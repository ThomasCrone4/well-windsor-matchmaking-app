import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import WorkedMatrix from '../../../components/WorkedMatrix';

export default function EditLoggedHoursPage() {
  const { id: logId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [log, setLog] = useState(null);
  const [hourBlocks, setHourBlocks] = useState([]);
  const [notes, setNotes] = useState('');

  const { isLoading } = useQuery({
    queryKey: ['logEntry', logId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select(`
          id,
          logged_hours,
          notes,
          vol_confirmed,
          org_confirmed,
          finalized,
          application:applications (
            id,
            opportunity_id
          )
        `)
        .eq('id', logId)
        .single();

      if (error) throw error;
      setLog(data);
      setHourBlocks(data.logged_hours || []);
      setNotes(data.notes || '');
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ logged_hours, notes, finalized, vol_confirmed, org_confirmed }) => {
      const { error } = await supabase
        .from('volunteer_hours')
        .update({
          logged_hours,
          notes,
          finalized,
          vol_confirmed,
          org_confirmed
        })
        .eq('id', logId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Hours confirmed');
      queryClient.invalidateQueries(['loggedHoursByOpportunity', log?.application?.opportunity_id]);
      queryClient.invalidateQueries(['loggedHours']);
      navigate(`/opportunity/${log?.application?.opportunity_id}/logged-hours`);
    },
    onError: () => toast.error('Failed to update hours'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!hourBlocks.length) return toast.error('Add at least one block');

    const existingBlocks = JSON.stringify(log.logged_hours || []);
    const currentBlocks = JSON.stringify(hourBlocks);
    const notesChanged = (notes.trim() || '') !== (log.notes?.trim() || '');

    const contentChanged = existingBlocks !== currentBlocks || notesChanged;

    mutation.mutate({
      logged_hours: hourBlocks,
      notes: notes.trim(),
      vol_confirmed: true,
      org_confirmed: contentChanged ? false : true,
      finalized: !contentChanged
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="relative mb-6">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-center">Edit & Confirm Hours</h1>
      </div>

      {isLoading || !log ? (
        <p>Loading...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded shadow">
          <div>
            <label className="block font-medium text-sm mb-1">Worked Blocks</label>
            <WorkedMatrix value={hourBlocks} onChange={setHourBlocks} />
          </div>

          <div>
            <label className="block font-medium text-sm mb-1">Notes (optional)</label>
            <textarea
              className="w-full p-2 border rounded min-h-[100px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Confirm & Save
          </button>
        </form>
      )}
    </div>
  );
}
