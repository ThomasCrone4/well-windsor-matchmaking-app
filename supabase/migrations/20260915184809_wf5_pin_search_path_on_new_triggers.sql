-- Workflow 5, follow-up — pin search_path on the two trigger functions added
-- by 20260915155917.
--
-- The security advisor flags `function_search_path_mutable` on both. Every
-- other function in this database sets `search_path`, and these two were
-- written without it — an inconsistency, and the kind that is only ever
-- noticed by running the linter.
--
-- Both are SECURITY INVOKER, so the exposure is smaller than it would be on a
-- SECURITY DEFINER function: they run as the caller, not as the owner. But
-- they are the two guards standing between a browser and erasing a role, and
-- "smaller" is not the standard this project holds. An unqualified name in a
-- function with a mutable search_path resolves against whatever the caller
-- has put in front of it.
--
-- CREATE OR REPLACE keeps the ACLs that 20260915155917 set (owner and
-- service_role only), so there is no trap 1c here. Restated below as an
-- assertion rather than an assumption.

create or replace function public.volunteer_opportunities_no_hard_delete()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Scoped to the browser roles: deleting an account cascades through
  -- user_profiles into this table as the service role, and ACC-6 must work.
  if current_user in ('authenticated', 'anon') then
    raise exception
      'Roles are removed, not deleted: set deleted_at so registrations survive.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create or replace function public.volunteer_opportunities_removal_is_final()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception
      'A removed role cannot be restored. Post it again if you need it back.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.volunteer_opportunities_no_hard_delete() from public;
revoke all on function public.volunteer_opportunities_no_hard_delete() from anon, authenticated;
revoke all on function public.volunteer_opportunities_removal_is_final() from public;
revoke all on function public.volunteer_opportunities_removal_is_final() from anon, authenticated;
