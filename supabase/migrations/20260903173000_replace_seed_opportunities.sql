-- =====================================================================
-- Replace the generated sample opportunities with realistic Windsor-area
-- seed data attached to the real organisation accounts.
--
-- WHY: all 51 existing opportunities were sample-generator output with
-- American locations ("Downtown Community Center", "Central Park Area",
-- "Food Bank Warehouse" -- in groups of exactly 4). None matched the
-- town filter's Windsor/Maidenhead/Slough values, so filtering by town
-- returned zero results for every town. They were publicly visible to
-- anonymous visitors. The only other row was a "Test" opportunity with a
-- matching "Test" application from Oct 2025.
--
-- !! THESE ARE SEED ROWS ATTRIBUTED TO REAL ORGANISATIONS !!
-- Real schools appear to be advertising roles they never wrote. That is
-- fine while the app is internal-only; it is NOT fine once the app is
-- public. Every seed row has a recognisable id beginning '5eed', so
-- removal before launch is one statement:
--
--   DELETE FROM public.opportunity_timeblocks
--    WHERE opportunity_id::text LIKE '5eed%';
--   DELETE FROM public.volunteer_opportunities
--    WHERE id::text LIKE '5eed%';
--
-- location is set to exactly 'Windsor' / 'Maidenhead' / 'Slough' because
-- OpportunitiesPage filters with `op.location === filters.town` -- an
-- exact string match. Venue detail therefore lives in the description.
-- That conflation of "which town, for filtering" with "where exactly,
-- for humans" is itself a schema smell; see the plan's Phase 1 note about
-- splitting out a proper `town` column.
--
-- Day indices follow src/utils/schedule.js DAYS: Monday=0 ... Sunday=6.
-- =====================================================================

-- Clear existing. volunteer_hours must go first: it references
-- applications with no ON DELETE CASCADE, so the cascade from
-- opportunities -> applications hits that FK and aborts. Its single row
-- was test data (11,696 hours, note "Hard work", against the Test
-- application) and Log Hours is slated for removal anyway.
DELETE FROM public.volunteer_hours;
DELETE FROM public.opportunity_timeblocks;
DELETE FROM public.volunteer_opportunities;

-- Fix the malformed default flagged earlier: it was the literal string
-- "'closed'::text" WITH quotes, which could never match a status
-- comparison. Nothing broke only because every insert set status
-- explicitly.
ALTER TABLE public.volunteer_opportunities
  ALTER COLUMN status SET DEFAULT 'draft';

INSERT INTO public.volunteer_opportunities
  (id, org_id, title, description, location, contact, generally_needed,
   requires_dbs, skills, status, volunteers_needed)
VALUES
-- ---- Well Windsor: the charity's own real volunteer needs -------------
('5eed0000-0000-4000-8000-000000000001', '6fdb25b0-a797-4d9d-bfad-1fed799f3f0d',
 'Colour Run Event Marshal',
 'Help our first Well Windsor Colour Run run smoothly. Marshals guide runners around the course, hand out colour powder at the stations and cheer people on. Based at Windsor Racecourse. Full briefing provided on the day; no experience needed, just energy and a loud voice.',
 'Windsor', 'hello@wellwindsor.org.uk', true, true,
 'Event support, working with families, enthusiasm', 'active', 12),

('5eed0000-0000-4000-8000-000000000002', '6fdb25b0-a797-4d9d-bfad-1fed799f3f0d',
 'Grant Research and Funding Applications',
 'We are a small team funding mental health provision in Windsor schools, and grant income is how we grow. Help us identify suitable trusts and foundations, and draft applications. Mostly remote with occasional catch-ups in Windsor. Ideal if you have written funding bids before, but we will happily train someone organised and thorough.',
 'Windsor', 'hello@wellwindsor.org.uk', true, false,
 'Research, writing, bid writing, attention to detail', 'active', 2),

('5eed0000-0000-4000-8000-000000000003', '6fdb25b0-a797-4d9d-bfad-1fed799f3f0d',
 'Local Business Fundraising Outreach',
 'Approach Windsor and Maidenhead businesses about sponsorship, raffle prizes and payroll giving. Suits someone confident on the phone and in person who knows the local business community. Flexible hours, work at your own pace.',
 'Windsor', 'hello@wellwindsor.org.uk', true, false,
 'Communication, sales, networking, local knowledge', 'active', 3),

('5eed0000-0000-4000-8000-000000000004', '6fdb25b0-a797-4d9d-bfad-1fed799f3f0d',
 'Website and Social Media Volunteer',
 'Keep our website current and our social channels active. Tasks include posting updates about our programmes, sharing fundraising milestones and tidying up pages that have gone stale. A few hours a month, entirely remote.',
 'Windsor', 'hello@wellwindsor.org.uk', true, false,
 'Social media, basic web editing, writing, Canva', 'active', 1),

('5eed0000-0000-4000-8000-000000000005', '6fdb25b0-a797-4d9d-bfad-1fed799f3f0d',
 'Mental Health Research Support',
 'Help us understand what is actually working. Summarise published research on school-based wellbeing interventions so our trustees can make evidence-based funding decisions. Suits a psychology or education student, or anyone comfortable reading academic papers.',
 'Windsor', 'hello@wellwindsor.org.uk', true, false,
 'Research, academic reading, summarising, data', 'active', 2),

('5eed0000-0000-4000-8000-000000000006', '6fdb25b0-a797-4d9d-bfad-1fed799f3f0d',
 'Wellbeing Workshop Assistant',
 'Support our Saturday morning family wellbeing workshops in Maidenhead. You will help set up the room, welcome families, and assist the facilitator during activities. Warm, patient people especially welcome.',
 'Maidenhead', 'hello@wellwindsor.org.uk', false, true,
 'Working with children, working with parents, patience', 'active', 4),

-- ---- Schools ---------------------------------------------------------
('5eed0000-0000-4000-8000-000000000007', '1d90ef45-a141-4d68-b779-177cac510a26',
 'Reading Support Volunteer',
 'Listen to children read one-to-one, twice a week during the school day. You will work with the same small group each week so they build confidence with a familiar face. Based at James First School, Windsor. DBS check arranged and paid for by the school.',
 'Windsor', 'office@jamesfirstschool.example', false, true,
 'Reading, working with children, patience', 'active', 4),

('5eed0000-0000-4000-8000-000000000008', '1d90ef45-a141-4d68-b779-177cac510a26',
 'Lunchtime Wellbeing Buddy',
 'Some children find lunchtime the hardest part of the day. Wellbeing buddies sit with pupils who struggle with the noise and crowds, play quiet games and generally make sure nobody is on their own. Weekday lunchtimes during term.',
 'Windsor', 'office@jamesfirstschool.example', false, true,
 'Working with children, listening, board games', 'active', 3),

('5eed0000-0000-4000-8000-000000000009', '854a82d2-5ab6-4378-8490-07fa30cc5ca6',
 'Playground Games Leader',
 'Run structured playground games at lunchtime so break times are active and inclusive. We provide the equipment and a few game ideas to get started. Tuesdays and Thursdays during term time in Slough.',
 'Slough', 'admin@jamessecondschool.example', false, true,
 'Sports, working with children, organising groups', 'active', 2),

('5eed0000-0000-4000-8000-00000000000a', 'f70b9008-c4a0-468c-828f-65bbb414a7ef',
 'After-School Homework Club Helper',
 'Help pupils with homework in our after-school club three afternoons a week. Mostly primary maths and literacy — no specialist knowledge needed, just patience and a willingness to explain things twice. Refreshments provided.',
 'Windsor', 'office@jamesthirdschool.example', false, true,
 'Maths, literacy, tutoring, working with children', 'active', 5),

('5eed0000-0000-4000-8000-00000000000b', '3950edbd-7ed2-46a2-8b08-f14ed7165892',
 'Sports Day Assistant',
 'A one-day commitment: help set up equipment, marshal races and hand out results at our annual sports day. Family members of pupils very welcome. Bring sun cream and optimism about the weather.',
 'Windsor', 'events@windsorgirls.example', false, false,
 'Sports, event support, working with children', 'active', 10),

('5eed0000-0000-4000-8000-00000000000c', '875907a2-baa6-47f8-8695-d7a0e61c8249',
 'School Library Volunteer',
 'Reshelve books, run the lending desk at break, and help pupils find something they will actually want to read. One afternoon a week in Maidenhead. Ideal for anyone who likes children''s fiction and a quiet, useful hour.',
 'Maidenhead', 'library@windsorschool.example', false, true,
 'Organisation, reading, working with children', 'active', 2),

('5eed0000-0000-4000-8000-00000000000d', '875907a2-baa6-47f8-8695-d7a0e61c8249',
 'Breakfast Club Assistant',
 'Early start, big impact. Help serve breakfast and set up activities before school so children arrive settled and fed. Weekday mornings during term time in Slough. Food hygiene training provided.',
 'Slough', 'breakfast@windsorschool.example', false, true,
 'Food preparation, early mornings, working with children', 'active', 3);

-- ---- Schedules for the non-flexible roles ----------------------------
INSERT INTO public.opportunity_timeblocks
  (opportunity_id, days, start_time, end_time, start_date, end_date)
VALUES
-- Wellbeing Workshop Assistant: Saturday mornings
('5eed0000-0000-4000-8000-000000000006', '{5}',         '10:00', '12:00', '2026-09-12', '2026-11-28'),
-- Reading Support: Mon + Wed mornings
('5eed0000-0000-4000-8000-000000000007', '{0,2}',       '09:00', '11:00', '2026-09-07', '2026-12-18'),
-- Lunchtime Wellbeing Buddy: weekday lunchtimes
('5eed0000-0000-4000-8000-000000000008', '{0,1,2,3,4}', '12:00', '13:30', '2026-09-07', '2026-12-18'),
-- Playground Games: Tue + Thu lunchtimes
('5eed0000-0000-4000-8000-000000000009', '{1,3}',       '12:00', '13:00', '2026-09-08', '2026-12-17'),
-- Homework Club: Tue/Wed/Thu after school
('5eed0000-0000-4000-8000-00000000000a', '{1,2,3}',     '15:30', '17:00', '2026-09-08', '2026-12-17'),
-- Sports Day: single Friday
('5eed0000-0000-4000-8000-00000000000b', '{4}',         '09:00', '15:00', '2027-07-09', '2027-07-09'),
-- Library: Wednesday afternoons
('5eed0000-0000-4000-8000-00000000000c', '{2}',         '13:00', '15:00', '2026-09-09', '2026-12-16'),
-- Breakfast Club: weekday early mornings
('5eed0000-0000-4000-8000-00000000000d', '{0,1,2,3,4}', '07:30', '08:45', '2026-09-07', '2026-12-18');
