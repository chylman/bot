-- Migration: enable pgvector extension and create knowledge_base table
-- Embeddings use gte-small model (384 dimensions) via Supabase AI — no external API needed.

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── knowledge_base ──────────────────────────────────────────────────────────
CREATE TABLE public.knowledge_base (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT        NOT NULL,
  answer      TEXT        NOT NULL,
  category    TEXT,
  embedding   vector(384),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast cosine similarity search
CREATE INDEX idx_knowledge_base_embedding
  ON public.knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Auto-update updated_at (reuse existing function set_updated_at)
CREATE TRIGGER trg_knowledge_base_updated_at
BEFORE UPDATE ON public.knowledge_base
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_select"
  ON public.knowledge_base FOR SELECT TO authenticated USING (true);

CREATE POLICY "kb_insert"
  ON public.knowledge_base FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "kb_update"
  ON public.knowledge_base FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "kb_delete"
  ON public.knowledge_base FOR DELETE TO authenticated USING (true);

-- Also allow service_role to read (needed from edge functions)
CREATE POLICY "kb_select_service"
  ON public.knowledge_base FOR SELECT TO service_role USING (true);

CREATE POLICY "kb_update_service"
  ON public.knowledge_base FOR UPDATE TO service_role USING (true) WITH CHECK (true);
