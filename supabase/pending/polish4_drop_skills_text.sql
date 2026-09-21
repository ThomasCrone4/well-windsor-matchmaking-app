-- POLISH-4, part 2: retire the free-text `skills` columns.
--
-- ============================ DO NOT APPLY YET ============================
-- Apply only AFTER the skills client is merged and live, and after checking
-- the deployed bundle no longer reads `skills` as text. See
-- supabase/pending/README.md for the procedure.
--
-- Why it cannot go first: `user_profiles_public_needs_detail` is a CHECK that
-- requires a NON-EMPTY skills STRING before a volunteer may be public. The
-- deployed site still writes that string. Drop the column while the old
-- client is live and every public volunteer profile becomes unsaveable; empty
-- it and they all become invalid. A CHECK cannot query another table, so it
-- cannot be taught about volunteer_skills -- which is why the rule has to
-- become a trigger, and why this is one migration rather than four.
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. The public-profile rule, moved from a CHECK to a trigger
-- ---------------------------------------------------------------------------
-- Same rule as before: to be visible to organisations you need a bio and at
-- least one skill. What changes is where "at least one skill" is read from.
--
-- It fires on user_profiles AND on volunteer_skills, because the rule can now
-- be broken from either side: by ticking public_profile with no skills, or by
-- removing the last skill from an already-public profile. Guarding only the
-- first would leave a public profile with no skills, which is exactly what
-- the CHECK existed to prevent.
alter table public.user_profiles
  drop constraint if exists user_profiles_public_needs_detail;

create or replace function public.enforce_public_profile_detail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
  v_public boolean;
  v_bio text;
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

  -- Deleting the profile itself: nothing left to validate.
  if not found then
    return coalesce(new, old);
  end if;

  if v_role <> 'volunteer' or v_public is not true then
    return coalesce(new, old);
  end if;

  if coalesce(btrim(v_bio), '') = '' then
    raise exception 'A public profile needs a bio'
      using errcode = '23514';
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

revoke all on function public.enforce_public_profile_detail() from public, anon, authenticated;

drop trigger if exists trg_public_profile_detail on public.user_profiles;
create constraint trigger trg_public_profile_detail
  after insert or update of public_profile, bio, role on public.user_profiles
  deferrable initially deferred
  for each row execute function public.enforce_public_profile_detail();

-- DEFERRED, and this is the point: sign-up inserts the profile row (via
-- handle_new_user) before any volunteer_skills row can exist, and the profile
-- page writes the profile and the skills as two statements. An immediate
-- trigger would fire between them and refuse a perfectly valid save. Deferred
-- to commit, both halves are in place before the rule is checked.
drop trigger if exists trg_public_profile_skills on public.volunteer_skills;
create constraint trigger trg_public_profile_skills
  after insert or delete on public.volunteer_skills
  deferrable initially deferred
  for each row execute function public.enforce_public_profile_detail();

-- ---------------------------------------------------------------------------
-- 2. The functions that still name the column
-- ---------------------------------------------------------------------------
-- handle_new_user is the dangerous one: a SECURITY DEFINER trigger on
-- auth.users, so if it names a dropped column EVERY sign-up fails, an
-- organisation's included -- not just a volunteer's. probe_skills signs up to
-- prove it does not.
--
-- It also gains the job of writing the join rows from sign-up metadata, so
-- the chosen skills survive if email confirmation is ever switched on (the
-- client can only write them when signUp returns a session, which it does
-- only while confirmation is off).
--
-- NOTE: fill in the CURRENT body before applying -- read it with
--   select pg_get_functiondef('public.handle_new_user'::regproc);
-- and edit, rather than pasting a guess from here. The body below shows only
-- the two changes this migration needs.
--
--   * remove  `skills`            from the INSERT column list
--   * remove  `new.raw_user_meta_data->>'skills'` from the VALUES
--   * add, after the profile insert:
--
--       insert into public.volunteer_skills (volunteer_id, skill_id)
--       select new.id, s.id
--         from public.skills s
--        where s.id::text in (
--                select jsonb_array_elements_text(
--                         new.raw_user_meta_data->'skill_ids')
--              )
--          and s.is_active
--       on conflict do nothing;
--
--     `and s.is_active` matters: metadata is client-supplied, so without it a
--     hidden skill could be chosen by anyone willing to hand-craft a sign-up.

-- admin_switch_account_type clears a volunteer's personal detail when the
-- account becomes an organisation (WF7-2). The skills text was part of that,
-- so the rows have to go the same way -- organisation rows are readable by
-- every signed-in user.
--
--   * remove `skills = null,` from the volunteer -> organisation UPDATE
--   * add:   delete from public.volunteer_skills where volunteer_id = p_user;
--
-- admin_account_overview returns `skills` for the admin account page.
--   * replace with a string_agg over the join, so the admin still sees them:
--
--       (select string_agg(s.name, ', ' order by s.sort_order, s.name)
--          from public.volunteer_skills vs
--          join public.skills s on s.id = vs.skill_id
--         where vs.volunteer_id = p.id) as skills
--
--   It is a RETURNS TABLE, so CREATE OR REPLACE cannot change the column's
--   type -- text in, text out, so this one is a straight replace (trap 1c:
--   a DROP would hand EXECUTE back to anon).

-- ---------------------------------------------------------------------------
-- 3. The views lose the text column
-- ---------------------------------------------------------------------------
-- Recreate all three WITHOUT `skills`, keeping skill_ids / skill_names.
-- Copy the definitions from 20260921113256_skills_on_views.sql and delete the
-- `o.skills,` / `p.skills,` / `v.skills,` line from each.
--
-- Every one is a DROP + CREATE, so every grant goes with it (trap 1b) and
-- must be re-granted BY ROLE NAME:
--
--   revoke all on public.public_volunteers from anon, authenticated;
--   grant select on public.public_volunteers to authenticated;
--   revoke all on public.public_opportunities from anon, authenticated;
--   grant select on public.public_opportunities to anon, authenticated;
--   revoke all on public.opportunity_applicants from anon, authenticated;
--   grant select on public.opportunity_applicants to authenticated;
--
-- Read pg_class.relacl afterwards and compare. A view with a join refuses
-- writes with 55000 before it looks at privileges, so a failed write is NOT
-- evidence the revoke landed (WF9-1).

-- ---------------------------------------------------------------------------
-- 4. Finally, the columns
-- ---------------------------------------------------------------------------
alter table public.volunteer_opportunities drop column if exists skills;
alter table public.user_profiles           drop column if exists skills;

-- volunteer_opportunities_skills_length goes with the column it constrains.
-- contentChecks.js still carries a `skills: 300` limit that now constrains
-- nothing -- remove it there in the same commit, or it becomes the kind of
-- comment that says one thing while the SQL says another.
