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
    const defaultMsg =
      status === 'accepted'
        ? 'Thank you! I’m happy to volunteer.'
        : 'Thanks for reaching out, but I won’t be able to volunteer.';
    setDraftStatus({ ...draftStatus, [id]: status });
    setMessages((prev) => ({ ...prev, [id]: prev[id] ?? defaultMsg }));
  };

  const cancelDraft = (id) => {
    setDraftStatus((prev) => {
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
      <h2 className="section-title mt-6 mb-2 text-left">{title}</h2>
      {list.length === 0 ? (
        <p className="muted italic">No {title.toLowerCase()} enquiries.</p>
      ) : (
        <ul className="stack">
          {list.map((enquiry) => {
            const draft = draftStatus[enquiry.id];
            const msg = messages[enquiry.id] || '';
            return (
              <li key={enquiry.id} className="card space-y-2">
                <h3 className="card-title text-black-800">
                  {enquiry.subject || 'No subject'}
                </h3>

                <p className="text text-sm">🏢 Organisation: {enquiry.org?.name || 'Unknown'}</p>

                {enquiry.org?.contact_number && (
                  <p className="text text-sm">📞 Contact: {enquiry.org.contact_number}</p>
                )}

                <p className="text text-sm">🏠 Town: {enquiry.org?.home_town || 'Unknown'}</p>

                <p className="caption">
                  📅 Sent: {format(new Date(enquiry.created_at), 'PPP p')}
                </p>

                {enquiry.message && (
                  <p className="text text-sm mt-1 whitespace-pre-line">
                    <strong>📨 Message:</strong> {enquiry.message}
                  </p>
                )}

                <p className="text-sm">
                  <strong>Status:</strong>{' '}
                  <span
                    className={
                      statusKey === 'accepted'
                        ? 'badge badge-success'
                        : statusKey === 'denied'
                        ? 'badge badge-danger'
                        : 'badge badge-neutral'
                    }
                  >
                    {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                  </span>
                </p>

                {statusKey === 'pending' && !draft && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleAction(enquiry.id, 'accepted')}
                      className="btn btn-success btn-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleAction(enquiry.id, 'denied')}
                      className="btn btn-danger btn-sm"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {statusKey === 'pending' && draft && (
                  <div className="stack">
                    <p className="text-sm font-medium">
                      You’ve chosen to{' '}
                      <span className={draft === 'accepted' ? 'text-green-700' : 'text-red-600'}>
                        {draft}
                      </span>{' '}
                      this opportunity.
                    </p>

                    <textarea
                      className="input textarea textarea-sm text-sm"
                      value={msg}
                      onChange={(e) => setMessages({ ...messages, [enquiry.id]: e.target.value })}
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSend(enquiry.id)}
                        disabled={loadingId === enquiry.id}
                        className="btn btn-primary btn-sm"
                      >
                        {loadingId === enquiry.id ? 'Sending…' : 'Send'}
                      </button>
                      <button
                        onClick={() => cancelDraft(enquiry.id)}
                        className="btn btn-ghost btn-sm"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="caption italic">
                      Changed your mind? You can switch to{' '}
                      <button
                        onClick={() =>
                          handleAction(enquiry.id, draft === 'accepted' ? 'denied' : 'accepted')
                        }
                        className="underline text-brand-teal"
                      >
                        {draft === 'accepted' ? 'Reject' : 'Accept'}
                      </button>{' '}
                      instead.
                    </div>
                  </div>
                )}

                {statusKey === 'denied' && (
                  <div className="text-sm text-red-600">
                    ❌ You declined this opportunity.
                    <br />
                    <strong>Message:</strong> {enquiry.rejection_message}
                  </div>
                )}

                {statusKey === 'accepted' && (
                  <div className="text-sm text-green-700">
                    ✅ You’ve accepted this opportunity.
                    <br />
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
      <div className="page-header">
        <h1 className="title">Received Enquiries</h1>
        <div className="flex gap-2">
          <Link to="/volunteer/sent-enquiries" className="btn btn-success">
            Sent Enquiries
          </Link>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center mt-10">Loading your dashboard...</p>
      ) : error ? (
        <div className="text-center text-red-600 mt-10">
          <p>⚠️ Failed to load enquiries.</p>
          <p className="error-text">{error.message}</p>
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
