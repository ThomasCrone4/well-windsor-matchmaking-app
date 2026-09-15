-- Workflow 5.5 — APP-5, the half of it that belongs in the database.
--
-- Roles publish without human review, so the only thing standing between a
-- 2MB description and everyone's browse is a length limit. There is none
-- today: `description` is unbounded `text`.
--
-- Two halves, deliberately split:
--
--   * LENGTHS live here, as CHECK constraints. The form will also enforce
--     them, with a character counter and a readable message — but the form is
--     not the only way in, and "breaks browse for everyone" is a property of
--     the data, not of the page that submitted it. A constraint is what makes
--     the claim true regardless of client.
--
--   * THE WORD LIST lives in the client (src/utils/contentChecks.js). It is a
--     content-quality measure for a small number of approved organisations,
--     not a security boundary, and a false positive here would be a 400 with
--     no explanation on the longest form on the site. In the form it can say
--     which word and let the person fix it.
--
-- Headroom against live data, measured immediately before writing this:
-- longest title 39, description 335, location 7, skills 55.
--
-- NOT added, and this is a decision rather than an omission: no SQL-injection
-- filter and no HTML/<script> filter. Supabase's client sends values
-- separately from the query and React escapes what it renders, so both are
-- already handled. A filter that greps for `<script>` catches the obvious
-- attempt, misses the real one, and teaches people the site is protected by
-- the wrong thing. The user asked for one; the reasoning is in the APP-5
-- thread and they accepted it.

alter table public.volunteer_opportunities
  add constraint volunteer_opportunities_title_length
    check (title is null or length(title) <= 120),
  add constraint volunteer_opportunities_description_length
    check (description is null or length(description) <= 5000),
  add constraint volunteer_opportunities_location_length
    check (location is null or length(location) <= 200),
  add constraint volunteer_opportunities_skills_length
    check (skills is null or length(skills) <= 300),
  add constraint volunteer_opportunities_closed_reason_length
    check (closed_reason is null or length(closed_reason) <= 200),
  -- volunteers_needed is a smallint with a > 0 check already. The upper bound
  -- is new: nothing in Windsor needs four thousand volunteers, and the number
  -- is printed on the card.
  add constraint volunteer_opportunities_volunteers_needed_sane
    check (volunteers_needed between 1 and 500);
