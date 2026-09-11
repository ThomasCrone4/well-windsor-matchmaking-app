-- Close the exposures found by the 2026-09-11 audit. Each one was provoked
-- from the outside with throwaway accounts before this was written, and is
-- re-probed after it is applied.
--
-- A CORRECTION FIRST. 20260908202130 says volunteer_opportunities "does not
-- have table-wide grants". That is wrong, and so is the same belief about
-- user_profiles: both carry TABLE-level privileges (relacl shows
-- anon=r on volunteer_opportunities, authenticated=arwd on user_profiles).
-- information_schema.column_privileges lists every column individually when
-- a grant is table-wide, which is what was misread as a column-level list.
-- Check pg_class.relacl, not column_privileges.
--
-- THE CONSEQUENCE: a column-level REVOKE does nothing against a table-level
-- grant. The only way to take a column away is to revoke the table
-- privilege and grant back a named list. That is what this does.

-- ---------------------------------------------------------------------------
-- 1. user_profiles: the columns a signed-in user may write to their own row
-- ---------------------------------------------------------------------------
-- Found: a user could rewrite their own `email`, and send-outreach sent to
-- that column -- so the charity's sender could be pointed at any inbox. Also
-- `role`, `id`, `created_at` and the dead ML/Log Hours columns were
-- writable. Nothing in the client inserts a profile (the signup trigger
-- does), and the two profile forms only ever send the columns granted back
-- below.
revoke insert, update on public.user_profiles from authenticated;
grant update (name, contact_number, home_town, dob, bio, skills,
              available_anytime, availability_matrix, public_profile)
  on public.user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A role is fixed at signup
-- ---------------------------------------------------------------------------
-- Found: prevent_role_change only stopped volunteer -> other, so an
-- organisation could turn itself into a volunteer. With UPDATE(role) no
-- longer granted the client cannot even ask; this is the backstop for the
-- service-role paths.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.role is distinct from old.role then
    raise exception 'An account''s role cannot be changed after signup'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Volunteers are adults, and the age check cannot be switched off
-- ---------------------------------------------------------------------------
-- Decided 2026-09-11: minimum age 18, date of birth required. The old CHECK
-- allowed 13 and passed whenever dob IS NULL -- and a volunteer could clear
-- their own dob after signup, which switched the check off entirely.
-- Verified before writing: no real volunteer is under 18 or has no dob, so
-- this validates against every existing row.
alter table public.user_profiles drop constraint if exists user_profiles_min_age;
alter table public.user_profiles add constraint user_profiles_min_age
  check (
    role <> 'volunteer'
    or (dob is not null and dob <= (current_date - interval '18 years'))
  );

-- ---------------------------------------------------------------------------
-- 4. Unread-notification count is your own, whatever id you pass
-- ---------------------------------------------------------------------------
-- Found: SECURITY DEFINER, counted notifications for any p_user_id. The
-- parameter is kept so the signature -- and with it the ACL -- survives
-- CREATE OR REPLACE; it is now ignored.
create or replace function public.get_unread_notification_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$function$;

-- ---------------------------------------------------------------------------
-- 5. A logged-out visitor cannot harvest organisations' contact emails
-- ---------------------------------------------------------------------------
-- Found: anon held table-wide SELECT, so every active role's `contact`
-- address was one GET away -- 15 of them, a personal Gmail among them.
-- Nothing public displays it. The embedding columns go too; they are dead
-- ML residue. The client's anon-reachable selects were changed in the same
-- commit to stop asking for `contact`, or the logged-out browse would 42501.
revoke select on public.volunteer_opportunities from anon;
grant select (id, org_id, title, description, location, town, skills,
              requires_dbs, generally_needed, when_needed, date_needed,
              volunteers_needed, status, closed_reason, category, created_at)
  on public.volunteer_opportunities to anon;
