// delete-account
//
// ACC-6. Required by UK GDPR before launch.
//
// The browser cannot delete an auth user, so this runs with the service role.
// It deletes ONLY the caller's own account: the id comes from the caller's
// verified session and is never taken from the request body, so there is no
// parameter anyone can point at somebody else.
//
// Order matters. prepare_account_deletion() writes the permanent record and
// redacts it BEFORE the user row goes, because deleting the user cascades
// org_outreach, applications, availability, notifications and (for an
// organisation) its roles. audit_logs has no foreign keys to any of it, which
// is what lets the dated record outlive the person — see ADM-4.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // --- Who is calling? --------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);

  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);

  // The only id this function will ever act on.
  const callerId = userData.user.id;

  // --- Confirmation -----------------------------------------------------
  // Deliberately not a bare POST. The client sends back the word shown in the
  // dialog, so a stray request — a retried fetch, a curious probe with a
  // borrowed token — cannot delete an account by accident.
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // an empty body is fine; it simply fails the check below
  }
  if (body.confirm !== 'DELETE') {
    return json({ error: 'Deletion was not confirmed' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // An admin deleting themselves would leave the charity with no way in, and
  // there is exactly one admin row today. Refuse and say why.
  const { data: adminRow } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', callerId)
    .maybeSingle();

  if (adminRow) {
    return json(
      { error: 'An admin account cannot be deleted from here. Ask another admin to remove your admin access first.' },
      409,
    );
  }

  // --- Preserve, then redact, then delete --------------------------------
  const { data: summary, error: prepErr } = await admin.rpc('prepare_account_deletion', {
    p_user_id: callerId,
  });

  if (prepErr) {
    console.error('prepare_account_deletion failed', prepErr);
    return json({ error: 'Could not prepare the account for deletion.' }, 500);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(callerId);

  if (delErr) {
    // The log already says the account was deleted, and it was not. Say so
    // rather than leaving the record lying.
    console.error('deleteUser failed', delErr);
    await admin.rpc('record_audit_event', {
      p_action_type: 'account_deletion_failed',
      p_actor_kind: 'system',
      p_target_user_id: callerId,
      p_target_table: 'user_profiles',
      p_metadata: { error: String(delErr.message ?? delErr).slice(0, 300) },
    });
    return json({ error: 'Could not delete the account. Please try again shortly.' }, 500);
  }

  return json({ ok: true, ...(summary as Record<string, unknown>) });
});
