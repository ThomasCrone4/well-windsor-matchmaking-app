-- Workflow 8.6 — final security pass: one grant with nothing behind it.
--
-- `authenticated` held table-wide DELETE on user_profiles (relacl
-- `authenticated=rdm`). It was harmless only because the table has no
-- DELETE policy, so RLS refuses every row — probe_wf8_final.py proved a
-- signed-in user cannot delete their own profile or anyone else's.
--
-- That is one missing policy away from a user deleting their profile row out
-- from under their auth account. Nothing in the client or any Edge Function
-- deletes from user_profiles: account deletion (ACC-6) goes through
-- auth.admin.deleteUser() and the ON DELETE CASCADE from auth.users, which
-- does not run as `authenticated`. So the grant goes, the same
-- defence-in-depth tidy-up the 2026-09-03 pass did for anon write grants.
--
-- Trap 1b: name the role; revoking from PUBLIC does nothing here.

revoke delete on public.user_profiles from anon, authenticated;
