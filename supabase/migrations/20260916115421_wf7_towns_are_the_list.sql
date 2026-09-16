-- Workflow 7.1 — ADM-6, part 1: the `towns` table becomes the list.
--
-- Until now there were two lists that disagreed. `towns` held four rows
-- (Windsor active; Old Windsor, Slough, Maidenhead inactive) and the admin
-- dashboard could add and activate them, but the database took its real
-- list from a CHECK on volunteer_opportunities.town that named Windsor,
-- Maidenhead and Slough. Old Windsor was in the table and not in the CHECK,
-- so an admin could activate it today and produce a town in which no role
-- could ever be posted, refused with a 23514 nobody could read.
--
-- So, before anything else in ADM-6:
--
--   1. The CHECK becomes a FOREIGN KEY to towns(name). Adding a town is now
--      an INSERT, with no migration behind it.
--
--   2. user_profiles.home_town gets the same foreign key. It had no
--      constraint at all, which is why townOptionsFor() exists: on
--      2026-09-08 real people held 'Maidenhead' and 'London'. Checked before
--      writing this: every profile today holds 'Windsor', so the key
--      validates without touching anyone's data. Nobody is locked out of
--      saving their own profile, because the "must be an ACTIVE town" rule
--      below only fires when home_town actually changes, and a town that
--      people live in cannot be deactivated (4).
--
--   3. While exactly one town is active, a role or profile saved with no
--      town is filed under it. This is the database half of the
--      disappearing picker: the client hides every town picker when there
--      is one town, and it does not have to win a race with the towns query
--      to get the town right — a submit before that query lands still ends
--      up in Windsor.
--
--   4. A town cannot be deactivated or deleted while any role that is not
--      removed, or any person, is filed under it — or the browse quietly
--      loses them. Nor can the last active town go, which would leave
--      nowhere to post anything. A trigger, not a UI rule, because an admin
--      holds UPDATE on this table through the API as well.
--
--   5. Every change to `towns` is written to the audit log, with the admin
--      who made it.
--
-- Deliberately NOT done: an ON UPDATE CASCADE. Renaming a town that roles
-- are filed under would rewrite `town` on each of them, which fires ROLE-2
-- and tells every registrant their role "has been updated". A rename is
-- refused by the key instead; nothing in the UI offers one.

-- ---------------------------------------------------------------------------
-- 0. The names themselves. "windsor" and "Windsor " must not become a second
--    town that nobody can tell apart from the first.
-- ---------------------------------------------------------------------------
alter table public.towns
  add constraint towns_name_tidy
  check (name = btrim(name) and name <> '' and length(name) <= 60);

create unique index towns_name_lower_key on public.towns (lower(name));

-- ---------------------------------------------------------------------------
-- 1 and 2. The foreign keys.
-- ---------------------------------------------------------------------------
alter table public.volunteer_opportunities
  drop constraint volunteer_opportunities_town_valid;

alter table public.volunteer_opportunities
  add constraint volunteer_opportunities_town_fkey
  foreign key (town) references public.towns (name)
  on update restrict on delete restrict;

alter table public.user_profiles
  add constraint user_profiles_home_town_fkey
  foreign key (home_town) references public.towns (name)
  on update restrict on delete restrict;

create index if not exists volunteer_opportunities_town_idx
  on public.volunteer_opportunities (town);
create index if not exists user_profiles_home_town_idx
  on public.user_profiles (home_town);

-- ---------------------------------------------------------------------------
-- 3. The one rule, database side: the sole active town, or NULL.
-- ---------------------------------------------------------------------------
create or replace function public.sole_active_town()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select min(name) from public.towns where is_active having count(*) = 1;
$$;

-- Only the SECURITY DEFINER triggers below call it. Trap 1: revoke from
-- PUBLIC, and trap 1c: name the roles too.
revoke all on function public.sole_active_town() from public, anon, authenticated;

create or replace function public.volunteer_opportunities_town_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.town is null then
    new.town := public.sole_active_town();
  end if;

  if new.town is not null
     and (tg_op = 'INSERT' or new.town is distinct from old.town)
     and not exists (select 1 from public.towns t
                      where t.name = new.town and t.is_active) then
    raise exception 'Well Windsor does not currently cover %. Choose one of the towns offered.', new.town
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.volunteer_opportunities_town_rules() from public, anon, authenticated;

create trigger town_rules
  before insert or update on public.volunteer_opportunities
  for each row execute function public.volunteer_opportunities_town_rules();

create or replace function public.user_profiles_town_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.home_town is null then
    new.home_town := public.sole_active_town();
  end if;

  if new.home_town is not null
     and (tg_op = 'INSERT' or new.home_town is distinct from old.home_town)
     and not exists (select 1 from public.towns t
                      where t.name = new.home_town and t.is_active) then
    raise exception 'Well Windsor does not currently cover %. Choose one of the towns offered.', new.home_town
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.user_profiles_town_rules() from public, anon, authenticated;

create trigger town_rules
  before insert or update on public.user_profiles
  for each row execute function public.user_profiles_town_rules();

-- ---------------------------------------------------------------------------
-- 4. Nothing filed under a town may be stranded by deactivating it.
-- ---------------------------------------------------------------------------
create or replace function public.towns_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles  integer;
  v_people integer;
begin
  -- Only an active town leaving the active list is guarded here. Deleting
  -- an inactive town that something still references is refused by the
  -- foreign keys, which also count removed roles.
  if not old.is_active or (tg_op = 'UPDATE' and new.is_active) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*) into v_roles
    from public.volunteer_opportunities
   where town = old.name and deleted_at is null;

  select count(*) into v_people
    from public.user_profiles
   where home_town = old.name;

  if v_roles > 0 or v_people > 0 then
    raise exception '% still has % role(s) and % account(s) filed under it. A town can only be deactivated once nothing is.',
      old.name, v_roles, v_people
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.towns
                  where is_active and id <> old.id) then
    raise exception '% is the only active town. Activate another before deactivating it.', old.name
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.towns_guard() from public, anon, authenticated;

create trigger towns_guard
  before update or delete on public.towns
  for each row execute function public.towns_guard();

-- ---------------------------------------------------------------------------
-- 5. The audit trail.
-- ---------------------------------------------------------------------------
create or replace function public.towns_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'town_added'
    when tg_op = 'DELETE' then 'town_deleted'
    when new.is_active and not old.is_active then 'town_activated'
    when old.is_active and not new.is_active then 'town_deactivated'
    else 'town_updated'
  end;

  perform public.record_audit_event(
    p_action_type  := v_action,
    p_actor_kind   := case when auth.uid() is null then 'system' else 'admin' end,
    p_actor_id     := auth.uid(),
    p_target_table := 'towns',
    p_old_values   := case when tg_op <> 'INSERT' then to_jsonb(old) end,
    p_new_values   := case when tg_op <> 'DELETE' then to_jsonb(new) end);

  return null;
end;
$$;

revoke all on function public.towns_audit() from public, anon, authenticated;

create trigger towns_audit
  after insert or update or delete on public.towns
  for each row execute function public.towns_audit();
