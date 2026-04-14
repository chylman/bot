-- Migration: create public.managers table
-- Each row represents one manager, linked 1-to-1 with a Supabase auth user.

CREATE TABLE public.managers (
  -- Use auth user ID directly as the primary key; one user = one manager record.
  user_id  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Enable Row Level Security
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the managers list
CREATE POLICY "managers select for authenticated"
  ON public.managers
  FOR SELECT
  TO authenticated
  USING (true);

-- A manager can only insert/update/delete their own row
CREATE POLICY "managers insert own row"
  ON public.managers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "managers update own row"
  ON public.managers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "managers delete own row"
  ON public.managers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
