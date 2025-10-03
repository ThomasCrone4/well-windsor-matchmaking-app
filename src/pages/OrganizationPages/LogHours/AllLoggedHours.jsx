import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import WorkedMatrix from '../../../components/WorkedMatrix';
import '../../../index.css';
import { Trash2, Edit2, CheckCircle } from 'lucide-react';

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
          total_minutes,
          created_at,
          vol_confirmed,
          org_confirmed,
          finalized,
          application:applications (
            id,
            opportunity_id,
            org_id,
            subject,
            volunteer:user_profiles!applications_volunteer_id_fkey ( id, name, email ),
            opportunity:volunteer_opportunities!applications_opportunity_id_fkey ( id, title )
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

  // ---------- Edit & Confirm (org edits → vol must reconfirm) ----------
  const editMutation = useMutation({
    mutationFn: async ({ id, logged_hours, notes }) => {
      const { error } = await supabase
        .from('volunteer_hours')
        .update({
          logged_hours,
          notes,
          org_confirmed: true,
          vol_confirmed: false,
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

  // ---------- Confirm as-is (finalise if volunteer already confirmed) ----------
  const confirmMutation = useMutation({
    mutationFn: async ({ id, finalizeNow }) => {
      const { error } = await supabase
        .from('volunteer_hours')
        .update({
          org_confirmed: true,
          finalized: finalizeNow ? true : false,
        })
        .eq('id', id);
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this log entry?')) return;
    const { data, error } = await supabase
      .from('volunteer_hours')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) toast.error('Delete failed');
    else if (!data || data.length === 0) toast.error('Delete blocked by policy or not found');
    else {
      toast.success('Entry deleted');
      queryClient.invalidateQueries(['orgAllLoggedHours', orgId]);
    }
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
    const finalizeNow = !!log.vol_confirmed;
    const ok = window.confirm(
      finalizeNow
        ? 'Confirm these hours? The volunteer has already confirmed — this will FINALISE the entry.'
        : 'Confirm these hours without edits? The volunteer will still need to confirm.'
    );
    if (!ok) return;
    confirmMutation.mutate({ id: log.id, finalizeNow });
  };

  // ---------- Time helpers (same logic as volunteer page) ----------
  const parseYMD = (s) => {
    if (!s) return null;
    const [y, m, d] = String(s).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const minutesBetweenTimes = (start, end) => {
    try {
      const [sh, sm] = String(start).split(':').map(Number);
      const [eh, em] = String(end).split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const diff = endMins - startMins;
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  };

  const DAY_TO_IDX = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };

  const countOccurrencesInRange = (startDateStr, endDateStr, days = []) => {
    const start = parseYMD(startDateStr);
    if (!start) return 0;
    const end = parseYMD(endDateStr) || start;
    if (end < start) return 0;

    const wanted = new Set(days.map((d) => DAY_TO_IDX[d]).filter((n) => n >= 0));
    if (wanted.size === 0) return 0;

    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (wanted.has(cursor.getDay())) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  };

  const minutesForBlock = (block) => {
    const perDay = minutesBetweenTimes(block.start_time, block.end_time);
    if (perDay <= 0) return 0;
    const occurrences = countOccurrencesInRange(block.start_date, block.end_date, block.days || []);
    return perDay * occurrences;
  };

  const formatTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (log) => {
    if (log.finalized) return <span className="badge badge-success">Finalised</span>;
    if (!log.org_confirmed) return <span className="badge badge-warning">Needs Your Confirmation</span>;
    if (!log.vol_confirmed) return <span className="badge badge-info">Pending Volunteer Confirmation</span>;
    return <span className="badge badge-neutral">Pending Finalisation</span>;
  };

  /** ---------------- Grouping ---------------- */
  const grouped = useMemo(() => {
    const needsOrg = [];
    const waitingVol = [];
    const finalised = [];
    for (const log of logs) {
      if (log.finalized) finalised.push(log);
      else if (!log.org_confirmed) needsOrg.push(log);
      else if (!log.vol_confirmed) waitingVol.push(log);
    }
    return { needsOrg, waitingVol, finalised };
  }, [logs]);

  /** ---------------- Card renderer (matches volunteer layout) ---------------- */
  const LogCard = ({ log }) => {
    const totalMinutes =
      typeof log.total_minutes === 'number' && !Number.isNaN(log.total_minutes)
        ? log.total_minutes
        : (log.logged_hours || []).reduce((acc, block) => acc + minutesForBlock(block), 0);

    const volunteer = log.application?.volunteer;
    const opportunity = log.application?.opportunity;

    return (
      <div className="card space-y-2 mb-4">
        {/* Header row: title | centered status | actions on right */}
        <div className="grid items-center grid-cols-[auto_1fr_auto] gap-3">
          <h3 className="card-title">
            {volunteer?.name || 'Unknown'} — {opportunity?.title || log.application?.subject || 'Untitled'}
          </h3>

          <div className={log.finalized ? 'flex items-center gap-2 justify-self-end' : 'flex justify-center'}>
            {getStatusBadge(log)}
          </div>

          {!log.finalized ? (
            <div className="flex items-center gap-2 justify-self-end">
              {/* ✅ Green tick — confirm without changes */}
              {!isEditing && !log.org_confirmed && (
                <button
                  aria-label="Confirm as-is"
                  onClick={() => handleConfirmNoChange(log)}
                  className="icon-btn icon-btn-success"
                  title={
                    log.vol_confirmed
                      ? 'Confirm these hours (both agreed → finalise)'
                      : 'Confirm these hours (volunteer still needs to approve)'
                  }
                >
                  <CheckCircle size={18} />
                </button>
              )}

              {/* ✏️ Edit & Confirm path */}
              <button
                aria-label="Edit hours"
                onClick={() => handleEdit(log)}
                className="icon-btn icon-btn-brand"
                title="Edit these hours (volunteer must reconfirm)"
              >
                <Edit2 size={18} />
              </button>

              <button
                aria-label="Delete"
                onClick={() => handleDelete(log.id)}
                className="icon-btn icon-btn-danger"
                title="Delete this entry"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>

        <p className="muted caption">📧 {volunteer?.email || 'No email'}</p>
        <p className="text">
          ⏱ {log.logged_hours?.length || 0} block(s) — <strong>Total: {formatTime(totalMinutes)}</strong>
        </p>

        {editingId === log.id ? (
          <>
            <div className="field">
              <label className="label">Edit Hour Blocks</label>
              <WorkedMatrix
                value={editedBlocks[log.id] || []}
                onChange={(val) => setEditedBlocks((prev) => ({ ...prev, [log.id]: val }))}
              />
            </div>

            <div className="field">
              <label className="label">Edit Notes</label>
              <textarea
                className="textarea"
                value={editedNotes[log.id]}
                onChange={(e) => setEditedNotes((prev) => ({ ...prev, [log.id]: e.target.value }))}
                placeholder="Optional context for these hours…"
              />
            </div>

            <div className="flex items-center gap-2 justify-end mt-2">
              <button
                onClick={() => handleSave(log.id)}
                className="btn btn-primary"
                disabled={editMutation.isPending}
                title="Save changes and request volunteer confirmation"
              >
                Save
              </button>
              <button onClick={() => setEditingId(null)} className="btn btn-ghost" title="Cancel editing">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text">
              <strong>Notes:</strong>{' '}
              {log.notes ? <span>{log.notes}</span> : <span className="muted italic">No notes</span>}
            </div>

            <div className="stack">
              {(log.logged_hours || []).map((block, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3">
                  <p>
                    <strong>Days:</strong> {block.days?.length ? block.days.join(', ') : 'N/A'}
                  </p>
                  <p>
                    <strong>Date:</strong> {block.start_date || 'N/A'} → {block.end_date || 'N/A'}
                  </p>
                  <p>
                    <strong>Time:</strong> {block.start_time || 'N/A'} → {block.end_time || 'N/A'}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderList = (heading, list) => {
    if (!list || list.length === 0) return null;
    return (
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="section-title mt-6 mb-2 text-left">{heading}</h2>
          <span className="caption muted">
            {list.length} item{list.length === 1 ? '' : 's'}
          </span>
        </div>
        {list.map((log) => (
          <LogCard key={log.id} log={log} />
        ))}
      </section>
    );
  };

  return (
    <div className="container-app max-w-3xl py-8">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary" type="button">
          ← Back
        </button>
      <h1 className="title">All Logged Hours</h1>
      <div className="spacer" />
      </div>

      {isLoading ? (
        <div className="card"><p className="muted">Loading…</p></div>
      ) : error ? (
        <div className="card"><p className="error-text">Failed to load logged hours.</p></div>
      ) : logs.length === 0 ? (
        <div className="card"><p className="muted italic">No volunteer hours logged yet.</p></div>
      ) : (
        <>
          {renderList('Needs Your Confirmation', grouped.needsOrg)}
          {renderList('Waiting Volunteer Confirmation', grouped.waitingVol)}
          {renderList('Finalised', grouped.finalised)}
        </>
      )}
    </div>
  );
}
