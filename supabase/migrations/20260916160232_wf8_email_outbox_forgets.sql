-- Workflow 8 — found while writing the privacy policy: the email outbox kept
-- everything, for ever, including after an account was deleted.
--
-- ADM-4 (decided): "Logs are permanent, personal data in them is not.
-- Deleting an account blanks the name and text, keeps the dated record."
-- audit_logs honours that through redact_user_from_audit_log(). email_outbox
-- did not, and holds more personal data than the audit log ever did:
--
--   * to_email / to_name — the recipient;
--   * reply_to_email — a problem reporter's address;
--   * subject — e.g. "Your message to <volunteer name> has been sent";
--   * payload — outreach_copy carries the volunteer's name and the full
--     message text; digest carries volunteers' names and the first 200
--     characters of their notes; problem_reported carries the report.
--
-- Nothing expired any of it, and prepare_account_deletion() never touched the
-- table. A volunteer who deleted their account stayed in organisations'
-- receipts and digests indefinitely.
--
-- Two parts, because neither closes it alone:
--
--   1. ON ACCOUNT DELETION, rows sent to the person, or recorded against their
--      account, or naming them as the reply-to, lose their content at once.
--      A row still `queued` is abandoned rather than sent to an account that
--      no longer exists.
--
--   2. A RETENTION JOB blanks the content of every `sent` or `abandoned` row
--      30 days after it was sent. This is what covers the rows that merely
--      MENTION someone — an organisation's receipt naming a volunteer, a
--      digest listing several — which part 1 cannot find without matching on
--      names. 30 days is provisional (PENDING-DECISIONS.md, WF8-4): long enough
--      to investigate "I never got that email", short enough to be defensible.
--
-- What survives either way: id, template, status, attempts, the timestamps,
-- the provider's message id and any error — the dated record ADM-3's "emails
-- sent and failed" needs. `held` and `failed` rows keep their content: a held
-- row is waiting to be released, and a failed one is still being retried.
--
-- Blanked rows get a placeholder address, because email_outbox_to_email_sane
-- requires something shaped like one; `.invalid` so it can never be sent.

alter table public.email_outbox add column if not exists redacted_at timestamptz;

create or replace function public.redact_email_outbox_row_content(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.email_outbox
     set to_email       = 'redacted@redacted.invalid',
         to_name        = null,
         reply_to_email = null,
         reply_to_name  = null,
         subject        = '(content removed)',
         payload        = '{}'::jsonb,
         status         = case when status = 'queued' then 'abandoned' else status end,
         last_error     = case when status = 'queued' then 'Account deleted before sending' else last_error end,
         redacted_at    = now()
   where id = any(p_ids)
     and redacted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.redact_email_outbox_row_content(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Retention.
-- ---------------------------------------------------------------------------
create or replace function public.expire_email_outbox_content()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.redact_email_outbox_row_content(array(
    select id from public.email_outbox
     where status in ('sent', 'abandoned')
       and redacted_at is null
       and coalesce(sent_at, created_at) < now() - interval '30 days'));
$$;

revoke all on function public.expire_email_outbox_content() from public, anon, authenticated;

select cron.schedule('expire-email-outbox-content', '20 3 * * *',
                     'select public.expire_email_outbox_content();');

-- ---------------------------------------------------------------------------
-- 1. Account deletion. Same signature, so CREATE OR REPLACE keeps the ACL
--    (trap 1c). Everything above the new block is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile   record;
  v_email     text;
  v_outreach  integer := 0;
  v_apps      integer := 0;
  v_roles     integer := 0;
  v_redacted  integer := 0;
  v_emails    integer := 0;
  r           record;
begin
  select id, role, name into v_profile
    from public.user_profiles where id = p_user_id;

  if v_profile.id is null then
    raise exception 'No such account' using errcode = '22023';
  end if;

  for r in
    select o.id, o.org_id, o.volunteer_id, o.opportunity_id, o.status, o.created_at
      from public.org_outreach o
     where o.org_id = p_user_id or o.volunteer_id = p_user_id
  loop
    perform public.record_audit_event(
      p_action_type      := 'outreach_preserved_on_deletion',
      p_actor_kind       := 'system',
      p_target_table     := 'org_outreach',
      p_target_record_id := r.id,
      p_metadata         := jsonb_build_object(
                              'org_id', r.org_id,
                              'volunteer_id', r.volunteer_id,
                              'opportunity_id', r.opportunity_id,
                              'status', r.status,
                              'sent_at', r.created_at),
      p_reason           := 'Account deleted; message text and names removed.');
    v_outreach := v_outreach + 1;
  end loop;

  select count(*) into v_apps from public.applications
   where volunteer_id = p_user_id or org_id = p_user_id;
  select count(*) into v_roles from public.volunteer_opportunities
   where org_id = p_user_id;

  -- WF8: the email outbox forgets them too.
  select u.email into v_email from auth.users u where u.id = p_user_id;
  v_emails := public.redact_email_outbox_row_content(array(
    select e.id from public.email_outbox e
     where e.related_user_id = p_user_id
        or (v_email is not null and (lower(e.to_email) = lower(v_email)
                                  or lower(e.reply_to_email) = lower(v_email)))));

  perform public.record_audit_event(
    p_action_type    := 'account_deleted',
    p_actor_kind     := 'user',
    p_actor_id       := p_user_id,
    p_target_user_id := p_user_id,
    p_target_table   := 'user_profiles',
    p_metadata       := jsonb_build_object(
                          'role', v_profile.role,
                          'outreach_preserved', v_outreach,
                          'applications_removed', v_apps,
                          'roles_removed', v_roles,
                          'emails_redacted', v_emails));

  v_redacted := public.redact_user_from_audit_log(p_user_id);

  return jsonb_build_object(
    'role', v_profile.role,
    'outreach_preserved', v_outreach,
    'applications_removed', v_apps,
    'roles_removed', v_roles,
    'emails_redacted', v_emails,
    'audit_rows_redacted', v_redacted);
end;
$$;
