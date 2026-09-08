-- Phase 1.2 — the flow rework, database half.
--
-- An application stops being a state machine and becomes a read-only
-- expression of interest. The volunteer applies; the organisation reads
-- the list and decides who to email through the send-outreach function.
-- Nothing after the introduction is modelled here at all.
--
-- Four consequences, all handled below:
--
--  1. status / rejection_message / direction go, along with the dead
--     review and hours columns. `direction` in particular: an
--     org -> volunteer approach is no longer an application, it is a
--     row in org_outreach written only by the Edge Function.
--
--  2. has_application_with() reads applications.status, so it and the
--     "profiles: counterparty read" policy that calls it must go with
--     it. No loss: that policy existed to hand a volunteer's dob,
--     email and contact_number to an organisation once an application
--     was accepted. There is no acceptance now, and the organisation
--     never needs the address — the server sends the email and sets
--     Reply-To to the org.
--
--  3. But the organisation still needs to know *who applied*. RLS
--     filters rows, not columns, so a replacement row policy on
--     user_profiles would re-expose exactly the contact fields we just
--     closed. Two owner-rights views instead, listing only the
--     non-contact columns, gated on auth.uid() — the same shape as
--     public_volunteers.
--
--  4. org_id becomes derived rather than supplied, and both write
--     grants become column-level. A client that cannot name a column
--     cannot forge it.

-- ---------------------------------------------------------------- 1 --
-- Policies that encode the old model.

drop policy if exists "Org can update own application status and feedback" on public.applications;
drop policy if exists "Volunteer can respond to received enquiry"          on public.applications;
drop policy if exists "Orgs can insert to_vol, vols can insert to_org applications" on public.applications;
drop policy if exists "Vols can delete applications"                       on public.applications;
drop policy if exists "Volunteers and Orgs can read their applications"    on public.applications;

-- Depends on applications.status, dropped below.
drop policy if exists "profiles: counterparty read" on public.user_profiles;
drop function if exists public.has_application_with(uuid);

-- ---------------------------------------------------------------- 2 --
-- Columns.

alter table public.applications
  drop column if exists status,
  drop column if exists rejection_message,
  drop column if exists direction,
  drop column if exists attachments,
  drop column if exists org_review,
  drop column if exists volunteer_review,
  drop column if exists reviewed_at,
  drop column if exists logged_hours;

-- An organisation can set an applicant aside. Deliberately invisible to
-- the volunteer: silence means no, and being told "declined" by an
-- organisation that never spoke to you is worse than not being told.
alter table public.applications
  add column if not exists dismissed_at timestamptz;

-- Every application is now volunteer -> opportunity, so this is
-- structural rather than incidental.
alter table public.applications
  alter column opportunity_id set not null;

-- The client checked for a duplicate with a SELECT first, which a
-- direct API call could simply skip.
alter table public.applications
  drop constraint if exists applications_one_per_volunteer_opportunity;
alter table public.applications
  add constraint applications_one_per_volunteer_opportunity
  unique (volunteer_id, opportunity_id);

-- ---------------------------------------------------------------- 3 --
-- org_id is derived from the opportunity, never supplied by the client,
-- and only an active opportunity accepts applications. Both were
-- previously the client's word for it.

create or replace function public.set_application_org_id()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  select o.org_id into new.org_id
  from public.volunteer_opportunities o
  where o.id = new.opportunity_id
    and o.status = 'active';

  if new.org_id is null then
    raise exception 'That opportunity is not open for applications'
      using errcode = 'check_violation';
  end if;

  -- Dismissal is the organisation's to set, not the applicant's.
  new.dismissed_at := null;

  return new;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default; revoking from anon
-- alone would do nothing.
revoke execute on function public.set_application_org_id() from public;

drop trigger if exists applications_set_org_id on public.applications;
create trigger applications_set_org_id
  before insert on public.applications
  for each row execute function public.set_application_org_id();

-- ---------------------------------------------------------------- 4 --
-- Grants. Revoking a table-level privilege first is required: revoking
-- a column privilege that was granted at table level has no effect.

revoke select, insert, update, delete on public.applications from anon;
revoke insert, update, delete on public.applications from authenticated;

-- The volunteer's own words plus the opportunity. Not org_id (the
-- trigger sets it), not dismissed_at (the organisation sets it).
grant insert (opportunity_id, volunteer_id, subject, message, opportunity_title)
  on public.applications to authenticated;

-- The only mutable field on an application.
grant update (dismissed_at) on public.applications to authenticated;

grant delete on public.applications to authenticated;

-- org_outreach is an append-only log written by the send-outreach
-- function under the service role. Nothing else should be able to
-- write to it, and TRUNCATE in particular is not subject to RLS.
revoke insert, update, delete, truncate, references, trigger
  on public.org_outreach from authenticated;
revoke all on public.org_outreach from anon;
grant select on public.org_outreach to authenticated;

-- ---------------------------------------------------------------- 5 --
-- Policies for the new model. org_id is now guaranteed to be the
-- opportunity's owner, so none of these need a cross-table subquery.

create policy "applications: read own"
  on public.applications for select to authenticated
  using (volunteer_id = auth.uid() or org_id = auth.uid());

create policy "applications: volunteer applies"
  on public.applications for insert to authenticated
  with check (volunteer_id = auth.uid());

create policy "applications: org dismisses"
  on public.applications for update to authenticated
  using (org_id = auth.uid())
  with check (org_id = auth.uid());

-- Withdrawing is the volunteer's call. An organisation dismisses
-- instead — it must not be able to delete the record and let the
-- volunteer silently re-apply into the same list.
create policy "applications: volunteer withdraws"
  on public.applications for delete to authenticated
  using (volunteer_id = auth.uid());

-- ---------------------------------------------------------------- 6 --
-- The two views that replace counterparty read.
--
-- security_invoker = false: these run with the owner's rights and so
-- see through RLS on user_profiles, exactly as public_volunteers does.
-- What keeps them safe is the column list (no email, no dob, no
-- contact_number) and the auth.uid() predicate, which reads the
-- caller's JWT claim rather than the view owner's identity.

drop view if exists public.opportunity_applicants;
create view public.opportunity_applicants
with (security_invoker = false) as
select
  a.id             as application_id,
  a.opportunity_id,
  a.created_at     as applied_at,
  a.subject,
  a.message,
  a.dismissed_at,
  o.title          as opportunity_title,
  v.id             as volunteer_id,
  v.name           as volunteer_name,
  v.home_town,
  v.skills,
  v.bio,
  v.available_anytime,
  v.availability_matrix
from public.applications a
join public.volunteer_opportunities o on o.id = a.opportunity_id
join public.user_profiles v           on v.id = a.volunteer_id
where o.org_id = auth.uid();

comment on view public.opportunity_applicants is
  'Applicants to the calling organisation''s own opportunities. Profile '
  'columns only — a volunteer who applies is asking to be judged on '
  'their skills, availability and message, not handing over their '
  'contact details. The organisation reaches them through send-outreach.';

drop view if exists public.org_outreach_sent;
create view public.org_outreach_sent
with (security_invoker = false) as
select
  x.id,
  x.created_at,
  x.subject,
  x.message,
  x.status,
  x.opportunity_id,
  x.volunteer_id,
  v.name     as volunteer_name,
  v.home_town as volunteer_home_town,
  o.title    as opportunity_title
from public.org_outreach x
join public.user_profiles v            on v.id = x.volunteer_id
left join public.volunteer_opportunities o on o.id = x.opportunity_id
where x.org_id = auth.uid();

comment on view public.org_outreach_sent is
  'The calling organisation''s own outreach log, with the volunteer''s '
  'name resolved. Same reasoning as opportunity_applicants: no contact '
  'columns.';

revoke all on public.opportunity_applicants from public;
revoke all on public.org_outreach_sent      from public;
grant select on public.opportunity_applicants to authenticated;
grant select on public.org_outreach_sent      to authenticated;
