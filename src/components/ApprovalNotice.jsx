// Shown to an organisation that a Well Windsor admin has not approved yet.
//
// Decided 2026-09-11: a new organisation can sign up and save drafts, but
// cannot publish a role, browse volunteers or contact anyone until it is
// approved. That is enforced in the database and in send-outreach -- this
// component only explains it, so a pending organisation is told why a
// button is disabled instead of meeting an RLS error.
//
// The check itself lives in utils/approval.js.

export default function ApprovalNotice({ children }) {
  return (
    <div
      role="status"
      className="mb-6 rounded-2xl px-5 py-4 text-sm"
      style={{
        backgroundColor: 'var(--color-background-secondary)',
        borderLeft: '3px solid var(--color-brand)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Your organisation is waiting for approval
      </p>
      <p className="mt-1">
        {children ??
          'Well Windsor reviews every organisation before it can publish roles or contact volunteers. You can save drafts in the meantime, and they will be ready to post the moment you are approved.'}
      </p>
    </div>
  );
}
