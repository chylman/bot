-- Migration: add created_by column to knowledge_base
-- Links each entry to the manager who created it, enabling audit trails
-- and ownership-based filtering. Matches the pattern used in tickets.
-- ON DELETE SET NULL preserves entries if a manager account is removed.
-- Existing rows get NULL (unknown creator) — this is intentional.

ALTER TABLE public.knowledge_base
  ADD COLUMN created_by UUID
    REFERENCES public.managers(user_id)
    ON DELETE SET NULL;

-- Tighten the insert policy: a manager can only create entries for themselves.
DROP POLICY "kb_insert" ON public.knowledge_base;

CREATE POLICY "kb_insert"
  ON public.knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
