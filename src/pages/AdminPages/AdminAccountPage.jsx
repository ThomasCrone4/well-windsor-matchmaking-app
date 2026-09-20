// WF9-7. One person, one page: /admin/accounts/:id
//
// The admin's per-person actions were scattered across the list screens --
// approve on the Organisations tab, switch account type on two different
// tabs, change a login email nowhere at all (ADM-8's function has existed
// and been tested since workflow 3 and never had a screen). And the
// volunteer list's "View" button pointed at /volunteers/<id>, a route that
// does not exist, so the catch-all quietly sent the admin to the home page.
//
// Deleting an account is here too, and it is the point of WF8-6: deleting
// someone from the Supabase dashboard skips prepare_account_deletion(), so
// the preserved outreach record, the audit-log redaction and the outbox
// blanking never run -- quietly breaking three things the privacy policy
// promises. admin_delete_account() runs the same preparation as
// self-deletion, in one transaction, logged with who did it and why.
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { supabase } from '../../utils/supabase';
import AdminNav from './AdminNav';
import { SwitchAccountDialog, DeclineOrganisationDialog } from './AdminActionDialogs';
import AdminDeleteAccountDialog from './AdminDeleteAccountDialog';
import AdminChangeEmailDialog from './AdminChangeEmailDialog';

function fmt(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.valueOf())) return '—';
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
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
      <span
        className="mt-0.5 block text-sm break-words"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {children ?? '—'}
      </span>
    </div>
  );
}

export default function AdminAccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [switching, setSwitching] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);

  const account = useQuery({
    queryKey: ['admin_account', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_account_overview', {
        p_user_id: id,
      });
      if (error) throw error;
      return data;
    },
    // No retry. The function raises P0002 for an account that does not
    // exist -- a stale link, or one just deleted -- and retrying that three
    // times leaves the page on "Loading…" for several seconds before
    // admitting it. A not-found will not become a found.
    retry: false,
  });

  const history = useQuery({
    queryKey: ['admin_account_history', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_account_history', {
        p_user_id: id,
        p_limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin_account', id] });
    qc.invalidateQueries({ queryKey: ['admin_account_history', id] });
    qc.invalidateQueries({ queryKey: ['admin-orgs'] });
    qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
  };

  const approval = useMutation({
    mutationFn: async (approved) => {
      const { error } = await supabase.rpc('set_organisation_approval', {
        p_org_id: id,
        p_approved: approved,
      });
      if (error) throw error;
    },
    onSuccess: (_d, approved) => {
      toast.success(approved ? 'Approved.' : 'Approval withdrawn. Its roles are off the browse.');
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Could not change approval'),
  });

  const decline = useMutation({
    mutationFn: async (reason) => {
      const { error } = await supabase.rpc('decline_organisation', {
        p_org_id: id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Declined. They are off the waiting list and have not been told.');
      setDeclining(false);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Could not decline'),
  });

  const switchType = useMutation({
    mutationFn: async ({ toRole, dob }) => {
      const { error } = await supabase.rpc('admin_switch_account_type', {
        p_user_id: id,
        p_new_role: toRole,
        p_dob: dob || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Account type changed.');
      setSwitching(null);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Could not change the account type'),
  });

  const remove = useMutation({
    mutationFn: async (reason) => {
      const { data, error } = await supabase.rpc('admin_delete_account', {
        p_user_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Account deleted, and the record kept.');
      setDeleting(false);
      // Nothing left to show on this page.
      navigate('/admin/manage');
    },
    onError: (e) => toast.error(e.message || 'Could not delete the account'),
  });

  if (account.isPending) {
    return (
      <div className="container-app max-w-5xl mx-auto px-4 py-8">
        <AdminNav />
        <div className="card" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>
      </div>
    );
  }

  if (account.error) {
    return (
      <div className="container-app max-w-5xl mx-auto px-4 py-8">
        <AdminNav />
        <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="empty-title">Could not open this account</p>
          <p className="empty-desc">{account.error.message}</p>
          <Link to="/admin/manage" className="btn-secondary mt-4">Back to the lists</Link>
        </div>
      </div>
    );
  }

  const a = account.data ?? {};
  const isOrg = a.role === 'organization';
  const pending = isOrg && !a.approved_at;

  return (
    <div className="container-app max-w-5xl mx-auto px-4 py-8" id="main-content">
      <AdminNav />

      <div className="mb-6">
        <Link to="/admin/manage" className="btn-secondary btn-sm">&larr; Back to the lists</Link>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="title !mb-1">{a.name}</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {/* UK spelling on screen, US in the data. */}
              {isOrg ? 'Organisation' : 'Volunteer'}
              {a.is_admin ? ' · administrator' : ''}
              {isOrg && a.approved_at ? ' · approved' : ''}
              {pending && a.declined_at ? ' · declined' : ''}
              {pending && !a.declined_at ? ' · waiting for approval' : ''}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field term="Login email">{a.email}</Field>
          <Field term="Email confirmed">
            {a.email_confirmed_at ? fmt(a.email_confirmed_at) : 'Not confirmed'}
          </Field>
          <Field term="Last signed in">{fmt(a.last_sign_in_at, true)}</Field>
          <Field term="Joined">{fmt(a.created_at)}</Field>
          <Field term="Home town">{a.home_town}</Field>
          <Field term="Phone">{a.contact_number}</Field>
          {!isOrg && <Field term="Date of birth">{fmt(a.dob)}</Field>}
          {!isOrg && (
            <Field term="Discoverable">{a.public_profile ? 'Yes' : 'No'}</Field>
          )}
          {isOrg && <Field term="Approved">{fmt(a.approved_at)}</Field>}
        </dl>

        {(a.bio || a.skills) && (
          <dl className="mt-4 grid gap-4">
            {a.bio && <Field term="Bio">{a.bio}</Field>}
            {a.skills && <Field term="Skills">{a.skills}</Field>}
          </dl>
        )}
      </div>

      {/* What they have on the site. Counts, with links to the lists that
          already show the rows -- a per-person copy of every list is a
          second place for the same query to drift. */}
      <div className="card mt-4">
        <h2 className="section-title mb-3">On the site</h2>
        <dl className="grid gap-4 sm:grid-cols-4">
          {isOrg ? (
            <>
              <Field term="Roles posted">{a.roles_posted}</Field>
              <Field term="Live now">{a.roles_live}</Field>
              <Field term="Messages sent">{a.messages_sent}</Field>
            </>
          ) : (
            <>
              <Field term="Registrations">{a.registrations}</Field>
              <Field term="Messages received">{a.messages_received}</Field>
            </>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/admin/manage" className="btn-secondary btn-sm">
            {isOrg ? 'Their roles, in the Opportunities list' : 'All volunteers'}
          </Link>
          <Link to="/admin/logs" className="btn-secondary btn-sm">Message log</Link>
        </div>
      </div>

      {/* The actions, gathered. */}
      <div className="card mt-4">
        <h2 className="section-title mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {isOrg && !a.approved_at && (
            <>
              <button
                className="btn-primary btn-sm"
                disabled={approval.isPending}
                onClick={() => approval.mutate(true)}
              >
                Approve
              </button>
              <button
                className="btn-secondary btn-sm"
                disabled={decline.isPending}
                onClick={() => setDeclining(true)}
              >
                Decline
              </button>
            </>
          )}
          {isOrg && a.approved_at && (
            <button
              className="btn-secondary btn-sm"
              disabled={approval.isPending}
              onClick={() => approval.mutate(false)}
            >
              Withdraw approval
            </button>
          )}

          <button
            className="btn-secondary btn-sm"
            onClick={() => setChangingEmail(true)}
          >
            Change login email
          </button>

          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              setSwitching({
                account: a,
                toRole: isOrg ? 'volunteer' : 'organization',
              })
            }
          >
            Make {isOrg ? 'a volunteer' : 'an organisation'}
          </button>

          <button
            className="btn-secondary btn-sm"
            style={{ color: 'var(--color-danger)' }}
            onClick={() => setDeleting(true)}
          >
            Delete account
          </button>
        </div>
        {a.is_admin && (
          <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            This is an administrator. Their account cannot be deleted from here
            until their admin access is revoked, on the Access page.
          </p>
        )}
      </div>

      {/* Their history. Redacted entries still appear -- the dated record
          outliving the personal data is the point of ADM-4. */}
      <div className="card mt-4">
        <h2 className="section-title mb-3">History</h2>
        {history.isPending ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
        ) : (history.data ?? []).length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Nothing recorded against this account yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {(history.data ?? []).map((h) => (
              <li
                key={h.id}
                className="rounded-lg p-3"
                style={{ backgroundColor: 'var(--color-background-secondary)' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {h.action_type}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {fmt(h.created_at, true)}
                    {h.actor_name ? ` · ${h.actor_name}` : ''}
                    {h.actor_kind ? ` (${h.actor_kind})` : ''}
                    {h.redacted_at ? ' · redacted' : ''}
                  </span>
                </div>
                {h.reason && (
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {h.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {declining && (
        <DeclineOrganisationDialog
          org={a}
          isPending={decline.isPending}
          onClose={() => setDeclining(false)}
          onConfirm={(reason) => decline.mutate(reason)}
        />
      )}
      {switching && (
        <SwitchAccountDialog
          account={switching.account}
          toRole={switching.toRole}
          isPending={switchType.isPending}
          onClose={() => setSwitching(null)}
          onConfirm={(dob) => switchType.mutate({ toRole: switching.toRole, dob })}
        />
      )}
      {deleting && (
        <AdminDeleteAccountDialog
          account={a}
          isPending={remove.isPending}
          onClose={() => setDeleting(false)}
          onConfirm={(reason) => remove.mutate(reason)}
        />
      )}
      {changingEmail && (
        <AdminChangeEmailDialog
          account={a}
          onClose={() => setChangingEmail(false)}
          onChanged={() => {
            setChangingEmail(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
