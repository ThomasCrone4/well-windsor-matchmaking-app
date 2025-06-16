import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { format, differenceInYears } from 'date-fns';

export default function OpportunityApplicantsPage() {
  const { id: opportunityId } = useParams();

  const { data: applicants, isLoading, error } = useQuery({
    queryKey: ['applicants', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          volunteer_id,
          user_profiles!volunteer_id (
            id,
            name,
            dob,
            dbs_checked
          )
        `)
        .eq('opportunity_id', opportunityId);

      if (error) throw error;

      return data.map(app => ({
        id: app.id,
        name: app.user_profiles?.name || 'Unknown',
        dob: app.user_profiles?.dob,
        dbs_checked: app.user_profiles?.dbs_checked || false,
      }));
    },
    enabled: !!opportunityId,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Applicants</h1>
        <Link
          to="/organization-dashboard"
          className="text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {isLoading ? (
        <p>Loading applicants...</p>
      ) : error ? (
        <p className="text-red-600">Error loading applicants</p>
      ) : applicants.length === 0 ? (
        <p className="text-gray-500 italic">No applicants found.</p>
      ) : (
        <ul className="space-y-4">
          {applicants.map(app => {
            const age = app.dob ? differenceInYears(new Date(), new Date(app.dob)) : 'N/A';
            return (
              <li key={app.id} className="bg-white border p-4 rounded shadow-sm">
                <p className="font-semibold text-lg">{app.name}</p>
                <p className="text-sm text-gray-600">🎂 Age: {age}</p>
                <p className="text-sm text-gray-600">
                  {app.dbs_checked ? '✅ DBS Checked' : '❌ No DBS Check'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
