-- Workflow 5.3, second follow-up — the volunteer's own registrations.
--
-- ROLE-1 says the volunteer's page shows "this role was removed by the
-- organisation". It could not: a volunteer reads roles through
-- `opportunities: public reads active only`, so the moment a role stops
-- being active-and-visible the embedded join returns NULL and the page falls
-- back to the string "Opportunity" with no title, no location and no way to
-- tell removed from closed.
--
-- That is not new and it is not caused by the soft delete — the same thing
-- has happened to every CLOSED role since the policy was written. It was
-- invisible because nothing had ever closed in front of a registrant. Proved
-- by reading as the throwaway volunteer with SET LOCAL ROLE: all three of
-- their registrations came back with a NULL title.
--
-- `applications.opportunity_title` exists and looks like the answer. It is
-- NULL on every row and nothing writes it — the same shape as `date_needed`,
-- and not a thing to start trusting now.
--
-- So: a view, which is this codebase's established answer to "someone needs
-- to see a narrow slice of a row they cannot read" (public_volunteers,
-- opportunity_applicants, org_outreach_sent, public_organisations). Owner
-- rights, scoped to auth.uid(), and no contact column of any kind — this
-- hands a volunteer facts about roles THEY registered for and nothing else.

create or replace view public.my_registrations
with (security_invoker = false) as
select
  a.id            as application_id,
  a.created_at    as registered_at,
  a.subject,
  a.message,
  a.opportunity_id,
  o.title         as opportunity_title,
  o.location      as opportunity_location,
  o.town          as opportunity_town,
  o.status        as opportunity_status,
  (o.deleted_at is not null) as opportunity_removed,
  org.name        as org_name
from public.applications a
left join public.volunteer_opportunities o on o.id = a.opportunity_id
left join public.user_profiles org on org.id = a.org_id
where a.volunteer_id = auth.uid();

comment on view public.my_registrations is
  'ROLE-1. A volunteer''s own registrations with enough of the role attached '
  'to name it after it closes or is removed, which the base-table policy '
  'deliberately hides. Owner rights, scoped to auth.uid(), no contact '
  'columns. Supabase''s linter flags this as a Security Definer View: that is '
  'the design, as with the other four.';

-- Trap 1b. Supabase's default privileges grant ALL on every new view to anon
-- and authenticated BY NAME, so `revoke ... from public` would leave anon
-- holding SELECT, INSERT, UPDATE, DELETE and TRUNCATE on it. Name the roles,
-- then grant back only what is needed. Probed as anon afterwards expecting
-- 42501, because reading this migration back would not show the difference.
revoke all on public.my_registrations from anon, authenticated;
grant select on public.my_registrations to authenticated;
