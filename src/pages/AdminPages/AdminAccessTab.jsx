// APP-3 and APP-6 — who hears about waiting organisations, and who is an admin.
//
// Both lists are deliberately thin over the database. The rules that matter
// are enforced there: hello@wellwindsor.org.uk cannot be removed or paused by
// any route, and nobody can remove their own admin access. This screen shows
// those rules rather than implementing them, so working around the page gets
// you nowhere.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { format, parseISO, isValid } from 'date-fns';
import { ShieldAlert, Lock } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import ConfirmDialog from '../../components/ConfirmDialog';

function fmt(value) {
  if (!value) return '';
  const d = parseISO(value);
  return isValid(d) ? format(d, 'PP') : '';
}

async function getRecipients() {
  const { data, error } = await supabase
    .from('notification_recipients')
    .select('id,email,name,is_permanent,paused_at,created_at')
    .order('is_permanent', { ascending: false })
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

async function getAdmins() {
  const { data, error } = await supabase.rpc('list_admins');
  if (error) throw error;
  return data ?? [];
}

async function findAccountByEmail(email) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,name,email,role')
    .ilike('email', email.trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default function AdminAccessTab({ currentUserId }) {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const { data: recipients, isPending: recipientsPending } = useQuery({
    queryKey: ['notification-recipients'],
    queryFn: getRecipients,
  });
  const { data: admins, isPending: adminsPending } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: getAdmins,
  });

  const invalidate = (key) => () => qc.invalidateQueries({ queryKey: [key] });

  const addRecipient = useMutation({
    mutationFn: async (email) => {
      const { error } = await supabase
        .from('notification_recipients')
        .insert({ email: email.trim().toLowerCase(), added_by: currentUserId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Added to the list'); setNewEmail(''); invalidate('notification-recipients')(); },
    onError: (e) => toast.error(e.message || 'Could not add that address'),
  });

  const setPaused = useMutation({
    mutationFn: async ({ id, paused }) => {
      const { error } = await supabase
        .from('notification_recipients')
        .update({ paused_at: paused ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_r, { paused }) => { toast.success(paused ? 'Paused' : 'Resumed'); invalidate('notification-recipients')(); },
    onError: (e) => toast.error(e.message || 'Could not change that address'),
  });

  const removeRecipient = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('notification_recipients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Removed from the list'); invalidate('notification-recipients')(); },
    onError: (e) => toast.error(e.message || 'Could not remove that address'),
  });

  const addAdmin = useMutation({
    mutationFn: async (email) => {
      const account = await findAccountByEmail(email);
      if (!account) throw new Error('No account signs in with that address');
      const { error } = await supabase.rpc('grant_admin', { p_user_id: account.id });
      if (error) throw error;
      return account;
    },
    onSuccess: (account) => {
      toast.success(`${account.name ?? 'That account'} is now an admin`);
      setAdminEmail('');
      invalidate('admin-accounts')();
    },
    onError: (e) => toast.error(e.message || 'Could not add that admin'),
  });

  const revokeAdminMut = useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase.rpc('revoke_admin', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Admin access removed'); invalidate('admin-accounts')(); },
    onError: (e) => toast.error(e.message || 'Could not remove that admin'),
  });

  return (
    <section className="space-y-6">
      {/* ---------------------------------------------------------- APP-3 */}
      <div className="card">
        <h2 className="section-title mb-2">Who is told an organisation is waiting</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Everyone on this list is emailed when an organisation signs up, and
          when a problem is reported. Admins are also told in the app.
        </p>
      </div>

      {recipientsPending ? (
        <div className="card" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>
      ) : (
        (recipients ?? []).map((r) => {
          const paused = !!r.paused_at;
          return (
            <div key={r.id} className="card" style={{ opacity: paused ? 0.6 : 1 }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {r.is_permanent && (
                    <Lock
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="font-medium break-all" style={{ color: 'var(--color-text-primary)' }}>
                    {r.email}
                  </span>
                  {paused && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'var(--color-background-secondary)',
                                   color: 'var(--color-text-secondary)' }}>
                      PAUSED
                    </span>
                  )}
                </div>

                {r.is_permanent ? (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Always on the list — cannot be removed or paused
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={setPaused.isPending}
                      onClick={() => setPaused.mutate({ id: r.id, paused: !paused })}
                    >
                      {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={removeRecipient.isPending}
                      onClick={() => removeRecipient.mutate(r.id)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              {!r.is_permanent && r.created_at && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  Added {fmt(r.created_at)}
                </p>
              )}
            </div>
          );
        })
      )}

      <div className="card">
        <label className="label" htmlFor="new-recipient">Add an address</label>
        <div className="flex flex-wrap gap-2 mt-1">
          <input
            id="new-recipient"
            type="email"
            className="input flex-1 min-w-[16rem]"
            placeholder="name@example.org"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!newEmail.trim() || addRecipient.isPending}
            onClick={() => addRecipient.mutate(newEmail)}
          >
            Add
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- APP-6 */}
      <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
        <h2 className="section-title mb-2 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" style={{ color: 'var(--color-danger)' }} aria-hidden="true" />
          Admin accounts
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          An admin sees and can change <strong>every</strong> account on Well
          Windsor — including approving organisations, reading problem reports
          and changing someone&rsquo;s sign-in email. Add people you would trust
          with all of it.
        </p>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
          You cannot remove your own admin access, so the last admin cannot lock
          everybody out.
        </p>
      </div>

      {adminsPending ? (
        <div className="card" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>
      ) : (
        (admins ?? []).map((a) => {
          const isSelf = a.user_id === currentUserId;
          return (
            <div key={a.user_id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {a.name ?? 'Unnamed account'}
                    {isSelf && (
                      <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-sm break-all" style={{ color: 'var(--color-text-secondary)' }}>
                    {a.email ?? '—'}
                  </p>
                </div>
                {isSelf ? (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    You cannot remove your own access
                  </span>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={revokeAdminMut.isPending}
                    onClick={() => setConfirmRevoke(a)}
                  >
                    Remove admin access
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      <div className="card">
        <label className="label" htmlFor="new-admin">Make an existing account an admin</label>
        <div className="flex flex-wrap gap-2 mt-1">
          <input
            id="new-admin"
            type="email"
            className="input flex-1 min-w-[16rem]"
            placeholder="The address they sign in with"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!adminEmail.trim() || addAdmin.isPending}
            onClick={() => addAdmin.mutate(adminEmail)}
          >
            Make admin
          </button>
        </div>
        <p className="help-text mt-2">
          They need a Well Windsor account already. This does not create one.
        </p>
      </div>

      <ConfirmDialog
        isOpen={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => {
          revokeAdminMut.mutate(confirmRevoke.user_id);
          setConfirmRevoke(null);
        }}
        title="Remove admin access?"
        message={
          <span>
            <strong>{confirmRevoke?.name ?? 'This account'}</strong> will lose
            access to the admin dashboard straight away. Their Well Windsor
            account itself is not affected, and you can make them an admin
            again later.
          </span>
        }
        confirmText="Remove admin access"
        cancelText="Keep it"
        confirmStyle="danger"
      />
    </section>
  );
}
