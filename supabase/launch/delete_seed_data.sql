-- ===========================================================================
-- NOT APPLIED. Workflow 8, item 1 — remove the seed data before going public.
-- ===========================================================================
--
-- Deliberately NOT in supabase/migrations/: nothing there may exist without a
-- matching ledger row, and this must not run until the charity has real
-- organisations ready to post (it leaves the public browse EMPTY — see
-- PENDING-DECISIONS.md, WF8-1). When the go-ahead comes: copy this into a
-- migration file, apply it, rename to the assigned version, walk the browse.
--
-- Dry-run inventory, taken 2026-09-16 against production:
--
--   * 13 roles with ids starting 5eed, all `active`, none removed, credited to
--     six REAL organisation accounts (including Well Windsor's own and the
--     admin's). 8 timeblocks between them.
--   * ZERO registrations, ZERO outreach messages and ZERO notifications
--     reference any of them. Deleting them loses no human data.
--   * One further live role, "OrgTestSep" (0e56347b…), a test posted on the
--     admin's organisation account on 2026-09-03. It has ONE registration,
--     from a real account. Part 2 handles it separately.
--
-- The guards below re-check that inventory at the moment of running and abort
-- the whole transaction if anything has changed — a real person registering
-- for a seed role between now and launch must not be silently erased.

begin;

-- ---------------------------------------------------------------------------
-- Part 1. The 5eed roles: HARD delete.
--
-- A hard delete, not ROLE-1's `deleted_at`, because these were never real:
-- there are no registrations to preserve, and a removed-but-kept fake role
-- would still show up in the admin list. It runs as the table owner, so the
-- no_hard_delete trigger (scoped to anon/authenticated) does not fire, and
-- opportunity_timeblocks cascades with it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_apps     integer;
  v_outreach integer;
  v_roles    integer;
begin
  select count(*) into v_roles from public.volunteer_opportunities where id::text like '5eed%';
  select count(*) into v_apps from public.applications
   where opportunity_id in (select id from public.volunteer_opportunities where id::text like '5eed%');
  select count(*) into v_outreach from public.org_outreach
   where opportunity_id in (select id from public.volunteer_opportunities where id::text like '5eed%');

  if v_apps > 0 or v_outreach > 0 then
    raise exception 'ABORT: % registration(s) and % outreach message(s) now reference seed roles. Re-inventory before deleting.',
      v_apps, v_outreach;
  end if;

  if v_roles <> 13 then
    raise exception 'ABORT: expected 13 seed roles, found %. Re-inventory before deleting.', v_roles;
  end if;
end $$;

delete from public.volunteer_opportunities where id::text like '5eed%';

-- ---------------------------------------------------------------------------
-- Part 2. "OrgTestSep" — REMOVE (ROLE-1), do not delete.
--
-- It has a real person's registration on it, and applications cascade on a
-- hard delete. Removing keeps the registration and tells the registrant in
-- the app. Commented out until WF8-1 is answered.
-- ---------------------------------------------------------------------------
-- update public.volunteer_opportunities
--    set deleted_at = now()
--  where id = '0e56347b-0b4d-46f0-b06d-b7092a6ce2a2'
--    and title = 'OrgTestSep';

-- ---------------------------------------------------------------------------
-- Part 3. Test and junk ACCOUNTS — deliberately not here.
--
-- Which real-looking accounts are junk is a judgement about real people, not
-- something to infer from a name. See PENDING-DECISIONS.md, WF8-3. Once the
-- list is agreed, delete them through the delete-account path (or
-- auth.admin.deleteUser), never a raw DELETE on user_profiles, so ACC-6's
-- audit preservation runs.
-- ---------------------------------------------------------------------------

-- Verify before committing: expect 0 seed roles, and the browse shows only
-- roles from real organisations.
select
  (select count(*) from public.volunteer_opportunities where id::text like '5eed%') as seed_roles_left,
  (select count(*) from public.volunteer_opportunities
    where status = 'active' and deleted_at is null) as live_roles_left;

commit;
