// ADM-1 and ADM-2/ADM-5 — the two admin actions that need an answer before
// they can go ahead: a reason for taking a role down, and a date of birth
// for making an organisation a volunteer.
//
// Not ConfirmDialog, because that closes itself on confirm whatever
// happened, and an admin who left the reason blank would lose the dialog
// and everything typed into it. Same markup and tokens, so it looks the same.
//
// Both actions are SECURITY DEFINER functions that check is_admin() and
// write the audit log themselves. Nothing here is a permission check.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MIN_VOLUNTEER_AGE, isOldEnough } from '../../utils/age';

function Dialog({ title, onClose, children, footer }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-dialog-title"
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
            id="admin-dialog-title"
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
          <button onClick={onClose} className="icon-btn icon-btn-brand p-1" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mb-6 text-sm leading-relaxed space-y-3" style={{ color: 'var(--color-text-secondary)' }}>
          {children}
        </div>
        <div className="flex gap-3 justify-end">{footer}</div>
      </div>
    </div>
  );
}

const REASON_MAX = 500;

/** ADM-1. Removal, not closing: the organisation could simply reopen a closed role. */
export function TakeDownRoleDialog({ role, orgName, isPending, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <Dialog
      title="Take this role down?"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} autoFocus>Cancel</button>
          <button
            className="btn-primary !bg-red-600 hover:!bg-red-700"
            disabled={!trimmed || reason.length > REASON_MAX || isPending}
            onClick={() => onConfirm(trimmed)}
          >
            {isPending ? 'Taking down…' : 'Take down'}
          </button>
        </>
      }
    >
      <p>
        <strong style={{ color: 'var(--color-text-primary)' }}>{role.title}</strong>
        {orgName ? ` · ${orgName}` : ''}
      </p>
      <p>
        It comes off the site straight away and <strong>cannot be put back</strong>.
        Its registrations are kept, and everyone who registered is told in the
        app that Well Windsor took it down.
      </p>
      <p>
        The organisation is <strong>not</strong> notified. If they need to know
        why, contact them directly.
      </p>
      <div className="form-row">
        <label htmlFor="take-down-reason" className="label required">
          Reason, for the audit log
        </label>
        <textarea
          id="take-down-reason"
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Not a volunteering role; reported as a scam"
        />
        <p className="help-text">
          Only admins see this. {Math.max(0, REASON_MAX - reason.length)} characters left.
        </p>
      </div>
    </Dialog>
  );
}

/** ADM-2 and ADM-5. What happens is decided in admin_switch_account_type(); this says it in words. */
export function SwitchAccountDialog({ account, toRole, isPending, onClose, onConfirm }) {
  const [dob, setDob] = useState('');
  const toVolunteer = toRole === 'volunteer';
  const dobProblem = !toVolunteer
    ? null
    : !dob
      ? 'A date of birth is required'
      : !isOldEnough(dob)
        ? `Volunteers must be ${MIN_VOLUNTEER_AGE} or over`
        : null;

  return (
    <Dialog
      title={toVolunteer ? 'Make this a volunteer account?' : 'Make this an organisation account?'}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} autoFocus>Cancel</button>
          <button
            className="btn-primary"
            disabled={!!dobProblem || isPending}
            onClick={() => onConfirm(toVolunteer ? dob : null)}
          >
            {isPending ? 'Switching…' : toVolunteer ? 'Make volunteer' : 'Make organisation'}
          </button>
        </>
      }
    >
      <p>
        <strong style={{ color: 'var(--color-text-primary)' }}>{account.name}</strong>
        {account.email ? ` · ${account.email}` : ''}
      </p>

      {toVolunteer ? (
        <ul className="list-disc pl-5 space-y-1">
          <li>Its <strong>live roles close now</strong>, and everyone registered on them is told. Drafts are kept.</li>
          <li>It stops being an approved organisation. Switching back later means approving it again.</li>
          <li>Messages it sent and received stay in the logs.</li>
        </ul>
      ) : (
        <ul className="list-disc pl-5 space-y-1">
          <li>It starts <strong>waiting for approval</strong>, like any new organisation.</li>
          <li>Their registrations are <strong>withdrawn</strong>: kept on record, hidden from the organisations, who are not told.</li>
          <li>
            Their date of birth, phone number, bio and skills are
            <strong> cleared</strong>, because organisation profiles are visible to
            other people. Their name will be visible too.
          </li>
          <li>Messages they sent and received stay in the logs.</li>
        </ul>
      )}

      {toVolunteer && (
        <div className="form-row">
          <label htmlFor="switch-dob" className="label required">Date of birth</label>
          <input
            id="switch-dob"
            type="date"
            className={`input ${dob && dobProblem ? 'input-invalid' : ''}`}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          {dob && dobProblem
            ? <p className="error-text">{dobProblem}</p>
            : <p className="help-text">Ask the person. Volunteers must be {MIN_VOLUNTEER_AGE} or over.</p>}
        </div>
      )}
    </Dialog>
  );
}
