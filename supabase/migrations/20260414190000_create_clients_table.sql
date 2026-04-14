-- Migration: create public.clients table
-- Each Telegram chat maps to exactly one client (telegram_chat_id is the PK).
-- Existing tables (messages, bot_outbox, chat_sessions) reference this table
-- via telegram_chat_id as a foreign key.
-- A trigger on messages keeps the client row up-to-date automatically.

-- ─── 1. Create the table ────────────────────────────────────────────────────
CREATE TABLE public.clients (
  telegram_chat_id BIGINT      PRIMARY KEY,
  username         TEXT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT
);

-- ─── 2. Back-fill from existing messages ────────────────────────────────────
-- Insert one row per unique chat id, taking the earliest / latest timestamps.
INSERT INTO public.clients (telegram_chat_id, username, first_seen_at, last_seen_at)
SELECT
  telegram_chat_id,
  -- pick the most recent username seen for this chat
  (ARRAY_AGG(username ORDER BY created_at DESC))[1] AS username,
  MIN(created_at) AS first_seen_at,
  MAX(created_at) AS last_seen_at
FROM public.messages
WHERE telegram_chat_id IS NOT NULL
GROUP BY telegram_chat_id
ON CONFLICT (telegram_chat_id) DO NOTHING;

-- ─── 3. Add foreign keys on existing tables ─────────────────────────────────
-- NOT VALID lets us add the constraint without a full table scan on existing
-- rows that were already backfilled above; VALIDATE finishes the job.

ALTER TABLE public.messages
  ADD CONSTRAINT fk_messages_client
  FOREIGN KEY (telegram_chat_id) REFERENCES public.clients(telegram_chat_id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.messages
  VALIDATE CONSTRAINT fk_messages_client;

ALTER TABLE public.bot_outbox
  ADD CONSTRAINT fk_bot_outbox_client
  FOREIGN KEY (telegram_chat_id) REFERENCES public.clients(telegram_chat_id)
  ON DELETE CASCADE NOT VALID;

-- bot_outbox may have rows for chats that never sent a message (rare), so
-- insert any missing clients before validating.
INSERT INTO public.clients (telegram_chat_id)
SELECT DISTINCT telegram_chat_id
FROM public.bot_outbox
WHERE telegram_chat_id IS NOT NULL
ON CONFLICT (telegram_chat_id) DO NOTHING;

ALTER TABLE public.bot_outbox
  VALIDATE CONSTRAINT fk_bot_outbox_client;

ALTER TABLE public.chat_sessions
  ADD CONSTRAINT fk_chat_sessions_client
  FOREIGN KEY (telegram_chat_id) REFERENCES public.clients(telegram_chat_id)
  ON DELETE CASCADE NOT VALID;

INSERT INTO public.clients (telegram_chat_id)
SELECT DISTINCT telegram_chat_id
FROM public.chat_sessions
WHERE telegram_chat_id IS NOT NULL
ON CONFLICT (telegram_chat_id) DO NOTHING;

ALTER TABLE public.chat_sessions
  VALIDATE CONSTRAINT fk_chat_sessions_client;

-- ─── 4. Trigger: auto-upsert client on every incoming message ────────────────
CREATE OR REPLACE FUNCTION public.upsert_client_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.clients (telegram_chat_id, username, first_seen_at, last_seen_at)
  VALUES (NEW.telegram_chat_id, NEW.username, NEW.created_at, NEW.created_at)
  ON CONFLICT (telegram_chat_id) DO UPDATE
    SET username     = EXCLUDED.username,
        last_seen_at = EXCLUDED.last_seen_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_upsert_client_on_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.upsert_client_on_message();

-- ─── 5. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Managers can read all clients
CREATE POLICY "clients_select"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (true);

-- Managers can update client notes / metadata
CREATE POLICY "clients_update"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
