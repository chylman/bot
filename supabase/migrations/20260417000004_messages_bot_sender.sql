-- Migration: add 'bot' as a valid sender in messages table
-- Bot messages are AI-generated responses from DeepSeek via auto-reply function.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_check
  CHECK (sender IN ('user', 'manager', 'bot'));
