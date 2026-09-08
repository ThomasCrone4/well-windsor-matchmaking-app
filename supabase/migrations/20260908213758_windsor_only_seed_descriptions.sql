-- The other half of Windsor-only: the prose.
--
-- 20260908212402 moved `town` and `location` on the four non-Windsor seed
-- rows and stopped there, which was not enough. Five descriptions still
-- named Maidenhead or Slough in their body text, so the browse went on
-- rendering both towns under a heading that says Windsor -- caught by a
-- Playwright assertion on the rendered page, not by re-reading the previous
-- migration, which looked complete.
--
-- Moving a filter column and leaving the sentence next to it untouched is
-- the same class of miss as updating one of two near-identical JSX blocks.
--
-- Targeted replacements rather than a blanket regex: "Approach Windsor and
-- Maidenhead businesses" has to lose a conjunction, not just a word, or it
-- reads "Approach Windsor and businesses".

update public.volunteer_opportunities
   set description = replace(description,
         'Approach Windsor and Maidenhead businesses',
         'Approach Windsor businesses')
 where id = '5eed0000-0000-4000-8000-000000000003';

update public.volunteer_opportunities
   set description = replace(replace(description, 'in Maidenhead', 'in Windsor'),
                             'in Slough', 'in Windsor')
 where id in ('5eed0000-0000-4000-8000-000000000006',
              '5eed0000-0000-4000-8000-000000000009',
              '5eed0000-0000-4000-8000-00000000000c',
              '5eed0000-0000-4000-8000-00000000000d');
