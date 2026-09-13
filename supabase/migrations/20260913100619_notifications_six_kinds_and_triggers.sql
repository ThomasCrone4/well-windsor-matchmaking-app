-- Workflow 1.3 — NTF-1: give `notifications` a fixed vocabulary, make the
-- database the only writer, and wire the events that exist today.
--
-- notifications has existed at 0 rows since it was created, so every
-- rendering path in NotificationsDropdown is unexercised. `type` was a free
-- varchar with no CHECK and a comment still naming the deleted hours_*
-- kinds.

-- ----------------------------------------------------------- vocabulary
alter table public.notifications
  add constraint notifications_type_valid check (type in (
    'outreach_received',      -- volunteer: an organisation has emailed you
    'role_removed',           -- volunteer: a role you registered for was removed
    'role_changed',           -- volunteer: a role you registered for closed or changed
    'interest_registered',    -- organisation: someone registered interest
    'org_awaiting_approval',  -- admin: an organisation is waiting
    'problem_reported'        -- admin: someone has reported a problem
  ));

comment on column public.notifications.type is
  'One of six kinds: outreach_received, role_removed, role_changed, '
  'interest_registered, org_awaiting_approval, problem_reported. Written '
  'only by SECURITY DEFINER triggers via notify_user().';

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

-- --------------------------------------------------------------- grants
-- Trap 1b: ALL was granted to anon and authenticated BY NAME. Name the
-- roles to take it back, then grant only what the bell actually needs.
--
-- No INSERT grant to anyone: the client must not be able to write into any
-- feed, including its own. The old "self insert only" policy let a user
-- fabricate their own notifications, and "Admins can manage all" let an
-- admin write into anybody's. Both are dropped — triggers are the writer.
--
-- UPDATE is granted on read_at ALONE. Granting the whole row let someone
-- rewrite their own notification text, which would make the log and the
-- bell disagree.
revoke all on public.notifications from anon, authenticated;
grant select (id, user_id, type, reference_id, message, read_at, created_at)
  on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

drop policy if exists "notifications: self insert only" on public.notifications;
drop policy if exists "Admins can manage all notifications" on public.notifications;

-- --------------------------------------------------------------- writer
create or replace function public.notify_user(
  p_user_id      uuid,
  p_type         text,
  p_message      text,
  p_reference_id uuid default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, type, message, reference_id)
  values (p_user_id, p_type, p_message, p_reference_id);
end;
$$;

revoke all on function public.notify_user(uuid, text, text, uuid)
  from public, anon, authenticated;

-- ------------------------------------------- an organisation emailed you
create or replace function public.notify_outreach_received()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org text;
begin
  if new.status is distinct from 'sent' then
    return new;
  end if;
  select name into v_org from public.user_profiles where id = new.org_id;
  perform public.notify_user(
    new.volunteer_id, 'outreach_received',
    coalesce(v_org, 'An organisation') || ' has sent you a message about volunteering.',
    new.opportunity_id);
  return new;
end;
$$;

drop trigger if exists notify_on_outreach_sent on public.org_outreach;
create trigger notify_on_outreach_sent
  after insert on public.org_outreach
  for each row execute function public.notify_outreach_received();

-- -------------------------------------- someone registered interest
create or replace function public.notify_interest_registered()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_volunteer text;
  v_title     text;
begin
  select name into v_volunteer from public.user_profiles where id = new.volunteer_id;
  select title into v_title from public.volunteer_opportunities where id = new.opportunity_id;
  perform public.notify_user(
    new.org_id, 'interest_registered',
    coalesce(v_volunteer, 'Someone') || ' has registered interest in ' ||
      coalesce(v_title, new.opportunity_title, 'one of your roles') || '.',
    new.opportunity_id);
  return new;
end;
$$;

drop trigger if exists notify_on_interest_registered on public.applications;
create trigger notify_on_interest_registered
  after insert on public.applications
  for each row execute function public.notify_interest_registered();

-- ------------------------------------- an organisation is waiting
create or replace function public.notify_org_awaiting_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_admin uuid;
begin
  if new.role is distinct from 'organization' or new.approved_at is not null then
    return new;
  end if;
  for v_admin in select user_id from public.admins loop
    perform public.notify_user(
      v_admin, 'org_awaiting_approval',
      new.name || ' has signed up and is waiting for approval.',
      new.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_on_org_signup on public.user_profiles;
create trigger notify_on_org_signup
  after insert on public.user_profiles
  for each row execute function public.notify_org_awaiting_approval();

-- ------------------------------------------- a role you registered for closed
-- Also covers the nightly auto-close job, which sets status = 'closed'.
create or replace function public.notify_role_closed()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_volunteer uuid;
begin
  if new.status is not distinct from old.status or new.status <> 'closed' then
    return new;
  end if;
  for v_volunteer in
    select distinct volunteer_id from public.applications where opportunity_id = new.id
  loop
    perform public.notify_user(
      v_volunteer, 'role_changed',
      'A role you registered for, ' || new.title || ', has closed.',
      new.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_on_role_closed on public.volunteer_opportunities;
create trigger notify_on_role_closed
  after update on public.volunteer_opportunities
  for each row execute function public.notify_role_closed();

-- 'role_removed' is in the CHECK above but has no trigger yet: it fires on
-- the soft-delete column that workflow 5 (ROLE-1) introduces. Deleting a
-- role today is a hard DELETE, which workflow 5 replaces, so a trigger
-- written now would be thrown away.
-- 'problem_reported' is wired in 1.4, in the same branch.
