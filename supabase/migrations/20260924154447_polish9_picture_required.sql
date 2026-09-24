-- POLISH-9: every role has a picture (asked 2026-09-24).
--
-- 1. Backfill. Every role without one gets a random ACTIVE picture -- all of
--    them, removed and draft rows included, because the column becomes
--    NOT NULL. Checked before writing this: no trigger reacts to an
--    image-only change (notify_role_state_change watches title, description,
--    location, town, flexibility, DBS, schedule and status; removal_is_final
--    only refuses clearing deleted_at), and no row being touched has a NULL
--    town, so town_rules changes nothing either. Nobody is notified.
--
-- 2. A role cannot be left without one. On INSERT a missing picture is
--    filled with a random active one (so a caller that sends none -- the
--    form while the library is still loading, the previously deployed client
--    choosing "no preference", a probe fixture -- still gets one rather than
--    an error). On UPDATE, clearing it is refused. NOT NULL is the backstop.
--
-- 3. The last active picture cannot be hidden, or there would be nothing to
--    fill a new role with. Same rule as towns_guard's last active town.

-- ------------------------------------------------------------ 1. backfill
-- The outer reference (o.id) makes the subquery correlated, so it is
-- evaluated per row; an uncorrelated one would give every role the SAME
-- random picture.
update public.volunteer_opportunities o
   set image_id = (select ri.id from public.role_images ri
                    where ri.is_active and o.id is not null
                    order by random() limit 1)
 where o.image_id is null;

-- --------------------------------------------------- 2. always a picture
create or replace function public.volunteer_opportunities_image_rules()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.image_id is null then
    if tg_op = 'UPDATE' then
      raise exception 'A role must have a picture. Choose a different one instead.'
        using errcode = 'check_violation';
    end if;
    select i.id into new.image_id
      from public.role_images i
     where i.is_active
     order by random()
     limit 1;
    return new;   -- freshly picked from the active list, nothing more to check
  end if;

  if (tg_op = 'INSERT' or new.image_id is distinct from old.image_id)
     and not exists (select 1 from public.role_images i
                      where i.id = new.image_id and i.is_active) then
    raise exception 'That picture is no longer offered. Choose another.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- The trigger itself (`before insert or update of image_id`) is unchanged:
-- an INSERT fires it even when the column is omitted.

alter table public.volunteer_opportunities alter column image_id set not null;

-- -------------------------------------- 3. never hide the last one offered
create or replace function public.admin_set_role_image_active(p_image_id uuid, p_active boolean)
returns public.role_images
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.role_images;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an administrator may hide or restore a picture'
      using errcode = '42501';
  end if;

  if not coalesce(p_active, true)
     and not exists (select 1 from public.role_images
                      where is_active and id <> p_image_id) then
    raise exception 'This is the only picture on offer, and every role needs one. Add another before hiding it.'
      using errcode = '23514';
  end if;

  update public.role_images set is_active = coalesce(p_active, true)
   where id = p_image_id
  returning * into v_row;

  if not found then
    raise exception 'No such picture' using errcode = 'P0002';
  end if;

  perform public.record_audit_event(
    p_action_type := case when v_row.is_active then 'role_image_unhidden'
                          else 'role_image_hidden' end,
    p_actor_kind  := 'admin',
    p_actor_id    := auth.uid(),
    p_target_table:= 'role_images',
    p_target_record_id := v_row.id,
    p_new_values  := jsonb_build_object('alt', v_row.alt,
                                        'is_active', v_row.is_active)
  );
  return v_row;
end;
$$;
