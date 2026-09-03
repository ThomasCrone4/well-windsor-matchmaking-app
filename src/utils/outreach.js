// Organisation -> volunteer outreach.
//
// The one rule: the client passes a volunteer_id and never an email
// address. The address is resolved inside the send-outreach Edge
// Function with the service role, so the organisation only learns it if
// the volunteer chooses to reply. Nothing here should ever grow a
// parameter that carries an address.
//
// The limits below are duplicated from the Edge Function on purpose:
// these are for telling the user before they write 5,000 characters,
// not for enforcement. The function and a CHECK constraint enforce.

import { supabase } from './supabase';

export const OUTREACH_SUBJECT_MAX = 200;
export const OUTREACH_MESSAGE_MAX = 5000;
export const OUTREACH_COOLDOWN_HOURS = 24;

/**
 * Send one message. Resolves on success; throws with the server's own
 * wording on failure, which carries the useful cases (cooldown, daily
 * cap, volunteer not contactable).
 */
export async function sendOutreach({ volunteerId, opportunityId = null, subject, message }) {
  const { data, error } = await supabase.functions.invoke('send-outreach', {
    body: {
      volunteer_id: volunteerId,
      opportunity_id: opportunityId,
      subject,
      message,
    },
  });

  if (error) {
    // supabase-js hides a non-2xx body behind error.context (a Response).
    // Without this the user sees "Edge Function returned a non-2xx status
    // code" instead of "you already contacted this volunteer today".
    let reason = 'Could not send the message. Please try again shortly.';
    try {
      const body = await error.context?.json?.();
      if (body?.error) reason = body.error;
    } catch {
      // Non-JSON error body; keep the generic wording.
    }
    throw new Error(reason);
  }

  return data;
}

/**
 * Whole hours left on the per-volunteer cooldown, or 0 if it has
 * lapsed. `lastSentAt` is the most recent successful send to that
 * volunteer by this organisation.
 */
export function cooldownHoursRemaining(lastSentAt) {
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = OUTREACH_COOLDOWN_HOURS * 60 * 60 * 1000 - elapsedMs;
  if (!(remainingMs > 0)) return 0;
  return Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
}

/**
 * Fold an org_outreach_sent list into one entry per volunteer.
 *
 * `contacted` means a message actually reached them, not that one was
 * attempted: the log records failures too, and telling an organisation
 * it has contacted someone it never reached is the one wrong answer
 * here. Failures are visible on the messages-sent page, and neither the
 * cooldown nor the daily cap counts them — the Edge Function filters
 * both on status = 'sent'.
 */
export function summariseOutreach(rows) {
  const byVolunteer = new Map();
  for (const row of rows ?? []) {
    const previous = byVolunteer.get(row.volunteer_id);
    const isSent = row.status === 'sent';
    const isNewer = !previous?.lastSentAt || new Date(row.created_at) > new Date(previous.lastSentAt);
    const lastSentAt = isSent && isNewer ? row.created_at : previous?.lastSentAt ?? null;

    byVolunteer.set(row.volunteer_id, {
      contacted: !!lastSentAt,
      lastSentAt,
      attempts: (previous?.attempts ?? 0) + 1,
    });
  }
  return byVolunteer;
}
