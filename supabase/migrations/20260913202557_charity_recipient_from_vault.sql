-- Point the charity-facing alerts at a redirect address while building.
--
-- Eleven real emails reached hello@wellwindsor.org.uk during workflow 2
-- testing. The first fix held ALL mail to real addresses, which stopped the
-- tests but also stopped the user exercising the app for real — too blunt.
--
-- The simpler answer: send the charity-facing alerts somewhere harmless
-- until launch. Nothing is held, everything really sends, and the emails can
-- actually be read and checked. Volunteer- and organisation-facing mail was
-- never the problem: it already goes to `.invalid` throwaways.
--
-- The address lives in Vault, not in this file. It is a personal inbox and
-- has no business in git, and keeping it as data means launch is a value
-- change rather than a migration.
--
--   Set:    select vault.create_secret('<address>', 'charity_notification_email', '...');
--   Change: select vault.update_secret(
--             (select id from vault.secrets where name = 'charity_notification_email'),
--             '<address>');
--   Launch: delete the secret, and this falls back to hello@ on its own.
--
-- The fallback is the real address deliberately. This function is what
-- APP-3 (workflow 4) replaces with the editable recipient list in which
-- hello@wellwindsor.org.uk can never be removed, so the default has to be
-- the thing that is correct in production, not the thing that is convenient
-- now.

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
  -- NOTE: this is broken and is corrected by 20260913202621. `name` is also
  -- an OUT parameter of this function, so it binds to the variable instead
  -- of the column and every call raises 42702. Kept as applied.
  select decrypted_secret into v_override
    from vault.decrypted_secrets
   where name = 'charity_notification_email';

  return query
    select coalesce(nullif(btrim(v_override), ''), 'hello@wellwindsor.org.uk')::text,
           'Well Windsor'::text;
end;
$$;

comment on function public.charity_notification_recipients() is
  'Who hears about organisations waiting and problems reported. Reads the '
  'charity_notification_email Vault secret while building; falls back to '
  'hello@wellwindsor.org.uk. Replaced by the APP-3 recipient list in '
  'workflow 4.';

revoke all on function public.charity_notification_recipients()
  from public, anon, authenticated;
