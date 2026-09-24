-- POLISH-9 (revised 2026-09-24): a picture on a role, chosen from a library
-- that only admins fill.
--
-- The earlier plan let organisations upload, or paste a URL we would fetch.
-- The user replaced it: organisations CHOOSE, admins SUPPLY. So there is no
-- organisation upload, no URL fetch and no Edge Function -- and no
-- safeguarding notice on the form, because every picture on offer was put
-- there by the charity.
--
-- Shape, deliberately the same as skills (POLISH-4):
--   * hiding is soft -- a hidden picture leaves the picker and stays on every
--     role that already has it;
--   * there is no delete path at all (no grant, ON DELETE RESTRICT);
--   * the only writers are two admin-only functions, both audited.
--
-- A row is either a picture in the `role-images` bucket (storage_path) or one
-- of the stock photographs that ship with the site in public/images/
-- (static_base, rendered at 480w/800w in WebP and JPEG). The stock rows are
-- seeded here so the library is not empty on day one.
--
-- `category` is NOT dropped here: the deployed client still reads and writes
-- it. Dropping it waits for this client to be live (one database, two
-- deploys) -- see supabase/pending/.

-- ---------------------------------------------------------------- the table
create table public.role_images (
  id           uuid primary key default gen_random_uuid(),
  storage_path text unique,
  static_base  text unique,
  alt          text not null,
  is_active    boolean not null default true,
  sort_order   integer not null default 500,
  created_by   uuid,            -- no FK: deleting an admin must not be blocked
  created_at   timestamptz not null default now(),
  constraint role_images_one_source
    check ((storage_path is null) <> (static_base is null)),
  constraint role_images_storage_path_shape
    check (storage_path is null
           or storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  constraint role_images_static_base_shape
    check (static_base is null or static_base ~ '^[a-z0-9-]+$'),
  constraint role_images_alt_length
    check (length(btrim(alt)) between 1 and 200)
);

alter table public.role_images enable row level security;

-- Trap 1b: the table is born with ALL granted to anon and authenticated BY
-- NAME. Revoke by name, grant back read only.
revoke all on public.role_images from anon, authenticated;
grant select on public.role_images to anon, authenticated;

-- Every picture is a public stock image; hidden ones are still on the roles
-- that chose them, so the browse must be able to read them.
create policy "role images: everyone reads"
  on public.role_images for select
  to anon, authenticated
  using (true);

insert into public.role_images (static_base, alt, sort_order) values
  ('image-asset-1', 'Many hands stacked together in the middle of a circle of people', 10),
  ('image-asset-2', 'Four people seen from behind, arms around each other, on a tree-lined road', 20),
  ('image-asset-3', 'Windsor Castle at the end of a busy Windsor street', 30),
  ('image-asset-4', 'Children in a field holding a play parachute above their heads', 40),
  ('image-asset', 'Hands holding a red box with a pink sticky note reading "Act now"', 50),
  ('unsplash-image-l3n9q27zulw', 'A row of sharpened colouring pencils against a white background', 60),
  ('unsplash-image-oycl7y4y0bk', 'A desk with a stack of books, an apple, pencils and alphabet blocks', 70);

-- ------------------------------------------------------------- the bucket
-- Public read (the browse is public), 5 MB, three image types. Writes are
-- admin-only by policy below; there is no UPDATE or DELETE policy, so an
-- uploaded file cannot be swapped for something else after it is on the list.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('role-images', 'role-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy "role images: admins upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'role-images' and public.is_admin(auth.uid()));

create policy "role images: admins list"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'role-images' and public.is_admin(auth.uid()));

-- ----------------------------------------------------------- the role link
alter table public.volunteer_opportunities
  add column image_id uuid references public.role_images(id) on delete restrict;

-- The towns rule (ADM-6): choosing a picture needs it to be on offer, but
-- saving a role that already holds a since-hidden one is always allowed --
-- otherwise hiding a picture would lock its roles out of unrelated edits.
create or replace function public.volunteer_opportunities_image_rules()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.image_id is not null
     and (tg_op = 'INSERT' or new.image_id is distinct from old.image_id)
     and not exists (select 1 from public.role_images i
                      where i.id = new.image_id and i.is_active) then
    raise exception 'That picture is no longer offered. Choose another.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.volunteer_opportunities_image_rules() from public, anon, authenticated;

create trigger image_rules
  before insert or update of image_id on public.volunteer_opportunities
  for each row execute function public.volunteer_opportunities_image_rules();

-- Carry the old category's picture across, so no card changes under anyone.
-- (No live role has a category today; drafts might.)
update public.volunteer_opportunities o
   set image_id = i.id
  from public.role_images i
 where o.image_id is null
   and o.deleted_at is null
   and i.static_base = case o.category
                         when 'in_schools'    then 'image-asset-1'
                         when 'behind_scenes' then 'unsplash-image-oycl7y4y0bk'
                         when 'one_off'       then 'image-asset-4'
                       end;

-- -------------------------------------------------------------- the view
-- Same columns in the same order, four appended: CREATE OR REPLACE keeps the
-- ACL and owner rights (trap 1c).
create or replace view public.public_opportunities
with (security_invoker = false) as
 SELECT o.id,
    o.org_id,
    u.name AS org_name,
    o.title,
    o.description,
    o.location,
    o.town,
    o.category,
    o.requires_dbs,
    o.generally_needed,
    o.volunteers_needed,
    o.status,
    o.created_at,
    o.schedule_revision,
    COALESCE(( SELECT array_agg(s.id ORDER BY s.sort_order, s.name) AS array_agg
           FROM (opportunity_skills os
             JOIN skills s ON ((s.id = os.skill_id)))
          WHERE (os.opportunity_id = o.id)), '{}'::uuid[]) AS skill_ids,
    COALESCE(( SELECT array_agg(s.name ORDER BY s.sort_order, s.name) AS array_agg
           FROM (opportunity_skills os
             JOIN skills s ON ((s.id = os.skill_id)))
          WHERE (os.opportunity_id = o.id)), '{}'::text[]) AS skill_names,
    o.image_id,
    ri.storage_path AS image_path,
    ri.static_base AS image_static,
    ri.alt AS image_alt
   FROM ((volunteer_opportunities o
     JOIN public_organisations u ON ((u.id = o.org_id)))
     LEFT JOIN role_images ri ON ((ri.id = o.image_id)))
  WHERE ((o.status = 'active'::text) AND (o.deleted_at IS NULL));

-- ----------------------------------------------------- admin-only writers
create or replace function public.admin_add_role_image(p_storage_path text, p_alt text)
returns public.role_images
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alt text := btrim(coalesce(p_alt, ''));
  v_row public.role_images;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an administrator may add a picture'
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

  -- The file must really be in the bucket: a row pointing at nothing would
  -- put a broken image on every card that chose it.
  if not exists (select 1 from storage.objects
                  where bucket_id = 'role-images' and name = p_storage_path) then
    raise exception 'That file has not been uploaded' using errcode = 'P0002';
  end if;

  insert into public.role_images (storage_path, alt, created_by)
  values (p_storage_path, v_alt, auth.uid())
  returning * into v_row;

  perform public.record_audit_event(
    p_action_type := 'role_image_added',
    p_actor_kind  := 'admin',
    p_actor_id    := auth.uid(),
    p_target_table:= 'role_images',
    p_target_record_id := v_row.id,
    p_new_values  := jsonb_build_object('storage_path', v_row.storage_path,
                                        'alt', v_row.alt)
  );
  return v_row;
end;
$$;

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

-- Trap 1: functions are born with EXECUTE to PUBLIC.
revoke all on function public.admin_add_role_image(text, text) from public, anon;
revoke all on function public.admin_set_role_image_active(uuid, boolean) from public, anon;
grant execute on function public.admin_add_role_image(text, text) to authenticated;
grant execute on function public.admin_set_role_image_active(uuid, boolean) to authenticated;
