-- POLISH-4, part 2: the free-text `skills` columns are retired.
--
-- Applied only after the client that stopped reading and writing them went
-- live. Verified against the DEPLOYED bundle, not the repo: index-K5eacUP-.js
-- sends no `home_town, skills, bio` select and writes no `skills:` payload.
-- The previous bundle did both, which is why this waited (POLISH-6).
--
-- Four things happen here and the order is forced: the rule that depends on
-- the column has to move first, then the functions that name it, then the
-- views that select it -- a view holding a dependency makes DROP COLUMN fail
-- with 2BP01 -- and only then the columns themselves.

-- ---------------------------------------------------------------------------
-- 1. The public-profile rule: a CHECK becomes a trigger
-- ---------------------------------------------------------------------------
-- Unchanged in substance: to be visible to organisations you need a bio and
-- at least one skill. What changes is where "at least one skill" is read
-- from, and a CHECK cannot query another table.
alter table public.user_profiles
  drop constraint if exists user_profiles_public_needs_detail;

create or replace function public.enforce_public_profile_detail()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_role   text;
  v_public boolean;
  v_bio    text;
  v_skills integer;
begin
  v_id := case tg_table_name
            when 'user_profiles' then coalesce(new.id, old.id)
            else coalesce(new.volunteer_id, old.volunteer_id)
          end;

  select p.role, p.public_profile, p.bio
    into v_role, v_public, v_bio
    from public.user_profiles p
   where p.id = v_id;

  -- The profile itself is gone (ACC-6 cascade): nothing left to validate.
  if not found then
    return coalesce(new, old);
  end if;

  if v_role <> 'volunteer' or v_public is not true then
    return coalesce(new, old);
  end if;

  if coalesce(btrim(v_bio), '') = '' then
    raise exception 'A public profile needs a bio' using errcode = '23514';
  end if;

  select count(*) into v_skills
    from public.volunteer_skills vs where vs.volunteer_id = v_id;

  if v_skills = 0 then
    raise exception 'A public profile needs at least one skill'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enforce_public_profile_detail()
  from public, anon, authenticated;

-- DEFERRABLE INITIALLY DEFERRED on both, and that is load-bearing:
--
--  * sign-up inserts the profile row before any volunteer_skills row can
--    exist, because handle_new_user writes them in that order;
--  * the profile page saves the profile and the skills as two statements.
--
-- An immediate trigger would fire between the halves and refuse a valid save.
-- Deferred, it sees only the state at commit. That is also why the client
-- writes skills through set_volunteer_skills() -- a DELETE and an INSERT over
-- PostgREST are two transactions, and the DELETE's commit is exactly the
-- state this refuses.
drop trigger if exists trg_public_profile_detail on public.user_profiles;
create constraint trigger trg_public_profile_detail
  after insert or update on public.user_profiles
  deferrable initially deferred
  for each row execute function public.enforce_public_profile_detail();

drop trigger if exists trg_public_profile_skills on public.volunteer_skills;
create constraint trigger trg_public_profile_skills
  after insert or delete on public.volunteer_skills
  deferrable initially deferred
  for each row execute function public.enforce_public_profile_detail();

-- ---------------------------------------------------------------------------
-- 2. handle_new_user: no text column, and it writes the join rows
-- ---------------------------------------------------------------------------
-- The dangerous one. A SECURITY DEFINER trigger on auth.users: if it names a
-- dropped column, EVERY sign-up fails, an organisation's included -- not just
-- a volunteer's. probe_skills signs up to prove it does not.
--
-- It takes over writing the join rows because the profile row exists before
-- the client has a session to write anything with. That only matters once
-- email confirmation is switched on, when signUp returns no session at all --
-- but it is the difference between a volunteer's skills surviving sign-up and
-- silently vanishing, so it is wired now rather than discovered then.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
begin
  if meta->>'role' is null then
    return NEW;
  end if;

  insert into public.user_profiles (
    id, role, name, email, home_town, dob, contact_number,
    bio, public_profile
  )
  values (
    NEW.id,
    meta->>'role',
    coalesce(nullif(btrim(meta->>'name'), ''), 'Unnamed'),
    NEW.email,
    nullif(btrim(meta->>'home_town'), ''),
    (meta->>'dob')::date,
    nullif(btrim(meta->>'contact_number'), ''),
    nullif(btrim(meta->>'bio'), ''),
    coalesce((meta->>'public_profile')::boolean, false)
  )
  on conflict (id) do nothing;

  -- POLISH-4. `skill_ids` metadata becomes rows. jsonb_typeof guards the
  -- shape rather than trusting it: this is client-supplied and a scalar would
  -- raise. `and s.is_active` matters for the same reason -- without it a
  -- hidden skill could be chosen by anyone willing to hand-craft a sign-up.
  if meta->>'role' = 'volunteer'
     and jsonb_typeof(meta->'skill_ids') = 'array' then
    insert into public.volunteer_skills (volunteer_id, skill_id)
    select NEW.id, s.id
      from public.skills s
     where s.id::text in (select jsonb_array_elements_text(meta->'skill_ids'))
       and s.is_active
    on conflict do nothing;
  end if;

  -- WF9-2: a second INSERT followed, expanding the availability_matrix
  -- metadata into volunteer_availability rows. Any availability metadata a
  -- stale client still sends is now ignored rather than stored.
  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. admin_switch_account_type: clear the rows, not the string
-- ---------------------------------------------------------------------------
-- WF7-2 clears a volunteer's personal detail when the account becomes an
-- organisation, because organisation rows are readable by every signed-in
-- user. The skills were part of that, so the rows go the same way.
create or replace function public.admin_switch_account_type(
  p_user_id uuid,
  p_new_role text,
  p_dob date default null::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile        public.user_profiles;
  v_roles_closed   integer := 0;
  v_regs_withdrawn integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can switch an account''s type'
      using errcode = '42501';
  end if;

  if p_new_role is null or p_new_role not in ('volunteer', 'organization') then
    raise exception 'An account is either a volunteer or an organisation'
      using errcode = '22023';
  end if;

  select * into v_profile
    from public.user_profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;

  if v_profile.role = p_new_role then
    raise exception 'That account is already a %',
      case p_new_role when 'organization' then 'organisation' else 'volunteer' end
      using errcode = '22023';
  end if;

  if p_new_role = 'volunteer' then
    if p_dob is null then
      raise exception 'A volunteer account needs a date of birth'
        using errcode = '22023';
    end if;
    if p_dob > (current_date - interval '18 years')::date then
      raise exception 'Volunteers must be 18 or over'
        using errcode = '23514';
    end if;
  end if;

  perform set_config('app.account_switch', 'on', true);

  if p_new_role = 'organization' then
    update public.applications
       set withdrawn_at = now()
     where volunteer_id = p_user_id
       and withdrawn_at is null;
    get diagnostics v_regs_withdrawn = row_count;

    -- POLISH-4: `skills = null` was here. The rows are the skills now.
    -- Deleted BEFORE the role changes so the deferred check, which returns
    -- early for a non-volunteer, sees a consistent end state either way.
    delete from public.volunteer_skills where volunteer_id = p_user_id;

    -- WF9-2: a `delete from volunteer_availability` and two availability
    -- columns in the update below have gone with the table and the columns.
    update public.user_profiles
       set role           = 'organization',
           approved_at    = null,
           approved_by    = null,
           dob            = null,
           contact_number = null,
           bio            = null,
           public_profile = false
     where id = p_user_id;
  else
    update public.volunteer_opportunities
       set status        = 'closed',
           closed_reason = 'The organisation''s account became a volunteer account'
     where org_id = p_user_id
       and status = 'active'
       and deleted_at is null;
    get diagnostics v_roles_closed = row_count;

    update public.user_profiles
       set role           = 'volunteer',
           dob            = p_dob,
           approved_at    = null,
           approved_by    = null,
           public_profile = false
     where id = p_user_id;
  end if;

  perform set_config('app.account_switch', 'off', true);

  perform public.record_audit_event(
    p_action_type      := 'account_type_switched',
    p_actor_kind       := 'admin',
    p_actor_id         := auth.uid(),
    p_target_user_id   := p_user_id,
    p_target_table     := 'user_profiles',
    p_target_record_id := p_user_id,
    p_old_values       := jsonb_build_object('role', v_profile.role,
                                             'approved', v_profile.approved_at is not null),
    p_new_values       := jsonb_build_object('role', p_new_role,
                                             'approved', false),
    p_metadata         := jsonb_build_object('roles_closed', v_roles_closed,
                                             'registrations_withdrawn', v_regs_withdrawn));

  return jsonb_build_object('role', p_new_role,
                            'roles_closed', v_roles_closed,
                            'registrations_withdrawn', v_regs_withdrawn);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. admin_account_overview: the same key, from the join
-- ---------------------------------------------------------------------------
-- The key stays 'skills' and stays text, so AdminAccountPage needs no change
-- -- it reads a.skills and will carry on reading a comma-joined list. This
-- returns jsonb rather than a RETURNS TABLE, so CREATE OR REPLACE is free to
-- change what fills it (trap 1c does not apply).
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
    'skills',             (select string_agg(s.name, ', ' order by s.sort_order, s.name)
                             from public.volunteer_skills vs
                             join public.skills s on s.id = vs.skill_id
                            where vs.volunteer_id = p_user_id),
    'contact_number',     v_profile.contact_number,
    'dob',                v_profile.dob,
    'public_profile',     v_profile.public_profile,
    'approved_at',        v_profile.approved_at,
    'declined_at',        v_profile.declined_at,
    'is_admin',           exists (select 1 from public.admins a where a.user_id = p_user_id),
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

-- ---------------------------------------------------------------------------
-- 5. The views let go of the column
-- ---------------------------------------------------------------------------
-- A view holding a dependency on the column makes DROP COLUMN fail with
-- 2BP01, so this has to come first. Every one is a DROP + CREATE, so every
-- grant goes with it (trap 1b) and is re-granted BY ROLE NAME -- Supabase's
-- default privileges would otherwise hand anon and authenticated ALL.
drop view if exists public.public_volunteers;
create view public.public_volunteers
with (security_invoker = false) as
  select p.id,
         p.name,
         p.home_town,
         p.bio,
         coalesce((
           select array_agg(s.id order by s.sort_order, s.name)
             from public.volunteer_skills vs
             join public.skills s on s.id = vs.skill_id
            where vs.volunteer_id = p.id
         ), '{}'::uuid[]) as skill_ids,
         coalesce((
           select array_agg(s.name order by s.sort_order, s.name)
             from public.volunteer_skills vs
             join public.skills s on s.id = vs.skill_id
            where vs.volunteer_id = p.id
         ), '{}'::text[]) as skill_names
    from public.user_profiles p
   where p.role = 'volunteer'
     and p.public_profile = true
     and public.is_approved_org(auth.uid());

revoke all on public.public_volunteers from anon, authenticated;
grant select on public.public_volunteers to authenticated;

drop view if exists public.public_opportunities;
create view public.public_opportunities
with (security_invoker = false) as
  select o.id,
         o.org_id,
         u.name as org_name,
         o.title,
         o.description,
         o.location,
         o.town,
         o.category,
         o.requires_dbs,
         o.generally_needed,
         o.volunteers_needed,
         o.status,
         o.created_at,
         o.schedule_revision,
         coalesce((
           select array_agg(s.id order by s.sort_order, s.name)
             from public.opportunity_skills os
             join public.skills s on s.id = os.skill_id
            where os.opportunity_id = o.id
         ), '{}'::uuid[]) as skill_ids,
         coalesce((
           select array_agg(s.name order by s.sort_order, s.name)
             from public.opportunity_skills os
             join public.skills s on s.id = os.skill_id
            where os.opportunity_id = o.id
         ), '{}'::text[]) as skill_names
    from public.volunteer_opportunities o
    join public.public_organisations u on u.id = o.org_id
   where o.status = 'active'
     and o.deleted_at is null;

revoke all on public.public_opportunities from anon, authenticated;
grant select on public.public_opportunities to anon, authenticated;

drop view if exists public.opportunity_applicants;
create view public.opportunity_applicants
with (security_invoker = false) as
  select a.id as application_id,
         a.opportunity_id,
         a.created_at as applied_at,
         a.message,
         a.dismissed_at,
         o.title as opportunity_title,
         v.id as volunteer_id,
         v.name as volunteer_name,
         v.home_town,
         v.bio,
         coalesce((
           select array_agg(s.name order by s.sort_order, s.name)
             from public.volunteer_skills vs
             join public.skills s on s.id = vs.skill_id
            where vs.volunteer_id = v.id
         ), '{}'::text[]) as skill_names
    from public.applications a
    join public.volunteer_opportunities o on o.id = a.opportunity_id
    join public.user_profiles v on v.id = a.volunteer_id
   where o.org_id = auth.uid()
     and a.withdrawn_at is null;

revoke all on public.opportunity_applicants from anon, authenticated;
grant select on public.opportunity_applicants to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The columns
-- ---------------------------------------------------------------------------
-- volunteer_opportunities_skills_length goes with the column it constrained.
-- contentChecks.js lost its matching `skills: 300` in the same commit.
alter table public.volunteer_opportunities drop column if exists skills;
alter table public.user_profiles           drop column if exists skills;
