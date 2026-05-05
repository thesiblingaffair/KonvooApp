import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, conversations, favorites, subscriptions, messages, characterMemories } from "../../db/schema.js";
import { getLifetimeMessages, getMonthlyImages } from "../../db/usage.js";
import { updateProfileSchema, PLAN_LIMITS, type PlanType } from "../../utils/schemas.js";
import { serverAnalytics } from "../../utils/analytics.js";

async function getProfile(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return reply.status(404).send({ error: "User not found" });

  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt)).limit(1);

  const plan: PlanType = (sub?.plan as PlanType) || "free";
  const lifetimeMsgs = await getLifetimeMessages(userId);
  const monthlyImgs = await getMonthlyImages(userId);
  const [convCount] = await db.select({ count: sql<number>`count(*)` }).from(conversations).where(eq(conversations.userId, userId));
  const [favCount] = await db.select({ count: sql<number>`count(*)` }).from(favorites).where(eq(favorites.userId, userId));

  return reply.send({
    user: { id: user.id, phone: user.phone, name: user.name, language: user.language, contentFilter: user.contentFilter, avatarUrl: user.avatarUrl, createdAt: user.createdAt },
    subscription: { plan, status: sub?.status || "active", expiresAt: sub?.expiresAt || null },
    usage: {
      messages: { used: lifetimeMsgs, limit: PLAN_LIMITS[plan].messageLimit },
      monthlyImages: { used: monthlyImgs, limit: PLAN_LIMITS[plan].monthlyImages },
    },
    stats: { conversations: Number(convCount?.count ?? 0), favorites: Number(favCount?.count ?? 0) },
  });
}

async function updateProfile(request: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const updates = updateProfileSchema.parse(request.body);
  const [updated] = await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  if (!updated) return reply.status(404).send({ error: "User not found" });
  return reply.send({ success: true, user: { id: updated.id, phone: updated.phone, name: updated.name, language: updated.language, contentFilter: updated.contentFilter, avatarUrl: updated.avatarUrl } });
}

async function deleteAccount(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return reply.status(404).send({ error: "User not found" });

  // Check if already scheduled for deletion
  if (user.deletionRequestedAt) {
    return reply.send({
      success: true,
      message: "Account is already scheduled for deletion.",
      deletionScheduledAt: user.deletionScheduledAt,
    });
  }

  const now = new Date();
  const deletionDate = new Date(now);
  deletionDate.setDate(deletionDate.getDate() + 30);

  // Soft delete: deactivate account, schedule permanent deletion in 30 days
  // - Do NOT cancel Razorpay subscription (user can still be charged for current cycle)
  // - Do NOT delete payment records (compliance)
  // - Deactivate so user cannot log in
  await db.update(users).set({
    isActive: false,
    deletionRequestedAt: now,
    deletionScheduledAt: deletionDate,
    updatedAt: now,
  }).where(eq(users.id, userId));

  serverAnalytics.accountDeletionRequested({ userId });

  // Delete conversation data (messages + memories) immediately for privacy
  // but keep the user row, subscriptions, and payments for 30 days
  const userConversations = await db.select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.userId, userId));

  for (const conv of userConversations) {
    await db.delete(messages).where(eq(messages.conversationId, conv.id));
    await db.delete(characterMemories).where(eq(characterMemories.conversationId, conv.id));
  }
  await db.delete(conversations).where(eq(conversations.userId, userId));
  await db.delete(favorites).where(eq(favorites.userId, userId));

  return reply.send({
    success: true,
    message: "Account scheduled for deletion. Your data will be permanently removed after 30 days. You can contact support@konvoo.live to cancel this request.",
    deletionScheduledAt: deletionDate.toISOString(),
  });
}

async function getFavorites(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const results = await db.select({
    characterId: favorites.characterId, favoritedAt: favorites.createdAt,
  }).from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt));
  return reply.send({ favorites: results });
}

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.get("/users/me", getProfile);
  fastify.patch("/users/me", updateProfile);
  fastify.get("/users/me/favorites", getFavorites);
  fastify.delete("/users/me", deleteAccount);
}
