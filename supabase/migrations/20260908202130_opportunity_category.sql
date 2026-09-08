-- Category on an opportunity, so the browse can show a photograph.
--
-- The approved design gives every role an image. There is no image column
-- and no public storage bucket (the only bucket is the private
-- enquiry_attachments), and per-opportunity upload is deferred: it needs a
-- safeguarding decision about who may publish photographs of identifiable
-- children, and that question has not been put to the charity.
--
-- So the organisation picks a category instead, and the client maps it to
-- one of the photographs already in public/images/. Three values, nullable,
-- because every opportunity that exists today has no category and must keep
-- rendering.
--
--   in_schools     working with children, on school premises
--   behind_scenes  admin, fundraising, research -- often remote
--   one_off        a single event or day
--
-- NULL is a real, permitted state and the client renders a neutral default
-- for it. Nothing here is a filter key; `town` still does the filtering.

alter table public.volunteer_opportunities
  add column if not exists category text;

alter table public.volunteer_opportunities
  drop constraint if exists volunteer_opportunities_category_check;

alter table public.volunteer_opportunities
  add constraint volunteer_opportunities_category_check
  check (category is null or category in ('in_schools', 'behind_scenes', 'one_off'));

comment on column public.volunteer_opportunities.category is
  'Optional shape-of-role tag, used client-side to choose a fallback '
  'photograph. Not a filter key -- town does the filtering. NULL is '
  'permitted and renders a neutral default.';

-- ---------------------------------------------------------------------------
-- Grants. THIS TABLE DOES NOT HAVE TABLE-WIDE GRANTS -- 20260903121939-era
-- work replaced them with COLUMN-level grants naming every column. A new
-- column is therefore invisible to anon and to authenticated until it is
-- named here, and a client that puts it in a .select() list gets 42501 for
-- the whole query, not a null for the one column. That would have taken the
-- entire browse down for logged-out visitors.
-- ---------------------------------------------------------------------------
grant select (category) on public.volunteer_opportunities to anon, authenticated;
grant insert (category), update (category) on public.volunteer_opportunities to authenticated;

-- ---------------------------------------------------------------------------
-- The volunteer's browse does not read the table -- it reads this function,
-- which returns a fixed column list. Without category here a signed-in
-- volunteer would see the neutral default on every card while a logged-out
-- visitor saw the real ones.
--
-- CREATE OR REPLACE cannot change a function's return type, so this drops
-- and recreates. A dropped function loses its ACL and is recreated with the
-- Postgres default of EXECUTE to PUBLIC -- which anon inherits. The revoke
-- below is not tidiness, it is the only thing that keeps anon out.
-- ---------------------------------------------------------------------------
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
  r.match_kind,
  r.category
from ranked r
join volunteer_opportunities v on v.id = r.id
left join orgs u on u.id = v.org_id
left join earliest e on e.id = r.id
order by r.match_rank asc, r.created_at desc;
$function$;

-- Restore the ACL the drop threw away. Trap 1: revoking from anon alone does
-- nothing, because the default grant is to PUBLIC and anon inherits it.
revoke all on function public.match_opportunities_by_availability(uuid) from public;
grant execute on function public.match_opportunities_by_availability(uuid)
  to authenticated, service_role;
