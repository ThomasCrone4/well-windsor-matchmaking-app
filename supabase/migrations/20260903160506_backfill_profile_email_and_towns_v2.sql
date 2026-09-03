-- One existing volunteer row ("Vol") is public_profile=true with no bio
-- and no skills -- it violates user_profiles_public_needs_detail (added
-- NOT VALID earlier for exactly this reason) and blocked the email
-- backfill below by re-triggering the check on UPDATE. It has nothing an
-- organisation could actually see, so unpublish it rather than invent
-- content; whoever owns the account can fill it in and re-publish.
UPDATE public.user_profiles
SET public_profile = false
WHERE id = 'fdb33926-8e65-496f-a84b-c3901349fae5';

-- Old AuthPage never wrote email into user_profiles at all. Backfill from
-- the real auth.users email.
UPDATE public.user_profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS NULL;

-- towns held only 'Windsor'; the rest of the app has always hardcoded
-- Windsor/Maidenhead/Slough (now centralised in src/utils/towns.js).
INSERT INTO public.towns (name, is_active)
VALUES ('Maidenhead', true), ('Slough', true)
ON CONFLICT DO NOTHING;
