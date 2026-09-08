-- =====================================================================
-- Supabase fundamentals audit, 2026-09-03.
--
-- The 0.0 emergency fix hardened 3 tables (user_profiles,
-- volunteer_opportunities, match_results) because those were the ones
-- with RLS fully disabled. This migration extends the same defence-in-
-- depth pattern to the other 10 public tables, and closes three gaps
-- found by reading every policy rather than assuming the earlier fix
-- generalised.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Revoke anon write grants everywhere else. In every case checked,
--    the existing RLS policies already block anon in practice (they key
--    off auth.uid(), which is NULL for anon) -- this is defence in
--    depth, matching the standard already set for the first 3 tables,
--    not a response to a live hole.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'admins','applications','audit_logs','notifications',
    'opportunity_timeblocks','site_settings','towns','user_status',
    'volunteer_availability','volunteer_hours'
  ])
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. volunteer_opportunities: "Allow everyone to see posts" was
--    USING (true) with no status filter. Harmless today only because
--    every existing row happens to be 'active' -- PostOpportunity.jsx
--    has a working draft-save path, so the first draft anyone saves
--    would have been visible to every anonymous visitor via a direct
--    API call. Owning orgs keep full-status visibility via the existing
--    org_can_crud_their_posts policy; admins via the existing admin
--    policy. No client change needed -- the app already filters
--    status='active' itself, this just makes the database agree.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow everyone to see posts" ON public.volunteer_opportunities;

CREATE POLICY "opportunities: public reads active only"
  ON public.volunteer_opportunities FOR SELECT TO anon, authenticated
  USING (status = 'active');


-- ---------------------------------------------------------------------
-- 3. notifications: "Authenticated users can insert notifications" had
--    WITH CHECK (true) -- any signed-in user could write a notification
--    row for ANY user_id with arbitrary type/message text, a live
--    phishing vector against real accounts. Confirmed no client code
--    currently relies on cross-user inserts (the one helper that could,
--    NotificationsContext's createNotification, is defined but never
--    called anywhere). Cross-user notifications belong behind the
--    create_notification() SECURITY DEFINER function (already locked to
--    trigger-only use) or a future trigger -- not a bare table policy.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "notifications: self insert only"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 4. match_volunteers_for_opportunity(uuid): confirmed dead code (zero
--    call sites in src/). It is SECURITY INVOKER and reads user_profiles
--    directly rather than through public_volunteers, bypassing the
--    consent gate for whoever calls it. RLS on user_profiles already
--    neutralises it in practice (a non-admin, non-counterparty caller
--    gets back nothing), but an unused function with a live PUBLIC
--    EXECUTE grant is a liability with no offsetting benefit.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.match_volunteers_for_opportunity(uuid) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Drop a duplicate, typo'd foreign key. volunteer_opportunities.org_id
--    had two FKs: the real one (-> user_profiles, CASCADE) and a
--    leftover "volunteer_opportunites_org_id_fkey" (-> auth.users,
--    NO ACTION). Redundant now that user_profiles.id itself FKs to
--    auth.users -- every org_id valid under the real FK is
--    automatically valid under this one too.
-- ---------------------------------------------------------------------
ALTER TABLE public.volunteer_opportunities
  DROP CONSTRAINT IF EXISTS volunteer_opportunites_org_id_fkey;
