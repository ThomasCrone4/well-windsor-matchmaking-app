-- Workflow 5.1 and 5.2 — ROLE-5 (one copy of the schedule) and ROLE-3 (drop
-- the contact email).
--
-- ROLE-5. The schedule has lived in two places that disagree: `when_needed`
-- (jsonb, written by the two forms for their own editing UX) and
-- `opportunity_timeblocks` (normalised, read by matching and auto-close).
-- The detail page already reads the timeblocks and falls back to when_needed;
-- the browse cards read when_needed alone and therefore show no schedule at
-- all on the eight roles that have one.
--
-- BUILD-PLAN §5.1 warns that six roles have no schedule anywhere and that
-- migrating could "invent or destroy data". Re-checked against live data
-- immediately before writing this, and it is not the risk it looks like:
--
--   14 roles · when_needed populated on 0 · date_needed populated on 0
--    6 generally_needed (flexible) · 8 scheduled
--    8 have timeblocks
--    0 scheduled roles WITHOUT timeblocks
--    0 flexible roles WITH timeblocks
--
-- The six with no schedule are exactly the six flexible ones, and flexible
-- means "no schedule" by design — that is what match_kind = FLEXIBLE is.
-- Scheduled ⟺ has timeblocks, with no exceptions either way. So there is
-- nothing to reconstruct and nothing to lose: every byte of schedule data in
-- this database is already in opportunity_timeblocks.
--
-- `date_needed` is dead — NULL on all 14 rows, written by nothing, and its
-- only reader tested `new Date(null)`, which is 1 January 1970, so a "this
-- role is in the past" warning fired on every single role.
--
-- ROLE-3. `contact` is NOT NULL and no volunteer has ever seen it. Checked
-- before dropping: of the 14 values, 7 duplicate the organisation's own login
-- email and 7 are fabricated seed addresses on the reserved `.example`
-- domain. None of it is reachable contact information, and an organisation is
-- reached through send-outreach's Reply-To, never through a column on a role.
-- Dropping it takes a required field off the longest form on the site.

alter table public.volunteer_opportunities
  drop column if exists when_needed,
  drop column if exists date_needed,
  drop column if exists contact;

-- ---------------------------------------------------------------------------
-- The match RPC returned both dropped columns.
--
-- `contact` going is a fix in its own right: CLAUDE.md lists "the match RPC
-- still returns contact to volunteers" as a known, unfixed leak. It is now
-- fixed by deletion rather than by filtering.
--
-- The return type changes, so CREATE OR REPLACE cannot do it — this is a DROP
-- and CREATE, which means the new function is born with EXECUTE granted to
-- anon and authenticated *by name* and to PUBLIC (trap 1c, hit for real on
-- this exact function on 2026-09-08). The grants are therefore restated
-- explicitly at the bottom, and re-probed as anon afterwards.
--
-- `skills` is added to the return for BRW-4: the browse searches skills, and
-- a volunteer's list comes from this function rather than from the table.
-- ---------------------------------------------------------------------------

drop function if exists public.match_opportunities_by_availability(uuid);

create function public.match_opportunities_by_availability(p_volunteer_id uuid)
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
    -- Five kinds, and NOT derived from match_rank. Collapsing these into
    -- three buckets is what put "Full availability match" on every flexible
    -- role — six of the fourteen live ones.
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
  -- One source now. This used to coalesce the timeblocks minimum with a
  -- jsonb_to_recordset over when_needed; with when_needed gone the fallback
  -- would only ever have produced NULL anyway.
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

-- Trap 1c. The recreated function is born with EXECUTE to PUBLIC and to anon
-- and authenticated by name. Take all of it away, then grant back the one
-- role that needs it. The RPC is a statement about a signed-in volunteer's
-- own availability, so anon has no use for it and never held it.
revoke all on function public.match_opportunities_by_availability(uuid) from public;
revoke all on function public.match_opportunities_by_availability(uuid) from anon, authenticated;
grant execute on function public.match_opportunities_by_availability(uuid) to authenticated;

comment on function public.match_opportunities_by_availability(uuid) is
  'Ranks active roles against a volunteer''s availability. match_rank orders '
  'the list; match_kind (FULL/PARTIAL/NONE/FLEXIBLE/UNSPECIFIED) is the claim '
  'shown to the user and must not be derived from match_rank. Returns no '
  'contact details of any kind.';
