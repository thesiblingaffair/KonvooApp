-- Telegram Bot Tables
-- Run this in Supabase SQL Editor

-- Telegram users (separate from main Konvoo users)
CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100),
  language VARCHAR(10) NOT NULL DEFAULT 'hinglish',
  plan VARCHAR(10) NOT NULL DEFAULT 'free',
  messages_sent INTEGER NOT NULL DEFAULT 0,
  message_limit INTEGER NOT NULL DEFAULT 10,
  subscription_id TEXT,
  subscription_expires_at TIMESTAMPTZ,
  linked_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_users_telegram_id ON telegram_users(telegram_id);

-- Telegram conversation messages
CREATE TABLE IF NOT EXISTS telegram_messages (
  id SERIAL PRIMARY KEY,
  telegram_user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_messages_user ON telegram_messages(telegram_user_id);

-- Auto-cleanup: delete messages older than 30 days (optional, run as cron)
-- DELETE FROM telegram_messages WHERE created_at < NOW() - INTERVAL '30 days';
