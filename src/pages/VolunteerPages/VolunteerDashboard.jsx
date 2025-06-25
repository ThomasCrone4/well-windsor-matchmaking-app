import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function VolunteerDashboard() {
  const [userId, setUserId] = useState(null);

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

  const {
    data: receivedData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['applications_received', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          created_at,
          subject,
          message,
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

  if (isLoading) return <p className="text-center mt-10">Loading your dashboard...</p>;

  if (error) {
    return (
      <div className="text-center text-red-600 mt-10">
        <p>⚠️ Failed to load enquiries.</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

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

      {Array.isArray(receivedData) && receivedData.length > 0 ? (
        <ul className="space-y-4">
          {receivedData.map((enquiry) => (
            <li key={enquiry.id} className="p-4 bg-white shadow rounded border space-y-1">
              <h3 className="text-lg font-semibold text-blue-800">
                📝 {enquiry.subject || 'No subject'}
              </h3>

              <div className="text-sm text-gray-700">
                🏢 Organisation: {enquiry.org?.name || 'Unknown'}
              </div>

              {enquiry.org?.contact_number && (
                <div className="text-sm text-gray-700">
                  📞 Contact: {enquiry.org.contact_number}
                </div>
              )}

              <div className="text-sm text-gray-700">
                🏠 Town: {enquiry.org?.home_town || 'Unknown'}
              </div>

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
      ) : (
        <p className="text-gray-600 text-center">You haven’t received any enquiries yet.</p>
      )}
    </div>
  );
}
