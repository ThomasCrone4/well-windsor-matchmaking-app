-- Workflow 1.4 — ADM-7: report a problem.
--
-- Open to anyone, signed in or not: the person most likely to hit
-- something broken is a visitor who cannot get past it. This is the one
-- place in this codebase where an anon INSERT grant is correct.

create table if not exists public.problem_reports (
  id            uuid primary key default gen_random_uuid(),
  -- Never client-supplied. The default resolves the real caller, so an
  -- anonymous report cannot claim to be from a signed-in person; INSERT is
  -- not granted on this column at all.
  reporter_id   uuid default auth.uid() references auth.users(id) on delete set null,
  contact_email text,
  message       text not null,
  page_url      text,
  status        text not null default 'new',
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid
);

alter table public.problem_reports
  add constraint problem_reports_status_valid check (status in ('new', 'handled'));

-- Cap the message, or the table is an open funnel for anything anyone
-- cares to paste into it.
alter table public.problem_reports
  add constraint problem_reports_message_sane
  check (btrim(message) <> '' and length(message) <= 2000);

alter table public.problem_reports
  add constraint problem_reports_contact_email_sane
  check (contact_email is null or (length(contact_email) <= 320 and contact_email like '%_@_%'));

alter table public.problem_reports
  add constraint problem_reports_page_url_sane
  check (page_url is null or length(page_url) <= 500);

create index if not exists problem_reports_status_created_idx
  on public.problem_reports (status, created_at desc);

alter table public.problem_reports enable row level security;

comment on table public.problem_reports is
  'ADM-7. Anyone may insert, including anon; only admins read or handle. '
  'reporter_id is never client-supplied — it defaults to auth.uid().';

-- --------------------------------------------------------------- grants
-- Trap 1b: every new table is born with ALL granted to anon and
-- authenticated BY NAME, so "revoke all from public" would leave SELECT,
-- UPDATE, DELETE and TRUNCATE in place. Name the roles, then grant back
-- the narrowest thing that works.
revoke all on public.problem_reports from anon, authenticated;

grant insert (message, contact_email, page_url) on public.problem_reports
  to anon, authenticated;
grant select on public.problem_reports to authenticated;
-- status only: handled_at and handled_by are stamped by trigger, so they
-- cannot be back-dated or attributed to someone else.
grant update (status) on public.problem_reports to authenticated;

create policy "reports: anyone may report" on public.problem_reports
  for insert to anon, authenticated
  with check (reporter_id is not distinct from auth.uid());

create policy "reports: admins read" on public.problem_reports
  for select to authenticated
  using (public.is_admin(auth.uid()));

create policy "reports: admins handle" on public.problem_reports
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------- rate limit
-- A blunt instrument, and deliberately so. Real per-IP limiting needs to
-- see the client address, which this database never does: PostgREST
-- reaches it through a pooler, so inet_client_addr() is the pooler. That
-- belongs in an Edge Function if it is ever needed.
--
-- The anon cap is global, which means a flood can lock out genuine
-- visitors for the hour. That is the better failure mode than an
-- unbounded funnel, but it is a trade-off, not a win.
create or replace function public.problem_reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_recent integer;
begin
  if new.reporter_id is not null then
    select count(*) into v_recent from public.problem_reports
     where reporter_id = new.reporter_id and created_at > now() - interval '10 minutes';
    if v_recent >= 5 then
      raise exception 'Too many reports from this account. Please wait a few minutes.'
        using errcode = 'check_violation';
    end if;
  else
    select count(*) into v_recent from public.problem_reports
     where reporter_id is null and created_at > now() - interval '1 hour';
    if v_recent >= 30 then
      raise exception 'Too many reports have been submitted. Please try again later.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists problem_reports_rate_limit_check on public.problem_reports;
create trigger problem_reports_rate_limit_check
  before insert on public.problem_reports
  for each row execute function public.problem_reports_rate_limit();

-- --------------------------------------------------------- handled stamp
create or replace function public.problem_reports_stamp_handled()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'handled' then
      new.handled_at := now();
      new.handled_by := auth.uid();
    else
      new.handled_at := null;
      new.handled_by := null;
    end if;
    perform public.record_audit_event(
      p_action_type := 'problem_report_' || new.status,
      p_actor_kind  := 'admin',
      p_actor_id    := auth.uid(),
      p_target_table := 'problem_reports',
      p_target_record_id := new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists problem_reports_stamp on public.problem_reports;
create trigger problem_reports_stamp
  before update on public.problem_reports
  for each row execute function public.problem_reports_stamp_handled();

-- -------------------------------------------------- notify the admins
create or replace function public.notify_problem_reported()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_admin uuid;
begin
  for v_admin in select user_id from public.admins loop
    perform public.notify_user(
      v_admin, 'problem_reported',
      'Someone has reported a problem.', new.id);
  end loop;

  perform public.record_audit_event(
    p_action_type := 'problem_report_received',
    p_actor_kind  := case when new.reporter_id is null then 'system' else 'user' end,
    p_actor_id    := new.reporter_id,
    p_target_table := 'problem_reports',
    p_target_record_id := new.id);

  -- TODO(workflow 2, EML/ADM-7): email hello@wellwindsor.org.uk here, once
  -- the Brevo pipeline exists. Deliberately not half-built now — there is
  -- no send path to call, and a stub would look like a working one.
  return new;
end;
$$;

drop trigger if exists notify_on_problem_reported on public.problem_reports;
create trigger notify_on_problem_reported
  after insert on public.problem_reports
  for each row execute function public.notify_problem_reported();

revoke all on function public.problem_reports_rate_limit() from public, anon, authenticated;
revoke all on function public.problem_reports_stamp_handled() from public, anon, authenticated;
revoke all on function public.notify_problem_reported() from public, anon, authenticated;
