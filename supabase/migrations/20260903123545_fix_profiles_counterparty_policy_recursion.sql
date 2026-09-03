-- The "profiles: counterparty read" policy queried applications inline.
-- applications' own policies reference volunteer_opportunities, whose
-- org_can_crud_their_posts policy queries user_profiles -> cycle ->
-- 42P17 infinite recursion for any signed-in read of user_profiles.
--
-- Doing the lookup inside a SECURITY DEFINER function runs it as the
-- owner, bypassing RLS on applications and cutting the cycle.

CREATE OR REPLACE FUNCTION public.has_application_with(target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE (a.volunteer_id = auth.uid() AND a.org_id       = target_id)
       OR (a.org_id       = auth.uid() AND a.volunteer_id = target_id)
  );
$$;

-- Default EXECUTE is granted to PUBLIC; strip it, then grant deliberately.
REVOKE EXECUTE ON FUNCTION public.has_application_with(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_application_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles: counterparty read" ON public.user_profiles;

CREATE POLICY "profiles: counterparty read"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (public.has_application_with(id));
