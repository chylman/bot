-- Add high-confidence threshold for direct KB answers (skips DeepSeek entirely).
-- When the top KB result similarity >= similarity_exact_thr, the stored answer
-- is sent to the user verbatim without calling the AI model.

ALTER TABLE public.bot_settings
  ADD COLUMN similarity_exact_thr FLOAT NOT NULL DEFAULT 0.85
    CHECK (similarity_exact_thr BETWEEN 0 AND 1);
