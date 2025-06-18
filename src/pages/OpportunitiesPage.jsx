import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isThisWeek, isThisMonth } from 'date-fns';

export default function OpportunitiesPage() {
  const [revealedContacts, setRevealedContacts] = useState({});
  const [filters, setFilters] = useState({ town: 'All', dbs: 'Any', start: 'Any' });
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) setUserProfile(data);
    };
    fetchProfile();
  }, []);

  const { data, error, isLoading } = useQuery({
    queryKey: ['volunteer_opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select(`
          id,
          title,
          description,
          location,
          date_needed,
          contact,
          requires_dbs,
          when_needed,
          generally_needed,
          volunteers_needed,
          status
        `)
        .eq('status', 'active') // ✅ Only show active posts
        .order('date_needed', { ascending: true });

      if (error) throw error;
      return data;
    },
  });


  const handleApply = async (opportunityId) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    if (!user) {
      toast.error('Please log in to enquire.');
      navigate('/auth');
      return;
    }

    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('volunteer_id', user.id)
      .single();

    if (existing) {
      toast.error('You have already enquired about this opportunity.');
      return;
    }

    navigate(`/opportunities/${opportunityId}/enquire`);
  };

  const filterOpportunities = (items) => {
    return items.filter(op => {
      const startDate = new Date(op.date_needed);
      const now = new Date();

      const matchesTown =
        filters.town === 'All' || op.location === filters.town;

      const matchesDBS =
        filters.dbs === 'Any' ||
        (filters.dbs === 'DBS Required' ? op.requires_dbs : !op.requires_dbs);

      const matchesStart =
        filters.start === 'Any' ||
        (filters.start === 'This Week' && isThisWeek(startDate)) ||
        (filters.start === 'This Month' && isThisMonth(startDate));

      const matched =
        !matchedOnly ||
        (userProfile &&
          (!op.requires_dbs || userProfile.dbs_checked) &&
          (!userProfile.home_town_only || op.location === userProfile.home_town));

      const matchesSearch = op.title.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTown && matchesDBS && matchesStart && matched && matchesSearch;
    });
  };

  if (isLoading) return <p className="text-center mt-20">Loading opportunities...</p>;
  if (error) return <p className="text-center text-red-500 mt-20">Failed to load opportunities.</p>;

  const filtered = filterOpportunities(data || []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">Volunteer Opportunities</h1>

      <div className="mb-4 flex flex-wrap gap-4 items-center justify-center">
        <input
          type="text"
          placeholder="Search by title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="p-2 border rounded w-64"
        />
        <select
          value={filters.town}
          onChange={(e) => setFilters(f => ({ ...f, town: e.target.value }))}
          className="p-2 border rounded"
        >
          <option value="All">Location</option>
          <option value="Windsor">Windsor</option>
          <option value="Maidenhead">Maidenhead</option>
          <option value="Slough">Slough</option>
        </select>
        <select
          value={filters.dbs}
          onChange={(e) => setFilters(f => ({ ...f, dbs: e.target.value }))}
          className="p-2 border rounded"
        >
          <option value="Any">DBS status</option>
          <option value="DBS Required">DBS Required</option>
          <option value="No DBS Required">No DBS Required</option>
        </select>
        <select
          value={filters.start}
          onChange={(e) => setFilters(f => ({ ...f, start: e.target.value }))}
          className="p-2 border rounded"
        >
          <option value="Any">When</option>
          <option value="This Week">This Week</option>
          <option value="This Month">This Month</option>
        </select>
        {userProfile?.role === 'volunteer' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={matchedOnly}
              onChange={() => setMatchedOnly(!matchedOnly)}
            />
            Show Matches Only
          </label>
        )}
        <button
          onClick={() => {
            setFilters({ town: 'All', dbs: 'Any', start: 'Any' });
            setSearchTerm('');
            setMatchedOnly(false);
          }}
          className="text-sm text-gray-600 underline hover:text-gray-800"
        >
          Clear Filters
        </button>
      </div>


      {filtered.length === 0 ? (
        <p className="text-center text-gray-600">No opportunities available right now.</p>
      ) : (
        <ul className="space-y-6">
          {filtered.map((opportunity) => (
            <li key={opportunity.id} className="p-6 border rounded-lg shadow-sm bg-white space-y-2">
              <h2 className="text-xl font-semibold">{opportunity.title}</h2>
              <p className="text-gray-700">{opportunity.description}</p>
              <div className="text-sm text-gray-600">📍 Location: {opportunity.location}</div>
              <div className="text-sm text-gray-600">👥 Volunteers Needed: {opportunity.volunteers_needed ?? 'N/A'}</div>

              {opportunity.requires_dbs && (
                <div className="text-sm text-red-600">🔒 DBS Required</div>
              )}

              {opportunity.generally_needed ? (
                <p className="text-sm text-green-600">🕒 Available anytime</p>
              ) : opportunity.when_needed?.length > 0 ? (
                <div className="text-sm text-gray-700 mt-2 space-y-1">
                  <p className="font-semibold">🕒 Times Needed:</p>
                  <ul className="list-disc list-inside">
                    {opportunity.when_needed.map((block, idx) => (
                      <li key={idx}>
                        {block.days?.join(', ') || 'Days unknown'} &mdash;{' '}
                        {block.start_time || '??'} to {block.end_time || '??'}
                        {block.start_date && block.end_date && (
                          <> ({block.start_date} to {block.end_date})</>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-2"
                onClick={() => handleApply(opportunity.id)}
              >
                Enquire
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
