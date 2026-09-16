-- A throwaway organisation must not raise a real alert.
--
-- With the outbox drain running once a minute, creating a 7e57 test
-- organisation now emails hello@wellwindsor.org.uk for real. Three such
-- emails were queued during workflow 2 and only did not go out because the
-- cron had been switched off by hand first. Relying on remembering to do
-- that is exactly the shape of trap 6, which is on the books because a test
-- sent a real person a real email.
--
-- The rule is structural instead: an account whose address is on `.invalid`
-- is by definition incapable of receiving mail — that is what the reserved
-- TLD is for, and it is why CLAUDE.md mandates it for every throwaway. Such
-- an account never generates an alert to a real human.
--
-- This guards the signup alert, where the account's identity is known. An
-- anonymous problem report has no identity to test, so testing THAT path
-- still means pausing the drain first.

create or replace function public.is_test_address(p_email text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select p_email is not null and lower(p_email) like '%.invalid';
$$;

comment on function public.is_test_address(text) is
  'True for addresses on the reserved .invalid TLD, which can never receive '
  'mail. Used to keep throwaway test accounts from raising real alerts.';

revoke all on function public.is_test_address(text) from public, anon, authenticated;

create or replace function public.email_on_org_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r       record;
  v_email text;
begin
  if new.role <> 'organization' or new.approved_at is not null then
    return new;
  end if;

  select u.email into v_email from auth.users u where u.id = new.id;
  if public.is_test_address(v_email) then
    return new;  -- a throwaway account never alerts a real inbox
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
