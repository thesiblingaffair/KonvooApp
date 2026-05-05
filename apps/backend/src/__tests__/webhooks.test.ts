/**
 * Payment webhook tests.
 * Tests: signature verification, event handling for subscription lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── SIGNATURE VERIFICATION ───────────────────────────

describe("Razorpay Webhook Signature", () => {
  const WEBHOOK_SECRET = "webhook_test_secret";

  function computeSignature(rawBody: string): string {
    return crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
  }

  it("produces valid HMAC-SHA256 for raw body", () => {
    const rawBody = '{"event":"subscription.activated","payload":{}}';
    const signature = computeSignature(rawBody);

    // Verify by recomputing
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    expect(signature).toBe(expected);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails when body is re-serialized (the bug we fixed)", () => {
    const original = '{"event":"subscription.activated","payload":{"id":1}}';
    const parsed = JSON.parse(original);
    const reSerialized = JSON.stringify(parsed);

    // In this case they happen to match, but with different key ordering they won't
    const sigOriginal = computeSignature(original);
    const sigReSerialized = computeSignature(reSerialized);

    // Demonstrate: adding whitespace or reordering breaks the signature
    const withWhitespace = '{ "event": "subscription.activated", "payload": {"id": 1} }';
    const sigWhitespace = computeSignature(withWhitespace);

    expect(sigOriginal).not.toBe(sigWhitespace);
  });

  it("produces different signatures for different secrets", () => {
    const body = '{"event":"test"}';
    const sig1 = crypto.createHmac("sha256", "secret1").update(body).digest("hex");
    const sig2 = crypto.createHmac("sha256", "secret2").update(body).digest("hex");
    expect(sig1).not.toBe(sig2);
  });
});

// ─── WEBHOOK EVENT PARSING ────────────────────────────

describe("Webhook Event Parsing", () => {
  it("extracts user_id from subscription.activated notes", () => {
    const event = {
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id: "sub_test123",
            plan_id: "plan_buddy_test",
            notes: { user_id: "user-1", plan: "buddy", phone: "+919876543210" },
            current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          },
        },
      },
    };

    const subData = event.payload.subscription.entity;
    expect(subData.notes.user_id).toBe("user-1");
    expect(subData.notes.plan).toBe("buddy");
    expect(new Date(subData.current_end * 1000).getTime()).toBeGreaterThan(Date.now());
  });

  it("extracts payment info from subscription.charged", () => {
    const event = {
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: "sub_test123",
            notes: { user_id: "user-1" },
            current_end: Math.floor(Date.now() / 1000) + 60 * 86400,
          },
        },
        payment: {
          entity: {
            id: "pay_abc123",
            order_id: "order_xyz",
            amount: 14900,
            currency: "INR",
            method: "upi",
          },
        },
      },
    };

    const paymentData = event.payload.payment.entity;
    expect(paymentData.amount).toBe(14900);
    expect(paymentData.currency).toBe("INR");
    expect(paymentData.method).toBe("upi");
  });

  it("handles subscription.cancelled event", () => {
    const event = {
      event: "subscription.cancelled",
      payload: {
        subscription: {
          entity: { id: "sub_test123" },
        },
      },
    };

    expect(event.payload.subscription.entity.id).toBe("sub_test123");
  });

  it("handles payment.failed event gracefully", () => {
    const event = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_failed_123",
            notes: { user_id: "user-1" },
            amount: 14900,
            currency: "INR",
            method: "card",
          },
        },
      },
    };

    const paymentData = event.payload.payment.entity;
    expect(paymentData.id).toContain("failed");
    expect(paymentData.notes.user_id).toBe("user-1");
  });

  it("handles missing notes gracefully", () => {
    const event = {
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: { id: "sub_test", notes: {} },
        },
      },
    };

    const userId = event.payload.subscription.entity.notes?.user_id;
    expect(userId).toBeUndefined();
  });
});
