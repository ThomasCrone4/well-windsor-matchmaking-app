// WF9-6. Organisations waiting for a decision, at the top of the admin's
// landing page.
//
// This used to be a sort order inside the Organizations tab -- unapproved
// first, in a list of every organisation that has ever signed up. The only
// part of the admin with a person waiting at the other end was the part you
// had to go looking for.
//
// Two ways out now, not one. Approving was the only exit, so an organisation
// the charity decided against sat in the queue for ever and the count beside
// it stopped meaning "things to do".
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Building } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { DeclineOrganisationDialog } from './AdminActionDialogs';

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.valueOf())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminApprovalQueue({ organisations, isLoading }) {
  const qc = useQueryClient();
  const [declining, setDeclining] = useState(null);

  // Waiting = not approved AND not declined. Declining does not change what
  // the organisation can do; it only takes it off this list.
  const waiting = (organisations ?? []).filter((o) => !o.approved_at && !o.declined_at);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-orgs'] });
    qc.invalidateQueries({ queryKey: ['admin-opportunities'] });
  };

  const approve = useMutation({
    mutationFn: async (orgId) => {
      const { error } = await supabase.rpc('set_organisation_approval', {
        p_org_id: orgId,
        p_approved: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Approved. They can publish roles now.');
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Could not approve'),
  });

  const decline = useMutation({
    mutationFn: async ({ orgId, reason }) => {
      const { error } = await supabase.rpc('decline_organisation', {
        p_org_id: orgId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Declined. They are off the list and have not been told.');
      setDeclining(null);
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Could not decline'),
  });

  return (
    <section className="space-y-4" id="approval-queue">
      <div className="card">
        <h2 className="section-title mb-2">Organisations waiting</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          An organisation cannot publish a role, be found in the volunteer
          search, or write to anyone until it is approved. This review is the
          only check between a volunteer and whoever signed up.
        </p>
      </div>

      {isLoading ? (
        <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
          Loading…
        </div>
      ) : waiting.length === 0 ? (
        <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
          Nobody is waiting. New organisations appear here when they sign up.
        </div>
      ) : (
        waiting.map((org) => (
          <div key={org.id} className="card" data-org-id={org.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building size={18} className="shrink-0" />
                  <h3
                    className="font-semibold text-lg"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {org.name}
                  </h3>
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {org.email} · signed up {fmt(org.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(org.id)}
                >
                  Approve
                </button>
                <button
                  className="btn-secondary"
                  disabled={decline.isPending}
                  onClick={() => setDeclining(org)}
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {declining && (
        <DeclineOrganisationDialog
          org={declining}
          isPending={decline.isPending}
          onClose={() => setDeclining(null)}
          onConfirm={(reason) => decline.mutate({ orgId: declining.id, reason })}
        />
      )}
    </section>
  );
}
