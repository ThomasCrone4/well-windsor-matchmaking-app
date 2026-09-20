// WF9-7, closing WF8-6.
//
// Deleting someone from the Supabase dashboard skips
// prepare_account_deletion(), so the preserved outreach record, the
// audit-log redaction and the email-outbox blanking never happen -- three
// things the privacy policy promises. This dialog calls
// admin_delete_account(), which does the preparation and the delete in one
// transaction: either the person is gone and the record is written, or
// nothing happened.
//
// It asks for the word DELETE for the same reason the self-service flow
// does: a stray click on an irreversible action should not be enough.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const REASON_MAX = 500;

export default function AdminDeleteAccountDialog({ account, isPending, onClose, onConfirm }) {
  const ref = useRef(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const trimmed = reason.trim();
  const ready = !!trimmed && confirm === 'DELETE' && !isPending;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isOrg = account?.role === 'organization';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-delete-title"
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
            id="admin-delete-title"
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Delete this account?
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
            {account?.email ? ` · ${account.email}` : ''}
          </p>
          <p>
            This <strong>cannot be undone</strong>. It removes their profile
            {isOrg
              ? ', every role they posted and the registrations on those roles'
              : ', their registrations and the messages they were sent'}
            .
          </p>
          <p>
            A dated record is kept: which organisation wrote to whom, when, and
            whether it sent. Names, addresses and message text are removed from
            it. That record is what lets the charity answer a question about a
            message later without keeping the message.
          </p>
          <p>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              Use this rather than the Supabase dashboard.
            </strong>{' '}
            Deleting there skips all of the above.
          </p>

          <div className="form-row">
            <label htmlFor="admin-delete-reason" className="label required">
              Reason, for the audit log
            </label>
            <textarea
              id="admin-delete-reason"
              className="input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. They asked us by email to delete their account"
            />
            <p className="help-text">
              Only admins see this. {Math.max(0, REASON_MAX - reason.length)} characters left.
            </p>
          </div>

          <div className="form-row">
            <label htmlFor="admin-delete-confirm" className="label required">
              Type DELETE to confirm
            </label>
            <input
              id="admin-delete-confirm"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose} autoFocus>Cancel</button>
          <button
            className="btn-primary !bg-red-600 hover:!bg-red-700"
            disabled={!ready || reason.length > REASON_MAX}
            onClick={() => onConfirm(trimmed)}
          >
            {isPending ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
