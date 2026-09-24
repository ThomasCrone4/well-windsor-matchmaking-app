-- POLISH-9 follow-up: an admin can correct a picture's description.
--
-- The description is the image's alt text -- what a screen reader says on
-- every card that uses it -- so a typo or a vague one should be fixable
-- without hiding the picture and uploading it again. Built-in pictures are
-- editable too: their text lives in role_images, not in code.
--
-- Same shape as the other two writers: SECURITY DEFINER, is_admin() checked
-- inside, the same 1-200 character rule as admin_add_role_image, audited with
-- the old and the new text. Hidden pictures are editable as well -- they are
-- still on the roles that chose them.

create or replace function public.admin_set_role_image_alt(p_image_id uuid, p_alt text)
returns public.role_images
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alt text := btrim(coalesce(p_alt, ''));
  v_old text;
  v_row public.role_images;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an administrator may change a picture''s description'
      using errcode = '42501';
  end if;

  if v_alt = '' then
    raise exception 'Describe the picture for people who cannot see it'
      using errcode = '23514';
  end if;
  if length(v_alt) > 200 then
    raise exception 'A description is at most 200 characters'
      using errcode = '23514';
  end if;

  select alt into v_old from public.role_images where id = p_image_id for update;
  if not found then
    raise exception 'No such picture' using errcode = 'P0002';
  end if;

  update public.role_images set alt = v_alt
   where id = p_image_id
  returning * into v_row;

  perform public.record_audit_event(
    p_action_type := 'role_image_described',
    p_actor_kind  := 'admin',
    p_actor_id    := auth.uid(),
    p_target_table:= 'role_images',
    p_target_record_id := v_row.id,
    p_old_values  := jsonb_build_object('alt', v_old),
    p_new_values  := jsonb_build_object('alt', v_row.alt)
  );
  return v_row;
end;
$$;

-- Trap 1: born with EXECUTE to PUBLIC.
revoke all on function public.admin_set_role_image_alt(uuid, text) from public, anon;
grant execute on function public.admin_set_role_image_alt(uuid, text) to authenticated;
