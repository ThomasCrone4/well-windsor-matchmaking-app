// ListLogHours.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import '../../../index.css';
import WorkedMatrix from '../../../components/WorkedMatrix';
import { Edit2, Trash2, CheckCircle } from 'lucide-react';

export default function ListLogHours() {
  const [userId, setUserId] = useState(null);

  // inline edit state
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
      setUserId(data.user.id);
    };
    fetchUser();
  }, []);

  const { data: loggedHours = [], isLoading, error } = useQuery({
    queryKey: ['loggedHours', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select(`
          id,
          application_id,
          notes,
          logged_hours,
          total_minutes,
          total_hours,
          created_at,
          vol_confirmed,
          org_confirmed,
          finalized,
          application:applications (
            opportunity_title,
            subject,
            volunteer_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).filter((entry) => entry.application?.volunteer_id === userId);
    },
  });

  // ---------- Volunteer inline edit (vol edits → org must reconfirm) ----------
  const editMutation = useMutation({
    mutationFn: async ({ id, logged_hours, notes }) => {
      const { error } = await supabase
        .from('volunteer_hours')
        .update({
          logged_hours,
          notes,
          vol_confirmed: true,   // volunteer confirming their proposal
          org_confirmed: false,  // org must reconfirm
          finalized: false,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Hours updated — awaiting organisation confirmation');
      queryClient.invalidateQueries(['loggedHours', userId]);
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update hours'),
  });

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
      queryClient.invalidateQueries(['loggedHours', userId]);
    }
  };

  // ✅ Volunteer confirms their hours (finalise if org already confirmed)
  const handleVolunteerConfirm = async (entry) => {
    const ok = window.confirm(
      entry.org_confirmed
        ? 'Confirm these hours? The organisation has already confirmed — this will FINALISE the entry.'
        : 'Confirm these hours? The organisation will still need to approve.'
    );
    if (!ok) return;

    const finalizeNow = !!entry.org_confirmed;

    const { error } = await supabase
      .from('volunteer_hours')
      .update({
        vol_confirmed: true,
        finalized: finalizeNow,
      })
      .eq('id', entry.id);

    if (error) {
      toast.error('Failed to confirm hours');
    } else {
      toast.success(finalizeNow ? 'Hours finalised' : 'Confirmed — awaiting organisation');
      queryClient.invalidateQueries(['loggedHours', userId]);
    }
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setEditedBlocks((prev) => ({ ...prev, [entry.id]: entry.logged_hours || [] }));
    setEditedNotes((prev) => ({ ...prev, [entry.id]: entry.notes || '' }));
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

  /** ---------------- Time + occurrence helpers ---------------- */
  const parseYMD = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
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
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
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

  const formatTotalTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (entry) => {
    if (entry.finalized) {
      return <span className="badge badge-success">Finalised</span>;
    }
    if (!entry.org_confirmed) {
      return <span className="badge badge-warning">Awaiting Organisation Approval</span>;
    }
    if (!entry.vol_confirmed) {
      return <span className="badge badge-info">Needs Your Confirmation</span>;
    }
    return <span className="badge badge-neutral">Pending Finalisation</span>;
  };

  /** ---------------- Grouping ---------------- */
  const grouped = useMemo(() => {
    const theyApprove = [];
    const waitingOrg = [];
    const finalised = [];

    for (const e of loggedHours) {
      if (e.finalized) {
        finalised.push(e);
      } else if (!e.vol_confirmed) {
        theyApprove.push(e); // volunteer must confirm
      } else if (!e.org_confirmed || (e.org_confirmed && e.vol_confirmed && !e.finalized)) {
        waitingOrg.push(e);
      }
    }

    return { theyApprove, waitingOrg, finalised };
  }, [loggedHours]);

  /** ---------------- Card renderer ---------------- */
  const EntryCard = ({ entry }) => {
    const title =
      entry.application?.opportunity_title ||
      entry.application?.subject ||
      'Untitled Opportunity';

    const totalMinutes =
      typeof entry.total_minutes === 'number'
        ? entry.total_minutes
        : (entry.logged_hours || []).reduce((acc, block) => acc + minutesForBlock(block), 0);

    const isEditing = editingId === entry.id;

    return (
      <div className="card space-y-2 mb-4">
        {/* Header row */}
        <div className="grid items-center grid-cols-[auto_1fr_auto] gap-3">
          <h3 className="card-title">{title}</h3>

          <div
            className={
              entry.finalized
                ? 'flex items-center gap-2 justify-self-end'
                : 'flex justify-center'
            }
          >
            {getStatusBadge(entry)}
          </div>

          {/* Top-right actions */}
          {!entry.finalized ? (
            <div className="flex items-center gap-2 justify-self-end">
              {/* HIDE confirm while editing */}
              {!isEditing && !entry.vol_confirmed && (
                <button
                  aria-label="Confirm hours"
                  onClick={() => handleVolunteerConfirm(entry)}
                  className="icon-btn icon-btn-success"
                  title={
                    entry.org_confirmed
                      ? 'Confirm these hours (both agreed → finalise)'
                      : 'Confirm these hours (organisation still needs to approve)'
                  }
                >
                  <CheckCircle size={18} />
                </button>
              )}

              {!isEditing && (
                <button
                  aria-label="Edit"
                  onClick={() => handleEdit(entry)}
                  className="icon-btn icon-btn-brand"
                  title="Edit these hours (organisation must reconfirm)"
                >
                  <Edit2 size={18} />
                </button>
              )}

              <button
                aria-label="Delete"
                onClick={() => handleDelete(entry.id)}
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

        {/* Meta + Totals */}
        <p className="muted caption">Logged on: {format(parseISO(entry.created_at), 'PPP')}</p>
        <p className="text">
          ⏱ {entry.logged_hours?.length || 0} block(s) — <strong>Total: {formatTotalTime(totalMinutes)}</strong>
        </p>

        {/* Body */}
        {isEditing ? (
          <>
            <div className="field">
              <label className="label">Edit Hour Blocks</label>
              <WorkedMatrix
                value={editedBlocks[entry.id] || []}
                onChange={(val) =>
                  setEditedBlocks((prev) => ({ ...prev, [entry.id]: val }))
                }
              />
            </div>

            <div className="field">
              <label className="label">Edit Notes</label>
              <textarea
                className="textarea"
                value={editedNotes[entry.id]}
                onChange={(e) =>
                  setEditedNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))
                }
                placeholder="Optional context for these hours…"
              />
            </div>

            {/* Bottom action row (Save/Cancel) */}
            <div className="flex items-center gap-2 justify-end mt-2">
              <button
                onClick={() => handleSave(entry.id)}
                className="btn btn-primary btn-sm"
                disabled={editMutation.isPending}
                title="Save changes and request organisation confirmation"
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="btn btn-ghost btn-sm"
                title="Cancel editing"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text">
              <strong>Notes:</strong>{' '}
              {entry.notes ? (
                <span>{entry.notes}</span>
              ) : (
                <span className="muted italic">No notes</span>
              )}
            </div>

            <div className="stack">
              {(entry.logged_hours || []).map((block, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3">
                  <p>
                    <strong>Days:</strong>{' '}
                    {block.days?.length ? block.days.join(', ') : 'N/A'}
                  </p>
                  <p>
                    <strong>Date:</strong> {block.start_date || 'N/A'} →{' '}
                    {block.end_date || 'N/A'}
                  </p>
                  <p>
                    <strong>Time:</strong> {block.start_time || 'N/A'} →{' '}
                    {block.end_time || 'N/A'}
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
        {list.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </section>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="page-header">
        <h1 className="title">Your Logged Hours</h1>
        <button onClick={() => navigate('/volunteer/log-hours/new')} className="btn btn-primary">
          + Log New Hours
        </button>
      </div>

      {isLoading ? (
        <p className="muted">Loading...</p>
      ) : error ? (
        <p className="error-text">Failed to load logged hours.</p>
      ) : loggedHours.length === 0 ? (
        <p className="muted italic">No hours logged yet.</p>
      ) : (
        <>
          {renderList('Need Your Confirmation', grouped.theyApprove)}
          {renderList('Awaiting Organisation Approval', grouped.waitingOrg)}
          {renderList('Finalised', grouped.finalised)}
        </>
      )}
    </div>
  );
}
