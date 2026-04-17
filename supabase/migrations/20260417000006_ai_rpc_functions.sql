-- Migration: RPC helpers used by auto-reply edge function

-- ── 1. Vector similarity search in knowledge_base ───────────────────────────
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(384),
  match_threshold float,
  match_count     int
)
RETURNS TABLE (
  id         UUID,
  question   TEXT,
  answer     TEXT,
  category   TEXT,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    question,
    answer,
    category,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base
  WHERE
    is_active = true
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 2. Upsert + increment daily AI usage counter ─────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_date   DATE,
  p_tokens INTEGER
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_usage (date, calls, tokens_used, updated_at)
    VALUES (p_date, 1, p_tokens, now())
  ON CONFLICT (date) DO UPDATE
    SET calls       = ai_usage.calls + 1,
        tokens_used = ai_usage.tokens_used + p_tokens,
        updated_at  = now();
END;
$$;
