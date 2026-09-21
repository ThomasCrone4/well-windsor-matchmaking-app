-- POLISH-4, part 1b: map the existing free text onto the new list.
--
-- ADDITIVE ON PURPOSE. This only inserts join rows. It does not touch the
-- `skills` text columns, the views, or the public-profile CHECK -- all of
-- which the CURRENTLY DEPLOYED site still reads and writes. One database,
-- two deploys (the 9.2 lesson): the destructive half waits in
-- supabase/pending/ until the client is merged and live.
--
-- The rule, decided with the user: map what matches, drop the rest. No note
-- is kept of what was dropped and nobody is prompted.
--
-- Matching is word-boundary, not substring: a bare LIKE '%art%' would put
-- "Arts and crafts" on anyone who wrote "start" or "heart".

with syn(pattern, skill_name) as (values
  ('working with children', 'Working with children'),
  ('children',              'Working with children'),
  ('kids',                  'Working with children'),

  ('working with parents',  'Working with parents and families'),
  ('parents',               'Working with parents and families'),
  ('families',              'Working with parents and families'),
  ('working with families', 'Working with parents and families'),

  ('mentoring',             'Mentoring and listening'),
  ('mentor',                'Mentoring and listening'),
  ('listening',             'Mentoring and listening'),

  ('reading',               'Reading and literacy support'),
  ('literacy',              'Reading and literacy support'),
  ('teaching to read',      'Reading and literacy support'),

  ('maths',                 'Maths and homework help'),
  ('math',                  'Maths and homework help'),
  ('numeracy',              'Maths and homework help'),
  ('tutoring',              'Maths and homework help'),
  ('homework',              'Maths and homework help'),

  ('languages',             'Languages'),
  ('language',              'Languages'),

  ('sports',                'Sports and games'),
  ('sport',                 'Sports and games'),
  ('football',              'Sports and games'),
  ('rugby',                 'Sports and games'),
  ('cycling',               'Sports and games'),
  ('board games',           'Sports and games'),
  ('chess',                 'Sports and games'),

  ('arts',                  'Arts and crafts'),
  ('crafts',                'Arts and crafts'),

  ('music',                 'Music'),

  ('cooking',               'Cooking and food'),
  ('food preparation',      'Cooking and food'),

  ('gardening',             'Gardening and outdoors'),
  ('outdoors',              'Gardening and outdoors'),

  ('event support',         'Event support'),
  ('event planning',        'Event support'),
  ('events',                'Event support'),

  ('driving',               'Driving'),
  ('driver',                'Driving'),

  ('first aid',             'First aid'),

  ('diy',                   'DIY and repairs'),
  ('repairs',               'DIY and repairs'),
  ('maintenance',           'DIY and repairs'),

  ('admin',                 'Admin and organisation'),
  ('organisation',          'Admin and organisation'),
  ('organization',          'Admin and organisation'),
  ('organising groups',     'Admin and organisation'),

  ('fundraising',           'Fundraising'),

  ('bid writing',           'Bid and grant writing'),
  ('grant writing',         'Bid and grant writing'),

  ('social media',          'Social media and marketing'),
  ('marketing',             'Social media and marketing'),
  ('canva',                 'Social media and marketing'),

  ('web editing',           'Websites and design'),
  ('website',               'Websites and design'),
  ('web design',            'Websites and design')
),
-- Tokens as typed, lower-cased and stripped of the trailing full stops that
-- real entries actually carry ("chess and board games.").
vol_tokens as (
  select p.id as volunteer_id,
         btrim(lower(t), ' .') as token
    from public.user_profiles p,
         unnest(string_to_array(p.skills, ',')) as t
   where p.role = 'volunteer'
     and coalesce(btrim(p.skills), '') <> ''
),
op_tokens as (
  select o.id as opportunity_id,
         btrim(lower(t), ' .') as token
    from public.volunteer_opportunities o,
         unnest(string_to_array(o.skills, ',')) as t
   where coalesce(btrim(o.skills), '') <> ''
),
vol_matched as (
  insert into public.volunteer_skills (volunteer_id, skill_id)
  select distinct vt.volunteer_id, s.id
    from vol_tokens vt
    join syn on vt.token ~ ('(^|[^a-z])' || syn.pattern || '([^a-z]|$)')
    join public.skills s on s.name = syn.skill_name
  on conflict do nothing
  returning 1
)
insert into public.opportunity_skills (opportunity_id, skill_id)
select distinct ot.opportunity_id, s.id
  from op_tokens ot
  join syn on ot.token ~ ('(^|[^a-z])' || syn.pattern || '([^a-z]|$)')
  join public.skills s on s.name = syn.skill_name
on conflict do nothing;
