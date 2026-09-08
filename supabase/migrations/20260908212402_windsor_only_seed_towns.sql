-- Bring the seed opportunities to Windsor only.
--
-- Four of the fourteen live rows were tagged Maidenhead (School Library
-- Volunteer, Wellbeing Workshop Assistant) or Slough (Breakfast Club
-- Assistant, Playground Games Leader), so a browse whose copy says
-- "across Windsor" was listing roles in two other towns.
--
-- On every row `location` holds the town name rather than a venue -- there
-- is no "St Edward's, Parsonage Lane" anywhere in the table yet -- so both
-- columns move together. That is also why the detail page's Where row read
-- "Windsor · Windsor" until it learned to de-duplicate them.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. The `town` column, its CHECK
-- constraint and src/utils/towns.js all still admit Maidenhead and Slough.
-- Only the data and the browse UI are Windsor-only; adding a town back is a
-- one-line change to towns.js plus re-showing the filter. Narrowing the
-- CHECK now would make that a migration instead, which is the opposite of
-- what was asked for.
--
-- These are all 5eed... seed rows, which Phase 5.0 deletes before launch.
-- Nothing here touches an opportunity posted by a real organisation.

update public.volunteer_opportunities
   set town = 'Windsor',
       location = case
                    when location in ('Maidenhead', 'Slough') then 'Windsor'
                    else location
                  end
 where town in ('Maidenhead', 'Slough');
