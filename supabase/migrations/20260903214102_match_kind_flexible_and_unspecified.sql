-- Plan 1.1 — two wording problems in the availability match, both in the
-- RPC rather than the UI, and both caused by the same shortcut.
--
-- The function computed `match_rank` (1/2/3) and then derived the badge from
-- it in the final SELECT:
--
--     case r.match_rank when 1 then 'FULL' when 2 then 'PARTIAL' else 'NONE' end
--
-- Rank is an ordering key. Collapsing five distinct situations into three
-- ordering buckets and then reading the bucket back as a *claim about the
-- volunteer's schedule* is where the honesty goes:
--
--   * `generally_needed = true` scores rank 1 for anyone with any
--     availability at all -- it isn't a match, it's the absence of a
--     constraint. 6 of the 14 active opportunities are flexible, so most
--     "Full availability match" badges on the browse were nothing of the
--     kind. Now FLEXIBLE, and the badge says "Flexible timing".
--
--   * `total_blocks = 0` -- the organisation gave no schedule at all --
--     scored rank 2 and read "Partial availability overlap". There is
--     nothing to overlap with. We cannot support that claim in either
--     direction. Now UNSPECIFIED, and the badge says "Schedule not
--     specified".
--
-- So match_kind is computed directly in `ranked`, alongside match_rank and
-- from the same conditions. The ranks are unchanged -- ordering still works
-- exactly as before -- but the two are no longer the same number wearing
-- two hats.
--
-- Also folded in, because the function has to be dropped and recreated for
-- the new return column anyway:
--
--   * `town` is returned (plan 1.1b) so the volunteer path can filter on it
--     like every other path.
--   * The `orgs` CTE now reads public_organisations instead of
--     user_profiles. The function is SECURITY INVOKER, so it was relying on
--     the caller holding a read on user_profiles; the view is the supported
--     way to see an organisation's name and cannot expose a contact column.
--   * EXECUTE is revoked from PUBLIC (trap 1: revoking from anon alone does
--     nothing, anon inherits PUBLIC's default grant) and granted to
--     authenticated only. Only a signed-in volunteer has any use for it --
--     it takes a volunteer id and reports that volunteer's schedule overlap.

drop function if exists public.match_opportunities_by_availability(uuid);

create function public.match_opportunities_by_availability(p_volunteer_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  location text,
  town text,
  contact text,
  requires_dbs boolean,
  generally_needed boolean,
  volunteers_needed integer,
  created_at timestamp with time zone,
  org_id uuid,
  org_name text,
  when_needed jsonb,
  earliest_start date,
  match_rank integer,
  match_kind text
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
-- explode required blocks per opp (may be none)
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
-- count fully covered required blocks
covered_blocks as (
  select
    ob.opportunity_id,
    count(*) filter (where ob.days is not null) as total_blocks,
    count(*) filter (where exists (
      select 1
      from volunteer_availability va
      where va.volunteer_id = p_volunteer_id
        -- days containment: opp days ⊆ volunteer days
        and (ob.days is null or ob.days <@ va.days)
        -- time containment
        and (ob.start_time is null or va.start_time::time <= ob.start_time::time)
        and (ob.end_time   is null or va.end_time::time   >= ob.end_time::time)
        -- date containment (nulls = open)
        and (ob.start_date is null or coalesce(va.start_date::date, ob.start_date::date) <= ob.start_date::date)
        and (ob.end_date   is null or coalesce(va.end_date::date,   ob.end_date::date)   >= ob.end_date::date)
    )) as fully_covered_blocks
  from opp_blocks ob
  group by ob.opportunity_id
),
-- any overlap for PARTIAL (days ∩, time overlap, date overlap)
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
    -- Ordering key. Unchanged from the previous definition.
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
    -- What we actually tell the volunteer. Same branches, five outcomes
    -- rather than three, because "no constraint" and "no information" are
    -- not the same statement as "your times fit".
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
-- compute earliest_start from timeblocks first, else from legacy when_needed jsonb
earliest as (
  select
    v.id,
    coalesce(
      (select min(tb.start_date) from opportunity_timeblocks tb where tb.opportunity_id = v.id),
      (select min(b.start_date)
         from jsonb_to_recordset(coalesce(v.when_needed, '[]'::jsonb))
           as b(days text[], start_time text, end_time text, start_date date, end_date date)
      )
    ) as earliest_start
  from volunteer_opportunities v
)
select
  r.id,
  r.title,
  r.description,
  r.location,
  r.town,
  r.contact,
  r.requires_dbs,
  r.generally_needed,
  r.volunteers_needed,
  r.created_at,
  v.org_id,
  u.name as org_name,
  v.when_needed,
  e.earliest_start,
  r.match_rank,
  r.match_kind
from ranked r
join volunteer_opportunities v on v.id = r.id
left join orgs u on u.id = v.org_id
left join earliest e on e.id = r.id
order by r.match_rank asc, r.created_at desc;
$function$;

comment on function public.match_opportunities_by_availability(uuid) is
  'Availability overlap between one volunteer and every active opportunity. '
  'match_rank orders the list; match_kind is the claim shown to the user '
  '(FULL / PARTIAL / NONE / FLEXIBLE / UNSPECIFIED). Do not derive one from '
  'the other -- that is what shipped "Full availability match" on every '
  'flexible role.';

revoke all on function public.match_opportunities_by_availability(uuid) from public, anon;
grant execute on function public.match_opportunities_by_availability(uuid) to authenticated;
