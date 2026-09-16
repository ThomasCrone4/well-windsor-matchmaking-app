-- Restore anon's SELECT on `admins`. Revoking it broke the logged-out browse.
--
-- 20260914150723 did `revoke all on public.admins from anon, authenticated`
-- to take away INSERT, UPDATE and DELETE. It took SELECT with them, and that
-- is load-bearing in a way that is not obvious from this table at all:
--
--   `volunteer_opportunities`, `user_profiles`, `applications` and `towns`
--   each carry a policy scoped to the PUBLIC role whose USING clause is
--   `is_admin(auth.uid())`. PUBLIC includes anon. is_admin() is not
--   SECURITY DEFINER, so it reads `admins` as the caller — and with no
--   SELECT grant the whole query fails with
--   `42501: permission denied for table admins`.
--
-- So a revoke on the admin table turned the public role browse into a 401.
-- Caught by re-running probe_security2, which asserts the logged-out browse
-- still returns roles; reading the migration back would never have shown it.
--
-- Granting SELECT back is safe and is exactly the state that existed before:
-- RLS is on, and the only SELECT policy is `auth.uid() = user_id`, so anon
-- reads zero rows. The privilege is what is_admin() needs to *run*, not what
-- it needs to see.
--
-- Making is_admin() SECURITY DEFINER would also fix it and is tempting, but
-- it holds EXECUTE for PUBLIC, so it would let anyone ask whether any given
-- id is an admin. The grant is the smaller change.

grant select on public.admins to anon;

comment on table public.admins is
  'Who may use the admin dashboard. anon and authenticated need SELECT here '
  'even though RLS shows them nothing: policies on other tables call '
  'is_admin(), which is not SECURITY DEFINER and reads this table as the '
  'caller. Revoking SELECT breaks the logged-out browse.';
