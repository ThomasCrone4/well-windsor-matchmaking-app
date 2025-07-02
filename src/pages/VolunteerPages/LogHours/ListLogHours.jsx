import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

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

      return data.filter((entry) => entry.application?.volunteer_id === userId);
    },
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this log entry?')) return;
    const { error } = await supabase.from('volunteer_hours').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else {
      toast.success('Entry deleted');
      queryClient.invalidateQueries(['loggedHours', userId]);
    }
  };

  const getBlockDurationMinutes = (start, end) => {
    try {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      return Math.max((eh * 60 + em) - (sh * 60 + sm), 0);
    } catch {
      return 0;
    }
  };

  const formatTotalTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (entry) => {
    if (entry.finalized) {
      return (
        <span className="text-xs font-medium px-2 py-1 rounded bg-green-100 text-green-700">
          Finalised
        </span>
      );
    }

    if (!entry.org_confirmed) {
      return (
        <span className="text-xs font-medium px-2 py-1 rounded bg-yellow-100 text-yellow-700">
          Awaiting Organisation
        </span>
      );
    }

    if (!entry.vol_confirmed) {
      return (
        <span className="text-xs font-medium px-2 py-1 rounded bg-orange-100 text-orange-700">
          Needs Your Confirmation
        </span>
      );
    }

    return (
      <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-700">
        Pending Finalisation
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Logged Hours</h1>
        <button
          onClick={() => navigate('/volunteer/log-hours/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Log New Hours
        </button>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : loggedHours.length === 0 ? (
        <p className="text-gray-500 italic">No hours logged yet.</p>
      ) : (
        loggedHours.map((entry) => {
          const title =
            entry.application?.direction === 'to_volunteer'
              ? entry.application?.subject || 'Untitled Opportunity'
              : entry.application?.opportunity_title || 'Untitled Opportunity';

          const totalMinutes = (entry.logged_hours || []).reduce((acc, block) => {
            return acc + getBlockDurationMinutes(block.start_time, block.end_time);
          }, 0);

          return (
            <div
              key={entry.id}
              className="bg-white p-4 rounded border shadow-sm space-y-2 mb-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">{title}</h3>
                {getStatusBadge(entry)}
              </div>

              <p className="text-sm text-gray-500">
                Logged on: {format(parseISO(entry.created_at), 'PPP')}
              </p>
              <p className="text-sm text-gray-700">
                ⏱ {entry.logged_hours?.length || 0} block(s) –{' '}
                <strong>Total: {formatTotalTime(totalMinutes)}</strong>
              </p>

              <div className="space-y-2 pl-2 text-sm">
                {entry.logged_hours?.map((block, i) => (
                  <div key={i} className="border-l-4 pl-2 border-blue-500">
                    <p>
                      <strong>Days:</strong>{' '}
                      {block.days?.length ? block.days.join(', ') : 'N/A'}
                    </p>
                    <p>
                      <strong>Date:</strong>{' '}
                      {block.start_date || 'N/A'} → {block.end_date || 'N/A'}
                    </p>
                    <p>
                      <strong>Time:</strong>{' '}
                      {block.start_time || 'N/A'} → {block.end_time || 'N/A'}
                    </p>
                  </div>
                ))}
              </div>

              {entry.notes && (
                <p className="italic text-gray-600">“{entry.notes}”</p>
              )}

              {!entry.finalized && (
                <div className="flex gap-4 text-sm mt-2">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => navigate(`/volunteer/log-hours/edit/${entry.id}`)}
                  >
                    {entry.org_confirmed && !entry.vol_confirmed
                      ? 'Confirm & Edit'
                      : 'Edit'}
                  </button>
                  <button
                    className="text-red-600 hover:underline"
                    onClick={() => handleDelete(entry.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
