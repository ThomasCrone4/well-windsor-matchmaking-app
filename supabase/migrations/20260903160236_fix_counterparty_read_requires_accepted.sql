-- BUG: has_application_with() checked only that an application row exists
-- between the two parties, with no status filter. Caught by a live write
-- test: a volunteer's DOB/email were readable by the org the instant a
-- PENDING application existed, not only after acceptance as intended and
-- as documented in every comment describing this policy. Since every
-- enquiry creates an application, this exposed contact fields for
-- essentially all applications, not just accepted ones.

CREATE OR REPLACE FUNCTION public.has_application_with(target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.status = 'accepted'
      AND (
           (a.volunteer_id = auth.uid() AND a.org_id       = target_id)
        OR (a.org_id       = auth.uid() AND a.volunteer_id = target_id)
      )
  );
$$;
