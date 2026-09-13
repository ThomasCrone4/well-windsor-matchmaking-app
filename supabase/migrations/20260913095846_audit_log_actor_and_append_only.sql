-- Workflow 1.2 — ADM-3 and ADM-4: make audit_logs record system events as
-- well as admin ones, make it append-only in the database, and write the
-- GDPR redaction function that workflow 3 will call on account deletion.
--
-- audit_logs exists at 0 rows and nothing in src/ reads it, so the shape
-- is free to change.

-- ---------------------------------------------------------------- actor
-- admin_id was NOT NULL, which cannot express "the nightly digest job sent
-- this email". Replaced by an actor_id + actor_kind pair, so "who did
-- this" is answerable without interpreting a NULL.
--
-- Both foreign keys are DROPPED, deliberately. They were
-- ON DELETE SET NULL to user_profiles, so deleting an account silently
-- blanked the log entries about it — an append-only log that a cascade can
-- rewrite is not append-only, and the whole point of ADM-4 is that the
-- dated record survives the account. The ids stay as plain uuids and
-- redact_user_from_audit_log() is what removes the personal data.

alter table public.audit_logs drop constraint if exists audit_logs_admin_id_fkey;
alter table public.audit_logs drop constraint if exists audit_logs_target_user_id_fkey;

alter table public.audit_logs rename column admin_id to actor_id;
alter table public.audit_logs alter column actor_id drop not null;

alter table public.audit_logs add column if not exists actor_kind text not null default 'admin';
alter table public.audit_logs alter column actor_kind drop default;

alter table public.audit_logs add column if not exists redacted_at timestamptz;

alter table public.audit_logs add constraint audit_logs_actor_kind_valid
  check (actor_kind in ('admin', 'system', 'user'));

-- A system event has no actor; an admin or user event must name one.
alter table public.audit_logs add constraint audit_logs_actor_matches_kind
  check ((actor_kind = 'system') = (actor_id is null));

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_target_user_id_idx
  on public.audit_logs (target_user_id);

comment on table public.audit_logs is
  'Append-only record of admin, system and user actions. Writes only via '
  'record_audit_event(). UPDATE and DELETE are refused by trigger except '
  'inside redact_user_from_audit_log().';

-- ----------------------------------------------------------- append-only
-- Belt and braces: the grants below are the real control, but a future
-- migration handing out table privileges would otherwise silently reopen
-- the hole. The one permitted exception is the ADM-4 redaction function,
-- which announces itself with a transaction-local flag.
create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('app.audit_redaction', true), '') = 'on'
     and tg_op = 'UPDATE' then
    return new;
  end if;
  raise exception 'audit_logs is append-only: % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
  before update on public.audit_logs
  for each row execute function public.audit_logs_append_only();

drop trigger if exists audit_logs_no_delete on public.audit_logs;
create trigger audit_logs_no_delete
  before delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

-- --------------------------------------------------------------- grants
-- Trap 1b: Supabase's default privileges granted ALL to anon and
-- authenticated BY NAME, so "revoke ... from public" would leave INSERT,
-- UPDATE and DELETE in place. Name the roles.
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "Admins can insert audit logs" on public.audit_logs;
drop policy if exists "Admins can view all audit logs" on public.audit_logs;

-- No INSERT policy and no INSERT grant: the only writer is
-- record_audit_event(), which is SECURITY DEFINER and runs as the owner.
create policy "audit: admins read" on public.audit_logs
  for select to authenticated
  using (public.is_admin(auth.uid()));

-- --------------------------------------------------------------- writer
create or replace function public.record_audit_event(
  p_action_type     text,
  p_actor_kind      text default 'system',
  p_actor_id        uuid default null,
  p_target_user_id  uuid default null,
  p_target_table    text default null,
  p_target_record_id uuid default null,
  p_old_values      jsonb default null,
  p_new_values      jsonb default null,
  p_metadata        jsonb default null,
  p_reason          text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    actor_kind, actor_id, action_type, target_user_id, target_table,
    target_record_id, old_values, new_values, metadata, reason
  ) values (
    p_actor_kind, p_actor_id, p_action_type, p_target_user_id, p_target_table,
    p_target_record_id, p_old_values, p_new_values, p_metadata, p_reason
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Traps 1 and 1c: Postgres grants EXECUTE to PUBLIC by default and
-- Supabase grants it to anon/authenticated by name. Both must go, or any
-- signed-in user could forge a log entry naming whatever actor they liked.
revoke all on function public.record_audit_event(
  text, text, uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;

-- ------------------------------------------------------- ADM-4 redaction
-- Called by the account-deletion function in workflow 3. Leaves the dated
-- record and removes the personal data from it.
create or replace function public.redact_user_from_audit_log(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_count integer;
  v_keys  text[] := array['name', 'email', 'message', 'subject',
                          'contact_number', 'dob', 'reply_to'];
  v_key   text;
begin
  perform set_config('app.audit_redaction', 'on', true);

  update public.audit_logs a
     set old_values = coalesce(
           (select jsonb_object_agg(k, case when k = any(v_keys)
                                            then to_jsonb('deleted user'::text)
                                            else v end)
              from jsonb_each(a.old_values) as e(k, v)), a.old_values),
         new_values = coalesce(
           (select jsonb_object_agg(k, case when k = any(v_keys)
                                            then to_jsonb('deleted user'::text)
                                            else v end)
              from jsonb_each(a.new_values) as e(k, v)), a.new_values),
         metadata = coalesce(
           (select jsonb_object_agg(k, case when k = any(v_keys)
                                            then to_jsonb('deleted user'::text)
                                            else v end)
              from jsonb_each(a.metadata) as e(k, v)), a.metadata),
         reason = case when a.reason is null then null else 'deleted user' end,
         redacted_at = now()
   where a.target_user_id = p_user_id
      or a.actor_id = p_user_id;

  get diagnostics v_count = row_count;

  perform set_config('app.audit_redaction', 'off', true);
  return v_count;
end;
$$;

revoke all on function public.redact_user_from_audit_log(uuid)
  from public, anon, authenticated;
