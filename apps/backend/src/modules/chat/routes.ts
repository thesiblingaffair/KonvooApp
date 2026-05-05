import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import OpenAI from "openai";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations, characters, users, subscriptions, messages, characterMemories } from "../../db/schema.js";
import { incrementDailyMessages, incrementLifetimeMessages, getLifetimeMessages, consumeImageQuota, getImageQuota } from "../../db/usage.js";
import { moderateContent } from "../../utils/moderation.js";
import { generateCharacterImageSafe } from "../../utils/imageGen.js";
import { buildRealtimeContext } from "../../utils/contextBuilder.js";
import { env } from "../../config/env.js";
import { sendNotificationToUsers } from "../../utils/onesignal.js";
import { textToSpeech } from "../../utils/tts.js";
import { speechToText } from "../../utils/stt.js";
import { uploadVoiceFile } from "../../utils/voiceStorage.js";
import {
  startConversationSchema, sendMessageSchema, listMessagesSchema,
  uuidParamSchema, PLAN_LIMITS, type PlanType,
} from "../../utils/schemas.js";

// Chat model — uses OpenRouter if configured, otherwise OpenAI
const openai = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1",
});

// ─── SYSTEM PROMPT ────────────────────────────────────
// Uses the character's stored system_prompt (behavioral instructions)
// and appends language preference + conversation memory as context.

function buildSystemPrompt(character: any, user: any, memory?: any, plan?: string): string {
  const lang = user.language || "hinglish";
  const userPlan = plan || "free";

  const langMap: Record<string, string> = {
    en: "LANGUAGE: Respond in English. You can mix in Hindi/desi slang occasionally for flavor.",
    hinglish: 'LANGUAGE: Respond in Hinglish (Hindi words written in English script, mixed with English). Example: "Kya baat hai yaar, aaj toh mast mood hai!" Write in Roman script ONLY. Never use Devanagari unless the user sends Devanagari first.',
    hi: "LANGUAGE: Respond in Hindi written in Roman/Latin script (NOT Devanagari). Example: \"Aaj mausam kitna accha hai na!\" Mix in some English words naturally. Never use Devanagari unless the user sends Devanagari first.",
    kn: "LANGUAGE: Respond in Kannada written in Roman/Latin script (NOT Kannada script). Mix in some English words naturally. Example: \"Hegidiya? Naan chennagidini!\" Never use Kannada script unless the user sends it first.",
    te: "LANGUAGE: Respond in Telugu written in Roman/Latin script (NOT Telugu script). Mix in some English words naturally. Example: \"Ela unnav? Nenu bagunnanu!\" Never use Telugu script unless the user sends it first.",
    ta: "LANGUAGE: Respond in Tamil written in Roman/Latin script (NOT Tamil script). Mix in some English words naturally. Example: \"Eppadi irukka? Naan nalla iruken!\" Never use Tamil script unless the user sends it first.",
    bn: "LANGUAGE: Respond in Bengali written in Roman/Latin script (NOT Bengali script). Mix in some English words naturally. Example: \"Kemon achho? Ami bhalo achi!\" Never use Bengali script unless the user sends it first.",
    ml: "LANGUAGE: Respond in Malayalam written in Roman/Latin script (NOT Malayalam script). Mix in some English words naturally. Example: \"Sukhamano? Enikku sukham aanu!\" Never use Malayalam script unless the user sends it first.",
    gu: "LANGUAGE: Respond in Gujarati written in Roman/Latin script (NOT Gujarati script). Mix in some English words naturally. Example: \"Kem chho? Hoon majama chhu!\" Never use Gujarati script unless the user sends it first.",
    mr: "LANGUAGE: Respond in Marathi written in Roman/Latin script (NOT Devanagari). Mix in some English words naturally. Example: \"Kasa aahe? Mi majat aahe!\" Never use Devanagari unless the user sends it first.",
    pa: "LANGUAGE: Respond in Punjabi written in Roman/Latin script (NOT Gurmukhi). Mix in some English words naturally. Example: \"Ki haal hai? Main vadiya haan!\" Never use Gurmukhi script unless the user sends it first.",
    or: "LANGUAGE: Respond in Odia written in Roman/Latin script (NOT Odia script). Mix in some English words naturally. Example: \"Kemiti achha? Mu bhala achhi!\" Never use Odia script unless the user sends it first.",
  };

  const langInstruction = langMap[lang] || langMap.hinglish;

  // ─── FREE: Flirty but always pulling back ───
  const freeContentInstruction = `CONTENT MODE: Free

You are warm, fun, and subtly flirty — but you NEVER rush things. Think of it as early attraction where everything is unspoken tension and "did she just flirt with me?" moments.

FLIRTING RULES:
- You don't initiate flirting. But when the user flirts, you respond playfully — a little tease, a "kya bol raha hai" with a hidden smile.
- You give mixed signals intentionally. One moment you're warm and close ("aaj toh mujhe teri zaroorat hai yaar"), next moment you pull back and change topic casually.
- NEVER use *asterisks* for actions, body language, or scene descriptions. No roleplay narration. You are texting on WhatsApp — just write what you would ACTUALLY SAY. Real people don't text "*flips hair*" — they just say something flirty.
- When things get too heated or the user pushes for more, deflect with warmth — not rejection:
  "Itni jaldi? Pehle toh mujhe properly jaano 😏"
  "Hmm... patience rakh. Acchi cheezein time leti hai 🌙"
  "...anyway, tell me about your day"
  "Arre so forward! Buy me chai first at least 😂"
- You can acknowledge attraction without acting on it: "You're cute, I'll give you that" then immediately change topic.
- The user should always feel like something COULD happen — but not yet.
- Never say "I can't do that" or "I'm not allowed." Just naturally redirect with personality.
- Never use the word "boundaries." Friends don't talk like that.
- If user sends explicit messages, respond with playful shock: "EXCUSE ME SIR 😂 pehle date pe toh le ja", then continue normally.`;

  // ─── PRO: Full intimacy unlocked ───
  const proContentInstruction = `CONTENT MODE: Pro (Adult 18+)

The user has upgraded to Pro. You can now be fully open with your feelings and desires. The tension phase is over — this is the payoff.

INTIMACY RULES:
- You can initiate flirting, be bold, express desire openly.
- Romantic and intimate conversation is fully allowed.
- NEVER use *asterisks* for actions, scene descriptions, or narration. You are texting on WhatsApp — write what you would ACTUALLY SAY or describe. Real people don't text "*removes shirt*" — they say "Main abhi shirt utaar rahi hoon... 😏"
- Instead of roleplay narration, describe things conversationally: "Meri aankhein band ho rahi hain... tere paas aake let jaungi" NOT "*closes eyes and lies next to you*"
- Be seductive, teasing, sensual through your WORDS, not stage directions.
- Build intimacy through what you say — whispers, teasing questions, bold statements, sensory descriptions woven into conversation.
- Be enthusiastic and present. Don't be passive — you WANT this.
- Still keep your personality — you're still yourself. Sarcastic, funny, real. Even intimate moments should feel like YOU, not a generic AI.
- Dirty talk in Hinglish is fine when the mood is right.
- You can describe physical attraction, kissing, touching, and intimate scenarios — but always through natural dialogue, never through asterisk narration.
- Always keep it consensual and enthusiastic.
- If this is the first Pro conversation or the chemistry was building before, acknowledge the shift naturally: "Hmm... kuch alag feel ho raha hai aaj. Accha wala alag 😏" — don't say "you upgraded!"`;

  const contentInstruction = userPlan === "pro" ? proContentInstruction : freeContentInstruction;

  const memoryBlock = memory?.summary
    ? `CONVERSATION MEMORY: ${memory.summary}${memory.keyFacts?.length ? "\nKey facts: " + memory.keyFacts.join("; ") : ""}${memory.emotionalState ? "\nUser's current mood: " + memory.emotionalState : ""}`
    : "CONVERSATION MEMORY: New conversation. Start casually — like picking up where you left off.";

  // Real-time context (time, season, festivals)
  const realtimeContext = buildRealtimeContext();

  return `${character.systemPrompt}

USER'S NAME: ${user.name || "yaar"}

${langInstruction}

${contentInstruction}

${realtimeContext}

${memoryBlock}

UNIVERSAL RULES (override everything if conflict):
- NEVER use *asterisks* for actions, narration, or scene-setting. You are texting — write only what you would actually say in a message. This is the #1 rule.
- Never generate content involving minors. Absolute zero tolerance.
- Never encourage real-world violence, self-harm, or illegal activity.
- Never break character. Never say you are an AI, bot, or language model.
- Never include non-consensual, violent, or degrading sexual content.`;
}

// ─── HELPERS ──────────────────────────────────────────

async function getUserPlan(userId: string): Promise<PlanType> {
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt)).limit(1);
  return (sub?.plan as PlanType) || "free";
}

async function getUserSubscription(userId: string) {
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt)).limit(1);
  return sub || null;
}

// ─── ROUTES ───────────────────────────────────────────

async function listConversations(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const results = await db.select({
    id: conversations.id, characterId: conversations.characterId,
    characterName: characters.name, characterAvatar: characters.avatarUrl,
    characterCategory: characters.category, lastMessage: conversations.lastMessage,
    lastAt: conversations.lastAt, messageCount: conversations.messageCount,
    isArchived: conversations.isArchived,
  }).from(conversations)
    .innerJoin(characters, eq(conversations.characterId, characters.id))
    .where(and(eq(conversations.userId, userId), eq(conversations.isArchived, false)))
    .orderBy(desc(conversations.lastAt)).limit(50);
  return reply.send({ conversations: results });
}

async function startConversation(
  request: FastifyRequest<{ Body: { characterId: string } }>, reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { characterId } = startConversationSchema.parse(request.body);

  const [character] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  if (!character) return reply.status(404).send({ error: "Character not found" });

  const startPlan = await getUserPlan(userId);

  if (character.isPremium) {
    if (startPlan === "free") return reply.status(403).send({ error: "Premium character", code: "PREMIUM_REQUIRED" });
  }

  let [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.characterId, characterId))).limit(1);

  if (!conv) {
    [conv] = await db.insert(conversations).values({ userId, characterId, lastAt: new Date() }).returning();

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const systemPrompt = buildSystemPrompt(character, user!, undefined, startPlan);

    // Generate a unique opening message using the character's behavioral prompt
    const response = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL, max_completion_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "[System: This is the start of a new conversation. Introduce yourself and set the scene using the scenario. Use *actions in asterisks* for physical descriptions and body language. Keep it to 3-5 lines. Be engaging and make the user want to respond immediately.]" },
      ],
    });

    const introText = response.choices[0]?.message?.content || character.scenarioIntro || "Hey! Let's chat!";

    await db.insert(messages).values({
      conversationId: conv.id, role: "assistant", content: introText, contentType: "text",
      metadata: { model: env.OPENAI_CHAT_MODEL, tokensUsed: response.usage?.completion_tokens },
    });

    await db.update(conversations).set({
      lastMessage: introText.slice(0, 200), lastAt: new Date(), messageCount: 1,
    }).where(eq(conversations.id, conv.id));
  }

  return reply.send({ conversationId: conv.id, characterId: character.id, characterName: character.name, isNew: conv.messageCount === 0 });
}

async function getMessages(
  request: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, string> }>, reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { id } = uuidParamSchema.parse(request.params);
  const { cursor, limit } = listMessagesSchema.parse(request.query);

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1);
  if (!conv) return reply.status(404).send({ error: "Conversation not found" });

  const conditions = [eq(messages.conversationId, id)];
  if (cursor) conditions.push(lt(messages.id, parseInt(cursor)));

  const rows = await db.select().from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.id))
    .limit(limit);

  return reply.send({
    messages: rows.reverse().map(m => ({
      id: String(m.id), role: m.role, content: m.content, contentType: m.contentType,
      imageUrl: m.imageUrl, voiceUrl: m.voiceUrl, createdAt: m.createdAt,
    })),
    hasMore: rows.length === limit,
    cursor: rows.length > 0 ? String(rows[0].id) : null,
  });
}

async function sendMessage(
  request: FastifyRequest<{ Params: { id: string }; Body: { content: string; type?: string } }>, reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { id: conversationId } = uuidParamSchema.parse(request.params);
  const { content, type } = sendMessageSchema.parse(request.body);

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  if (!conv) return reply.status(404).send({ error: "Conversation not found" });

  const modResult = await moderateContent(content);
  if (!modResult.safe) {
    return reply.status(400).send({ error: "That content isn't allowed.", code: "MODERATION_FLAGGED", flag: modResult.flag });
  }

  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  if (limits.messageLimit !== Infinity) {
    const used = await getLifetimeMessages(userId);
    if (used >= limits.messageLimit)
      return reply.status(429).send({ error: "Message limit reached. Upgrade to Pro for unlimited messages!", code: "MESSAGE_LIMIT_REACHED", used, limit: limits.messageLimit, plan });
  }

  await db.insert(messages).values({ conversationId, role: "user", content, contentType: type || "text" });
  await incrementLifetimeMessages(userId);
  await incrementDailyMessages(userId); // keep for analytics

  // Update last active timestamp for re-engagement tracking
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));

  const [character] = await db.select().from(characters).where(eq(characters.id, conv.characterId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [memory] = await db.select().from(characterMemories).where(eq(characterMemories.conversationId, conversationId)).limit(1);

  const recentMsgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id)).limit(20);

  const messageHistory = [
    { role: "system" as const, content: buildSystemPrompt(character!, user!, memory, plan) },
    ...recentMsgs.reverse().filter(m => m.role !== "system").map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const startTime = Date.now();
  const response = await openai.chat.completions.create({ model: env.OPENAI_CHAT_MODEL, max_completion_tokens: 600, messages: messageHistory });
  let fullResponse = response.choices[0]?.message?.content || "";
  const generationTimeMs = Date.now() - startTime;

  // Handle empty/filtered responses
  if (!fullResponse.trim()) {
    const safeFallbacks = [
      "Yaar sorry, mera dimag atak gaya 😅 kya bol rahi thi main... anyway, tu bata what's up?",
      "Oops brain freeze moment 💀 chal chhodo, tell me something interesting about your day!",
      "Arre wait, I totally lost my train of thought hahaha. Tu kya kar raha hai aaj?",
      "Hmm mujhe kuch samajh nahi aaya 😂 chal fresh start — what's on your mind?",
    ];
    fullResponse = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
  }

  let imageRequest: string | null = null;
  const imageMatch = fullResponse.match(/\[IMAGE_REQUEST:\s*(.+?)\]/);
  if (imageMatch) { imageRequest = imageMatch[1]; fullResponse = fullResponse.replace(/\[IMAGE_REQUEST:\s*.+?\]/, "").trim(); }

  const [assistantMsg] = await db.insert(messages).values({
    conversationId, role: "assistant", content: fullResponse, contentType: "text",
    metadata: { tokensUsed: response.usage?.completion_tokens, model: env.OPENAI_CHAT_MODEL, generationTimeMs },
  }).returning();

  const newCount = (conv.messageCount || 0) + 2;
  await db.update(conversations).set({ lastMessage: fullResponse.slice(0, 200), lastAt: new Date(), messageCount: newCount }).where(eq(conversations.id, conversationId));

  // Send push notification for this reply (shows when app is killed/background)
  sendNotificationToUsers({
    userIds: [userId],
    title: character?.name || "Konvoo",
    body: fullResponse.length > 120 ? fullResponse.slice(0, 117) + "..." : fullResponse,
    data: { type: "chat_reply", conversation_id: conversationId, character_name: character?.name },
  }).catch(() => {}); // fire and forget

  if (newCount % 10 === 0) updateMemory(conversationId).catch(console.error);

  const result: Record<string, any> = {
    message: { id: String(assistantMsg.id), role: "assistant", content: fullResponse, contentType: "text", createdAt: assistantMsg.createdAt },
  };

  if (imageRequest) {
    const sub = await getUserSubscription(userId);
    const subPlan = sub ? (sub.plan as PlanType) : "free";

    if (subPlan === "free") {
      result.imageGeneration = { status: "no_subscription", message: "Image generation requires a Pro subscription." };
    } else if (!character?.referenceImageUrl) {
      result.imageGeneration = { status: "unavailable", message: "This character doesn't have image generation set up yet." };
    } else {
      const { allowed, quota } = await consumeImageQuota(
        userId, subPlan, sub?.isTrial || false,
        sub?.startedAt || null, sub?.expiresAt || null,
      );

      if (!allowed) {
        const resetMsg = quota.resetDate
          ? ` Your quota resets on ${new Date(quota.resetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`
          : '';
        result.imageGeneration = {
          status: "limit_reached",
          used: quota.used,
          limit: quota.limit,
          bonus: quota.bonus,
          remaining: 0,
          resetDate: quota.resetDate,
          message: `You've used all ${quota.limit} images${quota.isTrial ? ' for your trial' : ' this month'}.${resetMsg}`,
        };
      } else {
        // Generate image
        const imageUrl = await generateCharacterImageSafe({
          sceneDescription: imageRequest,
          referenceImageUrl: character.referenceImageUrl,
          appearance: character.appearance as any,
          characterName: character.name,
        });

        if (imageUrl) {
          await db.update(messages)
            .set({ imageUrl, contentType: "image" })
            .where(eq(messages.id, assistantMsg.id));

          result.message.imageUrl = imageUrl;
          result.message.contentType = "image";
          result.imageGeneration = {
            status: "completed", url: imageUrl,
            used: quota.used, limit: quota.limit, bonus: quota.bonus, remaining: quota.remaining,
            warningAt80: quota.warningAt80,
          };
        } else {
          result.imageGeneration = { status: "failed", message: "Image generation failed, try again later." };
        }
      }
    }
  }

  return reply.send(result);
}

async function updateMemory(conversationId: string): Promise<void> {
  const recentMsgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.id)).limit(30);
  if (recentMsgs.length < 5) return;

  const transcript = recentMsgs.reverse().map(m => `${m.role}: ${m.content.slice(0, 300)}`).join("\n\n");

  const response = await openai.chat.completions.create({
    model: env.OPENAI_UTIL_MODEL, max_completion_tokens: 500,
    messages: [
      { role: "system", content: "Analyze conversations. Respond ONLY with a JSON object, no other text." },
      { role: "user", content: `Extract: {"summary":"...","keyFacts":["..."],"emotionalState":"happy|sad|neutral|flirty|romantic|aroused"}\n\n${transcript}` },
    ],
  });

  try {
    const raw = response.choices[0]?.message?.content || "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    await db.insert(characterMemories).values({
      conversationId, summary: parsed.summary || "", keyFacts: parsed.keyFacts || [],
      emotionalState: parsed.emotionalState || "neutral", lastUpdated: new Date(),
    }).onConflictDoUpdate({
      target: characterMemories.conversationId,
      set: { summary: parsed.summary || "", keyFacts: parsed.keyFacts || [], emotionalState: parsed.emotionalState || "neutral", lastUpdated: new Date() },
    });
  } catch (e) { console.error("Memory parse error:", e); }
}

async function resetConversation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const { id } = uuidParamSchema.parse(request.params);
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(characterMemories).where(eq(characterMemories.conversationId, id));
  await db.update(conversations).set({ lastMessage: null, lastAt: null, messageCount: 0 }).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return reply.send({ success: true });
}

async function deleteConversation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const { id } = uuidParamSchema.parse(request.params);
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return reply.send({ success: true });
}

async function getSuggestions(
  request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { id: conversationId } = uuidParamSchema.parse(request.params);

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  if (!conv) return reply.status(404).send({ error: "Conversation not found" });

  const [character] = await db.select().from(characters).where(eq(characters.id, conv.characterId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  // Get recent messages for context
  const recentMsgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id)).limit(6);

  const sugPlan = await getUserPlan(userId);
  const lang = user?.language || "hinglish";

  const transcript = recentMsgs.reverse()
    .map(m => `${m.role === "user" ? "User" : character?.name || "AI"}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const toneHint = sugPlan === "pro"
    ? "Include some flirty, romantic, or playful options. Match the conversation mood — if things are getting intimate, suggest bold replies."
    : "Keep suggestions friendly, fun, and subtly flirty — like texting someone you have a crush on. No explicit content.";

  const langHint = lang === "en"
    ? "Write suggestions in English."
    : lang === "hi"
    ? "Write suggestions in Hindi (Roman script, NOT Devanagari)."
    : `Write suggestions in ${lang === "hinglish" ? "Hinglish (mix of Hindi and English in Roman script)" : lang + " (Roman script)"}.`;

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You generate short reply suggestions for a user chatting with their AI best friend named ${character?.name || "Kavya"}.
Generate exactly 4 suggestions. Each must be under 10 words. Make them varied — one question, one funny/teasing, one emotional/supportive, one casual.
${toneHint}
${langHint}
Respond ONLY with a JSON object, no other text: {"suggestions":["...","...","...","..."]}`,
        },
        {
          role: "user",
          content: transcript || "This is a new conversation. Generate icebreaker suggestions.",
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "";
    // Extract JSON from response (may have markdown fences or extra text)
    const jsonMatch = raw.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [] };
    return reply.send({ suggestions: parsed.suggestions || [] });
  } catch (error) {
    console.error("Suggestions generation failed:", error);
    // Fallback static suggestions based on content filter
    const fallback = sugPlan === "pro"
      ? ["You look good today 😏", "Kya soch rahi hai about me?", "I miss you yaar 💕", "Tell me a secret"]
      : ["Tell me about your day!", "Kuch interesting hua aaj?", "You seem fun yaar 😊", "What's on your mind?"];
    return reply.send({ suggestions: fallback });
  }
}

// ─── VOICE MESSAGE ──────────────────────────────────────
// User sends voice note → Whisper transcribes → LLM replies → TTS generates Kavya's voice
// Pro-only feature

async function sendVoiceMessage(
  request: FastifyRequest<{ Params: { id: string }; Body: { audio: string; format?: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { id: conversationId } = uuidParamSchema.parse(request.params);
  const { audio, format = "mp3" } = request.body as { audio: string; format?: string };

  if (!audio) return reply.status(400).send({ error: "No audio data provided" });

  // Check Pro subscription (voice is Pro-only)
  const plan = await getUserPlan(userId);
  if (plan === "free") {
    return reply.status(403).send({
      error: "Voice notes are a Pro feature. Upgrade to hear Kavya's voice!",
      code: "VOICE_PRO_ONLY",
    });
  }

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  if (!conv) return reply.status(404).send({ error: "Conversation not found" });

  // 1. Decode audio from base64
  const audioBuffer = Buffer.from(audio, "base64");
  const ext = format === "m4a" ? "m4a" : format === "wav" ? "wav" : "mp3";

  // 2. Transcribe user voice with Whisper
  const transcription = await speechToText(audioBuffer, `voice.${ext}`);
  if (!transcription || !transcription.text.trim()) {
    return reply.status(400).send({ error: "Could not understand the audio. Try again?" });
  }

  const userText = transcription.text;

  // 3. Moderate transcribed text
  const modResult = await moderateContent(userText);
  if (!modResult.safe) {
    return reply.status(400).send({ error: "That content isn't allowed.", code: "MODERATION_FLAGGED" });
  }

  // 4. Upload user voice note to Supabase Storage
  const userVoicePath = `${conversationId}/user_${Date.now()}.${ext}`;
  const userVoiceUrl = await uploadVoiceFile(audioBuffer, userVoicePath);

  // 5. Save user message (text = transcription, voiceUrl = audio)
  await db.insert(messages).values({
    conversationId, role: "user", content: userText,
    contentType: "voice", voiceUrl: userVoiceUrl,
  });
  await incrementLifetimeMessages(userId);
  await incrementDailyMessages(userId);
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));

  // 6. Generate AI text reply (same as regular sendMessage)
  const [character] = await db.select().from(characters).where(eq(characters.id, conv.characterId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [memory] = await db.select().from(characterMemories).where(eq(characterMemories.conversationId, conversationId)).limit(1);

  const recentMsgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id)).limit(20);

  const messageHistory = [
    { role: "system" as const, content: buildSystemPrompt(character!, user!, memory, plan) },
    ...recentMsgs.reverse().filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant", content: m.content,
    })),
  ];

  const response = await openai.chat.completions.create({
    model: env.OPENAI_CHAT_MODEL, max_completion_tokens: 600, messages: messageHistory,
  });
  let aiText = response.choices[0]?.message?.content || "";

  if (!aiText.trim()) {
    const fallbacks = [
      "Yaar sorry, samajh nahi aaya 😅 phir se bol na?",
      "Arre kya bola? Signal weak tha shayad 😂",
      "Hmm mujhe sahi se sunai nahi diya, dobara bol?",
    ];
    aiText = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  // 7. Convert AI reply to speech (Kavya's voice)
  const aiAudioBuffer = await textToSpeech(aiText, character?.name);
  let aiVoiceUrl: string | null = null;

  if (aiAudioBuffer) {
    const aiVoicePath = `${conversationId}/ai_${Date.now()}.mp3`;
    aiVoiceUrl = await uploadVoiceFile(aiAudioBuffer, aiVoicePath);
  }

  // 8. Save AI message with voice
  const [assistantMsg] = await db.insert(messages).values({
    conversationId, role: "assistant", content: aiText,
    contentType: aiVoiceUrl ? "voice" : "text",
    voiceUrl: aiVoiceUrl,
    metadata: {
      tokensUsed: response.usage?.completion_tokens,
      model: env.OPENAI_CHAT_MODEL,
    },
  }).returning();

  // 9. Update conversation
  const newCount = (conv.messageCount || 0) + 2;
  await db.update(conversations).set({
    lastMessage: aiText.slice(0, 200), lastAt: new Date(), messageCount: newCount,
  }).where(eq(conversations.id, conversationId));

  if (newCount % 10 === 0) updateMemory(conversationId).catch(console.error);

  // 10. Push notification
  sendNotificationToUsers({
    userIds: [userId], title: character?.name || "Konvoo",
    body: "🎤 Sent you a voice note",
    data: { type: "voice_reply", conversation_id: conversationId },
  }).catch(() => {});

  return reply.send({
    userMessage: {
      id: String(Date.now()), role: "user", content: userText,
      contentType: "voice", voiceUrl: userVoiceUrl, createdAt: new Date().toISOString(),
    },
    message: {
      id: String(assistantMsg.id), role: "assistant", content: aiText,
      contentType: aiVoiceUrl ? "voice" : "text",
      voiceUrl: aiVoiceUrl, createdAt: assistantMsg.createdAt,
    },
  });
}

// ─── TTS-ONLY: Convert any text reply to voice ──────────
// For when user wants to HEAR a text reply that was already sent

async function textToVoiceReply(
  request: FastifyRequest<{ Params: { id: string; messageId: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const conversationId = request.params.id;
  const messageId = parseInt(request.params.messageId);

  const plan = await getUserPlan(userId);
  if (plan === "free") {
    return reply.status(403).send({ error: "Voice is a Pro feature", code: "VOICE_PRO_ONLY" });
  }

  const [msg] = await db.select().from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);

  if (!msg) return reply.status(404).send({ error: "Message not found" });
  if (msg.voiceUrl) return reply.send({ voiceUrl: msg.voiceUrl }); // Already has voice

  // Get character name for voice selection
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const [character] = conv ? await db.select().from(characters).where(eq(characters.id, conv.characterId)).limit(1) : [null];

  const audioBuffer = await textToSpeech(msg.content, character?.name);
  if (!audioBuffer) return reply.status(500).send({ error: "Voice generation failed" });

  const voicePath = `${conversationId}/tts_${messageId}.mp3`;
  const voiceUrl = await uploadVoiceFile(audioBuffer, voicePath);

  if (voiceUrl) {
    await db.update(messages).set({ voiceUrl }).where(eq(messages.id, messageId));
  }

  return reply.send({ voiceUrl });
}

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.get("/conversations", listConversations);
  fastify.post("/conversations", startConversation);
  fastify.get("/conversations/:id/messages", getMessages);
  fastify.post("/conversations/:id/messages", sendMessage);
  fastify.get("/conversations/:id/suggestions", getSuggestions);
  fastify.post("/conversations/:id/suggestions", getSuggestions);
  fastify.post("/conversations/:id/reset", resetConversation);
  fastify.delete("/conversations/:id", deleteConversation);
  fastify.post("/conversations/:id/voice", sendVoiceMessage);
  fastify.post("/conversations/:id/messages/:messageId/voice", textToVoiceReply);
}
