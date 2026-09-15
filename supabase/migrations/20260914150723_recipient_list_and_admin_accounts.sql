-- Workflow 4 — APP-3 and APP-6.
--
-- APP-3. Who hears that an organisation is waiting becomes a list an admin
-- can edit, with hello@wellwindsor.org.uk permanently on it. "Permanently"
-- is enforced here rather than by hiding the button, because the point of
-- that row is that alerts cannot quietly stop when people change jobs — and
-- a rule that lives only in the UI stops being a rule the moment anyone uses
-- the API.
--
-- APP-6. Admins are added by hand in the database today. This gives them a
-- real route, and closes a gap found while reading pg_class.relacl: the
-- `admins` DELETE policy is `is_admin(auth.uid())` with no check on WHICH
-- row, so an admin can delete their own. With exactly one admin row that is
-- a one-click lockout of the entire charity.

-- ============================================================ APP-3
create table if not exists public.notification_recipients (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  name         text,
  -- The hello@ row. Cannot be deleted, paused, renamed or demoted.
  is_permanent boolean not null default false,
  paused_at    timestamptz,
  added_by     uuid,
  created_at   timestamptz not null default now()
);

alter table public.notification_recipients
  add constraint notification_recipients_email_sane
  check (length(email) <= 320 and email like '%_@_%');

create unique index if not exists notification_recipients_email_key
  on public.notification_recipients (lower(email));

-- At most one permanent row, so "the address that can never be removed" is
-- singular and unambiguous.
create unique index if not exists notification_recipients_one_permanent
  on public.notification_recipients ((true)) where is_permanent;

alter table public.notification_recipients enable row level security;

comment on table public.notification_recipients is
  'APP-3. Who is emailed when an organisation is waiting. The permanent row '
  '(hello@wellwindsor.org.uk) cannot be removed or paused by any route.';

insert into public.notification_recipients (email, name, is_permanent)
values ('hello@wellwindsor.org.uk', 'Well Windsor', true)
on conflict do nothing;

-- Trap 1b: a new table is born with ALL granted to anon and authenticated BY
-- NAME. Name the roles, then grant back what the admin screen needs; the
-- policies below limit it to admins, and the triggers limit it further.
revoke all on public.notification_recipients from anon, authenticated;
grant select, insert, update, delete on public.notification_recipients to authenticated;

create policy "recipients: admins read" on public.notification_recipients
  for select to authenticated using (public.is_admin(auth.uid()));
create policy "recipients: admins add" on public.notification_recipients
  for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "recipients: admins change" on public.notification_recipients
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy "recipients: admins remove" on public.notification_recipients
  for delete to authenticated using (public.is_admin(auth.uid()));

-- ------------------------------------------------- the permanent row holds
-- A trigger, not a policy, so it applies to the table owner and the service
-- role too. "Cannot be removed" has to mean cannot, not cannot-from-the-UI.
create or replace function public.protect_permanent_recipient()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_permanent then
      raise exception 'hello@wellwindsor.org.uk cannot be removed from the list'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.is_permanent then
    if new.paused_at is not null then
      raise exception 'hello@wellwindsor.org.uk cannot be paused'
        using errcode = '42501';
    end if;
    if not new.is_permanent then
      raise exception 'hello@wellwindsor.org.uk cannot be made removable'
        using errcode = '42501';
    end if;
    if lower(new.email) is distinct from lower(old.email) then
      raise exception 'hello@wellwindsor.org.uk cannot be readdressed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_recipients_protect on public.notification_recipients;
create trigger notification_recipients_protect
  before update or delete on public.notification_recipients
  for each row execute function public.protect_permanent_recipient();

-- Every change to the list goes in the audit log (APP-3).
create or replace function public.log_recipient_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.record_audit_event(
    p_action_type      := 'recipient_' || lower(tg_op),
    p_actor_kind       := case when v_actor is null then 'system' else 'admin' end,
    p_actor_id         := v_actor,
    p_target_table     := 'notification_recipients',
    p_target_record_id := coalesce(new.id, old.id),
    p_old_values       := case when tg_op = 'INSERT' then null
                               else jsonb_build_object('email', old.email,
                                                       'paused', old.paused_at is not null) end,
    p_new_values       := case when tg_op = 'DELETE' then null
                               else jsonb_build_object('email', new.email,
                                                       'paused', new.paused_at is not null) end);
  return coalesce(new, old);
end;
$$;

drop trigger if exists notification_recipients_audit on public.notification_recipients;
create trigger notification_recipients_audit
  after insert or update or delete on public.notification_recipients
  for each row execute function public.log_recipient_change();

-- ------------------------------------------------- who actually gets mailed
-- The development redirect still wins. charity_notification_email exists so
-- that testing cannot reach the charity, and it has to keep winning now that
-- hello@ is unpausable by design — otherwise building the list would undo the
-- fix for the eleven emails that reached them. Delete the secret at launch
-- and this falls through to the list.
create or replace function public.charity_notification_recipients()
returns table (email text, name text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp', 'vault'
as $$
declare
  v_override text;
begin
  select s.decrypted_secret into v_override
    from vault.decrypted_secrets s
   where s.name = 'charity_notification_email';

  if nullif(btrim(coalesce(v_override, '')), '') is not null then
    return query select v_override::text, 'Well Windsor (development redirect)'::text;
    return;
  end if;

  return query
    select r.email, coalesce(r.name, 'Well Windsor')
      from public.notification_recipients r
     where r.paused_at is null
     order by r.is_permanent desc, r.created_at;
end;
$$;

revoke all on function public.charity_notification_recipients()
  from public, anon, authenticated;

-- ============================================================ APP-6
-- `admins` cannot carry an is_admin() policy: is_admin() reads `admins`, and
-- a policy on a table that queries the same table recurses (trap 3). That is
-- why the only SELECT policy is self-read. Listing every admin therefore has
-- to be a SECURITY DEFINER function, which runs as the owner and is not
-- subject to the policy at all.
create or replace function public.list_admins()
returns table (user_id uuid, name text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
    select a.user_id, p.name, p.email, a.created_at
      from public.admins a
      left join public.user_profiles p on p.id = a.user_id
     order by a.created_at;
end;
$$;

revoke all on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;

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
    raise exception 'No such account' using errcode = 'no_data_found';
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

create or replace function public.revoke_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  -- The whole of APP-6's safety rests on this: nobody removes their own
  -- admin rights, so the last admin cannot lock the charity out.
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove your own admin access. Ask another admin.'
      using errcode = '42501';
  end if;

  delete from public.admins where user_id = p_user_id;

  perform public.record_audit_event(
    p_action_type    := 'admin_revoked',
    p_actor_kind     := 'admin',
    p_actor_id       := auth.uid(),
    p_target_user_id := p_user_id,
    p_target_table   := 'admins',
    p_target_record_id := p_user_id);
end;
$$;

revoke all on function public.revoke_admin(uuid) from public, anon;
grant execute on function public.revoke_admin(uuid) to authenticated;

-- --------------------------------------- close the direct route entirely
-- Found by reading relacl: authenticated held INSERT, UPDATE and DELETE on
-- `admins`, and the DELETE policy checked only that the caller IS an admin,
-- never which row was going. An admin could delete their own row and, with
-- one admin row in the table, lock everybody out. SELECT stays so is_admin()
-- and the self-read policy keep working.
drop policy if exists "admins delete by admin" on public.admins;
drop policy if exists "admins insert by superuser only" on public.admins;

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

-- Belt and braces: even if a future migration hands the privilege back, the
-- one thing that must never happen still cannot.
create or replace function public.admins_no_self_removal()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is not null and old.user_id = auth.uid() then
    raise exception 'You cannot remove your own admin access. Ask another admin.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists admins_block_self_removal on public.admins;
create trigger admins_block_self_removal
  before delete on public.admins
  for each row execute function public.admins_no_self_removal();
