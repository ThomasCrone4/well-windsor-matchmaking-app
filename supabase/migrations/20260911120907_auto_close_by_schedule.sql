-- Close a role the day after its last scheduled date, every night.
--
-- auto_close_past_opportunities() existed but could never close anything:
-- it tested `date_needed`, a column no form has written since the schedule
-- moved into opportunity_timeblocks, and which is NULL on every row. And
-- pg_cron was not installed, so nothing ever called it. Scheduling it as it
-- stood would have looked like a fix and done nothing.
--
-- Rule, decided 2026-09-11:
--   - A role with a schedule closes once every one of its time blocks has
--     an end_date in the past.
--   - A block with no end_date is open-ended, so its role stays open.
--   - A "generally needed" (flexible) role never closes on its own; the
--     organisation closes it.
-- opportunity_timeblocks is the table match_opportunities_by_availability
-- matches on, so closing and matching read the same schedule.
--
-- Dry run before this was applied: 0 roles would close today.

create extension if not exists pg_cron;

-- CREATE OR REPLACE with the same signature and return type, deliberately:
-- a DROP would reset the ACL to the defaults and hand EXECUTE back to anon
-- (trap 1b, which bit 20260908202130 for exactly this reason).
create or replace function public.auto_close_past_opportunities()
returns void
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  update public.volunteer_opportunities v
     set status = 'closed',
         closed_reason = 'Event finished'
   where v.status = 'active'
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
$function$;

-- Anyone, logged out included, could call this. It ran with the caller's
-- rights so anon got 42501, but nothing but the scheduler should run it.
revoke all on function public.auto_close_past_opportunities() from public;
revoke all on function public.auto_close_past_opportunities() from anon, authenticated;

-- 00:05 UTC is 01:05 in summer and 00:05 in winter, both after midnight in
-- Windsor, so a role whose last day was "yesterday" in the UK has an
-- end_date < current_date when this runs. Runs as the table owner, which
-- bypasses RLS -- it has to close every organisation's roles.
select cron.schedule(
  'auto-close-past-opportunities',
  '5 0 * * *',
  $$select public.auto_close_past_opportunities();$$
);
