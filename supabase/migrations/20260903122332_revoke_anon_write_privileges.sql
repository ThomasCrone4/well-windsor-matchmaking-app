-- Defence in depth. RLS already filters every row out for anon on these
-- tables, but anon has no business holding write privileges at all.
--
-- No functional change: profile inserts at signup run as `authenticated`
-- (signUp returns a session), and the existing insert policy checks
-- auth.uid() = id, which is NULL for anon and would fail regardless.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_profiles           FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.volunteer_opportunities FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.match_results           FROM anon;

-- Nobody needs these two through the API.
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.user_profiles           FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.volunteer_opportunities FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.match_results           FROM authenticated;
