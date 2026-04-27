-- Switch embedding model from gte-large (1024d) to OpenAI text-embedding-3-small (1536d).
-- Re-generate embeddings via the generate-embedding edge function after deploying.

-- 1. Drop existing index
DROP INDEX IF EXISTS idx_knowledge_base_embedding;

-- 2. Resize column to 1536d (nulls out all existing vectors)
ALTER TABLE public.knowledge_base
  ALTER COLUMN embedding TYPE vector(1536);

-- 3. Clear stale embeddings
UPDATE public.knowledge_base SET embedding = NULL;

-- 4. Recreate index for 1536-dim cosine search
CREATE INDEX idx_knowledge_base_embedding
  ON public.knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 32);

-- 5. Update RPC to accept 1536-dim query vectors
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(1536),
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
