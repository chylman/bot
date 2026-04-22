-- Migration: drop redundant FK on chat_sessions.manager_id (integrity fix)
-- The original CREATE TABLE declared an inline REFERENCES auth.users(id),
-- creating the auto-named constraint chat_sessions_manager_id_fkey.
-- Migration 20260415000005 later added fk_chat_sessions_manager which
-- references managers.user_id (itself a FK to auth.users(id)), making
-- the original constraint fully subsumed and redundant.
-- Keeping both causes every INSERT/UPDATE to validate the same column twice.

ALTER TABLE public.chat_sessions
  DROP CONSTRAINT chat_sessions_manager_id_fkey;
