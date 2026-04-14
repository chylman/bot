-- Automatically create a managers row whenever a new auth user is created.
-- SECURITY DEFINER lets the function run as the owner (postgres) so it can
-- insert into public.managers regardless of the caller's RLS context.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.managers (user_id, name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.email,
      'Manager'
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: add all users who signed up before this migration
INSERT INTO public.managers (user_id, name)
SELECT
  id,
  COALESCE(
    raw_user_meta_data->>'name',
    raw_user_meta_data->>'full_name',
    email,
    'Manager'
  )
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
