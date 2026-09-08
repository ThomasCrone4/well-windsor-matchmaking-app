-- =====================================================================
-- Data validation for user_profiles, and reliable profile creation.
--
-- Context: 113 profile rows exist but only 13 auth users. ~100 profiles
-- were inserted directly by the old sample-data generator with invented
-- UUIDs -- there was no foreign key to auth.users to stop it. Those rows
-- can never sign in, but they were appearing in the volunteer browse.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Constraints. Verified against current data before adding:
--    roles are only 'organization'/'volunteer', no blank names, no DOB
--    outside a sane range, no volunteers under 13.
-- ---------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_valid
  CHECK (role IN ('volunteer', 'organization'));

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_name_not_blank
  CHECK (btrim(name) <> '');

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_dob_sane
  CHECK (dob IS NULL OR (dob > DATE '1900-01-01' AND dob <= CURRENT_DATE));

-- Minimum age 13. Below that we would be knowingly processing children's
-- personal data, which needs a different lawful basis and parental
-- consent -- out of scope for v0.
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_min_age
  CHECK (
    role <> 'volunteer'
    OR dob IS NULL
    OR dob <= CURRENT_DATE - INTERVAL '13 years'
  );

-- A public volunteer profile must actually say something useful, since
-- that is what organisations browse on.
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_public_needs_detail
  CHECK (
    role <> 'volunteer'
    OR public_profile IS NOT TRUE
    OR (btrim(coalesce(bio, '')) <> '' AND btrim(coalesce(skills, '')) <> '')
  ) NOT VALID;   -- NOT VALID: some existing seeded rows would fail this

-- Every profile must correspond to a real account. NOT VALID so the ~100
-- orphaned seed rows survive; new rows are enforced immediately.
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_id_is_auth_user
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE
  NOT VALID;


-- ---------------------------------------------------------------------
-- 2. Hide profiles with no auth account from the volunteer browse.
--    Non-destructive: the seed rows stay, they just stop being shown to
--    organisations as if they were real people.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_volunteers
WITH (security_invoker = false)
AS
  SELECT p.id, p.name, p.home_town, p.skills, p.bio,
         p.available_anytime, p.availability_matrix
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'volunteer'
    AND p.public_profile = true;

GRANT SELECT ON public.public_volunteers TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Create the profile row from a trigger instead of from the client.
--
--    The client previously did signUp() then a separate insert. That
--    breaks whenever signUp returns no session (email confirmation on),
--    leaving an auth account with no profile -- a half-created user with
--    no way to recover. Doing it in a trigger makes signup atomic and
--    works in both confirmation modes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  -- Only act on signups that came through the app (which always sets
  -- role). Anything else -- dashboard invites, for instance -- is left
  -- alone rather than getting a malformed profile.
  IF meta->>'role' IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (
    id, role, name, email, home_town, dob, contact_number,
    bio, skills, available_anytime, availability_matrix, public_profile
  )
  VALUES (
    NEW.id,
    meta->>'role',
    coalesce(nullif(btrim(meta->>'name'), ''), 'Unnamed'),
    NEW.email,
    nullif(btrim(meta->>'home_town'), ''),
    (meta->>'dob')::date,
    nullif(btrim(meta->>'contact_number'), ''),
    nullif(btrim(meta->>'bio'), ''),
    nullif(btrim(meta->>'skills'), ''),
    coalesce((meta->>'available_anytime')::boolean, true),
    CASE WHEN coalesce((meta->>'available_anytime')::boolean, true)
         THEN NULL ELSE meta->'availability_matrix' END,
    coalesce((meta->>'public_profile')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
