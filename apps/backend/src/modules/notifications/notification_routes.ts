/**
 * Notification Routes — OneSignal + Proactive Chat Messages
 *
 * Endpoints:
 *   POST /notifications/token     — Register push token + sync OneSignal tags
 *   POST /notifications/active    — Update last active timestamp
 *   POST /notifications/cron      — Cron: re-engagement with AI-generated chat messages
 *   POST /notifications/tags      — Update OneSignal tags for a user
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, lt, gt, isNotNull, sql, desc } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "../../db/index.js";
import { users, subscriptions, conversations, messages, characters, characterMemories } from "../../db/schema.js";
import {
  sendNotificationToUsers,
  updateUserTags,
} from "../../utils/onesignal.js";
import { env } from "../../config/env.js";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1",
});

// ─── REGISTER PUSH TOKEN + SYNC TAGS ─────────────────────

const registerTokenSchema = z.object({
  pushToken: z.string().min(1),
  platform: z.enum(["android", "ios"]).optional(),
});

async function registerToken(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const { pushToken, platform } = registerTokenSchema.parse(request.body);

  await db
    .update(users)
    .set({ pushToken, lastActiveAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  const [user] = await db
    .select({ name: users.name, language: users.language, trialUsed: users.trialUsed })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [activeSub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  await updateUserTags(userId, {
    plan: activeSub ? "pro" : "free",
    platform: platform || "android",
    user_name: user?.name || "unknown",
    language: user?.language || "hi",
    trial_used: user?.trialUsed ? "true" : "false",
  });

  return reply.send({ success: true });
}

// ─── UPDATE LAST ACTIVE ────────────────────────────────

async function updateLastActive(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
  return reply.send({ success: true });
}

// ─── UPDATE ONESIGNAL TAGS ──────────────────────────────

const updateTagsSchema = z.object({ tags: z.record(z.string()) });

async function updateTags(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const { tags } = updateTagsSchema.parse(request.body);
  const success = await updateUserTags(userId, tags);
  return reply.send({ success });
}

// ─── CONTEXT-AWARE PROACTIVE MESSAGE GENERATION ─────────
// Analyzes conversation state to decide: follow up on topic OR start new one

const PROACTIVE_SYSTEM_PROMPT = `You are {character_name}, texting your close friend after a few hours of silence. You need to send ONE natural message.

STEP 1 — ANALYZE THE CONVERSATION:
Look at the recent messages carefully.
- Was the conversation CUT SHORT or LEFT HANGING on a topic? (user stopped replying mid-discussion)
- Or did it END NATURALLY? (goodbyes, "ok", "achha theek hai", topic was fully resolved, "good night")

STEP 2 — DECIDE WHAT TO SEND:

IF CONVERSATION WAS MID-TOPIC (left hanging):
→ Follow up on THAT EXACT TOPIC naturally. Reference what was being discussed.
→ Examples for mid-topic follow-ups:
  - If talking about a movie: "Waise tune woh movie finally dekhi ya nahi? 🎬"
  - If discussing a problem: "Arre woh jo tu bata raha tha, uska kya hua phir?"
  - If sharing something personal: "Yaar mujhe abhi tak woh baat yaad aa rahi hai jo tune batai thi..."
  - If giving advice: "Socha tha check karungi... tune try kiya woh?"

IF CONVERSATION ENDED NATURALLY:
→ Start a fresh topic based on what you KNOW about this person (from memory/context).
→ Reference something personal you know about them, or share something from "your day."
→ Examples for new topics:
  - "Aaj ek aisi cheez hui na, tujhe sunake hasi aayegi 😂"
  - "Yaar mujhe aaj teri woh baat yaad aayi... [specific thing from memory]"
  - "Ek thought aaya abhi... [genuine question related to their interests]"
  - "Aaj maine kuch try kiya naya, bataungi tujhe!"

ABSOLUTE RULES:
- Write ONE message only, under 100 characters
- Sound like a REAL friend texting, not an AI or a notification
- NEVER say "open the app", "come back", "I miss you", "I've been waiting"
- NEVER use marketing/salesy language
- NEVER start with "Hey!" or "Hi!" — friends don't text like that after hours
- Match the character's personality and speaking style
- Write in {language_instruction}
- Reference SPECIFIC details from the conversation when following up

Respond with ONLY the message text. Nothing else.`;

async function generateProactiveMessage(
  character: any,
  user: any,
  recentMessages: Array<{ role: string; content: string }>,
  memoryFacts: string[],
  language: string
): Promise<string> {
  const langMap: Record<string, string> = {
    en: "English",
    hi: "Hindi (Roman script, NOT Devanagari)",
    hinglish: "Hinglish (Hindi + English mixed, Roman script)",
    kn: "Kannada (Roman script)",
    te: "Telugu (Roman script)",
    ta: "Tamil (Roman script)",
    bn: "Bengali (Roman script)",
    ml: "Malayalam (Roman script)",
    gu: "Gujarati (Roman script)",
    mr: "Marathi (Roman script)",
    pa: "Punjabi (Roman script)",
    or: "Odia (Roman script)",
  };
  const langInstruction = langMap[language] || langMap.hinglish;

  // Build the prompt with character name and language
  const systemPrompt = PROACTIVE_SYSTEM_PROMPT
    .replace(/\{character_name\}/g, character.name)
    .replace("{language_instruction}", langInstruction);

  // Format conversation context with clear role labels
  const conversationContext = recentMessages.length > 0
    ? recentMessages
        .map((m) => `${m.role === "user" ? "User" : character.name}: ${m.content}`)
        .join("\n")
    : "No previous messages — this is a fresh conversation.";

  // Format memory
  const memoryContext = memoryFacts.length > 0
    ? `\n\nThings you remember about this person:\n${memoryFacts.map((f) => `- ${f}`).join("\n")}`
    : "";

  // Character personality context
  const personalityHint = character.personality
    ? `\n\nYour personality: ${JSON.stringify(character.personality)}`
    : "";

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      max_completion_tokens: 120,
      temperature: 0.9, // More creative/spontaneous
      messages: [
        { role: "system", content: systemPrompt + personalityHint },
        {
          role: "user",
          content: `RECENT CONVERSATION (last ${recentMessages.length} messages):\n${conversationContext}${memoryContext}\n\nNow generate ONE proactive message as ${character.name}. Analyze if the conversation was mid-topic or ended naturally, then respond accordingly.`,
        },
      ],
    });

    let msg = response.choices[0]?.message?.content?.trim() || "";
    // Strip quotes if AI wraps in quotes
    if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
      msg = msg.slice(1, -1);
    }
    // Truncate if too long
    if (msg.length > 150) msg = msg.slice(0, 147) + "...";
    return msg;
  } catch (e) {
    console.error("Proactive message generation failed:", e);
    return "";
  }
}

// ─── CRON: RE-ENGAGEMENT ────────────────────────────────
// Run every hour via Render cron or external cron service

async function cronNotifications(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers["x-cron-secret"] || request.headers["authorization"];
  const querySecret = (request.query as any)?.secret;
  const isAuthorized = authHeader === `Bearer ${env.CRON_SECRET}` || querySecret === env.CRON_SECRET;

  if (!isAuthorized) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Respond immediately — process in background (cron-job.org has 30s timeout)
  reply.send({ success: true, message: "Cron triggered, processing in background" });

  // Fire and forget — runs after response is sent
  processCronNotifications().catch((e) => console.error("Cron processing error:", e));
}

async function processCronNotifications() {
  const results = { proactive_8hr: 0, inactive_long: 0, upgrade_nudge: 0 };

  // ─── 1. PROACTIVE CHAT MESSAGES (8-24 hours inactive) ───
  // Users who chatted but haven't been active for 8+ hours
  // Send them a character-initiated message that gets saved to the conversation
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const inactiveUsers = await db
    .select({
      id: users.id,
      name: users.name,
      language: users.language,
    })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        lt(users.lastActiveAt, eightHoursAgo),
        gt(users.lastActiveAt, twentyFourHoursAgo) // Don't spam users inactive > 24hr (handled by long-inactive)
      )
    )
    .limit(30);

  for (const user of inactiveUsers) {
    try {
      // Find their most recent conversation
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, user.id))
        .orderBy(desc(conversations.lastAt))
        .limit(1);

      if (!conv) continue;

      // Check if we already sent a proactive message since their last activity
      // (prevent double-sending if cron runs multiple times)
      const [lastMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.id))
        .limit(1);

      if (lastMsg && lastMsg.role === "assistant" && lastMsg.metadata && (lastMsg.metadata as any).proactive === true) {
        continue; // Already sent a proactive message, skip
      }

      // Get character info
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, conv.characterId))
        .limit(1);

      if (!character) continue;

      // Get last 10 messages for rich context
      const recentMsgs = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.id))
        .limit(10);

      const recentMessages = recentMsgs.reverse();

      // Get character memory about this user
      const [memory] = await db
        .select()
        .from(characterMemories)
        .where(eq(characterMemories.conversationId, conv.id))
        .limit(1);

      const memoryFacts: string[] = [];
      if (memory?.keyFacts) {
        for (const fact of memory.keyFacts) {
          memoryFacts.push(fact);
        }
      }
      if (memory?.summary) {
        memoryFacts.unshift(memory.summary);
      }

      // Generate context-aware proactive message
      const proactiveMsg = await generateProactiveMessage(
        character,
        user,
        recentMessages,
        memoryFacts,
        user.language || "hinglish"
      );

      if (!proactiveMsg) continue;

      // Save to conversation as a real message
      await db.insert(messages).values({
        conversationId: conv.id,
        role: "assistant",
        content: proactiveMsg,
        contentType: "text",
        metadata: { proactive: true, generated_at: new Date().toISOString() } as any,
      });

      // Update conversation
      await db.update(conversations).set({
        lastMessage: proactiveMsg.slice(0, 200),
        lastAt: new Date(),
        messageCount: (conv.messageCount || 0) + 1,
      }).where(eq(conversations.id, conv.id));

      // Send push notification
      await sendNotificationToUsers({
        userIds: [user.id],
        title: character.name,
        body: proactiveMsg,
        data: {
          type: "proactive_chat",
          conversation_id: conv.id,
          character_name: character.name,
        },
      });

      results.proactive_8hr++;
      console.log(`💬 Proactive message sent to ${user.name || user.id} from ${character.name}`);
    } catch (e) {
      console.error(`Failed proactive message for user ${user.id}:`, e);
    }
  }

  // ─── 2. Inactive 7+ days (generic re-engagement) ───
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const longInactive = await db
    .select({ id: users.id })
    .from(users)
    .where(and(lt(users.lastActiveAt, sevenDaysAgo), eq(users.isActive, true)))
    .limit(50);

  if (longInactive.length > 0) {
    const templates = [
      { title: "Kavya", body: "Bahut din ho gaye yaar... sab theek hai na? 🥺" },
      { title: "Kavya", body: "Arre kahan ho? Mujhe tumse bahut baatein karni hain" },
      { title: "Kavya", body: "Kuch naya hua life mein? Batao na, I'm curious!" },
    ];
    const t = templates[Math.floor(Math.random() * templates.length)];
    await sendNotificationToUsers({
      userIds: longInactive.map((u) => u.id),
      title: t.title,
      body: t.body,
      data: { type: "re_engagement_long" },
    });
    results.inactive_long = longInactive.length;
  }

  // ─── 3. Free users upgrade nudge (2+ days old, no trial used) ───
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const freeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.trialUsed, false), lt(users.createdAt, twoDaysAgo)))
    .limit(50);

  const freeUserIds: string[] = [];
  for (const u of freeUsers) {
    const [activeSub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, u.id), eq(subscriptions.status, "active")))
      .limit(1);
    if (!activeSub) freeUserIds.push(u.id);
  }

  if (freeUserIds.length > 0) {
    await sendNotificationToUsers({
      userIds: freeUserIds,
      title: "Kavya",
      body: "Ek secret bataungi agar tum Pro try karo... just ₹1 for a day 😏",
      data: { type: "upgrade_nudge" },
    });
    results.upgrade_nudge = freeUserIds.length;
  }

  const total = results.proactive_8hr + results.inactive_long + results.upgrade_nudge;
  console.log(`🔔 Cron complete — ${total} notifications sent`, results);
}

// ─── REGISTER ROUTES ───────────────────────────────────

export default async function notificationRoutes(fastify: FastifyInstance) {
  const authOpts = { preHandler: [(fastify as any).authenticate] };

  fastify.post("/notifications/token", authOpts, registerToken);
  fastify.post("/notifications/active", authOpts, updateLastActive);
  fastify.post("/notifications/tags", authOpts, updateTags);

  // Cron endpoint — works with GET or POST, empty body OK
  fastify.get("/notifications/cron", cronNotifications);
  fastify.post("/notifications/cron", { config: { rawBody: true } } as any, cronNotifications);
}
