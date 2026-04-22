-- Migration: add composite index on messages (telegram_chat_id, created_at DESC)
-- The existing single-column index on telegram_chat_id covers filtering but not
-- sorting. Every chat query fetches messages for one chat ordered by time, so
-- the planner was doing an index scan on telegram_chat_id followed by a sort.
-- The composite index covers both the filter and the ORDER BY in one pass.
-- The old single-column index becomes redundant and is dropped to avoid
-- maintaining two indexes that serve the same filter pattern.

CREATE INDEX idx_messages_chat_created
  ON public.messages (telegram_chat_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_messages_telegram_chat_id;
