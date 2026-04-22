-- Migration: replace TEXT+CHECK enum columns with native PostgreSQL ENUM types
-- Affected columns:
--   messages.sender   ('user' | 'manager' | 'bot')
--   tickets.status    ('open' | 'in_progress' | 'closed')
--   tickets.priority  ('low' | 'normal' | 'high')
--
-- Benefits over TEXT+CHECK:
--   • Smaller storage (4 bytes OID vs variable-length text)
--   • Invalid values rejected by the type system, not just a constraint
--   • Self-documenting schema
--   • Extending is a single ALTER TYPE ... ADD VALUE (no DROP/recreate constraint)

-- ─── 1. Create enum types ────────────────────────────────────────────────────
CREATE TYPE public.message_sender   AS ENUM ('user', 'manager', 'bot');
CREATE TYPE public.ticket_status    AS ENUM ('open', 'in_progress', 'closed');
CREATE TYPE public.ticket_priority  AS ENUM ('low', 'normal', 'high');

-- ─── 2. Drop redundant CHECK constraints ────────────────────────────────────
ALTER TABLE public.messages DROP CONSTRAINT messages_sender_check;
ALTER TABLE public.tickets  DROP CONSTRAINT tickets_status_check;
ALTER TABLE public.tickets  DROP CONSTRAINT tickets_priority_check;

-- ─── 3. Drop view that depends on messages.sender ───────────────────────────
DROP VIEW public.clients_with_last_message;

-- ─── 4. Drop defaults before type conversion (PostgreSQL requirement) ────────
ALTER TABLE public.messages ALTER COLUMN sender   DROP DEFAULT;
ALTER TABLE public.tickets  ALTER COLUMN status   DROP DEFAULT;
ALTER TABLE public.tickets  ALTER COLUMN priority DROP DEFAULT;

-- ─── 5. Convert columns ──────────────────────────────────────────────────────
ALTER TABLE public.messages
  ALTER COLUMN sender TYPE public.message_sender
    USING sender::public.message_sender;

ALTER TABLE public.tickets
  ALTER COLUMN status TYPE public.ticket_status
    USING status::public.ticket_status;

ALTER TABLE public.tickets
  ALTER COLUMN priority TYPE public.ticket_priority
    USING priority::public.ticket_priority;

-- ─── 6. Re-apply defaults using the new types ────────────────────────────────
ALTER TABLE public.messages ALTER COLUMN sender   SET DEFAULT 'user'::public.message_sender;
ALTER TABLE public.tickets  ALTER COLUMN status   SET DEFAULT 'open'::public.ticket_status;
ALTER TABLE public.tickets  ALTER COLUMN priority SET DEFAULT 'normal'::public.ticket_priority;

-- ─── 7. Recreate the view (identical definition, sender now typed as enum) ───
CREATE OR REPLACE VIEW public.clients_with_last_message AS
SELECT
  c.telegram_chat_id,
  c.username,
  c.first_seen_at,
  c.last_seen_at,
  c.notes,
  m.text       AS last_message_text,
  m.sender     AS last_message_sender,
  m.created_at AS last_message_at
FROM public.clients c
LEFT JOIN LATERAL (
  SELECT text, sender, created_at
  FROM public.messages
  WHERE telegram_chat_id = c.telegram_chat_id
  ORDER BY created_at DESC
  LIMIT 1
) m ON true;

GRANT SELECT ON public.clients_with_last_message TO authenticated;
