-- Fix: remove username from upsert_client_on_message trigger.
-- The username column was dropped from messages in 20260422000001, but the
-- trigger was not updated — causing every user message INSERT to fail with
-- "column username does not exist", which silently blocked user messages from
-- appearing in the chat while bot messages (which skip the trigger) still worked.
-- The webhook already upserts clients with the correct username before inserting
-- the message, so the trigger only needs to maintain last_seen_at.

CREATE OR REPLACE FUNCTION public.upsert_client_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.sender <> 'user' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.clients (telegram_chat_id, first_seen_at, last_seen_at)
  VALUES (NEW.telegram_chat_id, NEW.created_at, NEW.created_at)
  ON CONFLICT (telegram_chat_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at;

  RETURN NEW;
END;
$$;
