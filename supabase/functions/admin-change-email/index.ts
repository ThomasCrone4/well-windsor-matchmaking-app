// admin-change-email
//
// ADM-8. The fallback for someone locked out of BOTH their old and new
// addresses, where ACC-8's double confirmation cannot help them.
//
// This is deliberately the weaker route and is treated as such. An admin
// asked by email to change an address has no way to verify the request --
// that is not a check, it is a person who can be talked into it once. So:
// admin-only, always logged with who did it and both addresses, and it
// refuses to touch an admin account.
//
// Changing auth.users.email needs the service role, which is why this cannot
// be a database function: the auth admin API keeps identities in step, and
// writing the column directly would not.

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

// Deliberately simple. The address is checked properly by the auth API; this
// only rejects the obviously malformed before anything is logged.
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 320;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);

  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);
  const callerId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const targetId = typeof body.user_id === 'string' ? body.user_id : '';
  const newEmail = (typeof body.new_email === 'string' ? body.new_email : '').trim().toLowerCase();
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

  if (!targetId) return json({ error: 'user_id is required' }, 400);
  if (!looksLikeEmail(newEmail)) return json({ error: 'That does not look like an email address' }, 400);
  if (!reason) return json({ error: 'A reason is required, and it is recorded' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // --- The caller must be an admin --------------------------------------
  // Checked with the service role rather than by reading `admins` as the
  // caller: the self-read policy means a non-admin's own query returns
  // nothing either way, and "no rows" must not be mistakable for "allowed".
  const { data: adminRow } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', callerId)
    .maybeSingle();

  if (!adminRow) return json({ error: 'Admins only' }, 403);

  // --- Not another admin, and not yourself ------------------------------
  if (targetId === callerId) {
    return json(
      { error: 'Change your own address from your profile page, where both addresses are confirmed.' },
      400,
    );
  }

  const { data: targetIsAdmin } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', targetId)
    .maybeSingle();

  if (targetIsAdmin) {
    return json({ error: 'An admin account cannot have its email changed this way.' }, 409);
  }

  // --- Do it -------------------------------------------------------------
  const { data: before } = await admin.auth.admin.getUserById(targetId);
  const oldEmail = before?.user?.email ?? null;
  if (!oldEmail) return json({ error: 'No such account' }, 404);

  if (oldEmail.toLowerCase() === newEmail) {
    return json({ error: 'That is already their address' }, 400);
  }

  // email_confirm: the whole point of this route is that the person cannot
  // reach either inbox, so requiring them to confirm would defeat it. That is
  // exactly why it is admin-only and logged.
  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, {
    email: newEmail,
    email_confirm: true,
  });

  if (updErr) {
    console.error('admin-change-email failed', updErr);
    return json({ error: updErr.message || 'Could not change the address' }, 502);
  }

  // Logged only after it actually happened, so the record cannot claim a
  // change that failed.
  const { error: logErr } = await admin.rpc('record_admin_email_change', {
    p_admin_id: callerId,
    p_user_id: targetId,
    p_old_email: oldEmail,
    p_new_email: newEmail,
    p_reason: reason,
  });

  if (logErr) console.error('record_admin_email_change failed', logErr);

  return json({ ok: true, old_email: oldEmail, new_email: newEmail, logged: !logErr });
});
