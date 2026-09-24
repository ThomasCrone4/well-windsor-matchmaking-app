-- Fix for 20260922123700. The trigger is shared by two tables, and picked the
-- id with a CASE EXPRESSION:
--
--   v_id := case tg_table_name
--             when 'user_profiles' then coalesce(new.id, old.id)
--             else coalesce(new.volunteer_id, old.volunteer_id)
--           end;
--
-- PL/pgSQL prepares the whole expression, so `new.id` is resolved against the
-- triggering row even when the branch is not taken -- on volunteer_skills
-- that is `42703: record "new" has no field "id"`. Every DELETE from
-- volunteer_skills failed, which took set_volunteer_skills() with it and
-- broke saving a volunteer profile. It reached production: the checks that
-- passed first were all on user_profiles, where the taken branch happens to
-- be the one that resolves.
--
-- Two fixes, both needed:
--  * IF statements, not a CASE expression. A branch that never runs is never
--    prepared, so the wrong table's field is never resolved.
--  * TG_OP, because NEW is unassigned on DELETE and OLD is unassigned on
--    INSERT -- referencing either raises on its own.
--
-- The return is now a plain NULL: this is an AFTER trigger, so the value is
-- discarded, and `coalesce(new, old)` had the same unassigned-record problem.
create or replace function public.enforce_public_profile_detail()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_role   text;
  v_public boolean;
  v_bio    text;
  v_skills integer;
begin
  if tg_table_name = 'user_profiles' then
    if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  else
    if tg_op = 'DELETE' then
      v_id := old.volunteer_id;
    else
      v_id := new.volunteer_id;
    end if;
  end if;

  select p.role, p.public_profile, p.bio
    into v_role, v_public, v_bio
    from public.user_profiles p
   where p.id = v_id;

  -- The profile itself is gone (ACC-6 cascade): nothing left to validate.
  if not found then
    return null;
  end if;

  if v_role <> 'volunteer' or v_public is not true then
    return null;
  end if;

  if coalesce(btrim(v_bio), '') = '' then
    raise exception 'A public profile needs a bio' using errcode = '23514';
  end if;

  select count(*) into v_skills
    from public.volunteer_skills vs where vs.volunteer_id = v_id;

  if v_skills = 0 then
    raise exception 'A public profile needs at least one skill'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_public_profile_detail()
  from public, anon, authenticated;
