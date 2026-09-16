-- Workflow 3.3 — ACC-6: account deletion, required by UK GDPR before launch.
--
-- ADM-4 settled the principle: logs are permanent, the personal data in them
-- is not. redact_user_from_audit_log() (workflow 1.2) already blanks the
-- name, email and message text and keeps the dated record, and audit_logs has
-- no foreign keys precisely so a deletion cannot cascade through it.
--
-- What the plan did not anticipate: **org_outreach cascades.** Both its
-- org_id and volunteer_id are ON DELETE CASCADE to user_profiles, so deleting
-- a volunteer erases the record that an organisation wrote to them. That is
-- the same thing INT-4 refuses to allow for withdrawn registrations, and for
-- the same reason: delete the row and a legitimate email starts looking like
-- an unprompted approach to someone who never applied. The charity loses its
-- evidence that the contact was permitted.
--
-- So before the account goes, each outreach involving it is written into the
-- permanent log — who sent it, about which role, when, and whether it sent.
-- Never the message text or either name: that is the personal data being
-- erased. The dated record survives; the person does not.

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile   record;
  v_outreach  integer := 0;
  v_apps      integer := 0;
  v_roles     integer := 0;
  v_redacted  integer := 0;
  r           record;
begin
  select id, role, name into v_profile
    from public.user_profiles where id = p_user_id;

  if v_profile.id is null then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;

  -- 1. Preserve the outreach record before the cascade takes it.
  for r in
    select o.id, o.org_id, o.volunteer_id, o.opportunity_id, o.status, o.created_at
      from public.org_outreach o
     where o.org_id = p_user_id or o.volunteer_id = p_user_id
  loop
    perform public.record_audit_event(
      p_action_type      := 'outreach_preserved_on_deletion',
      p_actor_kind       := 'system',
      p_target_table     := 'org_outreach',
      p_target_record_id := r.id,
      p_metadata         := jsonb_build_object(
                              'org_id', r.org_id,
                              'volunteer_id', r.volunteer_id,
                              'opportunity_id', r.opportunity_id,
                              'status', r.status,
                              'sent_at', r.created_at),
      p_reason           := 'Account deleted; message text and names removed.');
    v_outreach := v_outreach + 1;
  end loop;

  select count(*) into v_apps from public.applications
   where volunteer_id = p_user_id or org_id = p_user_id;
  select count(*) into v_roles from public.volunteer_opportunities
   where org_id = p_user_id;

  -- 2. The deletion itself, recorded before it happens so the log survives
  --    even if the auth delete then fails.
  perform public.record_audit_event(
    p_action_type    := 'account_deleted',
    p_actor_kind     := 'user',
    p_actor_id       := p_user_id,
    p_target_user_id := p_user_id,
    p_target_table   := 'user_profiles',
    p_metadata       := jsonb_build_object(
                          'role', v_profile.role,
                          'outreach_preserved', v_outreach,
                          'applications_removed', v_apps,
                          'roles_removed', v_roles));

  -- 3. ADM-4: blank the personal data across every entry about this person,
  --    including the ones just written.
  v_redacted := public.redact_user_from_audit_log(p_user_id);

  return jsonb_build_object(
    'role', v_profile.role,
    'outreach_preserved', v_outreach,
    'applications_removed', v_apps,
    'roles_removed', v_roles,
    'audit_rows_redacted', v_redacted);
end;
$$;

comment on function public.prepare_account_deletion(uuid) is
  'Writes the permanent record of an account before it is deleted, then '
  'redacts the personal data from it. Called by the delete-account Edge '
  'Function immediately before auth.admin.deleteUser.';

-- Service role only: the Edge Function calls it. A client must never be able
-- to fabricate a deletion record, or to run redaction against someone else.
revoke all on function public.prepare_account_deletion(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------- what will be lost
-- The confirmation has to make the consequence plain (ACC-6), and for an
-- organisation the consequence is larger than its own data: deleting it
-- cascades its roles and every registration volunteers made to them. The
-- client cannot count those itself — RLS hides other people's rows — so it
-- asks here.
create or replace function public.account_deletion_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select role into v_role from public.user_profiles where id = v_uid;

  return jsonb_build_object(
    'role', v_role,
    'roles_posted', (select count(*) from public.volunteer_opportunities where org_id = v_uid),
    'registrations_received', (select count(*) from public.applications where org_id = v_uid),
    'registrations_made', (select count(*) from public.applications where volunteer_id = v_uid),
    'messages_sent', (select count(*) from public.org_outreach where org_id = v_uid),
    'messages_received', (select count(*) from public.org_outreach where volunteer_id = v_uid));
end;
$$;

comment on function public.account_deletion_summary() is
  'Counts, for the signed-in user only, of what deleting their account would '
  'take with it. Reports on auth.uid() and nobody else.';

revoke all on function public.account_deletion_summary() from public, anon;
grant execute on function public.account_deletion_summary() to authenticated;
