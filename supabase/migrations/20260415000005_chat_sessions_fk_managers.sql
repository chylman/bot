-- Add a FK from chat_sessions.manager_id to managers.user_id so that
-- PostgREST can resolve the chat_sessions -> managers join.

ALTER TABLE public.chat_sessions
  ADD CONSTRAINT fk_chat_sessions_manager
  FOREIGN KEY (manager_id) REFERENCES public.managers(user_id) ON DELETE CASCADE;
