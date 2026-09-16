-- Fix 20260913202557, which was broken on every call.
--
-- charity_notification_recipients() has an OUT parameter called `name`, so
-- an unqualified `where name = 'charity_notification_email'` inside it
-- resolves to that variable rather than to vault.decrypted_secrets.name.
-- Every call raised 42702 "column reference name is ambiguous", which meant
-- the previous migration did not merely fail to redirect — it made the two
-- charity-alert triggers throw.
--
-- Caught immediately because setting the Vault secret and reading the
-- function back was done in the same breath as applying it. Applying a
-- migration and not calling what it changed would have left this to surface
-- on the next organisation signup.

create or replace function public.charity_notification_recipients()
returns table (email text, name text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp', 'vault'
as $$
declare
  v_override text;
begin
  -- Alias and qualify, or `name` binds to the OUT parameter.
  select s.decrypted_secret into v_override
    from vault.decrypted_secrets s
   where s.name = 'charity_notification_email';

  return query
    select coalesce(nullif(btrim(v_override), ''), 'hello@wellwindsor.org.uk')::text,
           'Well Windsor'::text;
end;
$$;

revoke all on function public.charity_notification_recipients()
  from public, anon, authenticated;
