/**
 * WebSocket handler — OpenAI streaming chat
 */
import { Server as SocketServer, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import OpenAI from "openai";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations, characters, users, subscriptions, messages, characterMemories } from "../../db/schema.js";
import { incrementDailyMessages, incrementLifetimeMessages, getLifetimeMessages, getMonthlyImages, incrementMonthlyImages } from "../../db/usage.js";
import { moderateContent } from "../../utils/moderation.js";
import { env } from "../../config/env.js";
import { PLAN_LIMITS, type PlanType } from "../../utils/schemas.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ─── SYSTEM PROMPT ────────────────────────────────────
// Uses stored system_prompt from character DB + language + memory context

function buildSystemPrompt(character: any, user: any, memory?: any): string {
  const lang = user.language || "hinglish";

  const langInstruction = lang === "en"
    ? "LANGUAGE: Respond in English. You can mix in Hindi/desi slang occasionally for flavor."
    : `LANGUAGE: Respond in Hinglish (Hindi words written in English script, mixed with English). Example: "Kya baat hai yaar, aaj toh mast mood hai!" Write in Roman script ONLY. Never use Devanagari unless the user sends Devanagari first.`;

  const memoryBlock = memory?.summary
    ? `CONVERSATION MEMORY: ${memory.summary}${memory.keyFacts?.length ? "\nKey facts: " + memory.keyFacts.join("; ") : ""}${memory.emotionalState ? "\nUser's current mood: " + memory.emotionalState : ""}`
    : "CONVERSATION MEMORY: New conversation. Set the scene using the scenario intro.";

  return `${character.systemPrompt}

${langInstruction}

${memoryBlock}

UNIVERSAL RULES (override character rules if conflict):
- Never generate content involving minors. Absolute zero tolerance.
- Never encourage real-world violence, self-harm, or illegal activity.
- If user asks for a picture/selfie, include [IMAGE_REQUEST: description] in your response.
- Never break character. Never say you are an AI, bot, or language model.`;
}

async function getUserPlan(userId: string): Promise<PlanType> {
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt)).limit(1);
  return (sub?.plan as PlanType) || "free";
}

export function setupWebSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","), credentials: true },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      if (!token) return next(new Error("Auth required"));
      const jwt = await import("jsonwebtoken");
      const decoded = jwt.default.verify(token, env.JWT_SECRET) as { userId: string };
      (socket as any).userId = decoded.userId;
      next();
    } catch { next(new Error("Invalid token")); }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket as any).userId as string;
    socket.join(`user:${userId}`);

    socket.on("join_conversation", async ({ conversationId }: any) => {
      const [conv] = await db.select().from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
      if (!conv) { socket.emit("error", { code: "NOT_FOUND" }); return; }
      socket.join(`conv:${conversationId}`);
      socket.emit("joined", { conversationId });
    });

    socket.on("message", async ({ conversationId, content, type = "text" }: any) => {
      try {
        const [conv] = await db.select().from(conversations)
          .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
        if (!conv) { socket.emit("error", { code: "NOT_FOUND" }); return; }

        const plan = await getUserPlan(userId);
        if (PLAN_LIMITS[plan].messageLimit !== Infinity) {
          const used = await getLifetimeMessages(userId);
          if (used >= PLAN_LIMITS[plan].messageLimit) {
            socket.emit("limit_reached", { type: "messages", plan, used, limit: PLAN_LIMITS[plan].messageLimit });
            return;
          }
        }

        const modResult = await moderateContent(content);
        if (!modResult.safe) { socket.emit("moderation", { flag: modResult.flag, message: "That content isn't allowed." }); return; }

        const [userMsg] = await db.insert(messages).values({ conversationId, role: "user", content, contentType: type }).returning();
        await incrementLifetimeMessages(userId);
        await incrementDailyMessages(userId); // keep for analytics
        io.to(`conv:${conversationId}`).emit("message_saved", { id: String(userMsg.id), role: "user", content, createdAt: userMsg.createdAt });

        const [character] = await db.select().from(characters).where(eq(characters.id, conv.characterId)).limit(1);
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const [memory] = await db.select().from(characterMemories).where(eq(characterMemories.conversationId, conversationId)).limit(1);
        const recentMsgs = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.id)).limit(20);

        const history: any[] = [
          { role: "system", content: buildSystemPrompt(character!, user!, memory) },
          ...recentMsgs.reverse().filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content })),
        ];

        socket.emit("typing_start", { conversationId });
        let fullResponse = "";
        const startTime = Date.now();

        const stream = await openai.chat.completions.create({ model: env.OPENAI_CHAT_MODEL, max_tokens: 600, messages: history, stream: true });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) { fullResponse += delta; socket.emit("token", { conversationId, content: delta }); }
        }

        socket.emit("typing_end", { conversationId });

        let imageRequest: string | null = null;
        const match = fullResponse.match(/\[IMAGE_REQUEST:\s*(.+?)\]/);
        if (match) { imageRequest = match[1]; fullResponse = fullResponse.replace(/\[IMAGE_REQUEST:\s*.+?\]/, "").trim(); }

        const [assistantMsg] = await db.insert(messages).values({
          conversationId, role: "assistant", content: fullResponse, contentType: "text",
          metadata: { model: env.OPENAI_CHAT_MODEL, generationTimeMs: Date.now() - startTime },
        }).returning();

        socket.emit("message_complete", {
          id: String(assistantMsg.id), conversationId, role: "assistant", content: fullResponse, contentType: "text", createdAt: assistantMsg.createdAt,
        });

        const newCount = (conv.messageCount || 0) + 2;
        await db.update(conversations).set({ lastMessage: fullResponse.slice(0, 200), lastAt: new Date(), messageCount: newCount }).where(eq(conversations.id, conversationId));

        if (imageRequest) {
          const imgs = await getMonthlyImages(userId);
          if (imgs < PLAN_LIMITS[plan].monthlyImages) {
            socket.emit("image_generating", { conversationId, prompt: imageRequest });
            try {
              await incrementMonthlyImages(userId);
              socket.emit("image_complete", { conversationId, url: "https://placehold.co/512x512/E8652B/white?text=Generated" });
            } catch { socket.emit("error", { code: "IMAGE_ERROR" }); }
          } else {
            socket.emit("limit_reached", { type: "images", plan, used: imgs, limit: PLAN_LIMITS[plan].monthlyImages });
          }
        }

        if (newCount % 10 === 0) {
          updateMemory(conversationId).catch(console.error);
        }
      } catch (error: any) {
        console.error("Message error:", error);
        socket.emit("error", { code: "MESSAGE_ERROR", message: "Failed to process." });
      }
    });

    socket.on("voice_start", async ({ conversationId }: any) => {
      try {
        const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: env.OPENAI_REALTIME_MODEL, voice: "shimmer", modalities: ["text", "audio"] }),
        });
        if (!res.ok) { socket.emit("error", { code: "VOICE_ERROR" }); return; }
        const session = await res.json() as any;
        socket.emit("voice_session", { conversationId, ephemeralToken: session.client_secret?.value, model: env.OPENAI_REALTIME_MODEL });
      } catch { socket.emit("error", { code: "VOICE_ERROR" }); }
    });

    socket.on("disconnect", () => {});
  });

  return io;
}

async function updateMemory(conversationId: string) {
  const rows = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.id)).limit(30);
  if (rows.length < 5) return;
  const transcript = rows.reverse().map(m => `${m.role}: ${m.content.slice(0, 300)}`).join("\n\n");

  const response = await openai.chat.completions.create({
    model: env.OPENAI_UTIL_MODEL, max_tokens: 500, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Respond in JSON only." },
      { role: "user", content: `Extract: {"summary":"...","keyFacts":["..."],"emotionalState":"neutral|happy|sad|flirty|romantic|aroused"}\n\n${transcript}` },
    ],
  });

  try {
    const p = JSON.parse(response.choices[0]?.message?.content || "{}");
    await db.insert(characterMemories).values({
      conversationId, summary: p.summary || "", keyFacts: p.keyFacts || [], emotionalState: p.emotionalState || "neutral", lastUpdated: new Date(),
    }).onConflictDoUpdate({
      target: characterMemories.conversationId,
      set: { summary: p.summary || "", keyFacts: p.keyFacts || [], emotionalState: p.emotionalState || "neutral", lastUpdated: new Date() },
    });
  } catch {}
}
