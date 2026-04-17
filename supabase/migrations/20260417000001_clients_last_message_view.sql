-- Migration: create view clients_with_last_message
-- Combines clients with their most recent message (any sender) via a lateral join.
-- Used by the dashboard chat preview block to show last message text and sender
-- without duplicating data in the clients table.

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

-- Grant access to authenticated users (mirrors clients RLS)
GRANT SELECT ON public.clients_with_last_message TO authenticated;
