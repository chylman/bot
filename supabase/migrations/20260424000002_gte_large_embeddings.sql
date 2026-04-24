-- Switch embedding model from gte-small (384d) to gte-large (1024d).
-- Existing embeddings are cleared — re-generate them after deploying edge functions.

-- 1. Drop the old IVFFlat index (can't ALTER index type in-place)
DROP INDEX IF EXISTS idx_knowledge_base_embedding;

-- 2. Resize the embedding column (nulls out all existing vectors)
ALTER TABLE public.knowledge_base
  ALTER COLUMN embedding TYPE vector(1024);

-- 3. Clear any stale 384-dim embeddings so match_knowledge_base
--    does not mix dimensions until re-generation completes
UPDATE public.knowledge_base SET embedding = NULL;

-- 4. Recreate index for 1024-dim cosine search.
--    lists = 32 is a reasonable starting point for up to ~1000 rows
--    (guideline: sqrt(rows), at least 10).
CREATE INDEX idx_knowledge_base_embedding
  ON public.knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 32);

-- 5. Update match_knowledge_base RPC to accept 1024-dim query vectors
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(1024),
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
