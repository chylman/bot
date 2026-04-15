-- Fix: upsert_client_on_message must only fire for user messages.
-- After consolidating bot_outbox into messages, manager messages (sender='manager')
-- also insert into messages — triggering a client upsert with username=NULL,
-- which would overwrite the real client username.

CREATE OR REPLACE FUNCTION public.upsert_client_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only track clients from real user messages
  IF NEW.sender <> 'user' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.clients (telegram_chat_id, username, first_seen_at, last_seen_at)
  VALUES (NEW.telegram_chat_id, NEW.username, NEW.created_at, NEW.created_at)
  ON CONFLICT (telegram_chat_id) DO UPDATE
    SET username     = EXCLUDED.username,
        last_seen_at = EXCLUDED.last_seen_at;
  RETURN NEW;
END;
$$;
