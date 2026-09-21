-- POLISH-4, part 1 of 2: skills become a managed list.
--
-- Until now `skills` was free text on two tables, typed twice over by every
-- organisation and every volunteer. Nothing could be matched on it, nothing
-- could be filtered by it, and "Working with children" and "working with
-- kids" were different strings.
--
-- Shape chosen with the user (PENDING-DECISIONS POLISH-4): join tables, not
-- an array column and not the text. Postgres cannot foreign-key an array
-- element, so an array would leave nothing to stop a deleted skill's id
-- lingering; the text column is what we are leaving.
--
-- HIDING IS SOFT, AND THAT IS THE POINT. `is_active = false` takes a skill
-- out of the pickers for new choices, and does NOT touch anybody who already
-- chose it. This is deliberately NOT the towns rule (ADM-6), where a town
-- cannot be deactivated while anything references it -- there, being filed
-- under a dead town breaks a foreign key; here, a volunteer who really does
-- speak Welsh does not stop speaking it because the charity stopped
-- advertising for it.

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- The picker groups by this. No CHECK on purpose: a CHECK naming the four
  -- groups is the same mistake ADM-6 undid on volunteer_opportunities.town,
  -- where the real list lived in a constraint and nobody could add to it.
  category    text not null default 'Other',
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness: "First aid" and "First Aid" are one skill.
create unique index if not exists skills_name_unique
  on public.skills (lower(btrim(name)));

create index if not exists skills_active_idx
  on public.skills (is_active, category, sort_order, name);

-- ---------------------------------------------------------------------------
-- Who has which
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE on the owner so ACC-6 account deletion and a role's own
-- cascade still work (the same reasoning as the no-hard-delete trigger being
-- scoped to browser roles).
--
-- ON DELETE RESTRICT on skill_id because a skill in use must not be
-- removable. There is no delete path in the UI at all -- the admin adds and
-- hides -- and this makes that true in the database rather than only in the
-- screen.
create table if not exists public.opportunity_skills (
  opportunity_id uuid not null
    references public.volunteer_opportunities(id) on delete cascade,
  skill_id uuid not null
    references public.skills(id) on delete restrict,
  primary key (opportunity_id, skill_id)
);

create table if not exists public.volunteer_skills (
  volunteer_id uuid not null
    references public.user_profiles(id) on delete cascade,
  skill_id uuid not null
    references public.skills(id) on delete restrict,
  primary key (volunteer_id, skill_id)
);

create index if not exists opportunity_skills_skill_idx
  on public.opportunity_skills (skill_id);
create index if not exists volunteer_skills_skill_idx
  on public.volunteer_skills (skill_id);

-- ---------------------------------------------------------------------------
-- The 20, signed off 2026-09-21
-- ---------------------------------------------------------------------------
-- Personality traits are deliberately absent -- the live data had "patience",
-- "enthusiasm", "empathy", "attention to detail". Everybody ticks those, so
-- they carry no information and would degrade matching later. The bio is
-- where they belong, and is also the escape hatch for a skill no list holds.
insert into public.skills (name, category, sort_order) values
  ('Working with children',            'With people',          10),
  ('Working with parents and families','With people',          20),
  ('Mentoring and listening',          'With people',          30),
  ('Reading and literacy support',     'With people',          40),
  ('Maths and homework help',          'With people',          50),
  ('Languages',                        'With people',          60),

  ('Sports and games',                 'Activities',          110),
  ('Arts and crafts',                  'Activities',          120),
  ('Music',                            'Activities',          130),
  ('Cooking and food',                 'Activities',          140),
  ('Gardening and outdoors',           'Activities',          150),

  ('Event support',                    'Events and practical',210),
  ('Driving',                          'Events and practical',220),
  ('First aid',                        'Events and practical',230),
  ('DIY and repairs',                  'Events and practical',240),

  ('Admin and organisation',           'Behind the scenes',   310),
  ('Fundraising',                      'Behind the scenes',   320),
  ('Bid and grant writing',            'Behind the scenes',   330),
  ('Social media and marketing',       'Behind the scenes',   340),
  ('Websites and design',              'Behind the scenes',   350)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Grants. Trap 1b: every new table is born with ALL granted to anon and
-- authenticated BY NAME through Supabase's default privileges, so
-- `revoke ... from public` would leave them holding INSERT, UPDATE, DELETE
-- and TRUNCATE. Name the roles.
-- ---------------------------------------------------------------------------
revoke all on public.skills             from anon, authenticated;
revoke all on public.opportunity_skills from anon, authenticated;
revoke all on public.volunteer_skills   from anon, authenticated;

-- The list itself is public: a logged-out visitor reads a role's skills on
-- the detail page, so anon needs SELECT. Writes go through the admin
-- functions below, never a table grant -- the shape workflow 4 settled on for
-- `admins` after a table-wide grant there turned out to allow self-removal.
grant select on public.skills to anon, authenticated;

grant select on public.opportunity_skills to anon, authenticated;
grant insert, delete on public.opportunity_skills to authenticated;

grant select, insert, delete on public.volunteer_skills to authenticated;

alter table public.skills             enable row level security;
alter table public.opportunity_skills enable row level security;
alter table public.volunteer_skills   enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- The list is readable by everyone, active or not: a role or a profile that
-- already carries a hidden skill still has to render its name.
drop policy if exists "skills read - public" on public.skills;
create policy "skills read - public"
  on public.skills for select using (true);

-- A role's skills are readable exactly when the role is, mirroring
-- public_read_active_blocks on opportunity_timeblocks.
drop policy if exists "opportunity_skills read - public" on public.opportunity_skills;
create policy "opportunity_skills read - public"
  on public.opportunity_skills for select
  using (exists (
    select 1 from public.volunteer_opportunities o
    where o.id = opportunity_skills.opportunity_id
      and o.status = 'active'
      and o.deleted_at is null
      and public.is_approved_org(o.org_id)
  ));

-- The owning organisation reads and writes its own, draft or not, so the edit
-- form can show what it chose before anyone else can see the role.
drop policy if exists "opportunity_skills - owner" on public.opportunity_skills;
create policy "opportunity_skills - owner"
  on public.opportunity_skills for all
  using (exists (
    select 1 from public.volunteer_opportunities o
    where o.id = opportunity_skills.opportunity_id and o.org_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.volunteer_opportunities o
    where o.id = opportunity_skills.opportunity_id and o.org_id = auth.uid()
  ));

drop policy if exists "opportunity_skills read - admin" on public.opportunity_skills;
create policy "opportunity_skills read - admin"
  on public.opportunity_skills for select
  using (public.is_admin(auth.uid()));

-- A volunteer's skills are their own to read and write. Nobody else reads
-- this table directly: an organisation sees them through public_volunteers
-- and opportunity_applicants, which run with owner rights and carry no
-- contact columns. A policy here for organisations would be a second,
-- divergent definition of who may see a volunteer -- the exact shape
-- CLAUDE.md warns about on user_profiles.
drop policy if exists "volunteer_skills - self" on public.volunteer_skills;
create policy "volunteer_skills - self"
  on public.volunteer_skills for all
  using (volunteer_id = auth.uid())
  with check (volunteer_id = auth.uid());

drop policy if exists "volunteer_skills read - admin" on public.volunteer_skills;
create policy "volunteer_skills read - admin"
  on public.volunteer_skills for select
  using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Admin management: add and hide. No delete, by design -- a skill somebody
-- chose must not be able to vanish from under them, and hiding already does
-- the job the admin actually wants.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_skill(
  p_name text,
  p_category text default 'Other'
)
returns public.skills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_row public.skills;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an administrator may add a skill'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'A skill needs a name' using errcode = '23514';
  end if;
  if length(v_name) > 60 then
    raise exception 'A skill name is at most 60 characters'
      using errcode = '23514';
  end if;

  -- A hidden skill with this name is un-hidden rather than duplicated: the
  -- unique index is on lower(name), so a second insert would fail with 23505
  -- and the admin would have no way to tell what went wrong.
  select * into v_row from public.skills
   where lower(btrim(name)) = lower(v_name);

  if found then
    if v_row.is_active then
      raise exception 'That skill is already on the list'
        using errcode = '23505';
    end if;
    update public.skills set is_active = true
     where id = v_row.id returning * into v_row;

    perform public.record_audit_event(
      p_action_type := 'skill_unhidden',
      p_actor_kind  := 'admin',
      p_actor_id    := auth.uid(),
      p_target_table:= 'skills',
      p_target_record_id := v_row.id,
      p_new_values  := jsonb_build_object('name', v_row.name)
    );
    return v_row;
  end if;

  insert into public.skills (name, category, sort_order)
  values (v_name, coalesce(nullif(btrim(p_category), ''), 'Other'), 500)
  returning * into v_row;

  perform public.record_audit_event(
    p_action_type := 'skill_added',
    p_actor_kind  := 'admin',
    p_actor_id    := auth.uid(),
    p_target_table:= 'skills',
    p_target_record_id := v_row.id,
    p_new_values  := jsonb_build_object('name', v_row.name,
                                        'category', v_row.category)
  );
  return v_row;
end;
$$;

create or replace function public.admin_set_skill_active(
  p_skill_id uuid,
  p_active boolean
)
returns public.skills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.skills;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an administrator may hide or restore a skill'
      using errcode = '42501';
  end if;

  update public.skills set is_active = coalesce(p_active, true)
   where id = p_skill_id
  returning * into v_row;

  if not found then
    raise exception 'No such skill' using errcode = 'P0002';
  end if;

  -- No guard on "in use". Hiding is deliberately allowed while people and
  -- roles hold the skill; that is what makes it hiding rather than removal.
  perform public.record_audit_event(
    p_action_type := case when v_row.is_active then 'skill_unhidden'
                          else 'skill_hidden' end,
    p_actor_kind  := 'admin',
    p_actor_id    := auth.uid(),
    p_target_table:= 'skills',
    p_target_record_id := v_row.id,
    p_new_values  := jsonb_build_object('name', v_row.name,
                                        'is_active', v_row.is_active)
  );
  return v_row;
end;
$$;

-- How many people and roles hold each skill, so the admin screen can say
-- what hiding one would leave behind. Admin only: the counts are harmless in
-- themselves, but there is no reason for a browser to ask.
create or replace function public.admin_skill_usage()
returns table (
  id uuid,
  name text,
  category text,
  is_active boolean,
  sort_order integer,
  volunteer_count integer,
  opportunity_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Administrators only' using errcode = '42501';
  end if;

  return query
  select s.id, s.name, s.category, s.is_active, s.sort_order,
         -- Cast in the BODY: CREATE OR REPLACE cannot change a RETURNS
         -- TABLE, and a DROP would hand EXECUTE back to anon (trap 1c).
         (select count(*) from public.volunteer_skills vs
           where vs.skill_id = s.id)::integer,
         (select count(*) from public.opportunity_skills os
           join public.volunteer_opportunities o on o.id = os.opportunity_id
           where os.skill_id = s.id and o.deleted_at is null)::integer
    from public.skills s
   order by s.sort_order, s.name;
end;
$$;

-- Trap 1: Postgres grants EXECUTE to PUBLIC by default and anon inherits it.
-- Revoke from PUBLIC, not just from anon.
revoke all on function public.admin_add_skill(text, text) from public, anon;
revoke all on function public.admin_set_skill_active(uuid, boolean) from public, anon;
revoke all on function public.admin_skill_usage() from public, anon;

grant execute on function public.admin_add_skill(text, text) to authenticated;
grant execute on function public.admin_set_skill_active(uuid, boolean) to authenticated;
grant execute on function public.admin_skill_usage() to authenticated;

comment on table public.skills is
  'The managed list of skills (POLISH-4). is_active=false hides a skill from '
  'the pickers without touching anybody who already chose it. Added and '
  'hidden only through admin_add_skill / admin_set_skill_active; there is no '
  'delete path, and skill_id is ON DELETE RESTRICT from both join tables.';
