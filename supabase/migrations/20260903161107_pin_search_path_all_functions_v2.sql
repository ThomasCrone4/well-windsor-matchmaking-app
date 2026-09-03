-- Extends the earlier SECURITY DEFINER-only search_path pin to every
-- function in public. Lower risk on invoker functions (no privilege
-- escalation possible -- they only ever run with the caller's own
-- rights), but free and correct to close out. Excludes functions owned
-- by an extension (pgvector's own C functions live in public because the
-- extension does; ALTER FUNCTION on those fails with "must be owner").
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search\_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
  END LOOP;
END $$;
