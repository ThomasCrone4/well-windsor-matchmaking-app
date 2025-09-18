import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';

export default function VolunteerSentEnquiriesPage() {
  const [userId, setUserId] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user?.id) {
        toast.error('Please log in');
        navigate('/auth');
        return;
      }
      setUserId(data.user.id);
    };
    getUser();
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sent_applications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          created_at,
          subject,
          message,
          volunteer_opportunities (
            title,
            location,
            date_needed
          )
        `)
        .eq('volunteer_id', userId)
        .eq('direction', 'to_opportunity')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async (id) => {
    const confirm = window.confirm(
      'Are you sure you want to delete this application?\n\nThe enquiry email has already been sent and this action cannot be undone.'
    );
    if (!confirm) return;

    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete application.');
      return;
    }

    toast.success('Application deleted.');
    await queryClient.invalidateQueries(['sent_applications', userId]);
  };

  if (isLoading) return <p className="text-center mt-20">Loading sent enquiries...</p>;
  if (error) {
    return (
      <div className="text-center text-red-600 mt-10">
        <p>⚠️ Failed to load sent enquiries.</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary btn-sm"
        >
          ← Back
        </button>
        <h1 className="title">My Sent Enquiries</h1>
        <div className="spacer" />
      </div>

      {!Array.isArray(data) || data.length === 0 ? (
        <p className="text-center muted">You haven’t applied to any roles yet.</p>
      ) : (
        <ul className="space-y-4">
          {data.map((app) => (
            <li key={app.id} className="card relative space-y-1">
              <button
                onClick={() => handleDelete(app.id)}
                className="icon-btn icon-btn-danger absolute top-2 right-2"
                title="Delete Application"
              >
                <Trash2 size={30} />
              </button>

              <div className="card-title">
                {app.volunteer_opportunities?.title || 'Unknown Opportunity'}
              </div>

              {app.subject && (
                <div className="highlight">
                  📝 Subject: {app.subject}
                </div>
              )}

              <div className="muted">
                📍 Location: {app.volunteer_opportunities?.location || 'Not specified'}
              </div>

              <div className="muted">
                📅 Date Needed:{' '}
                {app.volunteer_opportunities?.date_needed
                  ? format(new Date(app.volunteer_opportunities.date_needed), 'PPP')
                  : 'Not provided'}
              </div>

              {app.message && (
                <div className="text mt-2">
                  <strong>📨 Message:</strong> {app.message}
                </div>
              )}

              <div className="caption">
                Applied on: {format(new Date(app.created_at), 'PPP p')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
