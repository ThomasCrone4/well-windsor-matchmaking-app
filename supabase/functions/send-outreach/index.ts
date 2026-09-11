// send-outreach
//
// An organisation composes an initial email to a volunteer in the app; we
// send it on their behalf via Brevo.
//
// The caller passes a volunteer_id, NEVER an email address. The address is
// resolved here with the service role. Two consequences, both deliberate:
//   - the organisation never learns the volunteer's email until the
//     volunteer chooses to reply (Reply-To is set to the org)
//   - the endpoint cannot be used as an open relay to arbitrary addresses
//
// Everything is checked server-side. A client cannot be trusted to enforce
// who may email whom, or the rate limit.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// Verified sender in Brevo. Currently a personal address for development;
// swap to notifications@wellwindsor.org.uk once the domain is
// authenticated, by setting these secrets rather than editing code.
const SENDER_EMAIL = Deno.env.get('BREVO_SENDER_EMAIL') ?? 'thomascrone2000@gmail.com';
const SENDER_NAME = Deno.env.get('BREVO_SENDER_NAME') ?? 'Well Windsor';

// Rate limits. Deliberately strict: this sends under the charity's domain.
const COOLDOWN_HOURS_PER_VOLUNTEER = 24;
const MAX_SENDS_PER_ORG_PER_DAY = 20;

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Escape user text before it goes anywhere near an HTML email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip CR/LF so a crafted subject can't inject extra mail headers. */
function sanitiseSubject(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim().slice(0, SUBJECT_MAX);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const brevoKey = Deno.env.get('BREVO_KEY');
  if (!brevoKey) {
    console.error('BREVO_KEY is not set');
    return json({ error: 'Email is not configured' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // --- Who is calling? -------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);

  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);
  const callerId = userData.user.id;

  // --- Input -----------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const volunteerId = typeof body.volunteer_id === 'string' ? body.volunteer_id : '';
  const opportunityId = typeof body.opportunity_id === 'string' ? body.opportunity_id : null;
  const subject = sanitiseSubject(typeof body.subject === 'string' ? body.subject : '');
  const message = (typeof body.message === 'string' ? body.message : '').trim();

  if (!volunteerId) return json({ error: 'volunteer_id is required' }, 400);
  if (!subject) return json({ error: 'A subject is required' }, 400);
  if (!message) return json({ error: 'A message is required' }, 400);
  if (message.length > MESSAGE_MAX) {
    return json({ error: `Message is too long (max ${MESSAGE_MAX} characters)` }, 400);
  }

  // Service role from here on: it must read the volunteer's email, which
  // RLS deliberately hides from the organisation.
  const admin = createClient(supabaseUrl, serviceKey);

  // --- Caller must be an APPROVED organisation --------------------------
  const { data: org } = await admin
    .from('user_profiles')
    .select('id, name, role, approved_at')
    .eq('id', callerId)
    .single();

  if (!org || org.role !== 'organization') {
    return json({ error: 'Only organisations can contact volunteers' }, 403);
  }
  // Decided 2026-09-11: an organisation cannot write to anyone until a
  // Well Windsor admin has approved it. RLS keeps unapproved organisations
  // out of the volunteer list; this is the same rule at the only other door.
  if (!org.approved_at) {
    return json({ error: 'Your organisation is awaiting approval by Well Windsor' }, 403);
  }

  // --- Target must be a volunteer --------------------------------------
  const { data: volunteer } = await admin
    .from('user_profiles')
    .select('id, name, role, public_profile')
    .eq('id', volunteerId)
    .single();

  if (!volunteer || volunteer.role !== 'volunteer') {
    return json({ error: 'Volunteer not found' }, 404);
  }

  // --- May this org contact this volunteer? ----------------------------
  // Either the volunteer applied to one of the org's opportunities, or
  // they have opted into being discoverable. Without this check, any org
  // could email any volunteer.
  const { count: applicationCount } = await admin
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', callerId)
    .eq('volunteer_id', volunteerId);

  const hasApplied = (applicationCount ?? 0) > 0;
  if (!hasApplied && !volunteer.public_profile) {
    return json({ error: 'This volunteer has not made their profile discoverable' }, 403);
  }

  // --- Addresses come from the LOGIN account, never the profile ---------
  // This used to send to user_profiles.email and reply to the org's
  // user_profiles.email. A signed-in user could rewrite that column on
  // their own row, so a throwaway volunteer pointed at a stranger's inbox,
  // plus a throwaway organisation, turned this function into a way to send
  // anyone anything under the charity's name -- the one thing the header
  // above says it cannot do. Found by the 2026-09-11 audit. The column is
  // no longer client-writable either, but the address a message goes to
  // should not depend on a grant staying correct.
  //
  // Resolved only after the permission check above, so an organisation
  // cannot use the error below to learn anything about a volunteer it
  // has no right to contact.
  //
  // auth.users.email is only proven once email confirmation is on, so an
  // unconfirmed address is refused outright rather than trusted.
  const [{ data: volAuth }, { data: orgAuth }] = await Promise.all([
    admin.auth.admin.getUserById(volunteerId),
    admin.auth.admin.getUserById(callerId),
  ]);
  const volunteerEmail = volAuth?.user?.email_confirmed_at ? volAuth.user.email : null;
  const orgEmail = orgAuth?.user?.email_confirmed_at ? orgAuth.user.email : null;

  if (!orgEmail) {
    return json({ error: 'Please confirm your email address before contacting volunteers' }, 403);
  }
  if (!volunteerEmail) {
    return json({ error: 'That volunteer has not confirmed their email address yet' }, 409);
  }

  // --- Rate limits ------------------------------------------------------
  const cooldownSince = new Date(
    Date.now() - COOLDOWN_HOURS_PER_VOLUNTEER * 60 * 60 * 1000,
  ).toISOString();

  const { count: recentToSame } = await admin
    .from('org_outreach')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', callerId)
    .eq('volunteer_id', volunteerId)
    .eq('status', 'sent')
    .gte('created_at', cooldownSince);

  if ((recentToSame ?? 0) > 0) {
    return json(
      { error: `You have already contacted this volunteer in the last ${COOLDOWN_HOURS_PER_VOLUNTEER} hours` },
      429,
    );
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday } = await admin
    .from('org_outreach')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', callerId)
    .eq('status', 'sent')
    .gte('created_at', dayAgo);

  if ((sentToday ?? 0) >= MAX_SENDS_PER_ORG_PER_DAY) {
    return json({ error: 'Daily message limit reached. Please try again tomorrow.' }, 429);
  }

  // --- Compose ----------------------------------------------------------
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeOrgName = escapeHtml(org.name ?? 'An organisation');

  const htmlContent = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px">
      <p style="margin:0 0 16px"><strong>${safeOrgName}</strong> has got in touch with you through Well Windsor.</p>
      <div style="padding:16px;border-left:3px solid #14b8a6;background:#f9fafb;margin:0 0 20px">${safeMessage}</div>
      <p style="margin:0 0 8px">Reply directly to this email to continue the conversation with them.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:13px;color:#6b7280;margin:0">
        Sent via Well Windsor, which connects volunteers with local organisations.
        Well Windsor does not vet or DBS-check organisations or volunteers, and is
        not party to any arrangement you make.
      </p>
    </div>`;

  const textContent =
    `${org.name ?? 'An organisation'} has got in touch with you through Well Windsor.\n\n` +
    `${message}\n\n` +
    `Reply directly to this email to continue the conversation with them.\n\n` +
    `---\nSent via Well Windsor. Well Windsor does not vet or DBS-check ` +
    `organisations or volunteers, and is not party to any arrangement you make.`;

  // --- Send -------------------------------------------------------------
  let providerMessageId: string | null = null;
  let sendError: string | null = null;

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: volunteerEmail, name: volunteer.name ?? undefined }],
        // The whole point: their reply goes to the org, not to us.
        replyTo: { email: orgEmail, name: org.name ?? undefined },
        subject,
        htmlContent,
        textContent,
      }),
    });

    if (!res.ok) {
      sendError = `Brevo ${res.status}: ${(await res.text()).slice(0, 500)}`;
    } else {
      const payload = await res.json().catch(() => ({}));
      providerMessageId = payload?.messageId ?? null;
    }
  } catch (e) {
    sendError = `Request failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Log both outcomes. A failed send is exactly what you want recorded.
  await admin.from('org_outreach').insert({
    org_id: callerId,
    volunteer_id: volunteerId,
    opportunity_id: opportunityId,
    subject,
    message,
    status: sendError ? 'failed' : 'sent',
    provider_message_id: providerMessageId,
    error: sendError,
  });

  if (sendError) {
    console.error('send-outreach failed', sendError);
    return json({ error: 'Could not send the message. Please try again shortly.' }, 502);
  }

  return json({ ok: true, message_id: providerMessageId });
});
