-- Workflow 5.3 — ROLE-1 (deleting hides, never erases) and ROLE-2 (closing or
-- changing tells the registrants).
--
-- ROLE-1. Today "Delete" is a hard DELETE, and `applications.opportunity_id`
-- is ON DELETE CASCADE — so deleting a role erases every registration on it.
-- The dashboard's own confirm text says so out loud ("Everyone who registered
-- interest in it will be removed too"). That is the behaviour being replaced:
-- the role and its registrations stay, and the role becomes invisible.
--
-- Soft delete is only as good as the read paths that honour it, so all of
-- them are changed here, not just the browse:
--
--   * `opportunities: public reads active only` — the policy itself, which
--     historically had no status filter at all and only hadn't leaked because
--     no draft existed.
--   * `public_read_active_blocks` on opportunity_timeblocks — gated on the
--     parent being 'active' and nothing else, so a removed role's days and
--     times stayed readable by anon. (It also never checked org approval,
--     unlike the policy on the parent table; fixed in the same breath.)
--   * match_opportunities_by_availability — a volunteer's whole browse.
--   * auto_close_past_opportunities — the nightly job. Without this it would
--     set status='closed' on a removed role, firing "a role you registered
--     for has closed" at people already told it was removed.
--   * the applications INSERT policy — registering interest is a write, but
--     letting someone register for a removed role is the same bug wearing a
--     different verb. It checked only `volunteer_id = auth.uid()`.
--
-- Hard DELETE is taken away rather than merely unused, because the UI is not
-- the only way in: the privilege is revoked AND a trigger refuses. The
-- trigger is scoped to the browser roles so that account deletion still
-- cascades — `volunteer_opportunities.org_id` is ON DELETE CASCADE on
-- user_profiles, so an unconditional raise here would break ACC-6.
--
-- Un-deleting is refused too. A volunteer who was told "this role was
-- removed" must not have that silently reversed, and the plan already draws
-- the line: ROLE-4 makes *closed* reversible; removal is terminal.
--
-- ROLE-2. Registrants are told when a role closes (already built) and now
-- also when it materially changes.
--
-- `schedule_revision` exists because of a real limitation. Both forms rewrite
-- opportunity_timeblocks by deleting every row and re-inserting, on every
-- save, whether or not the times changed — so a trigger on that table would
-- fire on saves that changed nothing. The client compares the normalised
-- blocks and bumps this counter only when they genuinely differ, which gives
-- the parent row something honest to notice.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.volunteer_opportunities
  add column if not exists deleted_at timestamptz,
  add column if not exists schedule_revision integer not null default 0;

comment on column public.volunteer_opportunities.deleted_at is
  'ROLE-1. Non-null means the organisation removed this role: invisible to the '
  'public, to search and to matching, while its registrations survive. Never '
  'cleared once set — removal is terminal, closing is what reverses (ROLE-4).';

comment on column public.volunteer_opportunities.schedule_revision is
  'ROLE-2. Bumped by the client only when the timeblocks actually change, so '
  'the change notice can cover the schedule. The forms rewrite timeblocks on '
  'every save, so the table itself cannot tell a real change from a re-save.';

create index if not exists volunteer_opportunities_live_idx
  on public.volunteer_opportunities (status, created_at desc)
  where deleted_at is null;

-- anon's SELECT on this table is column-level, not table-wide (pg_class.relacl
-- shows anon=m; the grants are in pg_attribute.attacl — trap 1d). A new column
-- therefore carries no grant at all, and any `select=*` as anon would fail
-- 42501. Both new columns are harmless to read: the policy below means anon
-- can only ever see rows where deleted_at is null.
grant select (deleted_at, schedule_revision)
  on public.volunteer_opportunities to anon;

-- ---------------------------------------------------------------------------
-- Read paths
-- ---------------------------------------------------------------------------

drop policy if exists "opportunities: public reads active only"
  on public.volunteer_opportunities;
create policy "opportunities: public reads active only"
  on public.volunteer_opportunities
  for select to anon, authenticated
  using (status = 'active'
         and deleted_at is null
         and is_approved_org(org_id));

drop policy if exists public_read_active_blocks on public.opportunity_timeblocks;
create policy public_read_active_blocks
  on public.opportunity_timeblocks
  for select
  using (exists (
    select 1 from public.volunteer_opportunities o
    where o.id = opportunity_timeblocks.opportunity_id
      and o.status = 'active'
      and o.deleted_at is null
      and is_approved_org(o.org_id)
  ));

-- ---------------------------------------------------------------------------
-- Registering interest in a removed role
-- ---------------------------------------------------------------------------

-- Wrapped in a SECURITY DEFINER function rather than written inline: a policy
-- on `applications` that reads `volunteer_opportunities` reaches user_profiles
-- through that table's own policies, which is the 42P17 recursion path
-- (trap 3). The function reads as owner, so no policy is re-entered.
create or replace function public.opportunity_open_for_registration(p_opportunity_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.volunteer_opportunities o
    where o.id = p_opportunity_id
      and o.status = 'active'
      and o.deleted_at is null
      and public.is_approved_org(o.org_id)
  );
$$;

revoke all on function public.opportunity_open_for_registration(uuid) from public;
revoke all on function public.opportunity_open_for_registration(uuid) from anon, authenticated;
-- The policy calls it as the caller, so authenticated needs EXECUTE to run it
-- — the same reason anon must keep EXECUTE on is_admin(). anon has no INSERT
-- on applications at all, so it needs nothing here.
grant execute on function public.opportunity_open_for_registration(uuid) to authenticated;

drop policy if exists "applications: volunteer applies" on public.applications;
create policy "applications: volunteer applies"
  on public.applications
  for insert to authenticated
  with check (volunteer_id = auth.uid()
              and public.opportunity_open_for_registration(opportunity_id));

-- ---------------------------------------------------------------------------
-- No hard delete from a browser
-- ---------------------------------------------------------------------------

revoke delete on public.volunteer_opportunities from anon, authenticated;

create or replace function public.volunteer_opportunities_no_hard_delete()
returns trigger
language plpgsql
as $$
begin
  -- Scoped to the browser roles on purpose. Deleting an account cascades
  -- through user_profiles into this table as the service role, and ACC-6
  -- must keep working.
  if current_user in ('authenticated', 'anon') then
    raise exception
      'Roles are removed, not deleted: set deleted_at so registrations survive.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists no_hard_delete_opportunity on public.volunteer_opportunities;
create trigger no_hard_delete_opportunity
  before delete on public.volunteer_opportunities
  for each row execute function public.volunteer_opportunities_no_hard_delete();

create or replace function public.volunteer_opportunities_removal_is_final()
returns trigger
language plpgsql
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

drop trigger if exists removal_is_final on public.volunteer_opportunities;
create trigger removal_is_final
  before update on public.volunteer_opportunities
  for each row execute function public.volunteer_opportunities_removal_is_final();

-- ---------------------------------------------------------------------------
-- Telling the registrants
-- ---------------------------------------------------------------------------

-- One function for all three transitions so their precedence is explicit and
-- cannot drift: removed beats closed beats changed, and a role that is
-- already removed says nothing further at all.
create or replace function public.notify_role_state_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_volunteer uuid;
  v_type      text;
  v_message   text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    v_type    := 'role_removed';
    v_message := 'A role you registered for, ' || new.title ||
                 ', was removed by the organisation.';

  elsif new.deleted_at is not null then
    -- Already removed. Nothing that happens to the row afterwards is news.
    return new;

  elsif new.status is distinct from old.status and new.status = 'closed' then
    v_type    := 'role_changed';
    v_message := 'A role you registered for, ' || new.title || ', has closed.';

  elsif new.status = 'active' and (
          new.title             is distinct from old.title
       or new.description       is distinct from old.description
       or new.location          is distinct from old.location
       or new.town              is distinct from old.town
       or new.generally_needed  is distinct from old.generally_needed
       or new.requires_dbs      is distinct from old.requires_dbs
       or new.schedule_revision is distinct from old.schedule_revision
        ) then
    v_type    := 'role_changed';
    v_message := 'A role you registered for, ' || new.title ||
                 ', has been updated by the organisation.';

  else
    return new;
  end if;

  for v_volunteer in
    select distinct volunteer_id
    from public.applications
    where opportunity_id = new.id
  loop
    perform public.notify_user(v_volunteer, v_type, v_message, new.id);
  end loop;

  return new;
end;
$$;

-- Replaced by the function above, which subsumes it.
drop trigger if exists notify_on_role_closed on public.volunteer_opportunities;
drop function if exists public.notify_role_closed();

drop trigger if exists notify_on_role_state_change on public.volunteer_opportunities;
create trigger notify_on_role_state_change
  after update on public.volunteer_opportunities
  for each row execute function public.notify_role_state_change();

-- Trap 1c: all three functions above were just created, so each carries
-- EXECUTE to PUBLIC and to anon/authenticated by name. None is callable to
-- any purpose from a browser.
revoke all on function public.volunteer_opportunities_no_hard_delete() from public;
revoke all on function public.volunteer_opportunities_no_hard_delete() from anon, authenticated;
revoke all on function public.volunteer_opportunities_removal_is_final() from public;
revoke all on function public.volunteer_opportunities_removal_is_final() from anon, authenticated;
revoke all on function public.notify_role_state_change() from public;
revoke all on function public.notify_role_state_change() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The nightly job must not touch a removed role
-- ---------------------------------------------------------------------------

create or replace function public.auto_close_past_opportunities()
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.volunteer_opportunities v
     set status = 'closed',
         closed_reason = 'Event finished'
   where v.status = 'active'
     and v.deleted_at is null
     and v.generally_needed is not true
     and exists (
       select 1 from public.opportunity_timeblocks tb
       where tb.opportunity_id = v.id
     )
     and not exists (
       select 1 from public.opportunity_timeblocks tb
       where tb.opportunity_id = v.id
         and (tb.end_date is null or tb.end_date >= current_date)
     );
end;
$$;

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------

-- Same signature, so this is a CREATE OR REPLACE and the ACL set in the
-- previous migration survives (trap 1c is about DROP + CREATE).
create or replace function public.match_opportunities_by_availability(p_volunteer_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  location text,
  town text,
  skills text,
  requires_dbs boolean,
  generally_needed boolean,
  volunteers_needed integer,
  created_at timestamp with time zone,
  org_id uuid,
  org_name text,
  earliest_start date,
  match_rank integer,
  match_kind text,
  category text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with me as (
  select id,
         coalesce(available_anytime, false) as available_anytime
  from user_profiles
  where id = p_volunteer_id
),
active_opps as (
  select *
  from volunteer_opportunities
  where status = 'active'
    and deleted_at is null
),
opp_blocks as (
  select o.id as opportunity_id,
         o.generally_needed,
         o.created_at,
         tb.days,
         tb.start_time::time as start_time,
         tb.end_time::time   as end_time,
         tb.start_date::date as start_date,
         tb.end_date::date   as end_date
  from active_opps o
  left join opportunity_timeblocks tb
    on tb.opportunity_id = o.id
),
covered_blocks as (
  select
    ob.opportunity_id,
    count(*) filter (where ob.days is not null) as total_blocks,
    count(*) filter (where exists (
      select 1
      from volunteer_availability va
      where va.volunteer_id = p_volunteer_id
        and (ob.days is null or ob.days <@ va.days)
        and (ob.start_time is null or va.start_time::time <= ob.start_time::time)
        and (ob.end_time   is null or va.end_time::time   >= ob.end_time::time)
        and (ob.start_date is null or coalesce(va.start_date::date, ob.start_date::date) <= ob.start_date::date)
        and (ob.end_date   is null or coalesce(va.end_date::date,   ob.end_date::date)   >= ob.end_date::date)
    )) as fully_covered_blocks
  from opp_blocks ob
  group by ob.opportunity_id
),
overlap_blocks as (
  select distinct ob.opportunity_id
  from opp_blocks ob
  join volunteer_availability va
    on va.volunteer_id = p_volunteer_id
   and (ob.days && va.days)
   and ob.start_time is not null and ob.end_time is not null
   and va.start_time::time <= ob.end_time::time
   and ob.start_time::time <= va.end_time::time
   and (
     (ob.start_date is null and ob.end_date is null) or
     (coalesce(va.start_date::date, ob.start_date::date, ob.end_date::date)
        <= coalesce(ob.end_date::date, ob.start_date::date))
     and (coalesce(ob.start_date::date, ob.end_date::date)
        <= coalesce(va.end_date::date, ob.end_date::date, ob.start_date::date))
   )
),
ranked as (
  select
    o.*,
    case
      when o.generally_needed = true then
        case
          when (select available_anytime from me) = true
               or exists (select 1 from volunteer_availability va where va.volunteer_id = p_volunteer_id)
          then 1 else 2 end
      when coalesce(cb.total_blocks, 0) = 0 then
        case when exists (select 1 from volunteer_availability va where va.volunteer_id = p_volunteer_id)
             then 2 else 3 end
      when cb.fully_covered_blocks = cb.total_blocks then 1
      when exists (select 1 from overlap_blocks x where x.opportunity_id = o.id) then 2
      else 3
    end as match_rank,
    case
      when o.generally_needed = true then 'FLEXIBLE'
      when coalesce(cb.total_blocks, 0) = 0 then 'UNSPECIFIED'
      when cb.fully_covered_blocks = cb.total_blocks then 'FULL'
      when exists (select 1 from overlap_blocks x where x.opportunity_id = o.id) then 'PARTIAL'
      else 'NONE'
    end::text as match_kind
  from active_opps o
  left join covered_blocks cb
    on cb.opportunity_id = o.id
),
orgs as (
  select id, name from public_organisations
),
earliest as (
  select
    v.id,
    (select min(tb.start_date)
       from opportunity_timeblocks tb
      where tb.opportunity_id = v.id) as earliest_start
  from volunteer_opportunities v
)
select
  r.id,
  r.title,
  r.description,
  r.location,
  r.town,
  r.skills,
  r.requires_dbs,
  r.generally_needed,
  r.volunteers_needed,
  r.created_at,
  v.org_id,
  u.name as org_name,
  e.earliest_start,
  r.match_rank,
  r.match_kind,
  r.category
from ranked r
join volunteer_opportunities v on v.id = r.id
left join orgs u on u.id = v.org_id
left join earliest e on e.id = r.id
order by r.match_rank asc, r.created_at desc;
$function$;
