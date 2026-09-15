-- Workflow 5.3, follow-up — the other guard on registering interest.
--
-- Two things decide whether a registration is allowed, and after the soft
-- delete migration they disagreed:
--
--   * the `applications: volunteer applies` RLS policy, which now calls
--     opportunity_open_for_registration() and does check deleted_at;
--   * set_application_org_id(), a SECURITY DEFINER BEFORE INSERT trigger that
--     resolves org_id from the role and raises "That opportunity is not open
--     for applications" when it cannot — and which checked status and
--     approval but NOT deleted_at.
--
-- Found by a probe insert failing with the wrong error code, which is the
-- only reason it was noticed at all.
--
-- The policy alone does hold the line today; this is the second guard, and
-- CLAUDE.md's own rule from the signup alerts applies: when two things fire
-- on one event, guard both or neither. Leaving one of them ignorant of
-- deleted_at means a future migration that relaxes the policy silently
-- reopens the hole, and the trigger is the one that produces the readable
-- message a volunteer would actually see.

create or replace function public.set_application_org_id()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  select o.org_id into new.org_id
  from public.volunteer_opportunities o
  where o.id = new.opportunity_id
    and o.status = 'active'
    and o.deleted_at is null
    and public.is_approved_org(o.org_id);

  if new.org_id is null then
    raise exception 'That opportunity is not open for applications'
      using errcode = 'check_violation';
  end if;

  new.dismissed_at := null;

  return new;
end;
$$;

-- CREATE OR REPLACE keeps the existing ACL (postgres and service_role only),
-- so there is no trap 1c to undo here. Restated as an assertion rather than
-- an assumption.
revoke all on function public.set_application_org_id() from public;
revoke all on function public.set_application_org_id() from anon, authenticated;
