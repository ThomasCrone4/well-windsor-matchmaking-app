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

  if (isLoading) return <p className="text-center mt-20">Loading enquiries...</p>;
  if (error) return <p className="text-center text-red-500 mt-20">Failed to load enquiries.</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded shadow-sm transition"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold">My Sent Enquiries</h1>
        <div className="w-20" />
      </div>

      {!Array.isArray(data) || data.length === 0 ? (
        <p className="text-center text-gray-600">You haven’t sent any enquiries yet.</p>
      ) : (
        <ul className="space-y-4">
          {data.map((enquiry) => (
            <li key={enquiry.id} className="relative p-4 border rounded-lg shadow bg-white space-y-1">
              <button
                onClick={() => handleDelete(enquiry.id)}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-600 transition"
                title="Delete Enquiry"
              >
                <Trash2 size={30} />
              </button>
              <div className="text-lg font-semibold">
                {enquiry.volunteer?.name || 'Unknown volunteer'}
              </div>
              <div className="text-sm text-blue-700 font-medium">
                📝 Subject: {enquiry.subject || 'No subject'}
              </div>
              <div className="text-sm text-gray-600">
                🏠 Home Town: {enquiry.volunteer?.home_town || 'Unknown'}
              </div>
              <div className="text-sm text-gray-600">
                📞 Contact: {enquiry.volunteer?.contact_number || 'N/A'}
              </div>
              <div className="text-sm text-gray-600">
                🛠️ Skills: {enquiry.volunteer?.skills || 'Not provided'}
              </div>
              {enquiry.volunteer?.dbs_checked && (
                <div className="text-sm text-red-600">🔒 DBS Checked</div>
              )}
              <div className="text-sm text-gray-600">
                📅 Sent: {format(new Date(enquiry.created_at), 'PPP p')}
              </div>
              {enquiry.message && (
                <div className="text-sm text-gray-800 mt-2">
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
