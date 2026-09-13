-- Hold mail to real people until launch.
--
-- This is not hypothetical tidying. Eleven "A problem was reported" emails
-- reached hello@wellwindsor.org.uk during workflow 2 testing and three were
-- opened by a person, because probe_wf1.py files problem reports and the
-- problem-report trigger emails the charity. The .invalid guard added in
-- 20260913125313 does not help here: an anonymous report has no account, so
-- there is no address to test. The note written at the time said "testing
-- that path still means unscheduling the drain first" — and then the drain
-- was left scheduled and the probe run several times. A rule that depends on
-- remembering is not a control.
--
-- So the control moves into the machinery. While delivery mode is 'test',
-- the sender refuses any recipient that is not on `.invalid` and marks the
-- row `held`. Held is not failed and not lost: the row keeps its recipient,
-- its subject and its body, and would send if released. Nothing is silently
-- dropped.
--
-- At launch this becomes 'live' in one statement:
--   select vault.update_secret(
--            (select id from vault.secrets where name = 'email_delivery_mode'),
--            'live');

alter table public.email_outbox drop constraint if exists email_outbox_status_valid;
alter table public.email_outbox
  add constraint email_outbox_status_valid
  check (status in ('queued', 'sent', 'failed', 'abandoned', 'held'));

comment on column public.email_outbox.status is
  'queued -> sent | failed -> abandoned. `held` means delivery mode was '
  'test and the recipient was not a .invalid test address: kept, not sent.';

-- Mode lives in Vault beside the other email settings. It is not a secret,
-- but keeping every email switch in one place beats inventing a settings
-- table whose grants are one more thing to get wrong.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_delivery_mode') then
    perform vault.create_secret(
      'test', 'email_delivery_mode',
      'test = only .invalid recipients are sent, everything else is held. live = send to everyone.');
  end if;
end;
$$;

create or replace function public.email_delivery_is_live()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp', 'vault'
as $$
declare
  v_mode text;
begin
  select decrypted_secret into v_mode
    from vault.decrypted_secrets where name = 'email_delivery_mode';
  -- Absent or unreadable means hold. Failing closed is the whole point.
  return coalesce(lower(v_mode), 'test') = 'live';
end;
$$;

comment on function public.email_delivery_is_live() is
  'False while the project is in test mode, which holds mail to any address '
  'that is not on the reserved .invalid TLD.';

revoke all on function public.email_delivery_is_live() from public, anon, authenticated;
