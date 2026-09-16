-- Workflow 7.2 — ADM-1: an admin can take a role down.
--
-- The admin opportunities tab had "Applicants", "Edit" and "View Creator"
-- and no way to take anything off the site, even though the
-- `opps update status - admin` policy has existed all along.
--
-- Taking down means REMOVING (ROLE-1: deleted_at, terminal), not closing.
-- Closing is the state ROLE-4 made reversible by the organisation from its
-- own edit form, so an admin "closing" an unsuitable role would last exactly
-- until the organisation reopened it. And never DELETE: that is revoked on
-- this table and refused by trigger, and would erase the registrations.
--
-- Through a function rather than a client UPDATE on deleted_at, for one
-- reason: the audit log. ADM-3 says the logs record who did what, and an
-- admin taking down someone else's role is exactly the event that needs a
-- name and a reason against it. The function requires the reason.
--
-- The registrants are told by the existing ROLE-2 trigger. Its message said
-- "was removed by the organisation" unconditionally, which would be untrue
-- here, so it now names who removed it: the organisation when the person
-- removing it is the organisation, Well Windsor otherwise. Same-signature
-- CREATE OR REPLACE, so the function keeps its ACL (trap 1c).

create or replace function public.notify_role_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_volunteer uuid;
  v_type      text;
  v_message   text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    v_type    := 'role_removed';
    v_message := 'A role you registered for, ' || new.title ||
                 case when auth.uid() is not distinct from new.org_id
                      then ', was removed by the organisation.'
                      else ', was taken down by Well Windsor.'
                 end;

  elsif new.deleted_at is not null then
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

create or replace function public.admin_take_down_role(
  p_opportunity_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.volunteer_opportunities;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can take a role down'
      using errcode = '42501';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why the role is being taken down'
      using errcode = '22023';
  end if;

  if length(p_reason) > 500 then
    raise exception 'Keep the reason to 500 characters'
      using errcode = '22023';
  end if;

  select * into v_role
    from public.volunteer_opportunities
   where id = p_opportunity_id
   for update;

  if not found then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  if v_role.deleted_at is not null then
    raise exception 'That role has already been removed'
      using errcode = '22023';
  end if;

  update public.volunteer_opportunities
     set deleted_at = now()
   where id = p_opportunity_id;

  perform public.record_audit_event(
    p_action_type      := 'role_taken_down',
    p_actor_kind       := 'admin',
    p_actor_id         := auth.uid(),
    p_target_user_id   := v_role.org_id,
    p_target_table     := 'volunteer_opportunities',
    p_target_record_id := p_opportunity_id,
    p_old_values       := jsonb_build_object('status', v_role.status,
                                             'title', v_role.title),
    p_new_values       := jsonb_build_object('deleted', true),
    p_reason           := btrim(p_reason));
end;
$$;

revoke all on function public.admin_take_down_role(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_take_down_role(uuid, text) to authenticated;
