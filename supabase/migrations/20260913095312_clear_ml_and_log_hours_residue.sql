-- Workflow 1.1 — clear the residue left by the deleted ML matching and
-- Log Hours features, so later schema work is not stepping around dead
-- tables.
--
-- ML matching was deleted 2026-09-03 (commit 0e3b1a9); its scores were
-- Math.random(). Log Hours was deleted 2026-09-04 (commit d72d379).
-- Nothing in src/ reads any of this — the only two surviving mentions
-- (NotificationsDropdown.jsx, HomePage.jsx) are comments explaining the
-- removal.
--
-- Verified empty before writing this migration:
--   volunteer_hours 0 rows, match_results 0, user_status 0,
--   site_settings 0, user_profiles.logged_hours non-zero on 0 rows.
-- user_profiles.embedding_vector is non-NULL on 3 rows: dead vectors from
-- the deleted feature, deliberately discarded.
--
-- user_status carried is_banned and is_suspended that nothing read or
-- enforced. Suspend/ban is out of scope by decision — withdrawing an
-- organisation's approval already takes its roles down. The table goes
-- rather than leaving a flag that means nothing, which is exactly the lie
-- UserManagement shipped before it was deleted.

-- 1. Functions first: calculate_match_score takes vector arguments, so it
--    has to go before the extension that defines the type.
drop function if exists public.calculate_match_score(vector, vector, boolean);
drop function if exists public.match_volunteers_for_opportunity(uuid);
drop function if exists public.get_public_counts();
drop function if exists public.hours_by_org();
drop function if exists public.hours_by_volunteer();
drop function if exists public.hours_total_sum();

-- 2. Tables. Every foreign key on these points outward to tables that are
--    being kept, so nothing kept depends on them and the order is free.
drop table if exists public.match_results;
drop table if exists public.volunteer_hours;
drop table if exists public.user_status;
drop table if exists public.site_settings;

-- 3. Columns. idx_user_embedding and idx_opportunity_embedding are indexes
--    on these columns and drop with them. No view references them.
alter table public.user_profiles
  drop column if exists embedding_text,
  drop column if exists embedding_vector,
  drop column if exists embedding_updated_at,
  drop column if exists logged_hours;

alter table public.volunteer_opportunities
  drop column if exists embedding_text,
  drop column if exists embedding_vector,
  drop column if exists embedding_updated_at;

-- 4. The extension, last. No CASCADE on purpose: if anything still depends
--    on the vector type this must fail loudly and roll the whole migration
--    back, rather than quietly dropping whatever that is.
drop extension if exists vector;
