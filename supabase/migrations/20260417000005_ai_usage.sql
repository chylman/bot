-- Migration: daily AI usage counter
-- Tracks DeepSeek API calls and tokens per day to enforce application-level limits.

CREATE TABLE public.ai_usage (
  date          DATE    PRIMARY KEY DEFAULT CURRENT_DATE,
  calls         INTEGER NOT NULL DEFAULT 0,
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily limit constants (adjust as needed)
-- Max calls per day before auto-reply is suppressed
COMMENT ON TABLE public.ai_usage IS 'daily_call_limit=200';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select"
  ON public.ai_usage FOR SELECT TO authenticated USING (true);

-- Only service_role (edge functions) can insert/update
CREATE POLICY "ai_usage_all_service"
  ON public.ai_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
