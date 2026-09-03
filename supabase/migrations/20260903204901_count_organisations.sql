-- The homepage's third stat used to be "Volunteer Hours", summed from
-- applications.logged_hours -- a column nothing ever wrote to, now
-- dropped. Replaced with a count of organisations, which is real.
--
-- It needs its own function for the same reason count_volunteers has
-- one: anon holds no grant on user_profiles, so a logged-out visitor
-- counting from the table directly gets 0. Granting anon a read there
-- instead would expose organisations' email and phone to the whole
-- internet, because RLS filters rows and not columns.
--
-- Joined to auth.users like count_volunteers, so a profile row with no
-- real account behind it can never inflate the number.

create or replace function public.count_organisations()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where p.role = 'organization';
$$;

-- Postgres grants EXECUTE to PUBLIC by default. Revoke, then name the
-- roles that should have it -- matching count_volunteers.
revoke execute on function public.count_organisations() from public;
grant execute on function public.count_organisations() to anon, authenticated, service_role;
