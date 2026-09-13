-- Workflow 3.4 — ACC-8 and ADM-8.
--
-- Two pieces the client cannot do for itself.
--
-- 1. auth.users.email and user_profiles.email can drift, and drift is how
--    send-outreach became a way to mail anyone under the charity's name: it
--    read the profile column, which every user could rewrite. The column is
--    no longer client-writable and send-outreach now reads auth.users, but a
--    stale copy is still a trap for the next person who reaches for the
--    convenient one. Keep them in step at the source.
--
-- 2. ADM-8 is the fallback for someone locked out of BOTH addresses, so it
--    cannot be self-service and cannot go through the client. The Edge
--    Function does the auth change; this records it, because "logged with who
--    did it" is the whole reason the fallback is acceptable.

-- ------------------------------------------------- keep the copy in step
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.email is distinct from old.email then
    update public.user_profiles
       set email = new.email
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Backfill anything that has already drifted.
update public.user_profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- --------------------------------------------------------------- ADM-8
-- Called by the admin-change-email Edge Function after the auth change has
-- succeeded. Separate from the change itself so the log records what really
-- happened, not what was attempted.
create or replace function public.record_admin_email_change(
  p_admin_id  uuid,
  p_user_id   uuid,
  p_old_email text,
  p_new_email text,
  p_reason    text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if not public.is_admin(p_admin_id) then
    raise exception 'Only a Well Windsor admin can change another account''s email'
      using errcode = '42501';
  end if;

  -- The old and new addresses are both recorded on purpose: this is the one
  -- route that changes an address without the account holder proving
  -- anything, so it has to be answerable afterwards. ADM-4 redaction blanks
  -- these keys if the account is later deleted.
  v_id := public.record_audit_event(
    p_action_type    := 'admin_changed_login_email',
    p_actor_kind     := 'admin',
    p_actor_id       := p_admin_id,
    p_target_user_id := p_user_id,
    p_target_table   := 'auth.users',
    p_target_record_id := p_user_id,
    p_old_values     := jsonb_build_object('email', p_old_email),
    p_new_values     := jsonb_build_object('email', p_new_email),
    p_reason         := p_reason);

  return v_id;
end;
$$;

revoke all on function public.record_admin_email_change(uuid, uuid, text, text, text)
  from public, anon, authenticated;
