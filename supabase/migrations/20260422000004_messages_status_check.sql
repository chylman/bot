-- Migration: add CHECK constraint on messages.status
-- The column was migrated from bot_outbox without a constraint, allowing any
-- string. Valid values written by the application are:
--   'pending' — inserted by the admin panel when a manager sends a message
--   'sent'    — set by the send-telegram-message edge function on success
--   'error'   — set by the send-telegram-message edge function on failure
-- NULL is allowed: user and bot messages never have a status.

ALTER TABLE public.messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('pending', 'sent', 'error'));
