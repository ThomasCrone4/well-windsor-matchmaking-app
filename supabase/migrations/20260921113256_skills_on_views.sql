-- POLISH-4, part 1c: the three views carry the chosen skills.
--
-- STILL ADDITIVE. Each view keeps its existing `skills` TEXT column exactly
-- as it is -- the currently deployed site reads it -- and gains two arrays
-- built from the join tables. The new client reads the arrays; the old one
-- carries on reading the text. Dropping the text column is part 2, after the
-- client is merged and live (the 9.2 rule: one database, two deploys).
--
-- `skill_ids` as well as `skill_names` because Find Volunteers filters by
-- identity, not by label: filtering on a name would go wrong the moment an
-- admin renames a skill.
--
-- The aggregates are ORDERED. An unordered array is the same bug as the
-- unordered view that 9.4 found under pagination -- Postgres promises
-- nothing, so the chips would reshuffle between renders for no reason.
--
-- Recreated, not replaced: CREATE OR REPLACE VIEW cannot add a column in the
-- middle, and these need the new ones alongside. A DROP means the grants go
-- with it (trap 1b) -- every one is re-granted below, by role name, because
-- Supabase's default privileges would otherwise hand anon and authenticated
-- ALL on the new view.

-- ---------------------------------------------------------------------------
drop view if exists public.public_volunteers;
create view public.public_volunteers
with (security_invoker = false) as
  select p.id,
         p.name,
         p.home_town,
         p.skills,
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

-- ---------------------------------------------------------------------------
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
         o.skills,
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

-- ---------------------------------------------------------------------------
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
         v.skills,
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
