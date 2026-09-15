-- Workflow 5.0 — function EXECUTE grants, and the residue workflow 1 missed.
--
-- Two unrelated tidy-ups that both belong in "review every function's grant",
-- folded into one migration rather than a pass of their own.
--
-- 1. TRIGGER FUNCTIONS CARRY EXECUTE TO anon (trap 1c).
--
--    Every function created in workflows 1-4 was born with EXECUTE granted to
--    anon and authenticated *by name* (Supabase's default privileges), and to
--    PUBLIC (Postgres's own default). The security advisor flags twelve of
--    them. Nine are trigger functions.
--
--    They are not reachable today: PostgREST refuses to call a function
--    returning `trigger` at all (PGRST202), which was probed before writing
--    this. That is a property of the API tier, not of the grant — so the grant
--    goes, because the project standard is that every SECURITY DEFINER
--    function's EXECUTE grant is reviewed rather than left at its default.
--
--    Revoking EXECUTE does NOT stop a trigger firing. Postgres checks EXECUTE
--    on a trigger function when the trigger is CREATEd, not each time it runs.
--    That claim is load-bearing here, so it is proven from outside after this
--    is applied rather than taken on trust.
--
--    Deliberately NOT revoked, each for a reason that has already bitten once:
--      * is_approved_org()   — the `opportunities: public reads active only`
--        policy calls it, so anon needs EXECUTE to *run* it. Exactly the
--        mistake made on public.admins in workflow 4, which took the whole
--        logged-out browse down with 42501.
--      * is_admin()          — same shape, four policies scoped to PUBLIC.
--      * count_volunteers(), count_organisations() — the logged-out home page
--        counts. Public by design.
--
-- 2. THREE DEAD FUNCTIONS OUTLIVED THEIR TABLES.
--
--    Workflow 1.1 dropped `volunteer_hours` and `site_settings` but not the
--    functions that read them. All three are orphaned: no trigger uses them
--    (checked in pg_trigger), nothing in src/ calls them, and the tables they
--    reference no longer exist — get_site_settings() is reachable by anon and
--    can only error.

-- ---------------------------------------------------------------------------
-- 1. Trigger functions: no EXECUTE to anyone but the owner and service_role.
--    PUBLIC first (trap 1), then the two roles by name (trap 1b). Doing only
--    one of the two leaves the grant in place and looks tidy in the diff.
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    -- SECURITY DEFINER, added by workflows 1-4, all flagged by the advisor
    'public.email_on_org_approved()',
    'public.email_on_org_signup()',
    'public.email_on_problem_reported()',
    'public.log_recipient_change()',
    'public.notify_interest_registered()',
    'public.notify_org_awaiting_approval()',
    'public.notify_outreach_received()',
    'public.notify_role_closed()',
    'public.sync_profile_email()',
    -- SECURITY INVOKER trigger functions. Calling one directly gains nothing,
    -- but "every trigger function" is a rule that can be checked; "every
    -- trigger function except four" is a rule that drifts.
    'public.admins_no_self_removal()',
    'public.audit_logs_append_only()',
    'public.prevent_role_change()',
    'public.protect_permanent_recipient()'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon, authenticated', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Residue: functions whose tables were dropped in workflow 1.1.
-- ---------------------------------------------------------------------------

-- Reads volunteer_hours.logged_hours. Table dropped 2026-09-13.
drop function if exists public.set_volunteer_hours_total_minutes();
drop function if exists public.calc_volunteer_hours_minutes(jsonb);

-- Reads site_settings. Table dropped 2026-09-13, so anon could call this and
-- get nothing but an error.
drop function if exists public.get_site_settings();
