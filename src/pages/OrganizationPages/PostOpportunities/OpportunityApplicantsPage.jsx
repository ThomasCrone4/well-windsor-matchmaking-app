// src/pages/organization/OpportunityApplicantsPage.jsx
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

  const [draftStatus, setDraftStatus] = useState({});
  const [messages, setMessages] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [expandedMessages, setExpandedMessages] = useState({});

  const { data: applicants, isLoading, error } = useQuery({
    queryKey: ['applicants', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          subject,
          message,
          status,
          rejection_message,
          created_at,
          opportunity_title,
          volunteer:user_profiles!volunteer_id (
            id,
            name,
            email,
            dob,
            dbs_checked,
            role
          )
        `)
        .eq('opportunity_id', opportunityId);

      if (error) throw error;

      return (data ?? []).map(app => {
        const isVolunteer = app.volunteer?.role === 'volunteer';
        return {
          id: app.id,
          name: isVolunteer ? app.volunteer.name : 'Unknown',
          email: isVolunteer ? app.volunteer.email : null,
          dob: isVolunteer ? app.volunteer.dob : null,
          dbs_checked: isVolunteer ? app.volunteer.dbs_checked : false,
          created_at: app.created_at,
          status: app.status,
          rejection_message: app.rejection_message,
          opportunity_title: app.opportunity_title,
          subject: app.subject || '',
          message: app.message || '',
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

  const handleAction = (appId, status) => {
    const defaultMsg = status === 'accepted'
      ? 'Congratulations! We’d love to have you join us.'
      : 'Hi, unfortunately we have decided not to work with you.';
    setDraftStatus({ ...draftStatus, [appId]: status });
    setMessages(prev => ({ ...prev, [appId]: prev[appId] ?? defaultMsg }));
  };

  const cancelDraft = (appId) => {
    setDraftStatus(prev => {
      const copy = { ...prev };
      delete copy[appId];
      return copy;
    });
  };

  const handleSend = async (appId) => {
    const status = draftStatus[appId];
    const message = messages[appId]?.trim();
    if (!status || !message) return;

    setLoadingId(appId);
    await updateStatus.mutateAsync({ appId, status, rejection_message: message });
    setLoadingId(null);
    cancelDraft(appId);
  };

  const toggleMessage = (id) => {
    setExpandedMessages(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const grouped = { pending: [], accepted: [], denied: [] };
  if (applicants) {
    for (const app of applicants) {
      grouped[app.status || 'pending'].push(app);
    }
  }

  const renderList = (title, list, statusKey) => (
    <div>
      <h2 className="text-lg font-semibold mt-6 mb-2">{title}</h2>
      {list.length === 0 ? (
        <p className="text-gray-500 italic">No {title.toLowerCase()} applicants.</p>
      ) : (
        <ul className="space-y-4">
          {list.map(app => {
            const age = app.dob ? differenceInYears(new Date(), new Date(app.dob)) : 'N/A';
            const isExpanded = expandedMessages[app.id];
            const isLong = app.message.length > 200;
            const displayedMessage = isExpanded || !isLong
              ? app.message
              : app.message.slice(0, 200) + '...';
            const draft = draftStatus[app.id];
            const msg = messages[app.id] || '';

            return (
              <li key={app.id} className="bg-white border p-4 rounded shadow-sm space-y-2">
                <h3 className="font-bold text-lg">{app.name}</h3>
                <p className="text-sm text-gray-600">🎂 Age: {age}</p>
                <p className="text-sm text-gray-600">
                  {app.dbs_checked ? '✅ DBS Checked' : '❌ No DBS Check'}
                </p>
                <p className="text-sm">
                  <strong>Applied on:</strong> {format(new Date(app.created_at), 'd MMM yyyy')}
                </p>
                <p className="text-sm"><strong>Subject:</strong> {app.subject}</p>
                <p className="text-sm whitespace-pre-line">
                  <strong>Message:</strong> {displayedMessage}
                </p>
                {isLong && (
                  <button
                    onClick={() => toggleMessage(app.id)}
                    className="text-blue-600 text-sm underline"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
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
                      onClick={() => handleAction(app.id, 'accepted')}
                      className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleAction(app.id, 'denied')}
                      className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {statusKey === 'pending' && draft && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      You’ve chosen to <span className={draft === 'accepted' ? 'text-green-700' : 'text-red-600'}>{draft}</span> this applicant.
                    </p>
                    <textarea
                      className="w-full p-2 border rounded text-sm"
                      value={msg}
                      onChange={e =>
                        setMessages({ ...messages, [app.id]: e.target.value })
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSend(app.id)}
                        disabled={loadingId === app.id}
                        className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => cancelDraft(app.id)}
                        className="text-sm text-gray-600 underline hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="text-sm text-gray-500 italic">
                      Changed your mind? You can switch to{' '}
                      <button
                        onClick={() =>
                          handleAction(app.id, draft === 'accepted' ? 'denied' : 'accepted')
                        }
                        className="underline text-blue-600"
                      >
                        {draft === 'accepted' ? 'Reject' : 'Accept'}
                      </button>{' '}
                      instead.
                    </div>
                  </div>
                )}

                {statusKey === 'accepted' && (
                  <>
                    <p className="text-sm text-green-700">
                      📧 Email: <a href={`mailto:${app.email}`} className="underline">{app.email}</a>
                    </p>
                    <p className="text-sm text-green-700">
                      ✅ Message sent: {app.rejection_message}
                    </p>
                  </>
                )}

                {statusKey === 'denied' && (
                  <p className="text-sm text-red-600">
                    ❌ Rejection message: {app.rejection_message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const opportunityTitle = applicants?.[0]?.opportunity_title ?? 'this opportunity';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded shadow-sm transition"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-center flex-1">Applicants for {opportunityTitle}</h1>
        <div className="w-20" />
      </div>

      {isLoading ? (
        <p className="text-center">Loading applicants...</p>
      ) : error ? (
        <p className="text-center text-red-600">Error loading applicants</p>
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
