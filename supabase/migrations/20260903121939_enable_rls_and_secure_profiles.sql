-- =====================================================================
-- Close anonymous write/read access on the three tables where RLS was off.
-- anon held DELETE/INSERT/UPDATE/TRUNCATE on all three with no RLS,
-- so the whole profile and opportunity dataset was destroyable by anyone.
-- =====================================================================

-- 1. Turn RLS on. This activates the policies that already exist but were
--    inert (4 on user_profiles, 5 on volunteer_opportunities).
ALTER TABLE public.user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results           ENABLE ROW LEVEL SECURITY;

-- 2. Replace the blanket authenticated-read policy. It let any logged-in
--    account read every profile's DOB, phone and email regardless of the
--    user's public_profile setting.
DROP POLICY IF EXISTS "Users can see all other profiles (not secure)" ON public.user_profiles;

-- 3. Row policies for user_profiles.
--    Note volunteers are deliberately NOT publicly readable on the base
--    table: RLS filters rows, not columns, so a browse policy here would
--    expose contact fields too. Volunteer browse goes via the view in (5).

CREATE POLICY "profiles: self read"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles: organizations are public"
  ON public.user_profiles FOR SELECT TO anon, authenticated
  USING (role = 'organization');

CREATE POLICY "profiles: counterparty read"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.applications a
    WHERE (a.volunteer_id = auth.uid() AND a.org_id       = user_profiles.id)
       OR (a.org_id       = auth.uid() AND a.volunteer_id = user_profiles.id)
  ));

CREATE POLICY "profiles: admin read"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. Keep contact fields away from anonymous scrapers. Organisation rows are
--    publicly readable by policy above; this stops anon pulling their inbox
--    and phone number in bulk.
REVOKE SELECT ON public.user_profiles FROM anon;
GRANT  SELECT (
  id, role, name, home_town, skills, bio,
  available_anytime, availability_matrix, public_profile, created_at
) ON public.user_profiles TO anon;

-- 5. Consent-gated volunteer browse, safe columns only.
CREATE OR REPLACE VIEW public.public_volunteers
WITH (security_invoker = false)   -- deliberate: curated projection, owner rights
AS
  SELECT id, name, home_town, skills, bio,
         available_anytime, availability_matrix
  FROM public.user_profiles
  WHERE role = 'volunteer' AND public_profile = true;

GRANT SELECT ON public.public_volunteers TO anon, authenticated;

-- 6. Drop the fabricated match scores. All 153 rows came from Math.random()
--    in sampleDataGenerator.js and were rendered to real volunteers as
--    authoritative match percentages.
TRUNCATE TABLE public.match_results;
