-- =====================================================================
-- Enforce "user_profiles rows must correspond to a real auth account".
--
-- 100 of 113 profile rows had no matching auth.users row -- inserted
-- directly by the old sample-data generator, which had no foreign key
-- stopping it. They could never sign in, but count_volunteers() and
-- get_public_counts() counted them anyway (the homepage claimed 107
-- volunteers against 6 actually browsable), and they populated the
-- volunteer browse organisations use to find real people.
--
-- Checked first: nothing references these rows (applications,
-- opportunities, availability, admins, user_status, notifications all
-- return 0), so this is a clean delete, not a cascade.
-- =====================================================================

DELETE FROM public.user_profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Now that no orphans remain, the FK can be validated instead of resting
-- on NOT VALID. Validating scans existing rows but adds no new lock beyond
-- what ALTER TABLE already takes, and is cheap at this table size.
ALTER TABLE public.user_profiles
  VALIDATE CONSTRAINT user_profiles_id_is_auth_user;

-- Count only real accounts. SECURITY DEFINER + search_path already correct
-- from the earlier hardening migration; only the query changes.
CREATE OR REPLACE FUNCTION public.count_volunteers()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'volunteer';
$$;

CREATE OR REPLACE FUNCTION public.get_public_counts()
RETURNS TABLE(volunteers bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'volunteer';
$$;
