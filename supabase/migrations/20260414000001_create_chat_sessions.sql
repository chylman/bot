-- chat_sessions: tracks which manager is currently connected to each chat.
-- PRIMARY KEY on telegram_chat_id enforces the one-manager-per-chat rule:
-- an INSERT from a second manager will fail with a unique constraint error.
-- When a row exists  → that manager is connected.
-- When no row exists → chat is unattended (bot echo is active).

CREATE TABLE public.chat_sessions (
  telegram_chat_id BIGINT      PRIMARY KEY,
  manager_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see who is currently connected
CREATE POLICY "chat_sessions_select"
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (true);

-- A manager can only claim a session for themselves
CREATE POLICY "chat_sessions_insert_own"
  ON public.chat_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (manager_id = auth.uid());

-- A manager can only disconnect themselves (delete their own row)
CREATE POLICY "chat_sessions_delete_own"
  ON public.chat_sessions
  FOR DELETE
  TO authenticated
  USING (manager_id = auth.uid());
