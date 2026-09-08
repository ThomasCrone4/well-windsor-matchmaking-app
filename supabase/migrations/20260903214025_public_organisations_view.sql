-- Plan 1.7 — anonymous visitors cannot see organisation names.
--
-- The 2026-09-03 audit revoked every anon grant on user_profiles. That was
-- right, but it left `profiles: organizations are public` -- a SELECT policy
-- that names anon -- dead on arrival: a policy grants nothing on its own, it
-- only filters rows a grant already permits. So a logged-out visitor gets
-- 42501 on user_profiles, and both the homepage and the public opportunities
-- browse fall back to the literal string "Organisation" on every listing.
--
-- The fix is NOT `grant select on user_profiles to anon`. RLS filters rows,
-- not columns: the row it would let anon read carries email, contact_number
-- and dob. That publishes every organisation's contact details to the
-- internet. Same reasoning as public_volunteers, and the same shape --
-- an owner-rights view over a fixed, safe column list.

create or replace view public.public_organisations
with (security_invoker = false) as
  select
    id,
    name,
    home_town,
    bio
  from public.user_profiles
  where role = 'organization';

comment on view public.public_organisations is
  'Organisation identity for public listings. Owner rights, so it bypasses '
  'RLS on user_profiles deliberately -- the safety is the column list, which '
  'must never grow to include email, contact_number or dob. Organisations '
  'are public entities; their people are not.';

-- Trap 1b in CLAUDE.md. Supabase ships
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
-- so this view is born with ALL granted to anon and authenticated *by name*.
-- `revoke all ... from public` would look tidy and change nothing. Name the
-- roles, then grant back only SELECT.
revoke all on public.public_organisations from anon, authenticated;
grant select on public.public_organisations to anon, authenticated;
