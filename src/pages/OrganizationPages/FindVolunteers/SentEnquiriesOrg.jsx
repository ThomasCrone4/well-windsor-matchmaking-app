// Everything this organisation has sent to volunteers.
//
// Reads org_outreach_sent, which is the send-outreach function's own
// log filtered to the calling organisation. It is append-only: there is
// no delete here, because the log is what the 24-hour cooldown and the
// daily cap are counted from, and because a sent email cannot be
// unsent. Failed sends are shown too — a silent failure is worse than
// a visible one.

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '../../../utils/supabase';
import ListSkeleton from '../../../components/skeletons/ListSkeleton';

export default function SentEnquiriesOrgPage() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['org_outreach_sent_full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_outreach_sent')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" id="main-content">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0">Messages sent</h1>
        <div className="spacer" />
      </div>

      <p className="page-description">
        Messages Well Windsor has sent to volunteers on your behalf. Replies go directly to
        your organisation&rsquo;s email address, not back through here.
      </p>

      {isLoading ? (
        <ListSkeleton items={4} />
      ) : error ? (
        <div className="text-center mt-10">
          <p className="error-text">Failed to load your messages.</p>
          <p className="caption">{error.message}</p>
        </div>
      ) : data.length === 0 ? (
        <p className="muted italic mt-6">
          You haven&rsquo;t written to any volunteers yet. You can write to applicants from an
          opportunity&rsquo;s applicants list, or to anyone on the Find Volunteers page.
        </p>
      ) : (
        <ul className="stack-lg">
          {data.map((message) => (
            <li key={message.id} className="card stack">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="card-title">
                  {message.volunteer_name || 'Unknown volunteer'}
                </h2>
                <span
                  className={`badge ${
                    message.status === 'sent' ? 'badge-success' : 'badge-danger'
                  }`}
                >
                  {message.status === 'sent' ? 'Sent' : 'Not delivered'}
                </span>
              </div>

              <p className="caption">
                {format(new Date(message.created_at), 'PPP p')}
                {message.volunteer_home_town ? ` · ${message.volunteer_home_town}` : ''}
                {message.opportunity_title ? ` · about ${message.opportunity_title}` : ''}
              </p>

              <p className="highlight">📝 {message.subject}</p>
              <p className="text whitespace-pre-line">{message.message}</p>

              {message.status !== 'sent' && (
                <p className="error-text">
                  This one did not reach them. Nothing was delivered, and it does not count
                  against your daily limit — you can write to them again.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
