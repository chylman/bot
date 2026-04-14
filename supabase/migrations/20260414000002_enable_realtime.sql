-- Enable Supabase Realtime for all tables used by the admin panel.
-- Without this, postgres_changes subscriptions in the browser receive nothing.

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_outbox;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
