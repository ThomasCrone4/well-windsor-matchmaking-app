// ACC-6 — delete your account.
//
// The confirmation has to make the consequence plain, and for an organisation
// the consequence reaches past its own data: deleting it cascades its roles
// and every registration volunteers made to them. The client cannot count
// those itself — RLS hides other people's rows — so account_deletion_summary()
// reports them, for the signed-in user and nobody else.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../utils/supabase';
import ConfirmDialog from './ConfirmDialog';

async function fetchSummary() {
  const { data, error } = await supabase.rpc('account_deletion_summary');
  if (error) throw error;
  return data;
}

function Line({ children }) {
  return (
    <li style={{ color: 'var(--color-text-secondary)' }} className="text-sm">
      {children}
    </li>
  );
}

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  // Defaulted rather than guarded on isLoading: a disabled or in-flight query
  // reports isLoading false in v5, and this must never render undefined.
  const { data } = useQuery({ queryKey: ['deletion-summary'], queryFn: fetchSummary });
  const s = data ?? {};
  const isOrg = s.role === 'organization';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      // The account is gone; the session that remains points at nothing.
      await supabase.auth.signOut();
      toast.success('Your account has been deleted.');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Account deletion failed:', err);
      toast.error(err?.message || 'Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  const consequences = (
    <div className="flex flex-col gap-3">
      <p>
        This cannot be undone. Your profile, your sign-in and everything below
        is removed straight away.
      </p>
      <ul className="list-disc pl-5 flex flex-col gap-1">
        {isOrg ? (
          <>
            <Line>
              <strong>{s.roles_posted ?? 0}</strong>{' '}
              {s.roles_posted === 1 ? 'role you posted' : 'roles you posted'} — taken
              off the site
            </Line>
            <Line>
              <strong>{s.registrations_received ?? 0}</strong>{' '}
              {s.registrations_received === 1 ? 'registration' : 'registrations'}{' '}
              volunteers made to those roles — removed, and they are not told
            </Line>
            <Line>
              <strong>{s.messages_sent ?? 0}</strong>{' '}
              {s.messages_sent === 1 ? 'message' : 'messages'} you sent to
              volunteers — removed from your records
            </Line>
          </>
        ) : (
          <>
            <Line>
              <strong>{s.registrations_made ?? 0}</strong>{' '}
              {s.registrations_made === 1 ? 'role you registered for' : 'roles you registered for'} —
              the organisations stop seeing you
            </Line>
            <Line>
              <strong>{s.messages_received ?? 0}</strong>{' '}
              {s.messages_received === 1 ? 'message' : 'messages'} organisations
              sent you — removed from our records
            </Line>
            <Line>Your availability and your notifications</Line>
          </>
        )}
      </ul>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Emails already sent cannot be recalled, and we keep a dated record that
        they were sent — with your name, address and the text removed.
      </p>
    </div>
  );

  return (
    <section
      className="card mt-8"
      style={{ borderColor: 'var(--color-danger)' }}
      aria-labelledby="delete-account-heading"
    >
      <h2
        id="delete-account-heading"
        className="section-title"
        style={{ color: 'var(--color-danger)' }}
      >
        Delete your account
      </h2>

      <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
        {isOrg
          ? 'Removes your organisation, your roles and the registrations made to them. This cannot be undone.'
          : 'Removes your profile, your registrations and your availability. This cannot be undone.'}
      </p>

      <button
        type="button"
        className="btn btn-danger btn-sm mt-4"
        onClick={() => setOpen(true)}
        disabled={deleting}
      >
        {deleting ? 'Deleting…' : 'Delete my account'}
      </button>

      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDelete}
        title="Delete your account?"
        message={consequences}
        confirmText="Delete my account"
        cancelText="Keep my account"
        confirmStyle="danger"
      />
    </section>
  );
}
