-- Migration: remove username column from messages (3NF fix)
-- username is a property of the client, not the message.
-- The canonical value lives in clients.username and is kept up-to-date
-- by the upsert_client_on_message trigger. Storing it redundantly on
-- every message row violated 3NF: username was functionally dependent
-- on telegram_chat_id, not on messages.id.
-- To get the sender's name, JOIN clients ON clients.telegram_chat_id = messages.telegram_chat_id.

ALTER TABLE public.messages DROP COLUMN username;
