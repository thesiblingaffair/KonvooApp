/**
 * Usage tracking — replaces Redis counters.
 * Uses PostgreSQL upsert (ON CONFLICT DO UPDATE).
 * Simple in-memory rate limiter for API throttling.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "./index.js";
import { usageDaily, usageMonthly, users } from "./schema.js";
import { PLAN_LIMITS, TRIAL_IMAGE_LIMIT } from "../utils/schemas.js";

// ─── LIFETIME MESSAGE COUNTER (free plan = 50 total) ───

export async function getLifetimeMessages(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: users.totalMessagesSent })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.count ?? 0;
}

export async function incrementLifetimeMessages(userId: string): Promise<number> {
  const result = await db
    .update(users)
    .set({ totalMessagesSent: sql`${users.totalMessagesSent} + 1` })
    .where(eq(users.id, userId))
    .returning({ count: users.totalMessagesSent });
  return result[0]?.count ?? 0;
}

// ─── DAILY MESSAGE COUNTER (kept for analytics) ────────

export async function incrementDailyMessages(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const result = await db
    .insert(usageDaily)
    .values({ userId, date: today, messagesSent: 1 })
    .onConflictDoUpdate({
      target: [usageDaily.userId, usageDaily.date],
      set: { messagesSent: sql`${usageDaily.messagesSent} + 1` },
    })
    .returning({ count: usageDaily.messagesSent });

  return result[0]?.count ?? 0;
}

export async function getDailyMessages(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .select({ count: usageDaily.messagesSent })
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, userId), eq(usageDaily.date, today)))
    .limit(1);

  return row?.count ?? 0;
}

// ─── MONTHLY IMAGE COUNTER (base counter) ──────────────

export async function incrementMonthlyImages(userId: string): Promise<number> {
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const result = await db
    .insert(usageMonthly)
    .values({ userId, month, imagesGenerated: 1 })
    .onConflictDoUpdate({
      target: [usageMonthly.userId, usageMonthly.month],
      set: { imagesGenerated: sql`${usageMonthly.imagesGenerated} + 1` },
    })
    .returning({ count: usageMonthly.imagesGenerated });
  return result[0]?.count ?? 0;
}

export async function getMonthlyImages(userId: string): Promise<number> {
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const [row] = await db
    .select({ count: usageMonthly.imagesGenerated })
    .from(usageMonthly)
    .where(and(eq(usageMonthly.userId, userId), eq(usageMonthly.month, month)))
    .limit(1);
  return row?.count ?? 0;
}

// ─── IMAGE QUOTA SYSTEM (billing-cycle-aware) ──────────

export interface ImageQuota {
  used: number;
  limit: number;
  bonus: number;
  remaining: number;
  resetDate: string | null;    // ISO date when quota resets (null for trial)
  isExhausted: boolean;
  isTrial: boolean;
  warningAt80: boolean;        // true when >= 80% used
}

/**
 * Get image quota for a user based on their subscription billing cycle.
 * - Trial: flat limit (TRIAL_IMAGE_LIMIT), no reset
 * - Monthly: resets based on subscription startedAt, not calendar month
 * - Free: 0 images allowed
 */
export async function getImageQuota(
  userId: string,
  plan: string,
  isTrial: boolean,
  subscriptionStartedAt: Date | null,
  subscriptionExpiresAt: Date | null,
): Promise<ImageQuota> {


  // Free plan — no images
  if (plan === "free") {
    return { used: 0, limit: 0, bonus: 0, remaining: 0, resetDate: null, isExhausted: true, isTrial: false, warningAt80: false };
  }

  // Get bonus images from user record
  const [userRow] = await db
    .select({ bonusImages: users.bonusImages })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const bonus = userRow?.bonusImages ?? 0;

  if (isTrial) {
    // Trial: flat limit, count ALL images ever generated (no billing cycle)
    const totalImages = await getTotalImagesForUser(userId);
    const limit = TRIAL_IMAGE_LIMIT;
    const remaining = Math.max(0, limit + bonus - totalImages);
    return {
      used: totalImages,
      limit,
      bonus,
      remaining,
      resetDate: null,
      isExhausted: remaining <= 0,
      isTrial: true,
      warningAt80: totalImages >= Math.ceil(limit * 0.8),
    };
  }

  // Monthly plan: count images since current billing cycle start
  const cycleStart = getBillingCycleStart(subscriptionStartedAt);
  const cycleEnd = getBillingCycleEnd(cycleStart);
  const cycleImages = await getImagesSinceCycleStart(userId, cycleStart);

  const limit = PLAN_LIMITS.pro.monthlyImages;
  const remaining = Math.max(0, limit + bonus - cycleImages);

  return {
    used: cycleImages,
    limit,
    bonus,
    remaining,
    resetDate: cycleEnd.toISOString(),
    isExhausted: remaining <= 0,
    isTrial: false,
    warningAt80: cycleImages >= Math.ceil(limit * 0.8),
  };
}

/**
 * Calculate the start of the current billing cycle based on subscription start date.
 * E.g., if subscription started on Jan 15, billing cycles are Jan 15 - Feb 14, Feb 15 - Mar 14, etc.
 */
function getBillingCycleStart(subscriptionStartedAt: Date | null): Date {
  if (!subscriptionStartedAt) return new Date(new Date().getFullYear(), new Date().getMonth(), 1); // fallback to first of month

  const now = new Date();
  const startDay = subscriptionStartedAt.getDate();

  // Find the most recent occurrence of the start day
  let cycleStart = new Date(now.getFullYear(), now.getMonth(), startDay);
  if (cycleStart > now) {
    // Haven't reached the start day this month yet — go back one month
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, startDay);
  }
  return cycleStart;
}

function getBillingCycleEnd(cycleStart: Date): Date {
  const end = new Date(cycleStart);
  end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Count images generated since a specific date.
 */
async function getImagesSinceCycleStart(userId: string, cycleStart: Date): Promise<number> {
  const cycleMonth = cycleStart.toISOString().slice(0, 7) + "-01";
  // Get all monthly usage entries that overlap with current cycle
  const rows = await db
    .select({ count: usageMonthly.imagesGenerated, month: usageMonthly.month })
    .from(usageMonthly)
    .where(and(eq(usageMonthly.userId, userId), sql`${usageMonthly.month} >= ${cycleMonth}`));

  return rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
}

/**
 * Count ALL images a user has ever generated (for trial users).
 */
async function getTotalImagesForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ count: usageMonthly.imagesGenerated })
    .from(usageMonthly)
    .where(eq(usageMonthly.userId, userId));
  return rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
}

/**
 * Consume one image from quota. Draws from monthly quota first, then bonus.
 * Returns false if no quota available.
 */
export async function consumeImageQuota(
  userId: string,
  plan: string,
  isTrial: boolean,
  subscriptionStartedAt: Date | null,
  subscriptionExpiresAt: Date | null,
): Promise<{ allowed: boolean; quota: ImageQuota }> {
  const quota = await getImageQuota(userId, plan, isTrial, subscriptionStartedAt, subscriptionExpiresAt);

  if (quota.isExhausted) {
    return { allowed: false, quota };
  }

  // Increment the monthly counter
  await incrementMonthlyImages(userId);

  // If over the base limit, consume from bonus
  if (quota.used >= quota.limit && quota.bonus > 0) {
    await db
      .update(users)
      .set({ bonusImages: sql`${users.bonusImages} - 1` })
      .where(eq(users.id, userId));
    quota.bonus--;
  }

  quota.used++;
  quota.remaining = Math.max(0, quota.remaining - 1);
  quota.isExhausted = quota.remaining <= 0;
  quota.warningAt80 = quota.used >= Math.ceil(quota.limit * 0.8);

  return { allowed: true, quota };
}

// ─── IN-MEMORY RATE LIMITER (replaces Redis sliding window) ─

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore) {
    if (val.resetAt < now) rateLimitStore.delete(key);
  }
}, 300000);

export function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowMs = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  const allowed = entry.count <= maxRequests;
  return { allowed, remaining: Math.max(0, maxRequests - entry.count) };
}

// ─── OTP RATE LIMIT ────────────────────────────────────

export function checkOtpRateLimit(phone: string): boolean {
  return checkRateLimit(`otp:${phone}`, 3, 600000).allowed; // 3 per 10 min
}
