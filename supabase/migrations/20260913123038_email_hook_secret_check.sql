-- The send-email Edge Function needs to check the shared secret, but it
-- cannot read Vault the way the first draft assumed: PostgREST only exposes
-- the schemas it is configured with, and `vault` is not one of them, so
-- supabase-js `.schema('vault')` returned nothing and every drain failed
-- closed with 401. Caught by driving a real drain and reading
-- net._http_response, not by reading the code back.
--
-- The fix compares inside the database instead of handing the secret out, so
-- the secret never leaves Postgres at all — strictly better than the getter
-- this replaced.

create or replace function public.verify_email_hook_secret(p_secret text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp', 'vault'
as $$
declare
  v_expected text;
begin
  if p_secret is null or length(p_secret) = 0 then
    return false;
  end if;

  select decrypted_secret into v_expected
    from vault.decrypted_secrets where name = 'email_hook_secret';

  if v_expected is null then
    return false;
  end if;

  return p_secret = v_expected;
end;
$$;

-- Only the service role calls this, and only from the Edge Function. Traps 1
-- and 1c: Postgres grants EXECUTE to PUBLIC by default and Supabase grants it
-- to anon/authenticated by name, so both have to go or the endpoint's own
-- doorkeeper would be callable from a browser as an oracle.
revoke all on function public.verify_email_hook_secret(text)
  from public, anon, authenticated;
