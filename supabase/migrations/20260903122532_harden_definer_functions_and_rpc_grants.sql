-- =====================================================================
-- 1. Stop anonymous callers invoking privileged SECURITY DEFINER RPCs.
--    create_notification let anyone push arbitrary notifications to any
--    user_id; log_admin_action let anyone forge audit-trail entries
--    attributed to any admin. Neither is called by the client (verified:
--    the only .rpc() calls are count_volunteers,
--    match_opportunities_by_availability, and three admin hours_* fns).
--    These are meant to be invoked by triggers, which do not need the
--    API roles to hold EXECUTE.
--
--    NOTE: this REVOKE was insufficient on its own -- see the follow-up
--    migration 20260903122820, which also revokes from PUBLIC.
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, character varying, text, uuid)
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid, character varying, uuid, jsonb, jsonb, text)
  FROM anon, authenticated;

-- Signed-in users only; these take a user/notification id as a parameter
-- and would otherwise leak or mutate other people's notification state.
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count(uuid) FROM anon;

-- count_volunteers() and get_public_counts() stay anon-callable: they back
-- the public home page stats and expose only aggregate counts.

-- =====================================================================
-- 2. Pin search_path on every SECURITY DEFINER function in public.
--    Without it, a caller can shadow a referenced object by manipulating
--    search_path and have it run with the definer's privileges. is_admin
--    matters most here: it gates every admin RLS policy.
-- =====================================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                              -- SECURITY DEFINER only
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search\_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
  END LOOP;
END $$;

-- =====================================================================
-- 3. Narrow the volunteer browse view to signed-in users. The page that
--    consumes it (LookingForVolunteers) is org-only behind a
--    ProtectedRoute, so anonymous access was wider than intended.
-- =====================================================================
REVOKE SELECT ON public.public_volunteers FROM anon;
