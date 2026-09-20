// ADM-8, which has existed and been proven end to end since workflow 3 and
// has never had a screen. The Edge Function `admin-change-email` does the
// work: it checks is_admin itself, requires a reason, and records the change
// through record_admin_email_change().
//
// It uses admin.updateUserById, which -- unlike the user-facing
// PUT /auth/v1/user that ACC-8 uses -- is NOT deliverability-validated. That
// is why ADM-8 can be tested with `.invalid` throwaways and ACC-8 cannot.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../utils/supabase';

export default function AdminChangeEmailDialog({ account, onClose, onChanged }) {
  const ref = useRef(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trimmedEmail = email.trim();
  const trimmedReason = reason.trim();
  const ready = trimmedEmail.includes('@') && !!trimmedReason && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-email', {
        body: { user_id: account.id, new_email: trimmedEmail, reason: trimmedReason },
      });
      if (error) {
        // supabase-js hides the server's message in error.context, the same
        // way outreach.js has to read it (WF8).
        let detail = error.message;
        try {
          const body = await error.context?.json?.();
          if (body?.error) detail = body.error;
        } catch {
          // keep the generic message
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      toast.success('Login email changed.');
      onChanged();
    } catch (e) {
      toast.error(e.message || 'Could not change the email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-email-title"
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="rounded-lg shadow-2xl max-w-md w-full p-6"
        style={{
          backgroundColor: 'var(--color-background-elevated)',
          border: '1px solid var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2
            id="admin-email-title"
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Change the login email
          </h2>
          <button onClick={onClose} className="icon-btn icon-btn-brand p-1" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="mb-6 text-sm leading-relaxed space-y-3"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <p>
            <strong style={{ color: 'var(--color-text-primary)' }}>{account?.name}</strong>
            {account?.email ? ` · currently ${account.email}` : ''}
          </p>
          <p>
            This changes the address they sign in with, and it takes effect at
            once. They are not asked to confirm it, so only do this when you
            know the new address is theirs.
          </p>

          <div className="form-row">
            <label htmlFor="admin-new-email" className="label required">New login email</label>
            <input
              id="admin-new-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="their.new.address@example.org"
              autoComplete="off"
            />
          </div>

          <div className="form-row">
            <label htmlFor="admin-email-reason" className="label required">
              Reason, for the audit log
            </label>
            <textarea
              id="admin-email-reason"
              className="input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. They emailed us; their old address no longer works"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose} autoFocus>Cancel</button>
          <button className="btn-primary" disabled={!ready} onClick={submit}>
            {busy ? 'Changing…' : 'Change email'}
          </button>
        </div>
      </div>
    </div>
  );
}
