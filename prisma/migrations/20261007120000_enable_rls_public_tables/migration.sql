-- Supabase exposes every table in the public schema through PostgREST using
-- the anon/authenticated roles. This app never uses that API: Prisma connects
-- as the table owner, which bypasses RLS. Enable RLS with no policies so the
-- public API gets zero access while Prisma keeps working.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
