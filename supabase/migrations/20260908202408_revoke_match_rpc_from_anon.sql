-- Take EXECUTE on the match RPC back off anon.
--
-- 20260908202130 dropped and recreated match_opportunities_by_availability
-- to add `category` to its return list, because CREATE OR REPLACE cannot
-- change a function's return type. It ended with
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated, service_role;
--
-- which is trap 1 done correctly, and still left anon holding EXECUTE.
--
-- TRAP 1b APPLIES TO FUNCTIONS, NOT ONLY TO TABLES. Supabase ships
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role. A recreated function is therefore born
-- with EXECUTE granted TO THOSE ROLES BY NAME. Revoking from PUBLIC removes
-- an inherited grant that, in this project, is not the one that matters.
--
-- Caught by probing REST with the anon key, not by reading the ACL: the
-- call returned HTTP 200 and a full result set where 42501 was expected.
-- The prior ACL was {postgres,authenticated,service_role}; this restores it.

revoke execute on function public.match_opportunities_by_availability(uuid) from anon;

-- Same defect, same cause, on the two counters the logged-out home page
-- calls. These are deliberately anon-callable -- count_volunteers and
-- count_organisations exist precisely so a logged-out visitor sees a real
-- number -- so they are named here only to record that the grant was
-- reviewed and is intended, per the "every table needs the same checklist"
-- rule. No change to them.
