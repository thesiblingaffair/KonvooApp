/**
 * Global test setup — runs before all test files.
 * Mocks: database, OpenAI, MSG91, Supabase, env vars.
 */
import { vi } from "vitest";

// ─── MOCK ENVIRONMENT ─────────────────────────────────
// Set before any module imports env.ts
process.env.NODE_ENV = "test";
process.env.PORT = "0"; // random port
process.env.HOST = "127.0.0.1";
process.env.CORS_ORIGIN = "*";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "a]b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "7d";
process.env.MSG91_AUTH_KEY = "test-msg91-key";
process.env.MSG91_TEMPLATE_ID = "test-template-id";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_test_secret";
process.env.RAZORPAY_PLAN_PRO = "plan_pro_test";
process.env.OPENAI_API_KEY = "sk-test-key";
process.env.OPENAI_CHAT_MODEL = "gpt-4o-mini";
process.env.OPENAI_UTIL_MODEL = "gpt-4o-mini";
process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-mini";
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

// ─── MOCK GLOBAL FETCH (for MSG91, OpenAI) ────────────
vi.stubGlobal("fetch", vi.fn());
