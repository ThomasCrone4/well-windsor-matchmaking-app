-- The .invalid guard has to cover the bell as well as the outbox.
--
-- 20260913125313 stopped a throwaway organisation emailing the charity, but
-- notify_org_awaiting_approval() (workflow 1.3) still wrote an in-app
-- notification to every admin — and `admins` contains a real person. Two junk
-- rows duly landed in the live admin's bell while testing the email guard
-- itself, which is trap 6b for the second time in one day.
--
-- The two triggers exist for the same event and must agree about what counts
-- as a real account, so both now ask is_test_address().

create or replace function public.notify_org_awaiting_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_admin uuid;
  v_email text;
begin
  if new.role is distinct from 'organization' or new.approved_at is not null then
    return new;
  end if;

  select u.email into v_email from auth.users u where u.id = new.id;
  if public.is_test_address(v_email) then
    return new;  -- a throwaway account never reaches a real admin's bell
  end if;

  for v_admin in select user_id from public.admins loop
    perform public.notify_user(
      v_admin, 'org_awaiting_approval',
      new.name || ' has signed up and is waiting for approval.',
      new.id);
  end loop;
  return new;
end;
$$;
