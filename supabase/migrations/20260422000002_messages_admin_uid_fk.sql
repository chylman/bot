-- Migration: add FK from messages.admin_uid to managers.user_id (integrity fix)
-- admin_uid identifies the manager who sent a message, but previously had no
-- referential constraint — any UUID could be inserted without validation.
-- NOT VALID skips a full table scan on existing rows; VALIDATE then checks them.
-- ON DELETE SET NULL preserves message history if a manager account is removed.

ALTER TABLE public.messages
  ADD CONSTRAINT fk_messages_admin_uid
  FOREIGN KEY (admin_uid) REFERENCES public.managers(user_id)
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.messages
  VALIDATE CONSTRAINT fk_messages_admin_uid;
