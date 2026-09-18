-- Workflow 9, batch 9.1 -- one definition of "publicly visible".
--
-- The browse, the home page's list and the home page's role count each asked
-- for `status = 'active'` and trusted RLS for the rest. RLS deliberately lets
-- an admin read every role and an organisation read its own, and a REMOVED
-- role keeps `status = 'active'` -- so an admin browsing the live site saw 91
-- removed test roles, and an organisation sees its own removed ones on the
-- public browse. Three callers, three subtly different answers to "is this
-- role public", none of them written down anywhere.
--
-- public_opportunities is the one answer. Owner rights, like the other five
-- views, so the CALLER'S RLS can neither widen it nor narrow it: an admin, an
-- organisation and a logged-out visitor read exactly the same rows.
--
-- The organisation is joined through public_organisations rather than
-- user_profiles, for the same reason. "Publicly visible organisation" is
-- already defined there -- role = 'organization' and approved_at is not null,
-- the same test is_approved_org() makes -- so the inner join both filters and
-- names in one step, and there is no second copy of the rule to drift.

create or replace view public.public_opportunities
with (security_invoker = false) as
select
  o.id,
  o.org_id,
  u.name as org_name,
  o.title,
  o.description,
  o.location,
  o.town,
  o.category,
  o.skills,
  o.requires_dbs,
  o.generally_needed,
  o.volunteers_needed,
  o.status,
  o.created_at,
  o.schedule_revision
from public.volunteer_opportunities o
join public.public_organisations u on u.id = o.org_id
where o.status = 'active'
  and o.deleted_at is null;

comment on view public.public_opportunities is
  $c$WF9-1. Every role that is publicly visible and nothing else: active, not
removed, and posted by an approved organisation, with that organisation's
name. Owner rights on purpose, so an admin, an organisation and anon all get
the same list. No contact column, like the other five views. Supabase's linter
flags it as "Security Definer View"; that is the design, not a finding.$c$;

-- Trap 1b. Supabase ships ALTER DEFAULT PRIVILEGES granting ALL on every new
-- table and view to anon, authenticated and service_role BY NAME, so a tidy
-- `revoke all ... from public` would leave anon holding INSERT, UPDATE,
-- DELETE and TRUNCATE on this view. Name the roles, then grant back the one
-- privilege it needs.
revoke all on public.public_opportunities from anon, authenticated;
grant select on public.public_opportunities to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The browse's volunteer path never reads the table: it calls
-- match_opportunities_by_availability, which carried its own copy of the rule
-- -- status and deleted_at, but NO approval check -- and read the table under
-- the caller's RLS. So an administrator whose own account is a volunteer got
-- a third list again: every active role, including roles belonging to
-- organisations that have not been approved. That is the divergence this
-- batch exists to remove, so the function reads the view too.
--
-- Same signature deliberately: CREATE OR REPLACE keeps the ACL, where a DROP
-- and CREATE would hand EXECUTE straight back to anon by name (trap 1c).
--
-- Two knock-on simplifications, both because the view already carries what
-- was being fetched a second time: the join back to volunteer_opportunities
-- for org_id and the `orgs` CTE reading public_organisations are gone, and
-- the earliest_start subquery is now scoped to the rows actually returned
-- rather than to every row of the table.
--
-- (Batch 9.2 deletes this function outright along with the rest of
-- availability matching. It is corrected rather than left alone because 9.1's
-- claim is that every caller sees the same list, and a caller left on the old
-- rule would make that claim false in the meantime.)
create or replace function public.match_opportunities_by_availability(p_volunteer_id uuid)
 returns table(id uuid, title text, description text, location text, town text,
               skills text, requires_dbs boolean, generally_needed boolean,
               volunteers_needed integer, created_at timestamp with time zone,
               org_id uuid, org_name text, earliest_start date,
               match_rank integer, match_kind text, category text)
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
  select * from public_opportunities
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
  r.org_id,
  r.org_name,
  (select min(tb.start_date)
     from opportunity_timeblocks tb
    where tb.opportunity_id = r.id) as earliest_start,
  r.match_rank,
  r.match_kind,
  r.category
from ranked r
order by r.match_rank asc, r.created_at desc;
$function$;
