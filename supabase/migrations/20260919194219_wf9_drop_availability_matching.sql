-- Workflow 9, batch 9.2 -- availability matching, and volunteer availability
-- with it.
--
-- APPLIED 2026-09-19 as 20260919194219, after 9.2's client reached the live
-- site (verified by fetching the deployed bundle and finding zero references
-- to any availability column, table or RPC).
--
-- WHY IT WAS HELD BACK. There is one database and two deploys. A migration
-- reaches production the moment it is applied; the client reaches production
-- when `main` is merged and Cloudflare builds it. This migration drops columns
-- the CURRENTLY DEPLOYED site still reads and writes, so applying it before
-- that site is replaced breaks, for real users on a live site:
--
--   * the volunteer profile page -- it selects and updates
--     available_anytime / availability_matrix and rewrites volunteer_availability
--     on every save;
--   * Find Volunteers -- it names both columns in its select on
--     public_volunteers, and a missing column is a 400, not a blank;
--   * sign-up -- it passes the availability metadata handle_new_user reads.
--
-- So: merge and deploy 9.2's client commit FIRST, confirm the deployed site no
-- longer mentions availability, and only then apply this. The reverse order has
-- a broken window in it whose length is however long the merge takes.
--
-- WHAT IS BEING DESTROYED, on purpose and with the user's sign-off (WF9-1 in
-- PENDING-DECISIONS.md): real people's data. As of 2026-09-18 that is 5
-- volunteer_availability rows belonging to 3 real volunteers, plus the
-- availability_matrix / available_anytime values on the real profiles. It is
-- not recoverable from the archive branch, which preserves the CODE and not the
-- DATA. The decision is that a weekly grid filled in at sign-up is stale within
-- a fortnight, so keeping it is worse than losing it.

-- NOTE ON TRANSACTIONS: there is deliberately no `begin;`/`commit;` here.
-- The Supabase connector wraps an apply in its own transaction -- a failed
-- apply records nothing and rolls back whole -- and a nested COMMIT inside
-- that would end it early, leaving the statements after it running outside
-- any transaction. So the guard below relies on the connector's transaction,
-- and the temp table is dropped explicitly rather than ON COMMIT.

-- ---------------------------------------------------------------------------
-- 0. Guard rails.
--
-- The instruction was to remove data from these specific fields and nothing
-- else, so that is asserted rather than promised. Counts of every table that
-- holds people's data are taken here and checked again at the bottom, inside
-- the same transaction: if this migration has deleted a single account,
-- registration, role, message, notification or outbox row, the check raises
-- and the whole thing rolls back with nothing changed.
--
-- It cannot catch what it does not count, so the list is every table with
-- user data in it, not a sample.
-- ---------------------------------------------------------------------------
drop table if exists _wf92_before;
create temp table _wf92_before as
select 'user_profiles' as t, count(*) as n from public.user_profiles
union all select 'auth_users',             count(*) from auth.users
union all select 'applications',           count(*) from public.applications
union all select 'volunteer_opportunities',count(*) from public.volunteer_opportunities
union all select 'opportunity_timeblocks', count(*) from public.opportunity_timeblocks
union all select 'org_outreach',           count(*) from public.org_outreach
union all select 'notifications',          count(*) from public.notifications
union all select 'email_outbox',           count(*) from public.email_outbox
union all select 'audit_logs',             count(*) from public.audit_logs
union all select 'problem_reports',        count(*) from public.problem_reports
union all select 'towns',                  count(*) from public.towns
union all select 'admins',                 count(*) from public.admins;

-- ---------------------------------------------------------------------------
-- 1. The two views that name the columns.
--
-- Dropping a column a view depends on fails with 2BP01, and CASCADE would take
-- the view with it silently and leave its grants to be rediscovered later. So
-- drop them explicitly and recreate them in the same migration, grants and all.
--
-- public_volunteers is the obvious one. opportunity_applicants is the one it
-- would be easy to miss: it joins user_profiles too and carries the same two
-- columns, so it fails the same way. The applicants page reads it with
-- select('*'), which is why nothing in the client had to change for it.
-- ---------------------------------------------------------------------------
drop view if exists public.public_volunteers;
drop view if exists public.opportunity_applicants;

create view public.public_volunteers
with (security_invoker = false) as
select id, name, home_town, skills, bio
from public.user_profiles
where role = 'volunteer'
  and public_profile = true
  and public.is_approved_org(auth.uid());

comment on view public.public_volunteers is
  $c$Volunteers who set public_profile = true, readable only by an APPROVED
organisation. No contact column: RLS filters rows, not columns, so a policy on
user_profiles would re-expose dob, email and contact_number. WF9-2 removed
available_anytime and availability_matrix from it with the rest of
availability.$c$;

create view public.opportunity_applicants
with (security_invoker = false) as
select a.id as application_id,
       a.opportunity_id,
       a.created_at as applied_at,
       a.message,
       a.dismissed_at,
       o.title as opportunity_title,
       v.id as volunteer_id,
       v.name as volunteer_name,
       v.home_town,
       v.skills,
       v.bio
from public.applications a
  join public.volunteer_opportunities o on o.id = a.opportunity_id
  join public.user_profiles v on v.id = a.volunteer_id
where o.org_id = auth.uid()
  and a.withdrawn_at is null;

comment on view public.opportunity_applicants is
  $c$People who registered interest in one of YOUR roles and have not withdrawn
(INT-4). Owner rights, no contact column. WF9-2 removed the two availability
columns.$c$;

-- Trap 1b: Supabase's default privileges grant ALL on a newly created view to
-- anon, authenticated and service_role BY NAME. A `revoke ... from public`
-- would leave every one of those in place. Name the roles, then grant back only
-- SELECT -- and only to authenticated: neither view has ever been readable by
-- anon, and a recreate is exactly where that would be lost without noticing.
revoke all on public.public_volunteers from anon, authenticated;
revoke all on public.opportunity_applicants from anon, authenticated;
grant select on public.public_volunteers to authenticated;
grant select on public.opportunity_applicants to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Stop writing availability before the things written to disappear.
--
-- handle_new_user() is the only writer of volunteer_availability outside the
-- client, and it is a SECURITY DEFINER trigger on auth.users: if it still
-- referenced a dropped table, every SIGN-UP on the site would fail, not just a
-- volunteer's. Replaced first, in the same transaction.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  IF meta->>'role' IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (
    id, role, name, email, home_town, dob, contact_number,
    bio, skills, public_profile
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
    coalesce((meta->>'public_profile')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  -- WF9-2: a second INSERT followed, expanding the availability_matrix
  -- metadata into volunteer_availability rows. Any availability metadata a
  -- stale client still sends is now ignored rather than stored.
  RETURN NEW;
END;
$function$;

-- admin_switch_account_type() cleared a volunteer's availability when their
-- account became an organisation (WF7-2), because organisation profiles are
-- readable by every signed-in user. There is nothing left to clear.
create or replace function public.admin_switch_account_type(p_user_id uuid, p_new_role text, p_dob date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile        public.user_profiles;
  v_roles_closed   integer := 0;
  v_regs_withdrawn integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can switch an account''s type'
      using errcode = '42501';
  end if;

  if p_new_role is null or p_new_role not in ('volunteer', 'organization') then
    raise exception 'An account is either a volunteer or an organisation'
      using errcode = '22023';
  end if;

  select * into v_profile
    from public.user_profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;

  if v_profile.role = p_new_role then
    raise exception 'That account is already a %',
      case p_new_role when 'organization' then 'organisation' else 'volunteer' end
      using errcode = '22023';
  end if;

  if p_new_role = 'volunteer' then
    if p_dob is null then
      raise exception 'A volunteer account needs a date of birth'
        using errcode = '22023';
    end if;
    if p_dob > (current_date - interval '18 years')::date then
      raise exception 'Volunteers must be 18 or over'
        using errcode = '23514';
    end if;
  end if;

  perform set_config('app.account_switch', 'on', true);

  if p_new_role = 'organization' then
    update public.applications
       set withdrawn_at = now()
     where volunteer_id = p_user_id
       and withdrawn_at is null;
    get diagnostics v_regs_withdrawn = row_count;

    -- WF9-2: a `delete from volunteer_availability` and two availability
    -- columns in the update below have gone with the table and the columns.
    update public.user_profiles
       set role           = 'organization',
           approved_at    = null,
           approved_by    = null,
           dob            = null,
           contact_number = null,
           bio            = null,
           skills         = null,
           public_profile = false
     where id = p_user_id;
  else
    update public.volunteer_opportunities
       set status        = 'closed',
           closed_reason = 'The organisation''s account became a volunteer account'
     where org_id = p_user_id
       and status = 'active'
       and deleted_at is null;
    get diagnostics v_roles_closed = row_count;

    update public.user_profiles
       set role           = 'volunteer',
           dob            = p_dob,
           approved_at    = null,
           approved_by    = null,
           public_profile = false
     where id = p_user_id;
  end if;

  perform set_config('app.account_switch', 'off', true);

  perform public.record_audit_event(
    p_action_type      := 'account_type_switched',
    p_actor_kind       := 'admin',
    p_actor_id         := auth.uid(),
    p_target_user_id   := p_user_id,
    p_target_table     := 'user_profiles',
    p_target_record_id := p_user_id,
    p_old_values       := jsonb_build_object('role', v_profile.role,
                                             'approved', v_profile.approved_at is not null),
    p_new_values       := jsonb_build_object('role', p_new_role,
                                             'approved', false),
    p_metadata         := jsonb_build_object('roles_closed', v_roles_closed,
                                             'registrations_withdrawn', v_regs_withdrawn));

  return jsonb_build_object('role', p_new_role,
                            'roles_closed', v_roles_closed,
                            'registrations_withdrawn', v_regs_withdrawn);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The feature itself.
--
-- match_opportunities_by_availability was the matcher: it returned match_kind
-- (FULL / PARTIAL / FLEXIBLE / UNSPECIFIED / NONE) for the browse badge and
-- match_rank for its ordering. The browse now runs one query for every reader
-- against public_opportunities (WF9-1).
--
-- day_labels_to_indices existed only to turn the grid's day names into the
-- int[] volunteer_availability stored. handle_new_user() above was its last
-- caller; checked with pg_get_functiondef across every function in `public`.
-- ---------------------------------------------------------------------------
drop function if exists public.match_opportunities_by_availability(uuid);
drop table if exists public.volunteer_availability;
drop function if exists public.day_labels_to_indices(jsonb);

alter table public.user_profiles
  drop column if exists available_anytime,
  drop column if exists availability_matrix;

-- ---------------------------------------------------------------------------
-- 4. Prove nothing else was touched, before committing.
-- ---------------------------------------------------------------------------
do $guard$
declare
  r record;
  msg text := '';
  n_before integer;
begin
  -- A guard that silently checks nothing is worse than no guard. If the
  -- before-counts are missing, stop rather than pass.
  select count(*) into n_before from _wf92_before;
  if coalesce(n_before, 0) = 0 then
    raise exception
      'WF9-2 aborted: the before-counts table is empty, so the row-count '
      'guard would have passed without comparing anything'
      using errcode = 'data_exception';
  end if;

  for r in
    select b.t, b.n as before_n, a.n as after_n
    from _wf92_before b
    join (
      select 'user_profiles' as t, count(*) as n from public.user_profiles
      union all select 'auth_users',             count(*) from auth.users
      union all select 'applications',           count(*) from public.applications
      union all select 'volunteer_opportunities',count(*) from public.volunteer_opportunities
      union all select 'opportunity_timeblocks', count(*) from public.opportunity_timeblocks
      union all select 'org_outreach',           count(*) from public.org_outreach
      union all select 'notifications',          count(*) from public.notifications
      union all select 'email_outbox',           count(*) from public.email_outbox
      union all select 'audit_logs',             count(*) from public.audit_logs
      union all select 'problem_reports',        count(*) from public.problem_reports
      union all select 'towns',                  count(*) from public.towns
      union all select 'admins',                 count(*) from public.admins
    ) a on a.t = b.t
    where a.n <> b.n
  loop
    msg := msg || format('%s: %s -> %s; ', r.t, r.before_n, r.after_n);
  end loop;

  if msg <> '' then
    raise exception
      'WF9-2 aborted: this migration must drop two columns and one table and '
      'change no rows anywhere, but row counts moved -- %', msg
      using errcode = 'data_exception';
  end if;
end
$guard$;

drop table if exists _wf92_before;
