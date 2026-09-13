-- Close the last path by which a test reaches a real person.
--
-- 20260913125313 and 20260913131930 stopped a `.invalid` organisation
-- alerting the charity by email or by the bell. Problem reports were left
-- out, with a note saying that path needed the drain paused first, because an
-- anonymous report has no account to test.
--
-- That note has now been wrong twice. probe_wf1.py files problem reports, and
-- each run has put fresh junk in the live admin's notification feed — two
-- more during workflow 3, after the email side had already been fixed.
--
-- There IS something to test on an anonymous report: the reply address. A
-- genuine visitor never types an address on `.invalid` — the TLD exists
-- precisely so nothing can be delivered to it — so a report that gives one is
-- a test by construction. Every probe supplies one, and both the alert email
-- and the admin notification are skipped when it does.
--
-- A report from a signed-in test account is caught by the same rule through
-- its account address.

create or replace function public.problem_report_is_test(p_report public.problem_reports)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_reporter_email text;
begin
  if public.is_test_address(p_report.contact_email) then
    return true;
  end if;

  if p_report.reporter_id is not null then
    select u.email into v_reporter_email from auth.users u where u.id = p_report.reporter_id;
    if public.is_test_address(v_reporter_email) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

comment on function public.problem_report_is_test(public.problem_reports) is
  'True when a problem report came from a throwaway: a .invalid reply address '
  'or a .invalid account. Such a report raises neither the alert email nor the '
  'admin notification.';

revoke all on function public.problem_report_is_test(public.problem_reports)
  from public, anon, authenticated;

-- ------------------------------------------------- the bell (workflow 1.4)
create or replace function public.notify_problem_reported()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_admin uuid;
  v_test  boolean := public.problem_report_is_test(new);
begin
  if not v_test then
    for v_admin in select user_id from public.admins loop
      perform public.notify_user(
        v_admin, 'problem_reported',
        'Someone has reported a problem.', new.id);
    end loop;
  end if;

  -- The audit entry is written either way. The report itself is real and is
  -- listed on the admin dashboard; it is only the alert that is suppressed,
  -- and a log that quietly skipped test rows would be lying about what the
  -- table contains.
  perform public.record_audit_event(
    p_action_type := 'problem_report_received',
    p_actor_kind  := case when new.reporter_id is null then 'system' else 'user' end,
    p_actor_id    := new.reporter_id,
    p_target_table := 'problem_reports',
    p_target_record_id := new.id,
    p_metadata    := jsonb_build_object('test_origin', v_test));

  return new;
end;
$$;

-- ----------------------------------------------- the email (workflow 2)
create or replace function public.email_on_problem_reported()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  if public.problem_report_is_test(new) then
    return new;
  end if;

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
      p_reply_to_email    := new.contact_email,
      p_related_record_id := new.id);
  end loop;
  return new;
end;
$$;
