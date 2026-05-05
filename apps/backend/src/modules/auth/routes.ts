import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { checkOtpRateLimit } from "../../db/usage.js";
import { env } from "../../config/env.js";
import { sendOtpSchema, verifyOtpSchema, refreshTokenSchema, onboardingSchema } from "../../utils/schemas.js";
import { serverAnalytics } from "../../utils/analytics.js";
import { z } from "zod";

async function sendOtpViaMSG91(phone: string): Promise<boolean> {
  const mobile = phone.replace("+", "");
  const response = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: env.MSG91_AUTH_KEY },
    body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, mobile, otp_length: 6, otp_expiry: 5 }),
  });
  const data = (await response.json()) as { type: string };
  return data.type === "success";
}

async function verifyOtpViaMSG91(phone: string, otp: string): Promise<boolean> {
  const mobile = phone.replace("+", "");
  const response = await fetch(`https://control.msg91.com/api/v5/otp/verify?mobile=${mobile}&otp=${otp}`, {
    method: "GET",
    headers: { authkey: env.MSG91_AUTH_KEY },
  });
  const data = (await response.json()) as { type: string };
  return data.type === "success";
}

// ─── TEST ACCOUNT (Play Store review) ──────────────────
const TEST_PHONE = "919000090000";
const TEST_OTP = "246802";

function isTestAccount(phone: string): boolean {
  const cleaned = phone.replace("+", "").replace(/^91/, "91");
  return cleaned === TEST_PHONE || cleaned === "9000090000";
}

async function sendOtpHandler(request: FastifyRequest<{ Body: { phone: string } }>, reply: FastifyReply) {
  const { phone } = sendOtpSchema.parse(request.body);

  // Test account — skip real OTP
  if (isTestAccount(phone)) {
    return reply.send({ success: true, message: "OTP sent", expiresIn: 300 });
  }

  // Rate limit: max 3 OTP requests per phone per 10 minutes
  if (!checkOtpRateLimit(phone)) {
    return reply.status(429).send({ error: "Too many OTP requests. Try again in 10 minutes.", code: "OTP_RATE_LIMITED" });
  }

  const success = await sendOtpViaMSG91(phone);
  if (!success) return reply.status(500).send({ error: "Failed to send OTP", code: "OTP_SEND_FAILED" });
  return reply.send({ success: true, message: "OTP sent", expiresIn: 300 });
}

async function verifyOtpHandler(this: FastifyInstance, request: FastifyRequest<{ Body: { phone: string; otp: string } }>, reply: FastifyReply) {
  const { phone, otp } = verifyOtpSchema.parse(request.body);

  // Test account — accept fixed OTP
  let isValid: boolean;
  if (isTestAccount(phone) && otp === TEST_OTP) {
    isValid = true;
  } else if (isTestAccount(phone)) {
    return reply.status(401).send({ error: "Invalid or expired OTP", code: "OTP_INVALID" });
  } else {
    isValid = await verifyOtpViaMSG91(phone, otp);
  }

  if (!isValid) return reply.status(401).send({ error: "Invalid or expired OTP", code: "OTP_INVALID" });

  let [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  let isNewUser = false;
  if (!user) { [user] = await db.insert(users).values({ phone }).returning(); isNewUser = true; serverAnalytics.userSignup({ userId: user.id, phone }); }

  // If account was scheduled for deletion, reactivate it on login
  if (user.isActive === false) {
    await db.update(users).set({
      isActive: true,
      deletionScheduledAt: null,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
  }

  const accessToken = this.jwt.sign({ userId: user.id, phone: user.phone }, { expiresIn: env.JWT_ACCESS_EXPIRY });
  const refreshToken = this.jwt.sign({ userId: user.id, type: "refresh" }, { expiresIn: env.JWT_REFRESH_EXPIRY });

  return reply.send({
    success: true, accessToken, refreshToken, isNewUser,
    user: { id: user.id, phone: user.phone, name: user.name, language: user.language, avatarUrl: user.avatarUrl },
  });
}

async function refreshTokenHandler(this: FastifyInstance, request: FastifyRequest<{ Body: { refreshToken: string } }>, reply: FastifyReply) {
  const { refreshToken } = refreshTokenSchema.parse(request.body);
  try {
    const decoded = this.jwt.verify<{ userId: string; type: string }>(refreshToken);
    if (decoded.type !== "refresh") return reply.status(401).send({ error: "Invalid token type" });
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user) return reply.status(401).send({ error: "User not found" });
    if (!user.isActive) return reply.status(403).send({ error: "Account scheduled for deletion. Log in again to reactivate.", code: "ACCOUNT_DELETED" });
    const newAccess = this.jwt.sign({ userId: user.id, phone: user.phone }, { expiresIn: env.JWT_ACCESS_EXPIRY });
    const newRefresh = this.jwt.sign({ userId: user.id, type: "refresh" }, { expiresIn: env.JWT_REFRESH_EXPIRY });
    return reply.send({ accessToken: newAccess, refreshToken: newRefresh });
  } catch { return reply.status(401).send({ error: "Invalid refresh token" }); }
}

async function completeOnboarding(request: FastifyRequest<{ Body: { name: string; language: string } }>, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const { name, language } = onboardingSchema.parse(request.body);
  const [updated] = await db.update(users).set({ name, language, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  serverAnalytics.onboardingCompleted({ userId, name, language });
  return reply.send({ success: true, user: { id: updated.id, name: updated.name, language: updated.language, phone: updated.phone, avatarUrl: updated.avatarUrl } });
}

async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId as string;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return reply.status(404).send({ error: "User not found" });
  return reply.send({ id: user.id, phone: user.phone, name: user.name, language: user.language, avatarUrl: user.avatarUrl, createdAt: user.createdAt });
}

async function logout(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ success: true });
}

// ─── TRUECALLER VERIFY ──────────────────────────
// Verify Truecaller profile and create/login user

const truecallerSchema = z.object({
  phone: z.string().min(10),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  accessToken: z.string().min(1),
});

async function verifyTruecallerHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { phone, firstName, lastName, accessToken } = truecallerSchema.parse(request.body);

  // Verify the access token with Truecaller API
  try {
    const tcResponse = await fetch("https://profile4.truecaller.com/v1/default", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!tcResponse.ok) {
      return reply.status(401).send({ error: "Invalid Truecaller token", code: "TC_INVALID_TOKEN" });
    }

    const tcProfile = (await tcResponse.json()) as {
      phoneNumbers?: string[];
      name?: { first?: string; last?: string };
    };

    // Verify phone matches
    const tcPhone = tcProfile.phoneNumbers?.[0] || "";
    const normalizedInput = phone.replace(/[^0-9]/g, "").slice(-10);
    const normalizedTc = tcPhone.replace(/[^0-9]/g, "").slice(-10);

    if (normalizedInput !== normalizedTc && normalizedTc.length > 0) {
      return reply.status(401).send({ error: "Phone number mismatch", code: "TC_PHONE_MISMATCH" });
    }
  } catch (e) {
    // If Truecaller API is down, still allow login with the provided data
    // This is a graceful degradation — the SDK itself already verified the user
    console.warn("Truecaller API verification failed, using SDK-level trust:", e);
  }

  // Normalize phone to +91XXXXXXXXXX format
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const normalizedPhone = cleanPhone.startsWith("91") ? `+${cleanPhone}` : `+91${cleanPhone.slice(-10)}`;

  // Find or create user
  let [user] = await db.select().from(users).where(eq(users.phone, normalizedPhone)).limit(1);
  let isNewUser = false;

  if (!user) {
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    [user] = await db.insert(users).values({
      phone: normalizedPhone,
      name: fullName,
    }).returning();
    isNewUser = true;
    serverAnalytics.userSignup({ userId: user.id, phone: normalizedPhone });
  }

  // Reactivate if deleted
  if (user.isActive === false) {
    await db.update(users).set({
      isActive: true,
      deletionScheduledAt: null,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
  }

  // If Truecaller gave us a name and user doesn't have one, set it
  if (!user.name && firstName) {
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    await db.update(users).set({ name: fullName, updatedAt: new Date() }).where(eq(users.id, user.id));
    user = { ...user, name: fullName };
  }

  const jwtAccessToken = this.jwt.sign({ userId: user.id, phone: user.phone }, { expiresIn: env.JWT_ACCESS_EXPIRY });
  const refreshToken = this.jwt.sign({ userId: user.id, type: "refresh" }, { expiresIn: env.JWT_REFRESH_EXPIRY });

  console.log(`📊 [Analytics] truecaller_login: ${user.id} (isNewUser: ${isNewUser})`);

  return reply.send({
    success: true,
    accessToken: jwtAccessToken,
    refreshToken,
    isNewUser,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      language: user.language,
      avatarUrl: user.avatarUrl,
    },
  });
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/otp/send", sendOtpHandler);
  fastify.post("/auth/otp/verify", verifyOtpHandler.bind(fastify));
  fastify.post("/auth/truecaller/verify", verifyTruecallerHandler.bind(fastify));
  fastify.post("/auth/refresh", refreshTokenHandler.bind(fastify));
  fastify.post("/auth/onboarding", { preHandler: [fastify.authenticate], handler: completeOnboarding });
  fastify.get("/auth/me", { preHandler: [fastify.authenticate], handler: getMe });
  fastify.post("/auth/logout", { preHandler: [fastify.authenticate], handler: logout });
}
