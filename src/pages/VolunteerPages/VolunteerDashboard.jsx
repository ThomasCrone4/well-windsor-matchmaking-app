// src/pages/volunteer/VolunteerDashboard.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import ListSkeleton from '../../components/skeletons/ListSkeleton';

export default function VolunteerDashboard() {
  const [userId, setUserId] = useState(null);
  const queryClient = useQueryClient();
  const [draftStatus, setDraftStatus] = useState({});
  const [messages, setMessages] = useState({});
  const [loadingId, setLoadingId] = useState(null);  const [statusChanges, setStatusChanges] = useState(new Map());
  const DEFAULT_REPLIES = {
    accepted: 'Thank you! I’m happy to volunteer.',
    denied:   'Thanks for reaching out, but I won’t be able to volunteer.',
  };

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
            email,
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

  /**
   * Start/modify a draft decision for an enquiry.
   * Swaps to the correct default message when the prior text is empty
   * or matches the previous default.
   */
  const handleAction = (id, targetStatus, currentStatus = null, serverMsg = '') => {
    const prevDraft = draftStatus[id];                      // 'accepted' | 'denied' | undefined
    const prevMsgInState = (messages[id] ?? '').trim();

    // What the textarea currently shows (local edit if present, else what's on the server)
    const baseline = prevMsgInState !== '' ? prevMsgInState : (serverMsg ?? '').trim();
    const currentDefault = currentStatus ? DEFAULT_REPLIES[currentStatus] : null;

    // Swap to the new default if the baseline was empty or still equal to the previous default
    const shouldUseNewDefault =
      baseline === '' ||
      (currentDefault && baseline === currentDefault) ||
      (prevDraft && baseline === DEFAULT_REPLIES[prevDraft]);

    const nextMsg = shouldUseNewDefault ? DEFAULT_REPLIES[targetStatus] : baseline;

    setDraftStatus(prev => ({ ...prev, [id]: targetStatus }));
    setMessages(prev => ({ ...prev, [id]: nextMsg }));
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

    // Check rate limit (max 5 changes per hour)
    const now = Date.now();
    const history = statusChanges.get(id) || [];
    const lastHour = history.filter(timestamp => now - timestamp < 60 * 60 * 1000);
    
    if (lastHour.length >= 5) {
      toast.error('Too many status changes for this enquiry. Please wait before changing it again.');
      return;
    }

    setLoadingId(id);
    await updateStatus.mutateAsync({ id, status, rejection_message: message });
    setLoadingId(null);
    cancelDraft(id);

    // Track this status change
    setStatusChanges(prev => {
      const updatedHistory = [...(prev.get(id) || []), now];
      const updated = new Map(prev);
      updated.set(id, updatedHistory);
      return updated;
    });

    // Clear cached message so future toggles evaluate from server state
    setMessages(prev => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
  };

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="title">Volunteer Dashboard</h1>
      <ListSkeleton items={5} />
    </div>
  );
  if (error) return <p className="text-center text-red-600 mt-20">Failed to load enquiries.</p>;

  // Group enquiries by status
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

                <p className="text text-sm">📧 Email: {enquiry.org?.email || 'Unknown'}</p>
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

                {/* Pending actions */}
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

                {/* Accepted/Denied → change buttons */}
                {statusKey === 'accepted' && !draft && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() =>
                        handleAction(
                          enquiry.id,
                          'denied',
                          'accepted',
                          enquiry.rejection_message
                        )
                      }
                      className="btn btn-danger btn-sm"
                    >
                      Change to Denied
                    </button>
                  </div>
                )}

                {statusKey === 'denied' && !draft && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() =>
                        handleAction(
                          enquiry.id,
                          'accepted',
                          'denied',
                          enquiry.rejection_message
                        )
                      }
                      className="btn btn-success btn-sm"
                    >
                      Change to Accepted
                    </button>
                  </div>
                )}

                {/* Draft UI (shown for any list if a draft exists) */}
                {draft && (
                  <div className="stack">
                    <p className="text-sm font-medium">
                      You’ve chosen to{' '}
                      <span className={draft === 'accepted' ? 'text-green-700' : 'text-red-600'}>
                        {draft === 'accepted' ? 'accept' : 'deny'}
                      </span>{' '}
                      this opportunity.
                    </p>

                    <textarea
                      className="input textarea textarea-sm text-sm"
                      value={msg}
                      onChange={(e) =>
                        setMessages({ ...messages, [enquiry.id]: e.target.value })
                      }
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
                          handleAction(
                            enquiry.id,
                            draft === 'accepted' ? 'denied' : 'accepted',
                            statusKey,
                            enquiry.rejection_message
                          )
                        }
                        className="underline text-brand-teal"
                      >
                        {draft === 'accepted' ? 'Reject' : 'Accept'}
                      </button>{' '}
                      instead.
                    </div>
                  </div>
                )}

                {/* Final summaries when not editing */}
                {!draft && statusKey === 'denied' && enquiry.rejection_message && (
                  <div className="text-sm text-red-600">
                    ❌ You declined this opportunity.
                    <br />
                    <strong>Message:</strong> {enquiry.rejection_message}
                  </div>
                )}

                {!draft && statusKey === 'accepted' && enquiry.rejection_message && (
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
    <div className="max-w-3xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8">
        <h1 className="title">Volunteer Dashboard</h1>
        <p className="page-description">
          Manage enquiries from organisations and respond to opportunities. Accept enquiries you're interested in or decline those that don't fit your schedule.
        </p>
      </div>
      
      <div className="flex gap-2 mb-6">
        <Link to="/volunteer/sent-enquiries" className="btn btn-success">
          Sent Enquiries
        </Link>
      </div>

      {renderList('Pending', grouped.pending, 'pending')}
      {renderList('Accepted', grouped.accepted, 'accepted')}
      {renderList('Denied', grouped.denied, 'denied')}
    </div>
  );
}
