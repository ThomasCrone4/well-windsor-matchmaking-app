import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import WorkedMatrix from '../../../components/WorkedMatrix';
import '../../../index.css';

export default function OrgLoggedHoursPage() {
  const [orgId, setOrgId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editedBlocks, setEditedBlocks] = useState({});
  const [editedNotes, setEditedNotes] = useState({});
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        toast.error('Not logged in');
        return;
      }
      setOrgId(data.user.id);
    };
    fetchUser();
  }, []);

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['orgAllLoggedHours', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select(`
          id,
          logged_hours,
          notes,
          created_at,
          vol_confirmed,
          org_confirmed,
          finalized,
          application:applications (
            id,
            opportunity_id,
            org_id,
            subject,
            volunteer:user_profiles!applications_volunteer_id_fkey (
              id, name, email
            ),
            opportunity:volunteer_opportunities!applications_opportunity_id_fkey (
              id, title
            )
          )
        `)
        .eq('application.org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase fetch error:', error);
        throw error;
      }

      return (data ?? []).filter((log) => log.application?.org_id === orgId);
    },
  });

  // Edit-&-Confirm path: org changes anything → vol must reconfirm
  const editMutation = useMutation({
    mutationFn: async ({ id, logged_hours, notes }) => {
      const { error } = await supabase
        .from('volunteer_hours')
        .update({
          logged_hours,
          notes,
          org_confirmed: true,     // org has confirmed their edited version
          vol_confirmed: false,    // force volunteer to reconfirm after edits
          finalized: false,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Hours updated — awaiting volunteer confirmation');
      queryClient.invalidateQueries(['orgAllLoggedHours', orgId]);
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update hours'),
  });

  // Confirm-without-changes path: if volunteer already confirmed → finalize now
  const confirmMutation = useMutation({
    mutationFn: async ({ id, finalizeNow }) => {
      const payload = {
        org_confirmed: true,
        finalized: finalizeNow ? true : false,
      };
      // If finalised now, keep vol_confirmed as-is (already true); no other changes
      const { error } = await supabase.from('volunteer_hours').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.finalizeNow ? 'Hours finalised' : 'Confirmed — awaiting volunteer');
      queryClient.invalidateQueries(['orgAllLoggedHours', orgId]);
    },
    onError: () => toast.error('Failed to confirm hours'),
  });

  const handleEdit = (log) => {
    setEditingId(log.id);
    setEditedBlocks((prev) => ({ ...prev, [log.id]: log.logged_hours }));
    setEditedNotes((prev) => ({ ...prev, [log.id]: log.notes || '' }));
  };

  const handleSave = (id) => {
    const blocks = editedBlocks[id];
    const notes = editedNotes[id]?.trim() || '';
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      toast.error('Hour blocks required');
      return;
    }
    editMutation.mutate({ id, logged_hours: blocks, notes });
  };

  const handleConfirmNoChange = (log) => {
    if (log.finalized) return;
    const finalizeNow = !!log.vol_confirmed; // if vol already confirmed, both sides now agree → finalize
    confirmMutation.mutate({ id: log.id, finalizeNow });
  };

  const getDuration = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(eh * 60 + em - (sh * 60 + sm), 0);
  };

  const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (log) => {
    if (log.finalized) {
      return <span className="badge badge-success">Finalised</span>;
    }
    if (!log.org_confirmed) {
      return <span className="badge badge-warning">Needs Your Confirmation</span>;
    }
    if (!log.vol_confirmed) {
      return <span className="badge badge-info">Pending Volunteer Confirmation</span>;
    }
    return <span className="badge badge-neutral">Pending Finalisation</span>;
  };

  return (
    <div className="container-app max-w-5xl py-8">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary" type="button">
          ← Back
        </button>
        <h1 className="title">All Logged Hours</h1>
        <div className="spacer" />
      </div>

      {isLoading ? (
        <div className="card">
          <p className="muted">Loading…</p>
        </div>
      ) : error ? (
        <div className="card">
          <p className="error-text">Failed to load logged hours.</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="card">
          <p className="muted italic">No volunteer hours logged yet.</p>
        </div>
      ) : (
        <ul className="stack">
          {logs.map((log) => {
            const totalMins = (log.logged_hours || []).reduce((acc, block) => {
              return acc + getDuration(block.start_time, block.end_time);
            }, 0);

            const volunteer = log.application?.volunteer;
            const opportunity = log.application?.opportunity;

            return (
              <li key={log.id} className="card space-y-3">
                {/* Header row: title | status badge */}
                <div className="grid items-center grid-cols-[1fr_auto] gap-3">
                  <h3 className="card-title">
                    {volunteer?.name || 'Unknown'} —{' '}
                    {opportunity?.title || log.application?.subject || 'Untitled'}
                  </h3>
                  <div>{getStatusBadge(log)}</div>
                </div>

                <p className="caption muted">📧 {volunteer?.email || 'No email'}</p>

                <p className="text">
                  <strong>Total Time:</strong>{' '}
                  <span className="highlight">{formatTime(totalMins)}</span>
                </p>

                {editingId === log.id ? (
                  <>
                    {/* Edit form */}
                    <div className="field">
                      <label className="label">Edit Hour Blocks</label>
                      <WorkedMatrix
                        value={editedBlocks[log.id] || []}
                        onChange={(val) =>
                          setEditedBlocks((prev) => ({ ...prev, [log.id]: val }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label className="label">Edit Notes</label>
                      <textarea
                        className="textarea"
                        value={editedNotes[log.id]}
                        onChange={(e) =>
                          setEditedNotes((prev) => ({ ...prev, [log.id]: e.target.value }))
                        }
                        placeholder="Optional context for these hours…"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(log.id)}
                        className="btn btn-primary"
                        disabled={editMutation.isPending}
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn btn-ghost">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text">
                      <strong>Notes:</strong>{' '}
                      {log.notes ? (
                        <span>{log.notes}</span>
                      ) : (
                        <span className="muted italic">No notes</span>
                      )}
                    </div>

                    <ul className="stack-sm caption">
                      {log.logged_hours?.map((block, i) => (
                        <li key={i} className="text">
                          🗓 {block.days?.length ? block.days.join(', ') : 'N/A'} |{' '}
                          {block.start_date || 'N/A'} → {block.end_date || 'N/A'} |{' '}
                          {block.start_time || 'N/A'}–{block.end_time || 'N/A'}
                        </li>
                      ))}
                    </ul>

                    {!log.finalized && (
                      <div className="empty-cta flex gap-2 flex-wrap">
                        {/* Path A: confirm as-is */}
                        {!log.org_confirmed && (
                          <button
                            onClick={() => handleConfirmNoChange(log)}
                            className="btn btn-primary btn-sm"
                            disabled={confirmMutation.isPending}
                            title={
                              log.vol_confirmed
                                ? 'Volunteer already confirmed — this will finalise'
                                : 'Confirm these hours without changes'
                            }
                          >
                            {log.vol_confirmed ? 'Confirm' : 'Confirm (no changes)'}
                          </button>
                        )}

                        {/* Path B: edit & confirm (vol must reconfirm) */}
                        <button
                          onClick={() => handleEdit(log)}
                          className="btn btn-outline btn-sm"
                          disabled={editMutation.isPending}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
