-- POLISH-9, second half: drop `volunteer_opportunities.category`.
--
-- HELD, NOT APPLIED. The deployed client (main, before the polish-role-images
-- branch) still SELECTs `category` from public_opportunities and the table,
-- and still WRITES it from both role forms. Apply only once that client is
-- merged AND live -- grep the published bundle for `category` first (see
-- README.md). Applying early breaks the browse, the role page and both role
-- forms for real users.
--
-- The picture is `image_id` now (20260924122546_polish9_role_images); the
-- three categories' photographs were carried across into the library and any
-- live role holding a category got the matching image_id.
--
-- Only one object depends on the column: public_opportunities. A column
-- cannot be removed with CREATE OR REPLACE VIEW, so the view is dropped and
-- recreated -- and a recreated view is born with ALL granted to anon and
-- authenticated BY NAME (trap 1b), so the grants are restated.

begin;

drop view public.public_opportunities;

alter table public.volunteer_opportunities drop column category;  -- its CHECK goes with it

create view public.public_opportunities
with (security_invoker = false) as
 SELECT o.id,
    o.org_id,
    u.name AS org_name,
    o.title,
    o.description,
    o.location,
    o.town,
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

revoke all on public.public_opportunities from anon, authenticated;
grant select on public.public_opportunities to anon, authenticated;

commit;

-- After applying, read pg_class.relacl for public_opportunities: expect
-- anon=r and authenticated=r and nothing else for those two roles. Then run
-- .scratch/probe_wf9_1.py, .scratch/probe_role_images.py and
-- .scratch/walk_role_images.py.
