-- Migration: consolidate bot_outbox into messages
-- All messages (user and manager) will now live in a single table.
-- A new `sender` column distinguishes 'user' vs 'manager' messages.

-- ─── 1. Extend messages table ────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN sender       TEXT        NOT NULL DEFAULT 'user',
  ADD COLUMN admin_uid    UUID,
  ADD COLUMN status       TEXT,
  ADD COLUMN sent_at      TIMESTAMPTZ,
  ADD COLUMN error_message TEXT;

-- username is only present on user messages
ALTER TABLE public.messages
  ALTER COLUMN username DROP NOT NULL;

-- ─── 2. Migrate existing bot_outbox rows ─────────────────────────────────────
INSERT INTO public.messages
  (telegram_chat_id, username, text, created_at, sender, admin_uid, status, sent_at, error_message)
SELECT
  telegram_chat_id,
  NULL,
  text,
  created_at,
  'manager',
  admin_uid,
  status,
  sent_at,
  error_message
FROM public.bot_outbox;

-- ─── 3. Remove bot_outbox from realtime publication ──────────────────────────
ALTER PUBLICATION supabase_realtime DROP TABLE public.bot_outbox;

-- ─── 4. Drop bot_outbox ──────────────────────────────────────────────────────
DROP TABLE public.bot_outbox;
