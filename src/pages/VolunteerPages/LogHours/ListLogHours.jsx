import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import '../../../index.css';
import { Edit2, Trash2 } from 'lucide-react';

export default function ListLogHours() {
  const [userId, setUserId] = useState(null);
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

  const { data: loggedHours = [], isLoading } = useQuery({
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
            direction,
            volunteer_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).filter((entry) => entry.application?.volunteer_id === userId);
    },
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
        // volunteer still needs to approve (even if org hasn't yet)
        theyApprove.push(e);
      } else if (!e.org_confirmed || (e.org_confirmed && e.vol_confirmed && !e.finalized)) {
        // org hasn't confirmed OR both confirmed but waiting finalisation
        waitingOrg.push(e);
      }
    }

    return {
      theyApprove,
      waitingOrg,
      finalised,
    };
  }, [loggedHours]);

  /** ---------------- Card renderer ---------------- */

  const EntryCard = ({ entry }) => {
    const title =
      entry.application?.direction === 'to_volunteer'
        ? entry.application?.subject || 'Untitled Opportunity'
        : entry.application?.opportunity_title || 'Untitled Opportunity';

    const totalMinutes =
      typeof entry.total_minutes === 'number'
        ? entry.total_minutes
        : (entry.logged_hours || []).reduce((acc, block) => acc + minutesForBlock(block), 0);

    return (
      <div className="card space-y-2 mb-4">
        <div className="grid items-center grid-cols-[auto_1fr_auto] gap-3">
          <h3 className="card-title">{title}</h3>

          <div className="flex justify-center">{getStatusBadge(entry)}</div>

          {!entry.finalized ? (
            <div className="flex items-center gap-2 justify-self-end">
              <button
                aria-label="Edit"
                onClick={() => navigate(`/volunteer/log-hours/edit/${entry.id}`)}
                className="icon-btn hover:text-brand-teal"
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                aria-label="Delete"
                onClick={() => handleDelete(entry.id)}
                className="icon-btn icon-btn-danger"
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>

        <p className="muted caption">Logged on: {format(parseISO(entry.created_at), 'PPP')}</p>
        <p className="text">
          ⏱ {entry.logged_hours?.length || 0} block(s) — <strong>Total: {formatTotalTime(totalMinutes)}</strong>
        </p>

        <div className="stack">
          {(entry.logged_hours || []).map((block, i) => (
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

        {entry.notes && <p className="muted italic">“{entry.notes}”</p>}
      </div>
    );
  };

  const renderList = (heading, list) => {
    if (!list || list.length === 0) return null;
    return (
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="section-title mt-6 mb-2 text-left">{heading}</h2>
          <span className="caption muted">{list.length} item{list.length === 1 ? '' : 's'}</span>
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
