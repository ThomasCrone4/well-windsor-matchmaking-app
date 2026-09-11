-- An organisation must be approved by a Well Windsor admin before it can
-- publish a role, see discoverable volunteers, or email anyone.
--
-- Decided 2026-09-11. Until now anyone could sign up as an organisation
-- instantly, call it "Windsor Primary School", post roles, and write to any
-- volunteer who had made themselves discoverable -- for a children's
-- mental-health charity, the largest safeguarding gap the audit found.
--
-- Everything here is enforced in the database (and in send-outreach), not
-- in the UI. The UI only explains it.
--
--   pending org:  may sign up, edit its profile, save DRAFT roles.
--   approved org: may also publish, browse volunteers, send outreach.
--
-- The six organisations that exist today are marked approved, so nothing
-- that is live changes. New signups start pending.

alter table public.user_profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

comment on column public.user_profiles.approved_at is
  'Organisations only. NULL = awaiting admin approval: may save drafts, may '
  'not publish, browse volunteers or send outreach. Set only through '
  'set_organisation_approval(); not writable by clients.';

-- Grandfather the existing organisations.
update public.user_profiles
   set approved_at = now()
 where role = 'organization' and approved_at is null;

-- NOT WRITABLE BY CLIENTS. 20260911120630_close_exposure_findings replaced the
-- table-wide UPDATE grant on user_profiles with a named column list, and
-- these two columns are deliberately not in it. Had that grant still been
-- table-wide, every organisation could have approved itself.

-- ---------------------------------------------------------------------------
-- The check, callable from RLS
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so that policies on OTHER tables can ask it without
-- tripping RLS on user_profiles (trap 3), and so anon -- which cannot read
-- approved_at -- can still have the public browse filtered by it. It leaks
-- only "is this id an approved organisation", which is public anyway.
create or replace function public.is_approved_org(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.user_profiles p
    where p.id = uid and p.role = 'organization' and p.approved_at is not null
  );
$function$;

-- Trap 1 (PUBLIC) and trap 1b (named roles) both, then grant back. Policies
-- run with the caller's privileges, so anon and authenticated need EXECUTE.
revoke all on function public.is_approved_org(uuid) from public;
revoke all on function public.is_approved_org(uuid) from anon, authenticated;
grant execute on function public.is_approved_org(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publishing needs approval; drafts do not
-- ---------------------------------------------------------------------------
drop policy if exists org_can_crud_their_posts on public.volunteer_opportunities;
create policy org_can_crud_their_posts on public.volunteer_opportunities
  for all to authenticated
  using (
    exists (select 1 from public.user_profiles
            where id = auth.uid() and role = 'organization'
              and id = volunteer_opportunities.org_id)
  )
  with check (
    exists (select 1 from public.user_profiles
            where id = auth.uid() and role = 'organization'
              and id = volunteer_opportunities.org_id)
    and (status <> 'active' or public.is_approved_org(auth.uid()))
  );

-- The public sees a role only while its organisation is approved, so
-- revoking an approval takes that organisation's roles off the browse at
-- once rather than leaving them live until someone closes them.
drop policy if exists "opportunities: public reads active only" on public.volunteer_opportunities;
create policy "opportunities: public reads active only" on public.volunteer_opportunities
  for select to anon, authenticated
  using (status = 'active' and public.is_approved_org(org_id));

-- Registering interest is refused on an unapproved organisation's role too,
-- so the server check matches what the browse shows (trap 4).
create or replace function public.set_application_org_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  select o.org_id into new.org_id
  from public.volunteer_opportunities o
  where o.id = new.opportunity_id
    and o.status = 'active'
    and public.is_approved_org(o.org_id);

  if new.org_id is null then
    raise exception 'That opportunity is not open for applications'
      using errcode = 'check_violation';
  end if;

  -- Dismissal is the organisation's to set, not the applicant's.
  new.dismissed_at := null;

  return new;
end;
$function$;

-- A trigger function cannot be called over RPC, but the advisor flags the
-- grant anyway; take it away.
revoke all on function public.set_application_org_id() from public;
revoke all on function public.set_application_org_id() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discoverable volunteers: approved organisations only
-- ---------------------------------------------------------------------------
-- Also fixes the audit's "volunteers can browse each other" finding: the
-- checkbox people tick reads "Allow organisations to view my profile".
create or replace view public.public_volunteers
with (security_invoker = false) as
select id, name, home_town, skills, bio, available_anytime, availability_matrix
from public.user_profiles
where role = 'volunteer'
  and public_profile = true
  and public.is_approved_org(auth.uid());

revoke all on public.public_volunteers from anon, authenticated;
grant select on public.public_volunteers to authenticated;

-- Unapproved organisations are not listed publicly either.
create or replace view public.public_organisations
with (security_invoker = false) as
select id, name, home_town, bio
from public.user_profiles
where role = 'organization'
  and approved_at is not null;

revoke all on public.public_organisations from anon, authenticated;
grant select on public.public_organisations to anon, authenticated;

-- The home page's "local organisations" figure counts approved ones.
create or replace function public.count_organisations()
returns integer
language sql
stable
security definer
set search_path = public
as $function$
  select count(*)::int
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where p.role = 'organization'
    and p.approved_at is not null;
$function$;

-- ---------------------------------------------------------------------------
-- The only way to approve, or to take an approval back
-- ---------------------------------------------------------------------------
create or replace function public.set_organisation_approval(p_org_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can approve organisations'
      using errcode = '42501';
  end if;

  update public.user_profiles
     set approved_at = case when p_approved then coalesce(approved_at, now()) end,
         approved_by = case when p_approved then coalesce(approved_by, auth.uid()) end
   where id = p_org_id and role = 'organization';

  if not found then
    raise exception 'No such organisation' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.set_organisation_approval(uuid, boolean) from public;
revoke all on function public.set_organisation_approval(uuid, boolean) from anon, authenticated;
grant execute on function public.set_organisation_approval(uuid, boolean) to authenticated;
