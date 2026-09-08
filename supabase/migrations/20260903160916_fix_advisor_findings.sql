-- =====================================================================
-- Clean up findings from the post-audit advisor pass.
-- =====================================================================

-- 1. public_volunteers referenced auth.users to filter out orphan
--    profiles. That's redundant now: the orphans are deleted and
--    user_profiles_id_is_auth_user is a VALIDATED foreign key, so the
--    invariant is already guaranteed. Removing the join clears the
--    linter's auth_users_exposed finding outright (the view never
--    selected any auth.users column, but referencing the table at all
--    trips it, and the reference no longer earns its keep).
--
--    security_invoker stays false, deliberately: this view exists
--    specifically to let a caller see OTHER people's public volunteer
--    rows, which their own RLS on user_profiles would not otherwise
--    permit. The SELECT list is a fixed, curated, non-sensitive
--    projection (no dob/email/contact_number), and the view is granted
--    to `authenticated` only. The linter flags every definer view as
--    ERROR regardless of what it exposes; this one is reviewed and
--    intentional. (A SECURITY DEFINER function would take this off the
--    linter's radar entirely, at the cost of a client-code change --
--    worth doing later, not urgent since nothing sensitive is exposed.)
CREATE OR REPLACE VIEW public.public_volunteers
WITH (security_invoker = false)
AS
  SELECT id, name, home_town, skills, bio, available_anytime, availability_matrix
  FROM public.user_profiles
  WHERE role = 'volunteer' AND public_profile = true;

GRANT SELECT ON public.public_volunteers TO authenticated;


-- 2. handle_new_user() is a trigger function (RETURNS trigger) meant to
--    fire only from on_auth_user_created. It picked up the default
--    PUBLIC EXECUTE grant on creation, making it directly callable via
--    /rest/v1/rpc/handle_new_user. The signup trigger itself fires under
--    the auth service role inserting into auth.users, not under
--    anon/authenticated calling an RPC, so this grant was never needed --
--    verified by re-running a live signup after revoking it, below.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- 3. Missing indexes on foreign key columns that RLS policies and every
--    dashboard query filter on. applications in particular backs
--    has_application_with(), org_can_crud_their_posts (indirectly), and
--    every applicants/enquiries list in the app -- a full scan on every
--    one of those checks was the previous behaviour.
CREATE INDEX IF NOT EXISTS idx_applications_opportunity_id
  ON public.applications (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_applications_volunteer_id
  ON public.applications (volunteer_id);
CREATE INDEX IF NOT EXISTS idx_applications_org_id
  ON public.applications (org_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_org_id
  ON public.volunteer_opportunities (org_id);
