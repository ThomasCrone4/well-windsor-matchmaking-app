-- Plan 1.1b — split `town` out of `location`.
--
-- `location` is a free-text input on the post/edit forms, but the browse
-- filter is `op.location === filters.town`, an exact string match. It only
-- works today because every row happens to say exactly "Windsor",
-- "Maidenhead" or "Slough" -- which is also why the seed rows had to push
-- venue detail ("St Edward's") down into the description. The first real
-- organisation that types "St Edward's, Windsor" silently disappears from a
-- filtered browse: no error, no empty state, just a listing nobody can find.
--
-- One field was doing two jobs. Split them:
--   town      -- the filter key, constrained to the towns we cover
--   location  -- free text, the human-readable place ("St Edward's School")
--
-- The CHECK mirrors src/utils/towns.js, which the working agreement treats
-- as the canonical list (the `towns` table exists but nothing reads it --
-- deferred until town management lands in the admin UI). Adding a town
-- therefore needs an edit in both places, deliberately: a filter key that
-- can drift is the bug this migration exists to fix.

alter table public.volunteer_opportunities
  add column if not exists town text;

-- Backfill. Every current row's location is already exactly a town name,
-- so this is lossless; location keeps its value and stays free text.
update public.volunteer_opportunities
   set town = location
 where town is null
   and location in ('Windsor', 'Maidenhead', 'Slough');

alter table public.volunteer_opportunities
  drop constraint if exists volunteer_opportunities_town_valid;

alter table public.volunteer_opportunities
  add constraint volunteer_opportunities_town_valid
  check (town is null or town in ('Windsor', 'Maidenhead', 'Slough'));

-- A published opportunity with no town is unreachable from a filtered
-- browse, which is the failure mode above wearing a different hat. Drafts
-- may leave it blank (the post form lets you save an incomplete draft);
-- going active may not.
alter table public.volunteer_opportunities
  drop constraint if exists volunteer_opportunities_active_needs_town;

alter table public.volunteer_opportunities
  add constraint volunteer_opportunities_active_needs_town
  check (status <> 'active' or town is not null);

comment on column public.volunteer_opportunities.town is
  'Filter key. One of the towns in src/utils/towns.js. Free-text venue detail belongs in location.';

comment on column public.volunteer_opportunities.location is
  'Free text, human-readable place. Not a filter key -- see town.';
