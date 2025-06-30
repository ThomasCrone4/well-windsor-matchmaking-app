import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function VolunteerDashboard() {
  const [userId, setUserId] = useState(null);
  const queryClient = useQueryClient();
  const [draftStatus, setDraftStatus] = useState({});
  const [messages, setMessages] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user?.id) {
        toast.error('Unable to load user ID');
        return;
      }
      setUserId(data.user.id);
    };
    fetchUser();
  }, []);

  const { data: receivedData, isLoading, error } = useQuery({
    queryKey: ['applications_received', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          created_at,
          subject,
          message,
          status,
          rejection_message,
          org:org_id (
            name,
            contact_number,
            home_town
          ),
          volunteer_opportunities (
            title
          )
        `)
        .eq('volunteer_id', userId)
        .eq('direction', 'to_volunteer')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, rejection_message }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status, rejection_message })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Response sent');
      queryClient.invalidateQueries(['applications_received', userId]);
    },
    onError: () => toast.error('Failed to respond to enquiry'),
  });

  const handleAction = (id, status) => {
    const defaultMsg = status === 'accepted'
      ? 'Thank you! I’m happy to volunteer.'
      : 'Thanks for reaching out, but I won’t be able to volunteer.';
    setDraftStatus({ ...draftStatus, [id]: status });
    setMessages(prev => ({ ...prev, [id]: prev[id] ?? defaultMsg }));
  };

  const cancelDraft = (id) => {
    setDraftStatus(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleSend = async (id) => {
    const status = draftStatus[id];
    const message = messages[id]?.trim();
    if (!status || !message) return;

    setLoadingId(id);
    await updateStatus.mutateAsync({ id, status, rejection_message: message });
    setLoadingId(null);
    cancelDraft(id);
  };

  const grouped = { pending: [], accepted: [], denied: [] };
  if (receivedData) {
    for (const entry of receivedData) {
      grouped[entry.status || 'pending'].push(entry);
    }
  }

  const renderList = (title, list, statusKey) => (
    <div>
      <h2 className="text-lg font-semibold mt-6 mb-2">{title}</h2>
      {list.length === 0 ? (
        <p className="text-gray-500 italic">No {title.toLowerCase()} enquiries.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((enquiry) => {
            const draft = draftStatus[enquiry.id];
            const msg = messages[enquiry.id] || '';
            return (
              <li key={enquiry.id} className="p-4 bg-white shadow rounded border space-y-2">
                <h3 className="text-lg font-semibold text-blue-800">
                  📝 {enquiry.subject || 'No subject'}
                </h3>
                <p className="text-sm text-gray-700">🏢 Organisation: {enquiry.org?.name || 'Unknown'}</p>
                {enquiry.org?.contact_number && (
                  <p className="text-sm text-gray-700">📞 Contact: {enquiry.org.contact_number}</p>
                )}
                <p className="text-sm text-gray-700">🏠 Town: {enquiry.org?.home_town || 'Unknown'}</p>
                <p className="text-sm text-gray-600">📅 Sent: {format(new Date(enquiry.created_at), 'PPP p')}</p>
                {enquiry.message && (
                  <p className="text-sm text-gray-800 mt-1 whitespace-pre-line">
                    <strong>📨 Message:</strong> {enquiry.message}
                  </p>
                )}
                <p className="text-sm">
                  <strong>Status:</strong>{' '}
                  <span className={
                    statusKey === 'accepted' ? 'text-green-700 font-medium'
                    : statusKey === 'denied' ? 'text-red-600 font-medium'
                    : 'text-gray-700'
                  }>
                    {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                  </span>
                </p>

                {statusKey === 'pending' && !draft && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleAction(enquiry.id, 'accepted')}
                      className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleAction(enquiry.id, 'denied')}
                      className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {statusKey === 'pending' && draft && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      You’ve chosen to <span className={draft === 'accepted' ? 'text-green-700' : 'text-red-600'}>{draft}</span> this opportunity.
                    </p>
                    <textarea
                      className="w-full p-2 border rounded text-sm"
                      value={msg}
                      onChange={e =>
                        setMessages({ ...messages, [enquiry.id]: e.target.value })
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSend(enquiry.id)}
                        disabled={loadingId === enquiry.id}
                        className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => cancelDraft(enquiry.id)}
                        className="text-sm text-gray-600 underline hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="text-sm text-gray-500 italic">
                      Changed your mind? You can switch to{' '}
                      <button
                        onClick={() =>
                          handleAction(enquiry.id, draft === 'accepted' ? 'denied' : 'accepted')
                        }
                        className="underline text-blue-600"
                      >
                        {draft === 'accepted' ? 'Reject' : 'Accept'}
                      </button>{' '}
                      instead.
                    </div>
                  </div>
                )}

                {statusKey === 'denied' && (
                  <div className="text-sm text-red-600">
                    ❌ You declined this opportunity.<br />
                    <strong>Message:</strong> {enquiry.rejection_message}
                  </div>
                )}

                {statusKey === 'accepted' && (
                  <div className="text-sm text-green-700">
                    ✅ You’ve accepted this opportunity.<br />
                    <strong>Message:</strong> {enquiry.rejection_message}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-center">Received Enquiries</h1>
      <div className="flex justify-center mb-6">
        <Link
          to="/volunteer/sent-enquiries"
          className="inline-block bg-emerald-600 text-white font-semibold px-6 py-2 rounded-lg shadow hover:bg-emerald-700 transition"
        >
          Sent Enquiries
        </Link>
      </div>
      {isLoading ? (
        <p className="text-center mt-10">Loading your dashboard...</p>
      ) : error ? (
        <div className="text-center text-red-600 mt-10">
          <p>⚠️ Failed to load enquiries.</p>
          <p className="text-sm">{error.message}</p>
        </div>
      ) : (
        <>
          {renderList('Pending', grouped.pending, 'pending')}
          {renderList('Accepted', grouped.accepted, 'accepted')}
          {renderList('Denied', grouped.denied, 'denied')}
        </>
      )}
    </div>
  );
}
