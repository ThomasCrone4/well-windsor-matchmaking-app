-- Follow-up to 20260903200909, caught by probing from outside rather
-- than by reading the migration back.
--
-- The previous migration ended with:
--
--     revoke all on public.opportunity_applicants from public;
--     grant select on public.opportunity_applicants to authenticated;
--
-- and an anon probe still got HTTP 200 (an empty list, because
-- auth.uid() is null for anon, but 200 rather than 42501). The reason
-- is Supabase's default privileges:
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- Every view is born with ALL granted to anon and authenticated as
-- role grants. Revoking from PUBLIC does not touch a role grant --
-- the same asymmetry as trap 1 in CLAUDE.md, read the other way
-- round: there, anon inherited a PUBLIC grant and revoking from anon
-- did nothing; here, anon holds its own grant and revoking from
-- PUBLIC does nothing. Name the role explicitly, in both directions.
--
-- public_volunteers has the same leftovers: SELECT was revoked from
-- anon during the 2026-09-03 audit, but INSERT / UPDATE / DELETE /
-- TRUNCATE were not. A join view is not auto-updatable, so those
-- writes would fail on their own -- which is exactly why nobody
-- noticed them.

revoke all on public.opportunity_applicants from anon, authenticated;
revoke all on public.org_outreach_sent      from anon, authenticated;
revoke all on public.public_volunteers      from anon, authenticated;

grant select on public.opportunity_applicants to authenticated;
grant select on public.org_outreach_sent      to authenticated;
grant select on public.public_volunteers      to authenticated;
