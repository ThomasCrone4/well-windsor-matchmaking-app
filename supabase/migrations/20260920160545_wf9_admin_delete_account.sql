-- Workflow 9, batch 9.7 -- an admin can delete an account properly (WF8-6).
--
-- The gap this closes: `delete-account` deletes only the caller, by design
-- (ACC-6 -- there is no parameter to point at anyone else). So the only way
-- an admin could remove somebody was from the Supabase dashboard, which
-- deletes the auth row and **skips prepare_account_deletion() entirely**:
-- no preserved outreach record, no audit-log redaction, no email-outbox
-- blanking. Every one of those is something the privacy policy promises, so
-- the dashboard route quietly breaks it. It matters the moment anyone emails
-- asking to be deleted.
--
-- WHY SQL RATHER THAN AN EDGE FUNCTION. `delete-account` prepares over RPC
-- and then calls auth.admin.deleteUser over the API -- two steps that can
-- half-succeed, which is why it has a `account_deletion_failed` branch that
-- writes "the log says deleted and it was not". Inside the database the
-- preparation and the delete are one transaction: either the person is gone
-- and the record is written, or nothing happened. Deleting auth.users
-- directly is already the established pattern here (it is how throwaway
-- accounts are cleaned up), and the cascades do the rest.
--
-- ORDER, AND WHY IT IS THIS WAY ROUND. prepare_account_deletion() redacts the
-- audit log for this user, and redaction scrubs personal VALUES (name, email,
-- message, subject, contact_number, dob, and the reason column) while keeping
-- actor_id and target_user_id. So the "deleted by an admin" entry is written
-- AFTER the redaction -- written before, its reason would be blanked to
-- 'deleted user' and the one thing worth keeping would be lost. It therefore
-- carries no personal data of its own: a reason, and counts.

create or replace function public.admin_delete_account(p_user_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor   uuid := auth.uid();
  v_profile public.user_profiles;
  v_summary jsonb;
begin
  if not public.is_admin(v_actor) then
    raise exception 'Only a Well Windsor admin can delete someone else''s account'
      using errcode = '42501';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Please give a reason for deleting this account'
      using errcode = '22023';
  end if;

  select * into v_profile from public.user_profiles where id = p_user_id;
  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;

  -- Same refusal as delete-account, for the same reason: there is one admin
  -- row today, and an admin deleting an admin can lock the charity out of
  -- its own site. Revoking admin access first is a deliberate second step.
  if exists (select 1 from public.admins where user_id = p_user_id) then
    raise exception
      'That is an admin account. Revoke its admin access first, then delete it.'
      using errcode = '42501';
  end if;

  -- Self-deletion has its own route, which asks the person to type DELETE.
  -- An admin reaching their own account here is almost certainly a misclick.
  if p_user_id = v_actor then
    raise exception 'Use the delete option on your own profile page to close your own account'
      using errcode = '22023';
  end if;

  -- Preserve, then redact. Deleting the user cascades org_outreach,
  -- applications, notifications and (for an organisation) its roles, so the
  -- record has to be written while they still exist.
  v_summary := public.prepare_account_deletion(p_user_id);

  -- After the redaction, so the reason survives it. No names, no addresses.
  perform public.record_audit_event(
    p_action_type      := 'account_deleted_by_admin',
    p_actor_kind       := 'admin',
    p_actor_id         := v_actor,
    p_target_user_id   := p_user_id,
    p_target_table     := 'user_profiles',
    p_target_record_id := p_user_id,
    p_metadata         := jsonb_build_object('role', v_profile.role,
                                             'summary', v_summary),
    p_reason           := btrim(p_reason));

  delete from auth.users where id = p_user_id;

  return jsonb_build_object('deleted', true,
                            'role', v_profile.role,
                            'summary', v_summary);
end;
$function$;

-- Trap 1: EXECUTE is granted to PUBLIC by default and anon inherits it.
revoke all on function public.admin_delete_account(uuid, text) from public, anon;
grant execute on function public.admin_delete_account(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What the account page shows.
--
-- An admin can already read user_profiles by policy, but not auth.users --
-- so the CONFIRMED state of the login address, which is the thing you look
-- at when someone says they never got an email, is not reachable from a
-- browser. This returns the account as the admin screen needs it, and
-- nothing that is not already on some admin list.
-- ---------------------------------------------------------------------------
create or replace function public.admin_account_overview(p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile public.user_profiles;
  v_auth    record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can read an account'
      using errcode = '42501';
  end if;

  select * into v_profile from public.user_profiles where id = p_user_id;
  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;

  select email, email_confirmed_at, last_sign_in_at, created_at
    into v_auth
    from auth.users where id = p_user_id;

  return jsonb_build_object(
    'id',                 v_profile.id,
    'role',               v_profile.role,
    'name',               v_profile.name,
    'email',              coalesce(v_auth.email, v_profile.email),
    'email_confirmed_at', v_auth.email_confirmed_at,
    'last_sign_in_at',    v_auth.last_sign_in_at,
    'created_at',         v_profile.created_at,
    'home_town',          v_profile.home_town,
    'bio',                v_profile.bio,
    'skills',             v_profile.skills,
    'contact_number',     v_profile.contact_number,
    'dob',                v_profile.dob,
    'public_profile',     v_profile.public_profile,
    'approved_at',        v_profile.approved_at,
    'declined_at',        v_profile.declined_at,
    'is_admin',           exists (select 1 from public.admins a where a.user_id = p_user_id),
    -- Counts rather than the rows: the page links to the lists that already
    -- show them, and a per-person copy of every list is a second place for
    -- the same query to drift.
    'roles_posted',       (select count(*) from public.volunteer_opportunities o
                            where o.org_id = p_user_id and o.deleted_at is null),
    'roles_live',         (select count(*) from public.volunteer_opportunities o
                            where o.org_id = p_user_id and o.deleted_at is null
                              and o.status = 'active'),
    'registrations',      (select count(*) from public.applications a
                            where a.volunteer_id = p_user_id and a.withdrawn_at is null),
    'messages_sent',      (select count(*) from public.org_outreach x where x.org_id = p_user_id),
    'messages_received',  (select count(*) from public.org_outreach x where x.volunteer_id = p_user_id)
  );
end;
$function$;

revoke all on function public.admin_account_overview(uuid) from public, anon;
grant execute on function public.admin_account_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The person's own audit history, for the bottom of the account page.
-- audit_logs is admin-readable by policy already, but the rows name ids and
-- not people, so this joins the actor's name and keeps the page to one query.
-- ---------------------------------------------------------------------------
create or replace function public.admin_account_history(p_user_id uuid, p_limit integer default 100)
 returns table(id uuid, created_at timestamptz, action_type text, actor_kind text,
               actor_id uuid, actor_name text, reason text, metadata jsonb,
               redacted_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can read an account''s history'
      using errcode = '42501';
  end if;

  return query
  -- Cast in the BODY, not by changing the RETURNS TABLE: CREATE OR REPLACE
  -- cannot change a return type, and a DROP would hand EXECUTE back to anon
  -- by name (trap 1c). audit_logs.created_at is `timestamp WITHOUT time
  -- zone` holding UTC, and action_type is varchar -- both come back as
  -- 42804 "returned type does not match expected type" without these.
  select a.id, a.created_at::timestamptz, a.action_type::text, a.actor_kind, a.actor_id,
         actor.name, a.reason, a.metadata, a.redacted_at
    from public.audit_logs a
    left join public.user_profiles actor on actor.id = a.actor_id
   where a.target_user_id = p_user_id
      or a.actor_id = p_user_id
   order by a.created_at desc
   limit v_limit;
end;
$function$;

revoke all on function public.admin_account_history(uuid, integer) from public, anon;
grant execute on function public.admin_account_history(uuid, integer) to authenticated;
