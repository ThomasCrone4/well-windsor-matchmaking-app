import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';

export default function SentEnquiriesPage() {
  const [orgId, setOrgId] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const getOrgId = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        toast.error('Please log in');
        navigate('/auth');
        return;
      }

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (error) {
        toast.error('Failed to load profile');
        return;
      }

      setOrgId(profile.id);
    };

    getOrgId();
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sent_enquiries', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          created_at,
          subject,
          message,
          direction,
          volunteer_id,
          opportunity_id,
          volunteer:volunteer_id (
            name,
            home_town,
            contact_number,
            skills,
            dbs_checked
          ),
          volunteer_opportunities (
            title
          )
        `)
        .eq('org_id', orgId)
        .eq('direction', 'to_volunteer')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async (id) => {
    const confirm = window.confirm(
      'Are you sure you want to delete this enquiry?\n\nThe enquiry email has already been sent and this action cannot be undone.'
    );
    if (!confirm) return;

    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete enquiry.');
      return;
    }

    toast.success('Enquiry deleted.');
    await queryClient.invalidateQueries(['sent_enquiries', orgId]);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title">My Sent Enquiries</h1>
        <div className="spacer" />
      </div>

      {isLoading ? (
        <p className="text-center mt-10">Loading enquiries...</p>
      ) : error ? (
        <div className="text-center text-red-600 mt-10">
          <p>⚠️ Failed to load enquiries.</p>
          <p className="error-text">{error.message}</p>
        </div>
      ) : !Array.isArray(data) || data.length === 0 ? (
        <p className="text-center muted">You haven’t sent any enquiries yet.</p>
      ) : (
        <ul className="space-y-4">
          {data.map((enquiry) => (
            <li key={enquiry.id} className="card relative space-y-1">
              {/* top-right delete icon (matches your shared icon styles) */}
              <button
                onClick={() => handleDelete(enquiry.id)}
                className="icon-btn icon-btn-danger absolute top-2 right-2"
                title="Delete Enquiry"
                aria-label="Delete Enquiry"
              >
                <Trash2 size={30} />
              </button>

              {/* title */}
              <div className="card-title">
                {enquiry.volunteer?.name || 'Unknown volunteer'}
              </div>

              {/* subject */}
              <div className="highlight">
                📝 Subject: {enquiry.subject || 'No subject'}
              </div>

              {/* meta rows */}
              <div className="muted">
                🏠 Home Town: {enquiry.volunteer?.home_town || 'Unknown'}
              </div>
              <div className="muted">
                📞 Contact: {enquiry.volunteer?.contact_number || 'N/A'}
              </div>
              <div className="muted">
                🛠️ Skills: {enquiry.volunteer?.skills || 'Not provided'}
              </div>

              {enquiry.volunteer?.dbs_checked && (
                <div className="badge badge-success w-fit">🔒 DBS Checked</div>
              )}

              <div className="caption">
                📅 Sent: {format(new Date(enquiry.created_at), 'PPP p')}
              </div>

              {enquiry.message && (
                <div className="text mt-2 whitespace-pre-line">
                  <strong>📨 Message:</strong> {enquiry.message}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
