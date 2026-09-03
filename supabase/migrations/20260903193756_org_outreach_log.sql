-- =====================================================================
-- Record of every email the platform sends on an organisation's behalf.
--
-- Three jobs:
--   1. Show an org who they have already contacted.
--   2. Rate limiting -- the send function checks this table before
--      sending, so the platform can't be turned into a spam relay.
--   3. Accountability. These emails go out from a Well Windsor address
--      carrying text the charity did not write. If someone misuses it,
--      there has to be a record of what was actually sent.
--
-- Rows are written ONLY by the send-outreach Edge Function using the
-- service role. There is deliberately no insert policy for authenticated
-- users: a client that could write here directly could forge a record of
-- an email that was never sent, or bypass the rate limit.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.org_outreach (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  volunteer_id        uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  -- Set when the outreach follows an application; null for a cold
  -- approach from the volunteers page. SET NULL rather than CASCADE so
  -- deleting an opportunity doesn't erase the record that we emailed
  -- someone about it.
  opportunity_id      uuid REFERENCES public.volunteer_opportunities(id) ON DELETE SET NULL,
  subject             text NOT NULL,
  message             text NOT NULL,
  status              text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_outreach_subject_sane
    CHECK (btrim(subject) <> '' AND length(subject) <= 200),
  -- Length cap is a guardrail, not decoration: this text is sent under
  -- the charity's domain reputation.
  CONSTRAINT org_outreach_message_sane
    CHECK (btrim(message) <> '' AND length(message) <= 5000),
  CONSTRAINT org_outreach_status_valid
    CHECK (status IN ('sent', 'failed'))
);

-- Rate-limit lookups hit (org_id, volunteer_id, created_at) and the
-- "who have I contacted" list hits (org_id, created_at).
CREATE INDEX IF NOT EXISTS idx_org_outreach_org_created
  ON public.org_outreach (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_outreach_pair_created
  ON public.org_outreach (org_id, volunteer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_outreach_volunteer
  ON public.org_outreach (volunteer_id);

ALTER TABLE public.org_outreach ENABLE ROW LEVEL SECURITY;

-- Both sides can see the record. The volunteer received the email, so
-- there is nothing to hide from them, and it lets them see which
-- organisations have approached them.
CREATE POLICY "outreach: org reads own"
  ON public.org_outreach FOR SELECT TO authenticated
  USING (org_id = auth.uid());

CREATE POLICY "outreach: volunteer reads own"
  ON public.org_outreach FOR SELECT TO authenticated
  USING (volunteer_id = auth.uid());

CREATE POLICY "outreach: admin reads all"
  ON public.org_outreach FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies at all: writes come from the Edge
-- Function via the service role, which bypasses RLS.
REVOKE ALL ON public.org_outreach FROM anon;
GRANT SELECT ON public.org_outreach TO authenticated;
