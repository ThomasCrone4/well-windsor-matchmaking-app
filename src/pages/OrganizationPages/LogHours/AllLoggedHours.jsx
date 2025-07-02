import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import WorkedMatrix from '../../../components/WorkedMatrix';

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
            volunteer:user_profiles!applications_volunteer_id_fkey1 (
              id, name, email
            ),
            opportunity:volunteer_opportunities!applications_opportunity_id_fkey (
              id, title
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase fetch error:', error);
        throw error;
      }

      return (data ?? []).filter((log) => log.application?.org_id === orgId);
    },
  });

  const mutation = useMutation({
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

    mutation.mutate({ id, logged_hours: blocks, notes });
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

  const getStatus = (log) => {
    if (log.finalized) {
      return <span className="text-green-700 font-medium">Finalised</span>;
    }
    if (!log.vol_confirmed) {
      return <span className="text-orange-600 font-medium">Pending Volunteer Confirmation</span>;
    }
    if (!log.org_confirmed) {
      return <span className="text-yellow-600 font-medium">Needs Your Confirmation</span>;
    }
    return <span className="text-gray-600">Pending Finalisation</span>;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">All Logged Hours</h1>

      {isLoading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="text-red-600">Failed to load logged hours.</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-500 italic">No volunteer hours logged yet.</p>
      ) : (
        <ul className="space-y-6">
          {logs.map((log) => {
            const totalMins = (log.logged_hours || []).reduce((acc, block) => {
              return acc + getDuration(block.start_time, block.end_time);
            }, 0);

            const volunteer = log.application?.volunteer;
            const opportunity = log.application?.opportunity;

            return (
              <li key={log.id} className="bg-white p-4 rounded border shadow-sm space-y-1">
                <h3 className="text-lg font-semibold text-blue-800">
                  {volunteer?.name || 'Unknown'} — {opportunity?.title || log.application?.subject || 'Untitled'}
                </h3>

                <p className="text-sm text-gray-600">📧 {volunteer?.email || 'No email'}</p>
                <p className="text-sm">
                  <strong>Status:</strong> {getStatus(log)}
                </p>
                <p className="text-sm">
                  <strong>Total Time:</strong>{' '}
                  <span className="text-blue-700">{formatTime(totalMins)}</span>
                </p>

                {editingId === log.id ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Edit Hour Blocks</label>
                      <WorkedMatrix
                        value={editedBlocks[log.id] || []}
                        onChange={(val) =>
                          setEditedBlocks((prev) => ({ ...prev, [log.id]: val }))
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Edit Notes</label>
                      <textarea
                        className="w-full p-2 border rounded min-h-[100px]"
                        value={editedNotes[log.id]}
                        onChange={(e) =>
                          setEditedNotes((prev) => ({ ...prev, [log.id]: e.target.value }))
                        }
                      />
                    </div>

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSave(log.id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-sm text-gray-600 underline hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm">
                      <strong>Notes:</strong>{' '}
                      {log.notes ? (
                        <span>{log.notes}</span>
                      ) : (
                        <span className="italic text-gray-500">No notes</span>
                      )}
                    </div>

                    <ul className="text-xs mt-2 space-y-0.5">
                      {log.logged_hours?.map((block, i) => (
                        <li key={i}>
                          🗓 {block.days?.join(', ') || 'N/A'} | {block.start_date} → {block.end_date} |{' '}
                          {block.start_time}–{block.end_time}
                        </li>
                      ))}
                    </ul>

                    {!log.finalized && (
                      <button
                        onClick={() => handleEdit(log)}
                        className="text-blue-600 text-sm underline mt-1"
                      >
                        Edit & Confirm
                      </button>
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
