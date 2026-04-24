-- Single-row settings table for the AI bot configuration.
-- id is always 1 — enforced by the CHECK constraint and the seed INSERT below.

CREATE TABLE public.bot_settings (
  id               INT          PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  model            TEXT         NOT NULL DEFAULT 'deepseek-chat',
  system_prompt    TEXT         NOT NULL DEFAULT '',
  max_tokens       INT          NOT NULL DEFAULT 300  CHECK (max_tokens  BETWEEN 50  AND 4000),
  temperature      FLOAT        NOT NULL DEFAULT 0.5  CHECK (temperature BETWEEN 0   AND 2),
  daily_limit      INT          NOT NULL DEFAULT 200  CHECK (daily_limit  BETWEEN 1   AND 10000),
  history_count    INT          NOT NULL DEFAULT 10   CHECK (history_count BETWEEN 0  AND 50),
  kb_top_k         INT          NOT NULL DEFAULT 3    CHECK (kb_top_k     BETWEEN 0   AND 20),
  similarity_thr   FLOAT        NOT NULL DEFAULT 0.5  CHECK (similarity_thr BETWEEN 0 AND 1),
  fallback_msg     TEXT         NOT NULL DEFAULT 'Извините, автоответ временно недоступен. Наш менеджер скоро свяжется с вами.',
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by       UUID         REFERENCES auth.users (id) ON DELETE SET NULL
);

-- Seed the single row with current production defaults
INSERT INTO public.bot_settings (
  id, model, system_prompt, max_tokens, temperature,
  daily_limit, history_count, kb_top_k, similarity_thr, fallback_msg
) VALUES (
  1,
  'deepseek-chat',
  'Ты — дружелюбный помощник службы поддержки приложения для создания тренировок.
Приложение специализируется на футбольных тренировках для детей и взрослых, а также на общефизической подготовке.
Отвечай коротко, по делу, на русском языке.
Если вопрос выходит за рамки приложения или ты не знаешь ответа — скажи:
"Этот вопрос лучше уточнить у нашего менеджера, он скоро подключится к чату."
Не придумывай функции или возможности, которых нет в базе знаний.',
  300,
  0.5,
  200,
  10,
  3,
  0.5,
  'Извините, в данный момент автоответ недоступен. Наш менеджер скоро свяжется с вами.'
);

-- RLS: managers can read and update, but not insert or delete
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_settings: authenticated can select"
  ON public.bot_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bot_settings: authenticated can update"
  ON public.bot_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (id = 1);
