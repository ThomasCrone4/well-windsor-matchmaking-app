import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import { useState } from 'react';
import toast from 'react-hot-toast';
import WorkedMatrix from '../../../components/WorkedMatrix';

export default function OpportunityLoggedHoursPage() {
  const { id: opportunityId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editedBlocks, setEditedBlocks] = useState({});
  const [editedNotes, setEditedNotes] = useState({});

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['loggedHoursByOpportunity', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select(`
          id,
          volunteer_id,
          logged_hours,
          notes,
          confirmed_by,
          created_at,
          volunteer:user_profiles (
            name,
            email
          )
        `)
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, logged_hours, notes }) => {
      const { error } = await supabase
        .from('volunteer_hours')
        .update({
          logged_hours,
          notes,
          confirmed_by: false, // reset confirmation
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Hours updated — awaiting volunteer confirmation');
      queryClient.invalidateQueries(['loggedHoursByOpportunity', opportunityId]);
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update hours'),
  });

  const handleEdit = (log) => {
    setEditingId(log.id);
    setEditedBlocks({ ...editedBlocks, [log.id]: log.logged_hours });
    setEditedNotes({ ...editedNotes, [log.id]: log.notes || '' });
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded shadow-sm transition"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-center flex-1">Logged Hours</h1>
        <div className="w-20" />
      </div>

      {isLoading ? (
        <p>Loading logged hours...</p>
      ) : error ? (
        <p className="text-red-600 text-center">Failed to load logs.</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-500 italic text-center">No hours logged yet for this opportunity.</p>
      ) : (
        <ul className="space-y-6">
          {logs.map((log) => (
            <li key={log.id} className="border rounded shadow-sm bg-white p-4 space-y-2">
              <h3 className="text-lg font-semibold text-blue-800">
                {log.volunteer?.name || 'Unknown Volunteer'}
              </h3>
              <p className="text-sm text-gray-600">
                📧 {log.volunteer?.email || 'No contact'}
              </p>

              {editingId === log.id ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Edit Hour Blocks</label>
                    <WorkedMatrix
                      value={editedBlocks[log.id] || []}
                      onChange={(val) =>
                        setEditedBlocks({ ...editedBlocks, [log.id]: val })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Edit Notes</label>
                    <textarea
                      className="w-full p-2 border rounded min-h-[100px]"
                      value={editedNotes[log.id]}
                      onChange={(e) =>
                        setEditedNotes({ ...editedNotes, [log.id]: e.target.value })
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
                  <p className="text-sm text-gray-700">
                    <strong>Status:</strong>{' '}
                    {log.confirmed_by ? (
                      <span className="text-green-700 font-medium">Confirmed</span>
                    ) : (
                      <span className="text-orange-600 font-medium">Pending Volunteer Confirmation</span>
                    )}
                  </p>

                  <div className="text-sm">
                    <strong>Notes:</strong>{' '}
                    {log.notes ? (
                      <span>{log.notes}</span>
                    ) : (
                      <span className="italic text-gray-500">No notes provided</span>
                    )}
                  </div>

                  <div className="text-sm">
                    <strong>Worked Blocks:</strong>{' '}
                    <pre className="bg-gray-50 p-2 rounded text-xs whitespace-pre-wrap">{JSON.stringify(log.logged_hours, null, 2)}</pre>
                  </div>

                  <button
                    onClick={() => handleEdit(log)}
                    className="text-blue-600 text-sm underline"
                  >
                    Edit
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
