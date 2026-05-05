/**
 * Telegram Webhook Route
 *
 * Registers a Fastify route that receives Telegram updates via webhook.
 * Also handles webhook setup on server start.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createBot } from "./bot.js";
import { env } from "../../config/env.js";

export async function telegramRoutes(fastify: FastifyInstance) {
  const bot = createBot();

  if (!bot) {
    fastify.log.info("Telegram bot not configured — skipping routes");
    return;
  }

  // Initialize bot (fetches bot info from Telegram — required for handleUpdate)
  await bot.init();
  fastify.log.info(`🤖 Telegram bot initialized: @${bot.botInfo.username}`);

  // Webhook endpoint — Telegram sends updates here
  fastify.post("/telegram/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const incomingSecret = (request.headers as any)["x-telegram-bot-api-secret-token"];
    const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
    
    // Log for debugging (remove once working)
    fastify.log.info(`📩 Telegram webhook hit | secret match: ${incomingSecret === expectedSecret} | has body: ${!!request.body}`);

    // Verify webhook secret if configured and not the zod default
    if (expectedSecret && expectedSecret !== "konvoo-tg-webhook-2026" && incomingSecret !== expectedSecret) {
      fastify.log.warn(`Telegram webhook auth failed | incoming: ${incomingSecret?.slice(0,10)}... | expected: ${expectedSecret?.slice(0,10)}...`);
      return reply.status(401).send({ error: "Unauthorized" });
    }

    try {
      await bot.handleUpdate(request.body as any);
      return reply.status(200).send("ok");
    } catch (error: any) {
      fastify.log.error({ err: error, msg: "Telegram webhook error", message: error?.message });
      return reply.status(200).send("ok");
    }
  });

  // Endpoint to manually set the webhook URL
  fastify.get("/telegram/setup-webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const cronSecret = (request.query as any)?.secret;
    if (env.NODE_ENV === "production" && cronSecret !== env.CRON_SECRET && cronSecret !== env.TELEGRAM_WEBHOOK_SECRET && cronSecret !== env.TELEGRAM_BOT_TOKEN) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    try {
      const webhookUrl = `https://yaari-api.onrender.com/telegram/webhook`;
      await bot.api.setWebhook(webhookUrl, {
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });

      return reply.send({
        status: "ok",
        webhook: webhookUrl,
        message: "Webhook set successfully",
      });
    } catch (error: any) {
      fastify.log.error("Failed to set webhook:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Health check for the bot
  fastify.get("/telegram/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const me = await bot.api.getMe();
      const webhookInfo = await bot.api.getWebhookInfo();
      return reply.send({
        bot: { id: me.id, username: me.username, name: me.first_name },
        webhook: {
          url: webhookInfo.url,
          pending_update_count: webhookInfo.pending_update_count,
          last_error: webhookInfo.last_error_message || null,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  fastify.log.info("✅ Telegram bot routes registered");
}
