-- grant_admin() raised no_data_found for an unknown account, which PostgREST
-- returns as HTTP 500. Typing an address that has no account is a mistake the
-- person makes, not a server fault, and a 500 tells them the wrong thing —
-- and gets treated as an outage by anything watching. 22023 maps to 400.
--
-- Same for prepare_account_deletion(), which is service-role only and so
-- never reaches a person, but should not disagree with its sibling about what
-- "no such account" means.

create or replace function public.grant_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select role into v_role from public.user_profiles where id = p_user_id;
  if v_role is null then
    raise exception 'No Well Windsor account signs in with that address'
      using errcode = '22023';
  end if;

  insert into public.admins (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  perform public.record_audit_event(
    p_action_type    := 'admin_granted',
    p_actor_kind     := 'admin',
    p_actor_id       := auth.uid(),
    p_target_user_id := p_user_id,
    p_target_table   := 'admins',
    p_target_record_id := p_user_id);
end;
$$;

revoke all on function public.grant_admin(uuid) from public, anon;
grant execute on function public.grant_admin(uuid) to authenticated;

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
    raise exception 'No such account' using errcode = '22023';
  end if;

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

  v_redacted := public.redact_user_from_audit_log(p_user_id);

  return jsonb_build_object(
    'role', v_profile.role,
    'outreach_preserved', v_outreach,
    'applications_removed', v_apps,
    'roles_removed', v_roles,
    'audit_rows_redacted', v_redacted);
end;
$$;

revoke all on function public.prepare_account_deletion(uuid)
  from public, anon, authenticated;
