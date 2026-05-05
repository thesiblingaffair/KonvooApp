import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Razorpay from "razorpay";
import crypto from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptions, payments, users, telegramUsers } from "../../db/schema.js";
import { getLifetimeMessages, getMonthlyImages, getImageQuota } from "../../db/usage.js";
import { env } from "../../config/env.js";
import {
  createSubscriptionSchema,
  PLAN_LIMITS,
  TRIAL_CONFIG,
  type PlanType,
} from "../../utils/schemas.js";
import { serverAnalytics } from "../../utils/analytics.js";
import { updateUserTags } from "../../utils/onesignal.js";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

// ─── ROUTE HANDLERS ────────────────────────────────────

async function createSubscription(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { plan, useTrial } = createSubscriptionSchema.parse(request.body);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return reply.status(404).send({ error: "User not found" });
  }

  // Check if already has active subscription
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      )
    )
    .limit(1);

  if (existing) {
    return reply.status(400).send({
      error: "You already have an active plan",
      code: "ALREADY_SUBSCRIBED",
    });
  }

  // Check trial eligibility
  const wantsTrial = useTrial === true;
  if (wantsTrial && user.trialUsed) {
    return reply.status(400).send({
      error: "Already subscribed.",
      code: "TRIAL_ALREADY_USED",
    });
  }

  // Clean up any stale pending subscriptions from previous failed attempts
  await db
    .delete(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "pending")
      )
    );

  const planId = env.RAZORPAY_PLAN_PRO;

  try {
    // Build Razorpay subscription options
    const subscriptionOptions: any = {
      plan_id: planId,
      total_count: 12, // 12 billing cycles
      quantity: 1,
      customer_notify: 1,
      notes: {
        user_id: userId,
        plan,
        phone: user.phone,
        is_trial: wantsTrial ? "true" : "false",
      },
    };

    if (wantsTrial) {
      // ─── RAZORPAY TRIAL SUBSCRIPTION ───────────────
      // Use Razorpay's start_at to delay the first full charge by 3 days.
      // The ₹1 upfront is collected via an addon on the subscription.
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + TRIAL_CONFIG.durationDays);

      // start_at = Unix timestamp when the first full billing cycle begins
      subscriptionOptions.start_at = Math.floor(trialEnd.getTime() / 1000);

      // The ₹1 trial fee is charged as an upfront addon
      subscriptionOptions.addons = [
        {
          item: {
            name: "Konvoo Pro Trial — 1 Day",
            amount: TRIAL_CONFIG.amount, // 300 paise = ₹3
            currency: TRIAL_CONFIG.currency,
          },
          quantity: 1,
        },
      ];
    }

    const subscription = await razorpay.subscriptions.create(subscriptionOptions);

    // Calculate trial end date
    const trialEndsAt = wantsTrial
      ? new Date(Date.now() + TRIAL_CONFIG.durationDays * 24 * 60 * 60 * 1000)
      : null;

    // Store pending subscription
    await db.insert(subscriptions).values({
      userId,
      plan,
      razorpaySubId: subscription.id,
      status: "pending",
      isTrial: wantsTrial,
      trialEndsAt,
    });

    // NOTE: trialUsed is marked ONLY after payment confirmation in the webhook,
    // not here. If the user abandons checkout, they can retry the trial.

    return reply.send({
      subscriptionId: subscription.id,
      shortUrl: subscription.short_url,
      plan,
      amount: 9900,
      currency: "INR",
      isTrial: false,
      trialEndsAt: null,
      razorpayConfig: {
        key: env.RAZORPAY_KEY_ID,
        subscription_id: subscription.id,
        name: "Konvoo",
        description: "Konvoo Pro — ₹99/month",
        prefill: {
          contact: user.phone,
          email: "user@konvoo.live",
        },
        theme: {
          color: "#E8652B",
        },
      },
    });
  } catch (error) {
    console.error("Razorpay subscription creation failed:", error);
    return reply.status(500).send({
      error: "Failed to create subscription",
      code: "PAYMENT_ERROR",
    });
  }
}

async function handleWebhook(
  request: FastifyRequest<{ Body: any }>,
  reply: FastifyReply
) {
  const body = request.body as any;
  const signature = request.headers["x-razorpay-signature"] as string;

  const rawBody = (request as any).rawBody as string | undefined;
  if (!rawBody) {
    console.warn("Missing raw body for webhook signature verification");
    return reply.status(400).send({ error: "Missing raw body" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.warn("Invalid Razorpay webhook signature");
    return reply.status(400).send({ error: "Invalid signature" });
  }

  const event = body.event;
  const payload = body.payload;

  console.log(`📦 Razorpay webhook: ${event}`);

  switch (event) {
    case "subscription.activated": {
      const subData = payload.subscription.entity;
      const userId = subData.notes?.user_id;
      const plan = subData.notes?.plan;
      const isTrial = subData.notes?.is_trial === "true";
      const telegramId = subData.notes?.telegram_id;

      // ─── TELEGRAM SUBSCRIPTION ───
      if (telegramId) {
        await db.update(telegramUsers)
          .set({
            plan: "pro",
            subscriptionId: subData.id,
            subscriptionExpiresAt: new Date(subData.current_end * 1000),
            messageLimit: 999999,
            updatedAt: new Date(),
          })
          .where(eq(telegramUsers.telegramId, telegramId));

        console.log(`✅ Telegram user ${telegramId} upgraded to Pro`);
        break;
      }

      // ─── REGULAR KONVOO SUBSCRIPTION ───
      if (userId && plan) {
        // Cancel any existing active subscription
        await db
          .update(subscriptions)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(
            and(
              eq(subscriptions.userId, userId),
              eq(subscriptions.status, "active")
            )
          );

        // Activate new subscription
        const updateData: any = {
          status: "active",
          startedAt: new Date(),
          expiresAt: new Date(subData.current_end * 1000),
        };

        // If trial, set trial status
        if (isTrial) {
          updateData.isTrial = true;
          updateData.trialEndsAt = new Date(
            Date.now() + TRIAL_CONFIG.durationDays * 24 * 60 * 60 * 1000
          );
        }

        await db
          .update(subscriptions)
          .set(updateData)
          .where(eq(subscriptions.razorpaySubId, subData.id));

        // Mark trial as used ONLY after payment is confirmed
        if (isTrial) {
          await db
            .update(users)
            .set({ trialUsed: true, updatedAt: new Date() })
            .where(eq(users.id, userId));
        }

        serverAnalytics.subscriptionActivated({ userId, plan, isTrial });

        // Sync plan tag to OneSignal
        updateUserTags(userId, { plan: "pro", trial_used: isTrial ? "true" : "false" }).catch(() => {});
      }
      break;
    }

    case "subscription.charged": {
      const subData = payload.subscription.entity;
      const paymentData = payload.payment?.entity;
      const userId = subData.notes?.user_id;
      const telegramIdCharged = subData.notes?.telegram_id;

      // Telegram subscription renewal
      if (telegramIdCharged) {
        await db.update(telegramUsers)
          .set({
            plan: "pro",
            subscriptionExpiresAt: new Date(subData.current_end * 1000),
            updatedAt: new Date(),
          })
          .where(eq(telegramUsers.telegramId, telegramIdCharged));
        console.log(`✅ Telegram user ${telegramIdCharged} subscription renewed`);
        break;
      }

      if (userId) {
        // Extend subscription — trial is now over after first full charge
        await db
          .update(subscriptions)
          .set({
            status: "active",
            isTrial: false, // No longer trial after first full charge
            expiresAt: new Date(subData.current_end * 1000),
          })
          .where(eq(subscriptions.razorpaySubId, subData.id));

        // Log payment
        if (paymentData) {
          await db.insert(payments).values({
            userId,
            razorpayPayId: paymentData.id,
            razorpayOrderId: paymentData.order_id,
            amount: paymentData.amount,
            currency: paymentData.currency || "INR",
            status: "captured",
            method: paymentData.method,
          });

          serverAnalytics.paymentSuccess({
            userId,
            amount: paymentData.amount,
            currency: paymentData.currency || "INR",
            plan: subData.notes?.plan || "pro",
            method: paymentData.method,
            isTrial: subData.notes?.is_trial === "true",
          });
        }
      }
      break;
    }

    case "subscription.cancelled": {
      const subData = payload.subscription.entity;
      const telegramIdCancelled = subData.notes?.telegram_id;

      // Telegram subscription cancellation
      if (telegramIdCancelled) {
        await db.update(telegramUsers)
          .set({ plan: "free", messageLimit: 10, updatedAt: new Date() })
          .where(eq(telegramUsers.telegramId, telegramIdCancelled));
        console.log(`⚠️ Telegram user ${telegramIdCancelled} subscription cancelled`);
        break;
      }

      await db
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(subscriptions.razorpaySubId, subData.id));
      serverAnalytics.subscriptionCancelled({ userId: subData.notes?.user_id || "unknown", plan: subData.notes?.plan || "pro" });

      // Sync plan tag to OneSignal
      if (subData.notes?.user_id) {
        updateUserTags(subData.notes.user_id, { plan: "free" }).catch(() => {});
      }
      break;
    }

    case "subscription.halted": {
      const subData = payload.subscription.entity;
      await db
        .update(subscriptions)
        .set({ status: "halted" })
        .where(eq(subscriptions.razorpaySubId, subData.id));
      break;
    }

    case "payment.failed": {
      const paymentData = payload.payment?.entity;
      const userId = paymentData?.notes?.user_id;
      if (userId && paymentData) {
        await db.insert(payments).values({
          userId,
          razorpayPayId: paymentData.id,
          amount: paymentData.amount,
          currency: paymentData.currency || "INR",
          status: "failed",
          method: paymentData.method,
        });
        serverAnalytics.paymentFailed({ userId, amount: paymentData.amount, method: paymentData.method });
      }
      break;
    }
  }

  return reply.send({ status: "ok" });
}

async function getSubscriptionStatus(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const plan: PlanType = sub ? (sub.plan as PlanType) : "free";
  const limits = PLAN_LIMITS[plan];

  const lifetimeMsgs = await getLifetimeMessages(userId);

  // Get image quota (billing-cycle-aware)
  const imageQuota = await getImageQuota(
    userId, plan, sub?.isTrial || false,
    sub?.startedAt || null, sub?.expiresAt || null,
  );

  // Check if user has used trial
  const [user] = await db
    .select({ trialUsed: users.trialUsed })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return reply.send({
    plan,
    status: sub?.status || "active",
    startedAt: sub?.startedAt || null,
    expiresAt: sub?.expiresAt || null,
    isTrial: sub?.isTrial || false,
    trialEndsAt: sub?.trialEndsAt || null,
    trialUsed: user?.trialUsed || false,
    limits: {
      messageLimit: limits.messageLimit,
      monthlyImages: limits.monthlyImages,
      voiceEnabled: limits.voiceEnabled,
      customCharacters: limits.customCharacters,
    },
    usage: {
      messagesSent: lifetimeMsgs,
      monthlyImages: imageQuota.used,
    },
    imageQuota,
  });
}

async function cancelSubscription(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))
    )
    .limit(1);

  if (!sub || !sub.razorpaySubId) {
    return reply.status(400).send({ error: "No active subscription" });
  }

  try {
    await razorpay.subscriptions.cancel(sub.razorpaySubId, false);

    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(subscriptions.id, sub.id));

    return reply.send({
      success: true,
      message: "Subscription cancelled. You'll have access until the end of your billing period.",
      expiresAt: sub.expiresAt,
    });
  } catch (error) {
    console.error("Razorpay cancel failed:", error);
    return reply.status(500).send({ error: "Failed to cancel subscription" });
  }
}

// ─── MANUAL VERIFY (fallback if webhook doesn't fire) ─────

async function verifySubscription(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;

  // Find the most recent subscription for this user
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!sub || !sub.razorpaySubId) {
    return reply.status(404).send({ error: "No subscription found" });
  }

  // Already active? Nothing to do
  if (sub.status === "active") {
    return reply.send({ success: true, plan: "pro", alreadyActive: true });
  }

  try {
    // Check Razorpay directly for subscription status
    const rzpSub = await razorpay.subscriptions.fetch(sub.razorpaySubId) as any;
    console.log(`🔍 Razorpay sub ${sub.razorpaySubId} status: ${rzpSub.status}`);

    if (rzpSub.status === "active" || rzpSub.status === "authenticated") {
      // Activate in our database
      const updateData: any = {
        status: "active",
        startedAt: new Date(),
        expiresAt: rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : null,
      };

      if (sub.isTrial) {
        updateData.trialEndsAt = new Date(
          Date.now() + TRIAL_CONFIG.durationDays * 24 * 60 * 60 * 1000
        );
        // Mark trial as used
        await db
          .update(users)
          .set({ trialUsed: true, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      await db
        .update(subscriptions)
        .set(updateData)
        .where(eq(subscriptions.id, sub.id));

      console.log(`✅ Subscription manually activated for user ${userId}`);
      return reply.send({ success: true, plan: "pro" });
    } else {
      return reply.send({ success: false, razorpayStatus: rzpSub.status });
    }
  } catch (error) {
    console.error("Verify subscription failed:", error);
    return reply.status(500).send({ error: "Failed to verify subscription" });
  }
}

// ─── IMAGE ADD-ON PACK (₹99 for 10 images) ──────────

const IMAGE_ADDON = { amount: 9900, images: 10, currency: "INR" }; // 9900 paise = ₹99

async function createImageAddon(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;

  // Must have active subscription
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!sub) {
    return reply.status(400).send({ error: "Active subscription required to purchase add-on", code: "NO_SUBSCRIPTION" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  try {
    // Create Razorpay order (one-time, not subscription)
    const order = await razorpay.orders.create({
      amount: IMAGE_ADDON.amount,
      currency: IMAGE_ADDON.currency,
      notes: { user_id: userId, type: "image_addon", images: String(IMAGE_ADDON.images) },
    });

    return reply.send({
      orderId: order.id,
      amount: IMAGE_ADDON.amount,
      images: IMAGE_ADDON.images,
      razorpayConfig: {
        key: env.RAZORPAY_KEY_ID,
        order_id: order.id,
        name: "Konvoo",
        description: `${IMAGE_ADDON.images} Bonus Images`,
        prefill: { contact: user?.phone || "", email: "user@konvoo.live" },
        theme: { color: "#E8652B" },
      },
    });
  } catch (error) {
    console.error("Create image addon failed:", error);
    return reply.status(500).send({ error: "Failed to create add-on order" });
  }
}

async function verifyImageAddon(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { paymentId, orderId } = request.body as any;

  if (!paymentId || !orderId) {
    return reply.status(400).send({ error: "Missing paymentId or orderId" });
  }

  try {
    // Idempotency: check if this payment was already processed
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayPayId, paymentId))
      .limit(1);

    if (existingPayment) {
      // Already processed — return success without adding again
      return reply.send({
        success: true,
        bonusImagesAdded: 0,
        message: "This payment was already processed.",
        alreadyProcessed: true,
      });
    }

    // Verify payment with Razorpay
    const payment = await razorpay.payments.fetch(paymentId) as any;

    if (payment.status !== "captured" && payment.status !== "authorized") {
      return reply.status(400).send({ error: "Payment not completed", razorpayStatus: payment.status });
    }

    // Record payment FIRST (so duplicate calls can be detected)
    await db.insert(payments).values({
      userId,
      razorpayPayId: paymentId,
      razorpayOrderId: orderId,
      amount: IMAGE_ADDON.amount,
      currency: IMAGE_ADDON.currency,
      status: "captured",
      method: payment.method || "unknown",
    });

    // Then add bonus images
    await db
      .update(users)
      .set({ bonusImages: sql`${users.bonusImages} + ${IMAGE_ADDON.images}` })
      .where(eq(users.id, userId));

    console.log(`✅ Added ${IMAGE_ADDON.images} bonus images for user ${userId}`);

    return reply.send({
      success: true,
      bonusImagesAdded: IMAGE_ADDON.images,
      message: `${IMAGE_ADDON.images} bonus images added to your account!`,
    });
  } catch (error) {
    console.error("Verify image addon failed:", error);
    return reply.status(500).send({ error: "Failed to verify add-on payment" });
  }
}

// ─── ROUTE REGISTRATION ───────────────────────────────

export async function paymentRoutes(fastify: FastifyInstance) {
  // Webhook (NO auth — verified by Razorpay signature only)
  fastify.post("/subscriptions/webhook", {
    preParsing: async (request, _reply, payload) => {
      const chunks: Buffer[] = [];
      for await (const chunk of payload) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(chunks);
      (request as any).rawBody = raw.toString("utf8");
      const { Readable } = await import("stream");
      return Readable.from(raw);
    },
    handler: handleWebhook,
  });

  // Authenticated routes — use route-level preHandler instead of instance hook
  const authOpts = { preHandler: [fastify.authenticate] };
  fastify.post("/subscriptions/create", authOpts, createSubscription);
  fastify.get("/subscriptions/status", authOpts, getSubscriptionStatus);
  fastify.post("/subscriptions/verify", authOpts, verifySubscription);
  fastify.post("/subscriptions/cancel", authOpts, cancelSubscription);
  fastify.post("/subscriptions/addon/images", authOpts, createImageAddon);
  fastify.post("/subscriptions/addon/images/verify", authOpts, verifyImageAddon);
}
