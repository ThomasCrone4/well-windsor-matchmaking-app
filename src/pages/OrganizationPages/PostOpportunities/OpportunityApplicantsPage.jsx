import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import { format, differenceInYears } from 'date-fns';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function OpportunityApplicantsPage() {
  const { id: opportunityId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectionMessages, setRejectionMessages] = useState({});
  const [loadingApplicant, setLoadingApplicant] = useState(null);

  const { data: applicants, isLoading, error } = useQuery({
    queryKey: ['applicants', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          status,
          rejection_message,
          created_at,
          opportunity_title,
          volunteer:user_profiles!volunteer_id (
            id,
            name,
            dob,
            dbs_checked,
            role
          )
        `)
        .eq('opportunity_id', opportunityId);

      if (error) {
        console.error('Error fetching applicants:', error);
        throw error;
      }

      return (data ?? []).map(app => {
        const isVolunteer = app.volunteer?.role === 'volunteer';

        return {
          id: app.id,
          name: isVolunteer ? app.volunteer.name : 'Unknown',
          dob: isVolunteer ? app.volunteer.dob : null,
          dbs_checked: isVolunteer ? app.volunteer.dbs_checked : false,
          created_at: app.created_at,
          status: app.status,
          rejection_message: app.rejection_message,
          opportunity_title: app.opportunity_title,
        };
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ appId, status, rejection_message }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status, rejection_message })
        .eq('id', appId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries(['applicants', opportunityId]);
    },
    onError: () => toast.error('Update failed'),
  });

  const handleAccept = async (appId) => {
    setLoadingApplicant(appId);
    await updateStatus.mutateAsync({ appId, status: 'accepted' });
    setLoadingApplicant(null);
  };

  const handleReject = async (appId) => {
    const rejection_message =
      rejectionMessages[appId]?.trim() ||
      'Hi, unfortunately we have decided not to work with you.';
    setLoadingApplicant(appId);
    await updateStatus.mutateAsync({ appId, status: 'denied', rejection_message });
    setLoadingApplicant(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded shadow-sm transition"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-center flex-1">Applicants</h1>
        <div className="w-20" />
      </div>

      {isLoading ? (
        <p className="text-center">Loading applicants...</p>
      ) : error ? (
        <p className="text-center text-red-600">Error loading applicants</p>
      ) : !Array.isArray(applicants) || applicants.length === 0 ? (
        <p className="text-center text-gray-500 italic">No applicants found.</p>
      ) : (
        <ul className="space-y-4">
          {applicants.map(app => {
            const age = app.dob ? differenceInYears(new Date(), new Date(app.dob)) : 'N/A';
            return (
              <li key={app.id} className="bg-white border p-4 rounded shadow-sm space-y-2">
                <h2 className="font-bold text-lg">{app.name}</h2>
                <p className="text-sm text-gray-600">🎂 Age: {age}</p>
                <p className="text-sm text-gray-600">
                  {app.dbs_checked ? '✅ DBS Checked' : '❌ No DBS Check'}
                </p>
                <p className="text-sm">
                  <strong>Applied to:</strong> {app.opportunity_title}
                </p>
                <p className="text-sm">
                  <strong>Applied on:</strong>{' '}
                  {format(new Date(app.created_at), 'd MMM yyyy')}
                </p>
                <p className="text-sm">
                  <strong>Status:</strong> {app.status}
                </p>

                {app.status === 'pending' && (
                  <div className="space-x-2">
                    <button
                      onClick={() => handleAccept(app.id)}
                      disabled={loadingApplicant === app.id}
                      className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700"
                    >
                      Accept
                    </button>

                    <button
                      onClick={() => handleReject(app.id)}
                      disabled={loadingApplicant === app.id}
                      className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700"
                    >
                      Reject
                    </button>

                    <input
                      type="text"
                      placeholder="Optional rejection message"
                      className="mt-2 w-full p-2 border rounded"
                      value={rejectionMessages[app.id] || ''}
                      onChange={e =>
                        setRejectionMessages({
                          ...rejectionMessages,
                          [app.id]: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                {app.status === 'denied' && (
                  <p className="text-sm text-red-600 mt-1">
                    ❌ Rejection Message: {app.rejection_message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
