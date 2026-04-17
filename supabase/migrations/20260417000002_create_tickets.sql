-- Migration: create public.tickets table
-- Tickets are created by managers to track upcoming tasks or client follow-ups.
-- Optional link to a client (telegram_chat_id); if the client is deleted the
-- ticket remains (SET NULL) so historical records are preserved.

-- ─── 1. Create the table ────────────────────────────────────────────────────
CREATE TABLE public.tickets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id       UUID        NOT NULL
                               REFERENCES public.managers(user_id)
                               ON DELETE CASCADE,
  telegram_chat_id BIGINT      REFERENCES public.clients(telegram_chat_id)
                               ON DELETE SET NULL,
  title            TEXT        NOT NULL,
  description      TEXT,
  due_at           TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'in_progress', 'closed')),
  priority         TEXT        NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low', 'normal', 'high')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ─────────────────────────────────────────────────────────────
-- Dashboard query: upcoming open tickets for the current manager
CREATE INDEX idx_tickets_manager_status_due
  ON public.tickets (manager_id, status, due_at);

-- Lookup by linked client (e.g. show tickets in chat view)
CREATE INDEX idx_tickets_telegram_chat_id
  ON public.tickets (telegram_chat_id);

-- ─── 3. Auto-update updated_at on every row change ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Any manager can read all tickets (shared visibility across the team)
CREATE POLICY "tickets_select"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (true);

-- A manager can only create tickets for themselves
CREATE POLICY "tickets_insert_own"
  ON public.tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (manager_id = auth.uid());

-- A manager can only update their own tickets
CREATE POLICY "tickets_update_own"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (manager_id = auth.uid())
  WITH CHECK (manager_id = auth.uid());

-- A manager can only delete their own tickets
CREATE POLICY "tickets_delete_own"
  ON public.tickets
  FOR DELETE
  TO authenticated
  USING (manager_id = auth.uid());
