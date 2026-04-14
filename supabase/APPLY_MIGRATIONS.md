# Applying Supabase migrations

This project uses Supabase CLI migrations. A new migration has been added to create `public.bot_outbox` and essential RLS policies:

- supabase/migrations/20260407T2002_create_bot_outbox.sql

Follow these steps on Windows to apply it.

## Remote Supabase project
1) Install CLI (one time):
   - Chocolatey: choco install supabase -y
   - Or Scoop: scoop install supabase

2) Authenticate (opens browser):
   supabase login

3) Link the repo to your Supabase project (one time):
   supabase link --project-ref <YOUR_PROJECT_REF>

4) Push new migrations to the linked remote DB:
   supabase db push

5) Verify:
   - Table: supabase db query "select to_regclass('public.bot_outbox');"
   - RLS: supabase db query "select relrowsecurity from pg_class where relname = 'bot_outbox';"
   - Policies: supabase db query "select polname from pg_policies where tablename = 'bot_outbox';"

6) (Recommended) Enable Realtime for `public.messages` and `public.bot_outbox` in Supabase Dashboard → Realtime.

## Local development database
If you’re using the local Supabase stack:

1) Start local stack (first time may take a while):
   supabase start

2) Reset/apply migrations and seed:
   supabase db reset

3) Verify with the same SQL queries above.

## Notes
- Ensure your environment variables for the admin panel are set (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
- If you run a backend worker with the Service Role key to deliver Telegram messages, you may also add/update an RLS policy to allow `update` on `public.bot_outbox` for role `service_role` to mark messages as `sent` or `error`.
