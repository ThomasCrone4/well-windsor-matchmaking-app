-- Workflow 9, batch 9.6 -- declining an organisation, and the two email logs
-- ADM-3 never got a screen for.
--
-- ---------------------------------------------------------------------------
-- 1. Declining an organisation (WF9-6).
--
-- The approval queue is "organisations with approved_at is null", and there
-- was no way out of it except approval. So an organisation the charity
-- decides against sits in the queue for ever, and the count beside the tab
-- stops meaning "things to do" -- which is the only thing that count is for.
--
-- Declining is deliberately quiet: the organisation is NOT told, and nothing
-- about what it can do changes. It still cannot publish (approved_at is
-- still null, so is_approved_org is still false), it can still save drafts,
-- and if the charity changes its mind, approving works exactly as before.
-- The only thing declined_at does is take it off the admin's list.
--
-- The reason lives in the audit log rather than in a column: it is a note
-- about a decision, read while reviewing decisions, and audit_logs is
-- append-only and survives the account (WF1).
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists declined_at timestamptz;

comment on column public.user_profiles.declined_at is
  $c$WF9-6. Set when an admin declines an organisation's application: it
leaves the approval queue and is not told. NOT client-writable -- the only
path is decline_organisation(). Approving clears it.$c$;

-- Not client-writable, the same shape as approved_at -- and it is already
-- safe by construction rather than by this line. Read the ACL rather than
-- assuming (trap 1d): `authenticated` holds `rm` on user_profiles, NOT `w`,
-- so there is no table-wide UPDATE for a new column to inherit. UPDATE is
-- granted on seven named columns (name, home_town, dob, contact_number,
-- bio, skills, public_profile) and declined_at is not among them.
--
-- The revoke below is therefore a no-op today. It is kept as a guard: if a
-- future migration ever grants UPDATE on the table instead of on columns,
-- this column does not quietly come with it.
revoke update (declined_at) on public.user_profiles from anon, authenticated;

create or replace function public.decline_organisation(p_org_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile public.user_profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can decline an organisation'
      using errcode = '42501';
  end if;

  -- A reason is required, as it is for taking a role down (ADM-1): the point
  -- of the audit log is that a decision can be explained later.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Please give a reason for declining'
      using errcode = '22023';
  end if;

  select * into v_profile
    from public.user_profiles
   where id = p_org_id and role = 'organization'
   for update;

  if not found then
    raise exception 'No such organisation' using errcode = 'P0002';
  end if;

  if v_profile.approved_at is not null then
    raise exception 'That organisation is already approved. Withdraw approval first.'
      using errcode = '22023';
  end if;

  update public.user_profiles
     set declined_at = now()
   where id = p_org_id;

  perform public.record_audit_event(
    p_action_type      := 'organisation_declined',
    p_actor_kind       := 'admin',
    p_actor_id         := auth.uid(),
    p_target_user_id   := p_org_id,
    p_target_table     := 'user_profiles',
    p_target_record_id := p_org_id,
    p_old_values       := jsonb_build_object('declined_at', v_profile.declined_at),
    p_new_values       := jsonb_build_object('declined_at', now()),
    p_metadata         := jsonb_build_object('reason', btrim(p_reason)));
end;
$function$;

-- Trap 1: EXECUTE is granted to PUBLIC by default and anon inherits it.
revoke all on function public.decline_organisation(uuid, text) from public, anon;
grant execute on function public.decline_organisation(uuid, text) to authenticated;

-- Approving clears the decline, so an organisation cannot be both. Same
-- signature, so CREATE OR REPLACE keeps the ACL (trap 1c).
create or replace function public.set_organisation_approval(p_org_id uuid, p_approved boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can approve organisations'
      using errcode = '42501';
  end if;

  update public.user_profiles
     set approved_at = case when p_approved then coalesce(approved_at, now()) end,
         approved_by = case when p_approved then coalesce(approved_by, auth.uid()) end,
         -- WF9-6: approving un-declines. Withdrawing approval does NOT
         -- re-decline -- that would put an organisation the charity has
         -- already worked with back in a state meaning "we said no", and
         -- withdrawing is reversible in a way declining is not meant to be.
         declined_at = case when p_approved then null else declined_at end
   where id = p_org_id and role = 'organization';

  if not found then
    raise exception 'No such organisation' using errcode = 'P0002';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The email logs (ADM-3).
--
-- Two different things, deliberately two functions rather than one union:
-- an organisation writing to a volunteer is a message between two people,
-- and an automatic email is the system talking. They have different columns,
-- different retention and different reasons to be read.
--
-- email_outbox has NO client grants at all -- not a row is readable by anon
-- or authenticated (checked in pg_class.relacl). That is deliberate, so this
-- is a SECURITY DEFINER function rather than a new policy: a policy would
-- mean granting the table to `authenticated` and relying on the policy to
-- hold everyone else off, which is a larger door than it needs.
--
-- Both cap what they return rather than taking an offset. The admin screens
-- page at 50 in the browser, and a cap keeps one screen from pulling an
-- unbounded history once these tables have years in them; the count comes
-- back alongside so the page can say what it is not showing.
-- ---------------------------------------------------------------------------
create or replace function public.admin_outreach_log(p_limit integer default 500)
 returns table(id uuid, created_at timestamptz, org_id uuid, org_name text,
               volunteer_id uuid, volunteer_name text, to_email text,
               opportunity_id uuid, opportunity_title text,
               subject text, message text, status text, error text,
               total_count bigint)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can read the message log'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.org_outreach;

  return query
  select o.id,
         o.created_at,
         o.org_id,
         org.name,
         o.volunteer_id,
         vol.name,
         -- The address it ACTUALLY went to, which is the point of the log
         -- when someone complains. send-outreach resolves it from auth.users
         -- and never from user_profiles.email (which users could rewrite),
         -- so the log reads it from the same place.
         au.email::text,
         o.opportunity_id,
         opp.title,
         o.subject,
         o.message,
         o.status,
         o.error,
         v_total
    from public.org_outreach o
    left join public.user_profiles org on org.id = o.org_id
    left join public.user_profiles vol on vol.id = o.volunteer_id
    left join auth.users au            on au.id  = o.volunteer_id
    left join public.volunteer_opportunities opp on opp.id = o.opportunity_id
   order by o.created_at desc
   limit v_limit;
end;
$function$;

revoke all on function public.admin_outreach_log(integer) from public, anon;
grant execute on function public.admin_outreach_log(integer) to authenticated;

create or replace function public.admin_email_log(p_limit integer default 500)
 returns table(id uuid, created_at timestamptz, sent_at timestamptz,
               template text, to_email text, to_name text, subject text,
               status text, attempts integer, last_error text,
               redacted_at timestamptz, total_count bigint)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can read the email log'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.email_outbox;

  return query
  select e.id, e.created_at, e.sent_at, e.template, e.to_email, e.to_name,
         -- attempts is smallint on the table and integer here. Cast in the
         -- BODY, not by changing the declared type: CREATE OR REPLACE cannot
         -- change a RETURNS TABLE, so that would mean a DROP, and a
         -- recreated function is born with EXECUTE granted to anon by name
         -- (trap 1c). Without the cast PostgREST returns 42804, "Returned
         -- type smallint does not match expected type integer".
         e.subject, e.status, e.attempts::integer, e.last_error, e.redacted_at, v_total
    from public.email_outbox e
   order by e.created_at desc
   limit v_limit;
end;
$function$;

revoke all on function public.admin_email_log(integer) from public, anon;
grant execute on function public.admin_email_log(integer) to authenticated;

-- Deliberately NOT returned by admin_email_log: `payload`. It is the
-- template's variables, which for several templates includes the whole
-- message body again -- and the 30-day blanking job (WF8) clears to_email,
-- to_name, subject and payload together, so reading it here would be a
-- second copy of the thing that was blanked, on a screen that already shows
-- what was sent and to whom.
