ALTER TABLE public.bot_settings
  ADD COLUMN greeting_enabled  BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN greeting_msg      TEXT             NOT NULL DEFAULT 'Привет! Я помощник службы поддержки. Чем могу помочь?',
  ADD COLUMN greeting_thr      FLOAT            NOT NULL DEFAULT 0.75 CHECK (greeting_thr BETWEEN 0 AND 1),
  ADD COLUMN greeting_phrase   TEXT             NOT NULL DEFAULT 'Привет, здравствуй, добрый день, добрый вечер, доброе утро, хай, ку, hi, hello',
  ADD COLUMN greeting_embedding vector(1536);
