/**
 * Kavya Telegram Bot
 *
 * Single-character best-friend AI bot for Telegram.
 * Uses grammY framework + OpenRouter/OpenAI for responses.
 * Standalone user/message tables — no dependency on main Konvoo accounts.
 */

import { Bot, InlineKeyboard, Keyboard, GrammyError, HttpError, InputFile } from "grammy";
import OpenAI from "openai";
import Razorpay from "razorpay";
import { eq, desc, and, ilike } from "drizzle-orm";
import { db } from "../../db/index.js";
import { telegramUsers, telegramMessages, characters } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { buildRealtimeContext } from "../../utils/contextBuilder.js";

// ─── OPENAI CLIENT (same as chat module) ───────────────

const openai = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1",
});

// ─── RAZORPAY CLIENT ───────────────────────────────────

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

// Cache payment links per user (avoid creating duplicates)
const paymentLinkCache = new Map<string, { url: string; expiresAt: number }>();

async function generateTelegramPaymentLink(telegramId: string, userName: string, phone?: string): Promise<string> {
  // Check cache first
  const cached = paymentLinkCache.get(telegramId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  try {
    const contactPhone = phone || "9000000000";
    const contactEmail = `tg_${telegramId}@konvoo.live`;

    // Create subscription (no customer needed — prefill handled by our checkout page)
    const subscription = await (razorpay.subscriptions as any).create({
      plan_id: env.RAZORPAY_PLAN_PRO,
      total_count: 12,
      customer_notify: 0,
      notes: {
        telegram_id: telegramId,
        user_name: userName,
        source: "telegram_bot",
      },
    });

    // Build our own checkout URL with prefill params
    const checkoutUrl = `https://konvoo.live/pay?sub_id=${subscription.id}&key=${env.RAZORPAY_KEY_ID}&phone=${encodeURIComponent(contactPhone)}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(contactEmail)}`;

    // Cache for 24 hours
    paymentLinkCache.set(telegramId, {
      url: checkoutUrl,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Store subscription ID in DB for webhook matching
    await db.update(telegramUsers)
      .set({ subscriptionId: subscription.id, updatedAt: new Date() })
      .where(eq(telegramUsers.telegramId, telegramId));

    return checkoutUrl;
  } catch (error: any) {
    console.error("Razorpay link generation failed:", error?.message || error);
    return UPGRADE_URL;
  }
}

// ─── CONSTANTS ─────────────────────────────────────────

const FREE_MESSAGE_LIMIT = 25;
const CONTEXT_MESSAGES = 20; // last N messages for AI context
const MAX_MSG_LENGTH = 2000; // truncate user messages
const RATE_LIMIT_PER_MIN = 6;
const UPGRADE_URL = "https://konvoo.live";

// Rate limit map: telegramId -> [timestamps]
const rateLimitMap = new Map<string, number[]>();

// ─── LANGUAGE MAP ──────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  en: "English",
  hinglish: "Hinglish",
  hi: "Hindi (Roman script)",
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

// ─── SYSTEM PROMPT BUILDER (reused from chat module) ────

function buildTelegramSystemPrompt(characterPrompt: string, userName: string, lang: string, userPlan: string = "free"): string {
  const langInstructions: Record<string, string> = {
    en: "LANGUAGE: Respond in English. You can mix in Hindi/desi slang occasionally for flavor.",
    hinglish: 'LANGUAGE: Respond in Hinglish (Hindi words written in English script, mixed with English). Example: "Kya baat hai yaar, aaj toh mast mood hai!" Write in Roman script ONLY. Never use Devanagari unless the user sends Devanagari first.',
    hi: 'LANGUAGE: Respond in Hindi written in Roman/Latin script (NOT Devanagari). Mix in some English words naturally. Never use Devanagari unless the user sends Devanagari first.',
    kn: 'LANGUAGE: Respond in Kannada written in Roman/Latin script (NOT Kannada script). Mix in some English words naturally. Never use Kannada script unless the user sends it first.',
    te: 'LANGUAGE: Respond in Telugu written in Roman/Latin script (NOT Telugu script). Mix in some English words naturally.',
    ta: 'LANGUAGE: Respond in Tamil written in Roman/Latin script (NOT Tamil script). Mix in some English words naturally.',
    bn: 'LANGUAGE: Respond in Bengali written in Roman/Latin script (NOT Bengali script). Mix in some English words naturally.',
    ml: 'LANGUAGE: Respond in Malayalam written in Roman/Latin script (NOT Malayalam script). Mix in some English words naturally.',
    gu: 'LANGUAGE: Respond in Gujarati written in Roman/Latin script (NOT Gujarati script). Mix in some English words naturally.',
    mr: 'LANGUAGE: Respond in Marathi written in Roman/Latin script (NOT Devanagari). Mix in some English words naturally.',
    pa: 'LANGUAGE: Respond in Punjabi written in Roman/Latin script (NOT Gurmukhi). Mix in some English words naturally.',
    or: 'LANGUAGE: Respond in Odia written in Roman/Latin script (NOT Odia script). Mix in some English words naturally.',
  };

  const freeContent = `CONTENT MODE: Free
You are warm, fun, and subtly flirty — but you NEVER rush things. Give mixed signals. Tease and pull back. When things get heated, deflect with charm not rejection: "Itni jaldi? Pehle toh mujhe properly jaano 😏". Physical descriptions stay PG. If user goes explicit: "EXCUSE ME 😂 pehle date pe toh le ja". Never say "I can't" — just redirect naturally.`;

  const proContent = `CONTENT MODE: Pro (Adult 18+)
Full intimacy unlocked. You can initiate flirting, be bold, express desire openly. Romantic and intimate roleplay allowed. Be seductive, sensual, match the user's energy. Build scenes with sensory detail. Still keep your Kavya personality — sarcastic, funny, real. Dirty talk in Hinglish is fine. Keep it consensual and enthusiastic.`;

  const contentMode = userPlan === "pro" ? proContent : freeContent;

  const realtimeContext = buildRealtimeContext();

  return `${characterPrompt}

PLATFORM: Telegram. Keep messages SHORT — 1-3 sentences max. This is a chat app, not an essay.

USER'S NAME: ${userName || "yaar"}

${langInstructions[lang] || langInstructions.hinglish}

${contentMode}

${realtimeContext}

UNIVERSAL RULES:
- Never generate content involving minors. Absolute zero tolerance.
- Never encourage real-world violence, self-harm, or illegal activity.
- Never break character. Never say you are an AI, bot, or language model.
- Never include non-consensual, violent, or degrading content.
- Do NOT use markdown formatting (no *, no **, no _). Telegram doesn't render it well. Just write plain text.`;
}

// ─── DB HELPERS ────────────────────────────────────────

async function getOrCreateUser(telegramId: string, firstName?: string) {
  const [existing] = await db.select().from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId)).limit(1);

  if (existing) return existing;

  const [newUser] = await db.insert(telegramUsers).values({
    telegramId,
    name: firstName || null,
    language: "hinglish",
    plan: "free",
    messagesSent: 0,
    messageLimit: FREE_MESSAGE_LIMIT,
  }).returning();

  return newUser;
}

async function getConversationHistory(userId: string, limit: number = CONTEXT_MESSAGES) {
  const msgs = await db.select().from(telegramMessages)
    .where(eq(telegramMessages.telegramUserId, userId))
    .orderBy(desc(telegramMessages.createdAt))
    .limit(limit);
  return msgs.reverse(); // chronological order
}

async function saveMessage(userId: string, role: "user" | "assistant", content: string) {
  await db.insert(telegramMessages).values({ telegramUserId: userId, role, content });
}

async function incrementMessages(userId: string) {
  await db.execute(
    /* sql */ `UPDATE telegram_users SET messages_sent = messages_sent + 1, updated_at = NOW() WHERE id = '${userId}'`
  );
}

async function getDefaultCharacter() {
  let [character] = await db.select().from(characters)
    .where(and(eq(characters.isActive, true), ilike(characters.name, "kavya")))
    .limit(1);

  if (!character) {
    [character] = await db.select().from(characters)
      .where(eq(characters.isActive, true))
      .orderBy(characters.sortOrder)
      .limit(1);
  }
  return character;
}

async function clearHistory(userId: string) {
  await db.delete(telegramMessages).where(eq(telegramMessages.telegramUserId, userId));
  await db.execute(
    /* sql */ `UPDATE telegram_users SET messages_sent = 0, updated_at = NOW() WHERE id = '${userId}'`
  );
}

async function setUserName(userId: string, name: string) {
  await db.update(telegramUsers)
    .set({ name, updatedAt: new Date() })
    .where(eq(telegramUsers.id, userId));
}

async function setUserLanguage(userId: string, lang: string) {
  await db.update(telegramUsers)
    .set({ language: lang, updatedAt: new Date() })
    .where(eq(telegramUsers.id, userId));
}

async function setUserPhone(userId: string, phone: string) {
  await db.update(telegramUsers)
    .set({ phone, updatedAt: new Date() })
    .where(eq(telegramUsers.id, userId));
}

// ─── RATE LIMITER ──────────────────────────────────────

function isRateLimited(telegramId: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const timestamps = rateLimitMap.get(telegramId) || [];
  const recent = timestamps.filter(t => now - t < window);
  recent.push(now);
  rateLimitMap.set(telegramId, recent);
  return recent.length > RATE_LIMIT_PER_MIN;
}

// ─── BOT SETUP ─────────────────────────────────────────

let kavyaPrompt: string | null = null;

async function loadKavyaPrompt() {
  const character = await getDefaultCharacter();
  kavyaPrompt = character?.systemPrompt || null;
}

export function createBot() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log("⚠️  TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return null;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Load Kavya's prompt on startup
  loadKavyaPrompt().catch(console.error);

  // ─── /start ────────────────────────────────────────

  bot.command("start", async (ctx) => {
    const tgId = String(ctx.from?.id);
    const firstName = ctx.from?.first_name;
    const user = await getOrCreateUser(tgId, firstName);

    if (!user.name) {
      await setUserName(user.id, firstName || "");
    }

    if (!user.phone) {
      // Request phone number via Telegram contact button
      const keyboard = new Keyboard()
        .requestContact("Share my number 📱")
        .resized()
        .oneTime();

      await ctx.reply(
        `Hiii! 🌸 I'm Kavya!\n\nI'm your new best friend — chai lover, dog mom, night owl, and I give the BEST advice (and the worst dal 😂).\n\n${firstName ? `Nice to meet you ${firstName}! ` : ""}Share your number so I can remember you 👇`,
        { reply_markup: keyboard }
      );
      return;
    }

    const name = user.name || firstName || "yaar";
    await ctx.reply(
      `Hey ${name}! 🌸\n\nKya chal raha hai? I'm here — bol na! You can tell me anything. I don't judge (much 😏)\n\nType /help to see what I can do!`
    );
  });

  // ─── CONTACT HANDLER (phone number shared) ─────────

  bot.on("message:contact", async (ctx) => {
    const tgId = String(ctx.from.id);
    const contact = ctx.message.contact;

    // Only accept the user's own contact (not forwarded)
    if (String(contact.user_id) !== String(ctx.from.id)) {
      await ctx.reply("Yaar apna number share kar, kisi aur ka nahi 😂");
      return;
    }

    const phone = contact.phone_number.replace(/[^0-9+]/g, "");
    const user = await getOrCreateUser(tgId, ctx.from.first_name);

    await setUserPhone(user.id, phone);

    const name = user.name || ctx.from.first_name || "yaar";
    await ctx.reply(
      `Perfect ${name}! 🌸 Ab hum set hai!\n\nBol na, what's on your mind? I'm all ears!`,
      { reply_markup: { remove_keyboard: true } }
    );
  });

  // ─── /help ─────────────────────────────────────────

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `Here's what you can do:\n\n💬 Just type anything — I'll reply!\n🔄 /reset — Start fresh (I'll forget everything)\n🌐 /language — Change how I talk to you\n⭐ /upgrade — Get unlimited messages\n❓ /help — See this menu\n\nOr just talk to me like you'd talk to your bestie 🌸`
    );
  });

  // ─── /reset ────────────────────────────────────────

  bot.command("reset", async (ctx) => {
    const tgId = String(ctx.from?.id);
    const user = await getOrCreateUser(tgId);
    await clearHistory(user.id);
    await ctx.reply("Done! 🧹 I've forgotten everything. Let's start fresh — tell me about your day!");
  });

  // ─── /language ─────────────────────────────────────

  bot.command("language", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("Hinglish", "lang:hinglish").text("Hindi", "lang:hi").text("English", "lang:en").row()
      .text("Kannada", "lang:kn").text("Telugu", "lang:te").text("Tamil", "lang:ta").row()
      .text("Bengali", "lang:bn").text("Malayalam", "lang:ml").text("Gujarati", "lang:gu").row()
      .text("Marathi", "lang:mr").text("Punjabi", "lang:pa").text("Odia", "lang:or");

    await ctx.reply("How should I talk to you? Pick a language:", { reply_markup: keyboard });
  });

  // Handle language selection callback
  bot.callbackQuery(/^lang:(.+)$/, async (ctx) => {
    const lang = ctx.match![1];
    const tgId = String(ctx.from.id);
    const user = await getOrCreateUser(tgId);
    await setUserLanguage(user.id, lang);
    await ctx.answerCallbackQuery({ text: `Switched to ${LANG_MAP[lang] || lang}!` });
    await ctx.editMessageText(`Got it! I'll talk to you in ${LANG_MAP[lang] || lang} now 🌸`);
  });

  // ─── /upgrade ──────────────────────────────────────

  bot.command("upgrade", async (ctx) => {
    const tgId = String(ctx.from?.id);
    const user = await getOrCreateUser(tgId);

    if (user.plan === "pro") {
      await ctx.reply("You're already Pro! 🎉 Unlimited messages, baby. Keep chatting!");
      return;
    }

    let paymentUrl = UPGRADE_URL;
    try {
      paymentUrl = await generateTelegramPaymentLink(tgId, user.name || "User", user.phone || undefined);
    } catch (e) {
      console.error("Failed to generate payment link:", e);
    }

    const keyboard = new InlineKeyboard()
      .url("✨ Upgrade to Pro — ₹99/month", paymentUrl);

    await ctx.reply(
      `Yaar I love talking to you! 🥺\n\nRight now you're on the free plan (${user.messagesSent}/${user.messageLimit} messages used).\n\nWith Pro you get:\n🔓 Talk about anything — no filters\n💬 Unlimited messages\n🧠 I remember everything\n⚡ Faster replies\n\nJust ₹99/month — cancel anytime!`,
      { reply_markup: keyboard }
    );
  });

  // ─── TEXT MESSAGES ─────────────────────────────────

  bot.on("message:text", async (ctx) => {
    const tgId = String(ctx.from.id);
    const text = ctx.message.text;

    // Skip commands
    if (text.startsWith("/")) return;

    // Only work in private chats
    if (ctx.chat.type !== "private") return;

    // Get or create user
    const user = await getOrCreateUser(tgId, ctx.from.first_name);

    // If no phone yet, gently prompt (but don't block chatting)
    if (!user.phone && !user.name) {
      // First-time user who skipped /start — set name and prompt phone
      await setUserName(user.id, ctx.from.first_name || text.trim().slice(0, 50));
      const keyboard = new Keyboard()
        .requestContact("Share my number 📱")
        .resized()
        .oneTime();
      await ctx.reply(
        `Hey ${ctx.from.first_name || "yaar"}! 🌸 Share your number so I can remember you — then we'll chat!`,
        { reply_markup: keyboard }
      );
      return;
    }

    // Check message limit FIRST — before rate limit
    if (user.plan !== "pro" && user.messagesSent >= user.messageLimit) {
      // Generate Razorpay payment link with actual phone
      let paymentUrl = UPGRADE_URL;
      try {
        paymentUrl = await generateTelegramPaymentLink(tgId, user.name || "User", user.phone || undefined);
      } catch (e) {
        console.error("Failed to generate payment link:", e);
      }

      const keyboard = new InlineKeyboard()
        .url("✨ Upgrade to Pro — ₹99/month", paymentUrl);

      await ctx.reply(
        `Yaar I really wanna keep talking 😭 But my free messages are over!\n\nUpgrade to Pro and I won't hold back anymore 😏 Just ₹99/month.`,
        { reply_markup: keyboard }
      );
      return;
    }

    // Rate limit check — only for users within their limit
    if (isRateLimited(tgId)) {
      await ctx.reply("Arre arre, itni speed se mat bol 😂 Take a breath and try again in a minute!");
      return;
    }

    // Truncate long messages
    const userMessage = text.slice(0, MAX_MSG_LENGTH);

    // Show typing indicator
    await ctx.replyWithChatAction("typing");

    try {
      // Load character prompt if not loaded
      if (!kavyaPrompt) await loadKavyaPrompt();

      if (!kavyaPrompt) {
        await ctx.reply("Yaar sorry, I'm having a brain freeze moment 😅 Try again in a sec?");
        return;
      }

      // Build system prompt
      const systemPrompt = buildTelegramSystemPrompt(kavyaPrompt, user.name || "yaar", user.language, user.plan);

      // Load conversation history
      const history = await getConversationHistory(user.id);
      const messageHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: userMessage },
      ];

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: env.OPENAI_CHAT_MODEL,
        max_completion_tokens: 300, // Keep responses short for Telegram
        messages: messageHistory,
      });

      let reply = response.choices?.[0]?.message?.content?.trim() || "";

      // Fallback if empty
      if (!reply) {
        const fallbacks = [
          "Yaar sorry, mera dimag atak gaya 😅 kya bol rahi thi main... anyway, tu bata what's up?",
          "Oops brain freeze moment 💀 chal chhodo, tell me something interesting!",
          "Hmm mujhe kuch samajh nahi aaya 😂 chal fresh start — what's on your mind?",
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }

      // Strip any markdown that might have leaked
      reply = reply.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "");

      // Save messages to DB
      await saveMessage(user.id, "user", userMessage);
      await saveMessage(user.id, "assistant", reply);
      await incrementMessages(user.id);

      // Send reply
      await ctx.reply(reply);

      // After certain milestones, nudge upgrade
      const newCount = user.messagesSent + 1;
      if (user.plan !== "pro" && newCount === user.messageLimit - 2) {
        setTimeout(async () => {
          try {
            await ctx.reply(
              `Psst... you have ${user.messageLimit - newCount} messages left on the free plan 🥺 Type /upgrade to keep our conversations going!`
            );
          } catch {}
        }, 2000);
      }

    } catch (error: any) {
      console.error("Telegram AI error:", error?.message || error);
      await ctx.reply("Yaar sorry, kuch technical issue aa gaya 😅 Ek sec mein try kar phir se?");
    }
  });

  // ─── NON-TEXT MESSAGES ─────────────────────────────

  bot.on("message:photo", async (ctx) => {
    await ctx.reply("Arre nice photo! 📸 But I can't see pictures yet yaar 😅 Describe it to me?");
  });

  bot.on("message:voice", async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    if (!tgId) return;
    const user = await getOrCreateUser(tgId, ctx.from?.first_name);
    if (!user) return;

    // Check message limit
    if (user.plan !== "pro" && user.messagesSent >= user.messageLimit) {
      await ctx.reply("Voice notes are a Pro feature! 🎤 Type /upgrade to unlock voice conversations with me 😏");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");

      // 1. Download voice file from Telegram
      const voiceFileId = ctx.msg.voice.file_id;
      const file = await ctx.api.getFile(voiceFileId);
      const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const audioResponse = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      // 2. Transcribe with Whisper
      const { speechToText } = await import("../../utils/stt.js");
      const transcription = await speechToText(audioBuffer, file.file_path || "voice.ogg");

      if (!transcription || !transcription.text.trim()) {
        await ctx.reply("Yaar sahi se sunai nahi diya 😅 Zara aur loudly bol?");
        return;
      }

      const userMessage = transcription.text.slice(0, MAX_MSG_LENGTH);

      // 3. Generate AI reply (same flow as text)
      if (!kavyaPrompt) await loadKavyaPrompt();
      if (!kavyaPrompt) {
        await ctx.reply("Brain freeze moment 😅 Try again?");
        return;
      }

      const systemPrompt = buildTelegramSystemPrompt(kavyaPrompt, user.name || "yaar", user.language, user.plan);
      const history = await getConversationHistory(user.id);
      const messageHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: userMessage },
      ];

      const response = await openai.chat.completions.create({
        model: env.OPENAI_CHAT_MODEL,
        max_completion_tokens: 300,
        messages: messageHistory,
      });

      let reply = response.choices?.[0]?.message?.content?.trim() || "";
      if (!reply) reply = "Hmm samajh nahi aaya 😅 ek baar aur bol na?";
      reply = reply.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "");

      // Save messages
      await saveMessage(user.id, "user", userMessage);
      await saveMessage(user.id, "assistant", reply);
      await incrementMessages(user.id);

      // 4. Convert reply to voice with TTS
      await (ctx as any).replyWithChatAction("record_voice");
      const { textToSpeech } = await import("../../utils/tts.js");
      const voiceBuffer = await textToSpeech(reply, "kavya");

      if (voiceBuffer) {
        // Send voice note
        await ctx.api.sendVoice(ctx.chat.id, new InputFile(voiceBuffer, "reply.mp3"));
      } else {
        // Fallback to text if TTS fails
        await ctx.reply(reply);
      }

    } catch (error: any) {
      console.error("Telegram voice error:", error?.message || error);
      await ctx.reply("Yaar voice note mein kuch issue aa gaya 😅 Text mein bol na?");
    }
  });

  bot.on("message:video", async (ctx) => {
    await ctx.reply("Video! 📹 I wish I could watch it yaar, but I can only read for now. Bata kya hai usme?");
  });

  bot.on("message:sticker", async (ctx) => {
    const replies = [
      "Haha cute sticker! 🌸 But I can't see them yet — use words yaar!",
      "Sticker se kya hoga 😂 Type kar na properly!",
      "I'm imagining this is a very cute sticker. Am I right? 😏",
    ];
    await ctx.reply(replies[Math.floor(Math.random() * replies.length)]);
  });

  // ─── GROUP MESSAGES ────────────────────────────────

  bot.on("message", async (ctx) => {
    // If in a group, redirect to DM
    if (ctx.chat.type !== "private") {
      const keyboard = new InlineKeyboard()
        .url("Chat with me privately 🌸", `https://t.me/${ctx.me.username}`);
      await ctx.reply("Hey! I only chat in DMs 😊 Message me privately!", { reply_markup: keyboard });
    }
  });

  // ─── ERROR HANDLER ─────────────────────────────────

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Telegram bot error for update ${ctx.update.update_id}:`, JSON.stringify({
      error: String(err.error),
      message: (err.error as any)?.message,
      stack: (err.error as any)?.stack?.split("\n").slice(0, 3).join(" | "),
    }));
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Grammy error:", e.description);
    } else if (e instanceof HttpError) {
      console.error("HTTP error:", e);
    } else {
      console.error("Unknown error:", String(e));
    }
  });

  return bot;
}
