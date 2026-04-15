-- Allow any authenticated manager to delete any chat session (force-disconnect).
-- Previously only the session owner could delete their own row.

DROP POLICY "chat_sessions_delete_own" ON public.chat_sessions;

CREATE POLICY "chat_sessions_delete_any"
  ON public.chat_sessions
  FOR DELETE
  TO authenticated
  USING (true);
