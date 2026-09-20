// ADM-3, which has existed since workflow 1 and never had a screen.
//
// Two logs, deliberately separate. An organisation writing to a volunteer is
// a message between two people; an automatic email is the system talking.
// They keep different things for different lengths of time, and they are
// read for different reasons -- one when someone complains about a message,
// the other when an email did not arrive.
//
// Both come from admin-only SECURITY DEFINER functions rather than from the
// tables. email_outbox has NO client grants at all, by design, so there is
// no policy that would let a browser read it; org_outreach does have an
// admin policy, but the address the message ACTUALLY went to lives in
// auth.users, which a browser cannot reach either.
//
// Message text sits behind "Show message": an admin scanning the list for a
// failure should not have private correspondence on screen, and anyone
// walking past should not read it over their shoulder.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import Pagination from '../../components/Pagination';

const PER_PAGE = 50;

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.valueOf())
    ? '—'
    : d.toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
}

function StatusPill({ status }) {
  const bad = status === 'failed' || status === 'abandoned' || status === 'error';
  const held = status === 'held';
  return (
    <span
      className="px-2 py-1 text-xs font-medium rounded-full"
      style={{
        backgroundColor: bad
          ? 'var(--color-danger-soft, #fee2e2)'
          : held
            ? 'var(--color-background-secondary)'
            : 'var(--color-background-secondary)',
        color: bad ? 'var(--color-danger, #991b1b)' : 'var(--color-text-secondary)',
      }}
    >
      {status ?? 'unknown'}
    </span>
  );
}

/** One row's message, hidden until asked for. */
function ShowMessage({ subject, body }) {
  const [open, setOpen] = useState(false);
  if (!body && !subject) {
    return (
      <p className="text-sm italic" style={{ color: 'var(--color-text-muted)' }}>
        No message text kept.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide message' : 'Show message'}
      </button>
      {open && (
        <div
          className="mt-2 rounded-lg p-3 text-sm whitespace-pre-line"
          style={{
            backgroundColor: 'var(--color-background-secondary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {subject && (
            <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {subject}
            </p>
          )}
          {body || <em>No body.</em>}
        </div>
      )}
    </div>
  );
}

function Field({ term, children }) {
  return (
    <div>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.1em] block"
        style={{
          color: 'var(--color-text-muted)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        }}
      >
        {term}
      </span>
      <span className="mt-0.5 block text-sm break-words" style={{ color: 'var(--color-text-primary)' }}>
        {children ?? '—'}
      </span>
    </div>
  );
}

function CappedNotice({ shown, total }) {
  if (!total || total <= shown) return null;
  return (
    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
      Showing the {shown} most recent of {total}. Older entries are not loaded.
    </p>
  );
}

export default function AdminEmailLogs() {
  const [tab, setTab] = useState('outreach');

  const outreach = useQuery({
    queryKey: ['admin_outreach_log'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_outreach_log', { p_limit: 500 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const emails = useQuery({
    queryKey: ['admin_email_log'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_email_log', { p_limit: 500 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [outreachPage, setOutreachPage] = useState(1);
  const [emailPage, setEmailPage] = useState(1);

  const oRows = outreach.data ?? [];
  const eRows = emails.data ?? [];

  const oPages = Math.max(1, Math.ceil(oRows.length / PER_PAGE));
  const ePages = Math.max(1, Math.ceil(eRows.length / PER_PAGE));
  const oPage = Math.min(outreachPage, oPages);
  const ePage = Math.min(emailPage, ePages);
  const oVisible = oRows.slice((oPage - 1) * PER_PAGE, oPage * PER_PAGE);
  const eVisible = eRows.slice((ePage - 1) * PER_PAGE, ePage * PER_PAGE);

  const TabBtn = ({ id, children, count }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'}`}
    >
      {children}
      {count !== undefined && (
        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white bg-opacity-20">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <section className="space-y-4">
      <div className="card">
        <h2 className="section-title mb-2">Email log</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Everything the site has sent. Messages between an organisation and a
          volunteer are kept until the account is deleted; the content of
          automatic emails is blanked 30 days after sending, so older entries
          show what was sent and to whom but not what it said.
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Message text is hidden until you ask for it. It is private
          correspondence, and this page says so in the privacy policy.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <TabBtn id="outreach" count={oRows.length}>Messages to volunteers</TabBtn>
        <TabBtn id="automatic" count={eRows.length}>Automatic emails</TabBtn>
      </div>

      {tab === 'outreach' && (
        <>
          {outreach.isPending ? (
            <div className="card" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>
          ) : outreach.error ? (
            <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
              <p className="empty-title">Could not load the message log</p>
              <p className="empty-desc">{outreach.error.message}</p>
            </div>
          ) : oRows.length === 0 ? (
            <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
              No organisation has written to a volunteer yet.
            </div>
          ) : (
            <>
              <CappedNotice shown={oRows.length} total={Number(oRows[0]?.total_count ?? 0)} />
              {oVisible.map((r) => (
                <div key={r.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {r.org_name || 'Unknown organisation'} &rarr;{' '}
                      {r.volunteer_name || 'Unknown volunteer'}
                    </p>
                    <StatusPill status={r.status} />
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field term="Sent">{fmt(r.created_at)}</Field>
                    <Field term="Address it went to">{r.to_email}</Field>
                    <Field term="About the role">{r.opportunity_title}</Field>
                  </dl>
                  {r.error && (
                    <p className="mt-2 text-sm" style={{ color: 'var(--color-danger, #991b1b)' }}>
                      {r.error}
                    </p>
                  )}
                  <ShowMessage subject={r.subject} body={r.message} />
                </div>
              ))}
              <Pagination
                page={oPage}
                pageCount={oPages}
                onChange={setOutreachPage}
                total={oRows.length}
                perPage={PER_PAGE}
                noun="message"
              />
            </>
          )}
        </>
      )}

      {tab === 'automatic' && (
        <>
          {emails.isPending ? (
            <div className="card" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>
          ) : emails.error ? (
            <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
              <p className="empty-title">Could not load the email log</p>
              <p className="empty-desc">{emails.error.message}</p>
            </div>
          ) : eRows.length === 0 ? (
            <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
              Nothing in the outbox. Automatic emails appear here as they are queued.
            </div>
          ) : (
            <>
              <CappedNotice shown={eRows.length} total={Number(eRows[0]?.total_count ?? 0)} />
              {eVisible.map((r) => (
                <div key={r.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {r.template}
                    </p>
                    <StatusPill status={r.status} />
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                    <Field term="Queued">{fmt(r.created_at)}</Field>
                    <Field term="Sent">{fmt(r.sent_at)}</Field>
                    <Field term="Recipient">
                      {r.to_email || (r.redacted_at ? <em>blanked after 30 days</em> : '—')}
                    </Field>
                    <Field term="Attempts">{r.attempts ?? 0}</Field>
                  </dl>
                  {r.subject && (
                    <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {r.subject}
                    </p>
                  )}
                  {r.last_error && (
                    <p className="mt-2 text-sm" style={{ color: 'var(--color-danger, #991b1b)' }}>
                      {r.last_error}
                    </p>
                  )}
                </div>
              ))}
              <Pagination
                page={ePage}
                pageCount={ePages}
                onChange={setEmailPage}
                total={eRows.length}
                perPage={PER_PAGE}
                noun="email"
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
