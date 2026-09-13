-- Workflow 2 — the email pipeline.
--
-- Four of the eight emails are decided by the database (an admin approves an
-- organisation, an organisation signs up, a problem is reported, the 8am
-- digest). The database therefore has to cause an email, and the obvious way
-- — a trigger that calls the Edge Function over HTTP — is the wrong one: it
-- makes approving an organisation fail whenever Brevo is slow or down, and
-- it gives a trigger an outbound network dependency inside a transaction.
--
-- So triggers only ever INSERT a row here. A cron job drains the queue by
-- pinging the send-email Edge Function, which does the sending and writes
-- the result back. A failed send is a row with an error on it, not a lost
-- email, and "did they get it?" is answerable from this table and from
-- audit_logs.
--
-- Nothing in this file sends anything by itself.

create extension if not exists pg_net;

-- ------------------------------------------------------------------ queue
create table if not exists public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  template            text not null,
  to_email            text not null,
  to_name             text,
  reply_to_email      text,
  reply_to_name       text,
  subject             text not null,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'queued',
  attempts            smallint not null default 0,
  last_error          text,
  provider_message_id text,
  related_user_id     uuid,
  related_record_id   uuid,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

alter table public.email_outbox
  add constraint email_outbox_template_valid check (template in (
    'org_approved',      -- EML-1: an admin approved this organisation
    'org_awaiting',      -- APP-2: an organisation signed up, tell the charity
    'problem_reported',  -- ADM-7: a problem report came in
    'digest',            -- INT-1: the 08:00 Europe/London summary
    'outreach_copy'      -- CON-1: the organisation's copy of its own message
  ));

alter table public.email_outbox
  add constraint email_outbox_status_valid
  check (status in ('queued', 'sent', 'failed', 'abandoned'));

alter table public.email_outbox
  add constraint email_outbox_to_email_sane
  check (length(to_email) <= 320 and to_email like '%_@_%');

create index if not exists email_outbox_queued_idx
  on public.email_outbox (created_at) where status = 'queued';

alter table public.email_outbox enable row level security;

comment on table public.email_outbox is
  'Outbound transactional email. Triggers enqueue; the send-email Edge '
  'Function drains and records the result. No client may read or write it.';

-- Trap 1b: a new table is born with ALL granted to anon and authenticated BY
-- NAME. This table holds recipients' email addresses, so no client gets any
-- access whatsoever — not even SELECT for an admin. It is read through the
-- service role only.
revoke all on public.email_outbox from anon, authenticated;

-- ----------------------------------------------------- who hears from us
-- APP-3 (workflow 4) turns this into a table an admin can add addresses to.
-- Until then it is one address, in one place, so workflow 4 changes this
-- function and nothing else.
create or replace function public.charity_notification_recipients()
returns table (email text, name text)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select 'hello@wellwindsor.org.uk'::text, 'Well Windsor'::text;
$$;

revoke all on function public.charity_notification_recipients()
  from public, anon, authenticated;

-- --------------------------------------------------------------- enqueue
create or replace function public.enqueue_email(
  p_template          text,
  p_to_email          text,
  p_subject           text,
  p_to_name           text default null,
  p_payload           jsonb default '{}'::jsonb,
  p_related_user_id   uuid default null,
  p_related_record_id uuid default null,
  p_reply_to_email    text default null,
  p_reply_to_name     text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if p_to_email is null or p_to_email not like '%_@_%' then
    -- Never queue a row that can only ever fail. An address we do not have
    -- is not an error worth failing the caller's transaction for.
    return null;
  end if;

  insert into public.email_outbox (
    template, to_email, to_name, subject, payload,
    related_user_id, related_record_id, reply_to_email, reply_to_name
  ) values (
    p_template, p_to_email, p_to_name, p_subject, coalesce(p_payload, '{}'::jsonb),
    p_related_user_id, p_related_record_id, p_reply_to_email, p_reply_to_name
  )
  returning id into v_id;

  perform public.record_audit_event(
    p_action_type      := 'email_queued',
    p_actor_kind       := 'system',
    p_target_user_id   := p_related_user_id,
    p_target_table     := 'email_outbox',
    p_target_record_id := v_id,
    p_metadata         := jsonb_build_object('template', p_template));

  return v_id;
end;
$$;

revoke all on function public.enqueue_email(
  text, text, text, text, jsonb, uuid, uuid, text, text)
  from public, anon, authenticated;

-- ------------------------------------------- EML-1: your account is active
-- set_organisation_approval() is the only path that can set approved_at, so
-- this fires from the column rather than from the function: any future route
-- to approval gets the email too.
create or replace function public.email_on_org_approved()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text;
begin
  if new.role <> 'organization' then
    return new;
  end if;
  if new.approved_at is null or old.approved_at is not null then
    return new;  -- not an approval: a withdrawal, or an unrelated edit
  end if;

  select u.email into v_email from auth.users u where u.id = new.id;

  perform public.enqueue_email(
    p_template        := 'org_approved',
    p_to_email        := v_email,
    p_to_name         := new.name,
    p_subject         := 'Your Well Windsor account is now active',
    p_payload         := jsonb_build_object('org_name', new.name),
    p_related_user_id := new.id);
  return new;
end;
$$;

drop trigger if exists email_org_approved on public.user_profiles;
create trigger email_org_approved
  after update on public.user_profiles
  for each row execute function public.email_on_org_approved();

-- ------------------------------------ APP-2: an organisation is waiting
-- APP-1 was reversed on 13 September: the organisation itself is told on
-- screen and gets NO email here. This tells the charity, not the applicant.
create or replace function public.email_on_org_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  if new.role <> 'organization' or new.approved_at is not null then
    return new;
  end if;

  for r in select * from public.charity_notification_recipients() loop
    perform public.enqueue_email(
      p_template        := 'org_awaiting',
      p_to_email        := r.email,
      p_to_name         := r.name,
      p_subject         := 'An organisation is waiting for approval',
      p_payload         := jsonb_build_object(
                             'org_name', new.name,
                             'home_town', coalesce(new.home_town, 'not given')),
      p_related_user_id := new.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists email_org_signup on public.user_profiles;
create trigger email_org_signup
  after insert on public.user_profiles
  for each row execute function public.email_on_org_signup();

-- ------------------------------------------- ADM-7: a problem was reported
-- This replaces the TODO left in notify_problem_reported() in workflow 1.4.
create or replace function public.email_on_problem_reported()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  for r in select * from public.charity_notification_recipients() loop
    perform public.enqueue_email(
      p_template          := 'problem_reported',
      p_to_email          := r.email,
      p_to_name           := r.name,
      p_subject           := 'A problem was reported on the volunteer site',
      p_payload           := jsonb_build_object(
                               'report', left(new.message, 1000),
                               'page_url', coalesce(new.page_url, 'not recorded'),
                               'signed_in', new.reporter_id is not null),
      -- So the charity can reply straight to the person who reported it.
      p_reply_to_email    := new.contact_email,
      p_related_record_id := new.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists email_problem_reported on public.problem_reports;
create trigger email_problem_reported
  after insert on public.problem_reports
  for each row execute function public.email_on_problem_reported();

-- ------------------------------------------------------ INT-1: the digest
create table if not exists public.org_digest_state (
  org_id         uuid primary key,
  last_digest_at timestamptz not null default now()
);
alter table public.org_digest_state enable row level security;
revoke all on public.org_digest_state from anon, authenticated;

comment on table public.org_digest_state is
  'Watermark per organisation for the 08:00 digest, so a registration is '
  'reported once and once only.';

-- Builds the 08:00 Europe/London summary. Pure SQL: it decides what to say
-- and queues it. Sending is the drain job's problem.
--
-- Names, the role and the start of the note. NEVER contact details — the
-- organisation gets an address only when the volunteer replies to outreach.
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
       and a.created_at > v_since;

    -- "Nothing sent when nobody is new" — but the watermark still moves, so
    -- a quiet day cannot make tomorrow's digest repeat today's people.
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

revoke all on function public.build_daily_digests() from public, anon, authenticated;

-- ---------------------------------------------------------------- drain
-- Wakes the Edge Function, which does the sending. Fire and forget: pg_net
-- is asynchronous and the function writes results back to email_outbox
-- itself, so there is nothing here to wait for.
--
-- The shared secret lives in Vault. The Edge Function reads the same secret
-- back through its own service role and compares, so there is no key in this
-- file, none in the client bundle, and no dashboard step to forget.
create or replace function public.drain_email_outbox()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp', 'vault', 'net'
as $$
declare
  v_secret text;
  v_url    text;
  v_any    boolean;
begin
  select exists (select 1 from public.email_outbox where status = 'queued')
    into v_any;
  if not v_any then
    return;  -- never wake the sender for an empty queue
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'email_hook_secret';
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'send_email_url';

  if v_secret is null or v_url is null then
    raise warning 'drain_email_outbox: vault secrets missing, nothing sent';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-email-hook-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end;
$$;

revoke all on function public.drain_email_outbox() from public, anon, authenticated;

-- ------------------------------------------------------------------ cron
-- The existing auto-close job runs at 00:05 UTC. This one is pinned to
-- Europe/London explicitly, because the two disagree for half the year and a
-- digest arriving at 7am in winter is a bug nobody would report.
-- pg_cron schedules in UTC, so 08:00 London is expressed by running the
-- builder hourly and letting it act only at the right local hour.
select cron.unschedule('build-daily-digests')
 where exists (select 1 from cron.job where jobname = 'build-daily-digests');
select cron.schedule('build-daily-digests', '0 * * * *', $$
  select public.build_daily_digests()
   where extract(hour from (now() at time zone 'Europe/London')) = 8;
$$);

select cron.unschedule('drain-email-outbox')
 where exists (select 1 from cron.job where jobname = 'drain-email-outbox');
select cron.schedule('drain-email-outbox', '* * * * *',
                     $$select public.drain_email_outbox();$$);
