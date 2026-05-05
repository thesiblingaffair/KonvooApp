/**
 * PostgreSQL schema (via Supabase)
 *
 * ALL data in one database — no MongoDB, no Redis.
 * Messages + memories that were in MongoDB are now PostgreSQL tables.
 */
import {
  pgTable, uuid, varchar, text, boolean, integer, timestamp,
  jsonb, date, uniqueIndex, index, serial,
} from "drizzle-orm/pg-core";

// ─── USERS ─────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 15 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  avatarUrl: text("avatar_url"),
  language: varchar("language", { length: 10 }).default("hi").notNull(),
  contentFilter: varchar("content_filter", { length: 10 }).default("safe").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  trialUsed: boolean("trial_used").default(false).notNull(),
  totalMessagesSent: integer("total_messages_sent").default(0).notNull(),
  bonusImages: integer("bonus_images").default(0).notNull(),
  pushToken: text("push_token"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  deletionScheduledAt: timestamp("deletion_scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("idx_users_phone").on(t.phone)]);

// ─── CHARACTERS ────────────────────────────────────────
export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  personality: jsonb("personality").$type<{
    traits: string[]; tone: string; quirks: string[]; speakingStyle: string;
  }>().notNull(),
  backstory: text("backstory").notNull(),
  scenarioIntro: text("scenario_intro").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  isPremium: boolean("is_premium").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  referenceImageUrl: text("reference_image_url"),
  appearance: jsonb("appearance").$type<{
    hair?: string; eyes?: string; skin?: string; build?: string;
    style?: string; age?: string; gender?: string; extras?: string;
  }>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
}, (t) => [
  index("idx_characters_category").on(t.category),
  index("idx_characters_active").on(t.isActive),
]);

// ─── CONVERSATIONS ─────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  lastMessage: text("last_message"),
  lastAt: timestamp("last_at", { withTimezone: true }),
  messageCount: integer("message_count").default(0).notNull(),
  memory: jsonb("memory").$type<{
    summary: string; keyFacts: string[]; emotionalState: string; lastUpdated: string;
  }>().default({
    summary: "", keyFacts: [], emotionalState: "neutral", lastUpdated: new Date().toISOString(),
  }),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("idx_conversations_user_char").on(t.userId, t.characterId),
  index("idx_conversations_user").on(t.userId),
  index("idx_conversations_last").on(t.userId, t.lastAt),
]);

// ─── MESSAGES ──────────────────────────────────────────
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  role: varchar("role", { length: 10 }).notNull(), // user | assistant | system
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 10 }).default("text").notNull(),
  imageUrl: text("image_url"),
  voiceUrl: text("voice_url"),
  metadata: jsonb("metadata").$type<{
    model?: string; tokensUsed?: number; generationTimeMs?: number; moderationFlag?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_messages_conversation").on(t.conversationId),
  index("idx_messages_conversation_id").on(t.conversationId, t.id),
]);

// ─── CHARACTER MEMORIES ────────────────────────────────
export const characterMemories = pgTable("character_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().unique(),
  summary: text("summary").default("").notNull(),
  keyFacts: jsonb("key_facts").$type<string[]>().default([]).notNull(),
  emotionalState: varchar("emotional_state", { length: 20 }).default("neutral").notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_memories_conversation").on(t.conversationId),
]);

// ─── FAVORITES ─────────────────────────────────────────
export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("idx_favorites_pk").on(t.userId, t.characterId),
]);

// ─── SUBSCRIPTIONS ─────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: varchar("plan", { length: 20 }).notNull(),
  razorpaySubId: varchar("razorpay_sub_id", { length: 50 }),
  razorpayCustomerId: varchar("razorpay_customer_id", { length: 50 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  isTrial: boolean("is_trial").default(false).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_subscriptions_user").on(t.userId),
  index("idx_subscriptions_status").on(t.userId, t.status),
  index("idx_subscriptions_razorpay").on(t.razorpaySubId),
]);

// ─── PAYMENTS ──────────────────────────────────────────
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  razorpayPayId: varchar("razorpay_pay_id", { length: 50 }),
  razorpayOrderId: varchar("razorpay_order_id", { length: 50 }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("INR").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  method: varchar("method", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_payments_user").on(t.userId),
  index("idx_payments_razorpay").on(t.razorpayPayId),
]);

// ─── REPORTS ───────────────────────────────────────────
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull(),
  reason: varchar("reason", { length: 30 }).notNull(),
  details: text("details"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_reports_user").on(t.userId),
  index("idx_reports_status").on(t.status),
]);

// ─── USAGE TRACKING ────────────────────────────────────
export const usageDaily = pgTable("usage_daily", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  imagesGenerated: integer("images_generated").default(0).notNull(),
  tokensUsed: integer("tokens_used").default(0).notNull(),
}, (t) => [
  uniqueIndex("idx_usage_daily_user_date").on(t.userId, t.date),
]);

export const usageMonthly = pgTable("usage_monthly", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: date("month").notNull(),
  imagesGenerated: integer("images_generated").default(0).notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  tokensUsed: integer("tokens_used").default(0).notNull(),
}, (t) => [
  uniqueIndex("idx_usage_monthly_user_month").on(t.userId, t.month),
]);

// ─── TELEGRAM ──────────────────────────────────────────
export const telegramUsers = pgTable("telegram_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: varchar("telegram_id", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  language: varchar("language", { length: 10 }).default("hinglish").notNull(),
  plan: varchar("plan", { length: 10 }).default("free").notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  messageLimit: integer("message_limit").default(10).notNull(),
  subscriptionId: text("subscription_id"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  linkedUserId: uuid("linked_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("idx_tg_users_telegram_id").on(t.telegramId),
]);

export const telegramMessages = pgTable("telegram_messages", {
  id: serial("id").primaryKey(),
  telegramUserId: uuid("telegram_user_id").notNull().references(() => telegramUsers.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_tg_messages_user").on(t.telegramUserId),
]);
