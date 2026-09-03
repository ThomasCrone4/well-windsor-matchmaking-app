-- =====================================================================
-- Fix the availability-matching bug, stage 1 of 2 (expand).
--
-- THE BUG: match_opportunities_by_availability reads the
-- volunteer_availability TABLE. Only VolunteerProfilePage ever wrote it,
-- as a hand-maintained "mirror" of the user_profiles.availability_matrix
-- jsonb. Signup wrote only the jsonb. Result: any volunteer who signed up
-- with specific availability and never re-saved their profile was
-- invisible to matching -- 2 of the 3 volunteers with stated availability
-- were in exactly that state, scoring "no overlap" on everything.
--
-- This migration makes the table authoritative and keeps the jsonb in
-- sync during the transition. Stage 2 drops the jsonb columns once the
-- client reads availability from the tables.
--
-- Day index convention (must match src/utils/schedule.js DAYS exactly):
--   Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4,
--   Saturday=5, Sunday=6
-- Verified against existing rows before writing this: Thomas Crone's
-- ["Thursday","Wednesday"] block is stored as {2,3}.
-- =====================================================================


-- Shared label -> index conversion, mirroring dayLabelsToIndices() in
-- schedule.js. Having this in SQL means the trigger and the backfill
-- can't drift from each other.
CREATE OR REPLACE FUNCTION public.day_labels_to_indices(labels jsonb)
RETURNS int[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(idx ORDER BY idx), '{}'::int[])
  FROM (
    SELECT DISTINCT array_position(
             ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
             l
           ) - 1 AS idx
    FROM jsonb_array_elements_text(coalesce(labels, '[]'::jsonb)) AS l
  ) s
  WHERE idx IS NOT NULL AND idx BETWEEN 0 AND 6;
$$;

REVOKE EXECUTE ON FUNCTION public.day_labels_to_indices(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.day_labels_to_indices(jsonb) TO authenticated;


-- ---------------------------------------------------------------------
-- Backfill volunteer_availability from the jsonb for anyone who has
-- availability stated but no rows in the table.
-- ---------------------------------------------------------------------
INSERT INTO public.volunteer_availability
  (volunteer_id, start_date, end_date, days, start_time, end_time)
SELECT p.id,
       nullif(b->>'start_date', '')::date,
       nullif(b->>'end_date',   '')::date,
       public.day_labels_to_indices(b->'days'),
       (b->>'start_time')::time,
       (b->>'end_time')::time
FROM public.user_profiles p
CROSS JOIN LATERAL jsonb_array_elements(p.availability_matrix) AS b
WHERE p.role = 'volunteer'
  AND p.available_anytime = false
  AND p.availability_matrix IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.volunteer_availability va WHERE va.volunteer_id = p.id
  )
  -- days/start_time/end_time are NOT NULL on the table; skip malformed blocks
  AND public.day_labels_to_indices(b->'days') <> '{}'::int[]
  AND nullif(b->>'start_time', '') IS NOT NULL
  AND nullif(b->>'end_time',   '') IS NOT NULL;


-- ---------------------------------------------------------------------
-- Same problem on the opportunity side: when_needed jsonb vs
-- opportunity_timeblocks. PostOpportunity writes both, but any row
-- created another way (the old sample generator) only has jsonb.
-- ---------------------------------------------------------------------
INSERT INTO public.opportunity_timeblocks
  (opportunity_id, start_date, end_date, days, start_time, end_time)
SELECT o.id,
       nullif(b->>'start_date', '')::date,
       nullif(b->>'end_date',   '')::date,
       public.day_labels_to_indices(b->'days'),
       (b->>'start_time')::time,
       (b->>'end_time')::time
FROM public.volunteer_opportunities o
CROSS JOIN LATERAL jsonb_array_elements(o.when_needed) AS b
WHERE o.when_needed IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.opportunity_timeblocks t WHERE t.opportunity_id = o.id
  )
  AND public.day_labels_to_indices(b->'days') <> '{}'::int[]
  AND nullif(b->>'start_time', '') IS NOT NULL
  AND nullif(b->>'end_time',   '') IS NOT NULL;


-- ---------------------------------------------------------------------
-- Make signup write the table too, not just the jsonb. This is the
-- actual bug fix -- without it every new volunteer repeats the problem.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  meta        jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  anytime     boolean := coalesce((meta->>'available_anytime')::boolean, true);
  matrix      jsonb := meta->'availability_matrix';
BEGIN
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
    anytime,
    CASE WHEN anytime THEN NULL ELSE matrix END,
    coalesce((meta->>'public_profile')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  -- The table the matching RPC actually reads.
  IF NOT anytime AND matrix IS NOT NULL AND jsonb_typeof(matrix) = 'array' THEN
    INSERT INTO public.volunteer_availability
      (volunteer_id, start_date, end_date, days, start_time, end_time)
    SELECT NEW.id,
           nullif(b->>'start_date', '')::date,
           nullif(b->>'end_date',   '')::date,
           public.day_labels_to_indices(b->'days'),
           (b->>'start_time')::time,
           (b->>'end_time')::time
    FROM jsonb_array_elements(matrix) AS b
    WHERE public.day_labels_to_indices(b->'days') <> '{}'::int[]
      AND nullif(b->>'start_time', '') IS NOT NULL
      AND nullif(b->>'end_time',   '') IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
