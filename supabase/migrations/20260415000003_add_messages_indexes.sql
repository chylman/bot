-- Indexes for common query patterns on messages table.
-- telegram_chat_id: used in every chat query and realtime filter.
-- sender: used in page.tsx to filter user messages for sidebar/unread counts.

CREATE INDEX IF NOT EXISTS idx_messages_telegram_chat_id ON public.messages (telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender);
