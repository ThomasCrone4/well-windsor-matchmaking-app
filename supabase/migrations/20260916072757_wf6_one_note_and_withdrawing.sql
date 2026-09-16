-- Workflow 6.1 and 6.2 — INT-2 (one optional note) and INT-4 (withdrawing).
--
-- INT-2. Registering interest asked for a subject AND a message, both
-- required, which is a lot of ceremony for "I'd like to help". It becomes a
-- button plus an optional note.
--
-- The one live registration in this database has both fields filled in by a
-- real person (subject 7 characters, message 18, neither contained in the
-- other). Dropping the column would throw away a third of what they wrote,
-- so the subject is folded into the front of the note first. Checked before
-- writing this rather than assumed — a blind DROP here is the "invent or
-- destroy data" mistake ROLE-5 was careful about.
--
-- `opportunity_title` is deliberately LEFT ALONE. It looks like the same kind
-- of dead weight, but unlike `date_needed` it is genuinely written on every
-- insert, and two functions read it as a fallback. It is redundant now that
-- my_registrations joins the title, but removing it is not what INT-2 asks
-- for and would mean editing two more functions for no visible gain.
--
-- INT-4. Withdrawing hides the registration from the organisation, which is
-- never told. The row is KEPT and marked withdrawn, because the audit log has
-- to be able to say that a message already sent went to someone who had
-- registered at the time. Delete the row and a legitimate email starts
-- looking like an unprompted approach to a stranger.
--
-- Four things that have to be true for "kept but invisible" to mean anything:
--
--   * The organisation cannot SEE it — enforced on the base table's policy,
--     not only in the view, so a direct API read is honest too. The
--     dashboard's "N people interested" count reads the table directly.
--   * The organisation cannot UN-withdraw it. Its dismiss policy had no
--     withdrawn filter, and RLS evaluates UPDATE's USING against the
--     EXISTING row — so without this an organisation could clear the column
--     on a row it was not allowed to read and make the registration
--     reappear.
--   * The volunteer cannot hard-delete it. DELETE is revoked and refused by
--     trigger, the same shape as ROLE-1, and scoped to the browser roles so
--     ACC-6's account-deletion cascade still works.
--   * Re-registering still works. The old constraint was a plain
--     UNIQUE (volunteer_id, opportunity_id), so a kept withdrawn row would
--     have blocked the volunteer for ever — while the withdraw dialog
--     promises "you can register again later if you change your mind". It
--     becomes a partial unique index over live rows only.

-- ---------------------------------------------------------------------------
-- INT-2
-- ---------------------------------------------------------------------------

-- Both views name `subject`, so Postgres refuses to drop the column while
-- they exist (2BP01). They are rebuilt at the bottom -- dropped here rather
-- than with CASCADE, so that what comes back is written down in this file
-- instead of silently disappearing.
drop view if exists public.opportunity_applicants;
drop view if exists public.my_registrations;

update public.applications
   set message = case
         when subject is null or btrim(subject) = '' then message
         when message is null or btrim(message) = '' then subject
         else subject || E'\n\n' || message
       end
 where subject is not null and btrim(subject) <> '';

alter table public.applications drop column subject;

-- ---------------------------------------------------------------------------
-- INT-4: the column, and re-registering
-- ---------------------------------------------------------------------------

alter table public.applications
  add column if not exists withdrawn_at timestamptz;

comment on column public.applications.withdrawn_at is
  'INT-4. Non-null means the volunteer withdrew: invisible to the '
  'organisation, which is never told, while the row survives so the audit '
  'log can still explain a message already sent. Only withdraw_registration() '
  'sets it, and nothing clears it — registering again makes a NEW row.';

create index if not exists applications_live_idx
  on public.applications (opportunity_id) where withdrawn_at is null;

alter table public.applications
  drop constraint if exists applications_one_per_volunteer_opportunity;

-- Partial, so withdrawing does not lock the volunteer out of the role for
-- ever. A withdrawn row plus a later live row is the correct history.
create unique index if not exists applications_one_live_per_volunteer_opportunity
  on public.applications (volunteer_id, opportunity_id)
  where withdrawn_at is null;

-- ---------------------------------------------------------------------------
-- INT-4: who can see and do what
-- ---------------------------------------------------------------------------

-- The organisation's own reads, not just the view. `apps read - admin` is
-- untouched, so an admin still sees withdrawn rows — INT-4's "invisible to
-- everyone but an admin".
drop policy if exists "applications: read own" on public.applications;
create policy "applications: read own"
  on public.applications
  for select to authenticated
  using (volunteer_id = auth.uid()
         or (org_id = auth.uid() and withdrawn_at is null));

-- Dismissing is for live registrations only. Without `withdrawn_at is null`
-- in USING, an organisation could update a row it cannot read and clear the
-- withdrawal.
drop policy if exists "applications: org dismisses" on public.applications;
create policy "applications: org dismisses"
  on public.applications
  for update to authenticated
  using (org_id = auth.uid() and withdrawn_at is null)
  with check (org_id = auth.uid() and withdrawn_at is null);

-- Withdrawing goes through one door rather than a column grant. A grant on
-- `withdrawn_at` would also hand it to the organisation via its dismiss
-- policy, letting an org hide a registration from itself and making it look
-- as though the volunteer had withdrawn.
create or replace function public.withdraw_registration(p_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
  v_already timestamptz;
begin
  select volunteer_id, withdrawn_at
    into v_owner, v_already
    from public.applications
   where id = p_application_id;

  if v_owner is null then
    raise exception 'That registration does not exist'
      using errcode = 'no_data_found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'You can only withdraw your own registration'
      using errcode = '42501';
  end if;

  if v_already is not null then
    return false;               -- already withdrawn; nothing to do
  end if;

  update public.applications
     set withdrawn_at = now()
   where id = p_application_id;

  return true;
end;
$$;

-- Trap 1c: born with EXECUTE to PUBLIC and to anon/authenticated by name.
revoke all on function public.withdraw_registration(uuid) from public;
revoke all on function public.withdraw_registration(uuid) from anon, authenticated;
grant execute on function public.withdraw_registration(uuid) to authenticated;

-- The DELETE policy it replaces.
drop policy if exists "applications: volunteer withdraws" on public.applications;
revoke delete on public.applications from anon, authenticated;

create or replace function public.applications_no_hard_delete()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Scoped to the browser roles: deleting an account cascades into this
  -- table as the service role, and ACC-6 must keep working.
  if current_user in ('authenticated', 'anon') then
    raise exception
      'Registrations are withdrawn, not deleted: use withdraw_registration().'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists no_hard_delete_application on public.applications;
create trigger no_hard_delete_application
  before delete on public.applications
  for each row execute function public.applications_no_hard_delete();

revoke all on function public.applications_no_hard_delete() from public;
revoke all on function public.applications_no_hard_delete() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The views. Both name `subject`, so both must be rebuilt, and a view cannot
-- lose a column via CREATE OR REPLACE.
-- ---------------------------------------------------------------------------

drop view if exists public.opportunity_applicants;
create view public.opportunity_applicants
with (security_invoker = false) as
select
  a.id            as application_id,
  a.opportunity_id,
  a.created_at    as applied_at,
  a.message,
  a.dismissed_at,
  o.title         as opportunity_title,
  v.id            as volunteer_id,
  v.name          as volunteer_name,
  v.home_town,
  v.skills,
  v.bio,
  v.available_anytime,
  v.availability_matrix
from public.applications a
join public.volunteer_opportunities o on o.id = a.opportunity_id
join public.user_profiles v on v.id = a.volunteer_id
where o.org_id = auth.uid()
  and a.withdrawn_at is null;

comment on view public.opportunity_applicants is
  'People who registered interest in YOUR roles. Owner rights, no contact '
  'columns. Withdrawn registrations are excluded (INT-4): they disappear as '
  'though never made, and the organisation is never told.';

drop view if exists public.my_registrations;
create view public.my_registrations
with (security_invoker = false) as
select
  a.id            as application_id,
  a.created_at    as registered_at,
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
where a.volunteer_id = auth.uid()
  and a.withdrawn_at is null;

comment on view public.my_registrations is
  'ROLE-1. A volunteer''s own registrations with enough of the role attached '
  'to name it after it closes or is removed. Withdrawn rows are excluded so '
  'withdrawing still clears it from their page (INT-4).';

-- Trap 1b. Both views were just recreated, so each is born with ALL granted
-- to anon and authenticated BY NAME. `revoke from public` would leave that
-- untouched. Name the roles, grant back only SELECT, and re-probe as anon.
revoke all on public.opportunity_applicants from anon, authenticated;
grant select on public.opportunity_applicants to authenticated;
revoke all on public.my_registrations from anon, authenticated;
grant select on public.my_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- The digest must not name someone who has withdrawn
-- ---------------------------------------------------------------------------
-- Otherwise a volunteer who registers and withdraws before 08:00 is still
-- emailed to the organisation the next morning, which is precisely the chase
-- INT-4 exists to prevent.

create or replace function public.build_daily_digests()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  o        record;
  v_since  timestamptz;
  v_items  jsonb;
  v_count  integer;
  v_email  text;
  v_queued integer := 0;
begin
  for o in
    select p.id, p.name
      from public.user_profiles p
     where p.role = 'organization' and p.approved_at is not null
  loop
    select coalesce(s.last_digest_at, now() - interval '1 day')
      into v_since
      from (select 1) x
      left join public.org_digest_state s on s.org_id = o.id;

    select jsonb_agg(jsonb_build_object(
             'volunteer_name', coalesce(vp.name, 'A volunteer'),
             'role_title', coalesce(vo.title, a.opportunity_title, 'one of your roles'),
             'note', left(coalesce(a.message, ''), 200))
           order by a.created_at),
           count(*)
      into v_items, v_count
      from public.applications a
      left join public.user_profiles vp on vp.id = a.volunteer_id
      left join public.volunteer_opportunities vo on vo.id = a.opportunity_id
     where a.org_id = o.id
       and a.created_at > v_since
       and a.withdrawn_at is null;

    if coalesce(v_count, 0) > 0 then
      select u.email into v_email from auth.users u where u.id = o.id;

      if public.enqueue_email(
           p_template        := 'digest',
           p_to_email        := v_email,
           p_to_name         := o.name,
           p_subject         := case when v_count = 1
                                  then '1 person registered interest yesterday'
                                  else v_count || ' people registered interest yesterday' end,
           p_payload         := jsonb_build_object('org_name', o.name,
                                                   'count', v_count,
                                                   'items', v_items),
           p_related_user_id := o.id) is not null
      then
        v_queued := v_queued + 1;
      end if;
    end if;

    insert into public.org_digest_state (org_id, last_digest_at)
    values (o.id, now())
    on conflict (org_id) do update set last_digest_at = excluded.last_digest_at;
  end loop;

  return v_queued;
end;
$$;
