import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isThisWeek, isThisMonth } from 'date-fns';
import { useSearchParams } from "react-router-dom";

export default function OpportunitiesPage() {
  const [revealedContacts, setRevealedContacts] = useState({});
  const [filters, setFilters] = useState({ town: 'All', dbs: 'Any', start: 'Any' });
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onlyId = searchParams.get("opId");

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) return;

      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) setUserProfile(data);
    };
    fetchProfile();
  }, []);

  // --- NEW: preload opportunity_ids this volunteer has already enquired about ---
  const { data: myApps } = useQuery({
    queryKey: ['my_applied_opportunity_ids', userProfile?.id],
    enabled: !!userProfile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('opportunity_id')
        .eq('volunteer_id', userProfile.id);
        // Note: no direction filter to mirror your existing handleApply check
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });

  const appliedSet = useMemo(
    () => new Set((myApps ?? []).map(r => r.opportunity_id)),
    [myApps]
  );
  // ---------------------------------------------------------------------------

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

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || profile?.role !== 'volunteer') {
      toast.error('Only volunteers can make enquiries.');
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
      navigate('/volunteer/sent-enquiries');
      return;
    }

    navigate(`/opportunities/${opportunityId}/enquire`);
  };

  const filterOpportunities = (items) => {
    return items.filter(op => {
      const startDate = new Date(op.date_needed);

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
  
  const finalList = onlyId
  ? (filtered || []).filter(op => String(op.id) === String(onlyId))
  : (filtered || []);

  return (
  <div className="max-w-4xl mx-auto px-4 py-8">
    <div className="page-header">
      <h1 className="title">Volunteer Opportunities</h1>
      {userProfile?.role === 'volunteer' && (
        <div className="flex justify-center mb-6">
          <Link to="/volunteer/sent-enquiries" className="btn btn-success"> 
            Sent Enquiries
          </Link>
        </div>
      )}
    </div>

    {/* Filters */}
    <div className="card mb-6">
      <div className="form-grid md:grid-cols-5">
        {/* Search */}
        <div className="form-row">
          <label htmlFor="search" className="label">Search</label>
          <input
            id="search"
            type="text"
            placeholder="Search by title…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
          />
        </div>

        {/* Town */}
        <div className="form-row">
          <label htmlFor="town" className="label">Town</label>
          <select
            id="town"
            value={filters.town}
            onChange={(e) => setFilters(f => ({ ...f, town: e.target.value }))}
            className="select"
          >
            <option value="All">All</option>
            <option value="Windsor">Windsor</option>
            <option value="Maidenhead">Maidenhead</option>
            <option value="Slough">Slough</option>
          </select>
        </div>

        {/* DBS */}
        <div className="form-row">
          <label htmlFor="dbs" className="label">DBS</label>
          <select
            id="dbs"
            value={filters.dbs}
            onChange={(e) => setFilters(f => ({ ...f, dbs: e.target.value }))}
            className="select"
          >
            <option value="Any">Any</option>
            <option value="DBS Required">DBS Required</option>
            <option value="No DBS Required">No DBS Required</option>
          </select>
        </div>

        {/* When */}
        <div className="form-row">
          <label htmlFor="when" className="label">When</label>
          <select
            id="when"
            value={filters.start}
            onChange={(e) => setFilters(f => ({ ...f, start: e.target.value }))}
            className="select"
          >
            <option value="Any">Any</option>
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
          </select>
        </div>

        {/* Clear / Match toggle */}
        <div className="form-row">
          {userProfile?.role === 'volunteer' ? (
            <label className="check-label">
              <input
                type="checkbox"
                checked={matchedOnly}
                onChange={() => setMatchedOnly(!matchedOnly)}
                className="check"
              />
              Show Matches Only
            </label>
          ) : (
            <span className="label">&nbsp;</span>
          )}

          <button
            type="button"
            onClick={() => {
              setFilters({ town: 'All', dbs: 'Any', start: 'Any' });
              setSearchTerm('');
              setMatchedOnly(false);
              navigate("/opportunities")
            }}
            className="btn-secondary mt-1"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>

    {/* Results */}
    {finalList.length === 0 ? (
      <p className="text-center text-gray-600">No opportunities available right now.</p>
    ) : (
      <ul className="space-y-6">
        {finalList.map((opportunity) => {
          const alreadyEnquired = !!userProfile?.id && appliedSet.has(opportunity.id); // NEW
          return (
            <li key={opportunity.id} className="card p-6 space-y-2">
              <h2 className="text-xl font-semibold">{opportunity.title}</h2>
              <p className="text-gray-700">{opportunity.description}</p>
              <div className="text-sm text-gray-600">📍 Location: {opportunity.location}</div>
              <div className="text-sm text-gray-600">👥 Volunteers Needed: {opportunity.volunteers_needed ?? 'N/A'}</div>

              {opportunity.requires_dbs && (
                <span className="badge-danger">DBS Required</span>
              )}

              {opportunity.generally_needed ? (
                <p className="text-sm text-green-700 font-medium">🕒 Available anytime</p>
              ) : opportunity.when_needed?.length > 0 ? (
                <div className="text-sm text-gray-700 mt-2 space-y-1">
                  <p className="font-semibold">🕒 Times Needed:</p>
                  <ul className="list-disc list-inside">
                    {opportunity.when_needed.map((block, idx) => (
                      <li key={idx}>
                        {(block.days?.length ? block.days.join(', ') : 'Days unknown')} —{' '}
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
                className={`btn-primary ${alreadyEnquired ? 'opacity-60 cursor-not-allowed' : ''}`} 
                disabled={alreadyEnquired} 
                onClick={() => handleApply(opportunity.id)}
                title={alreadyEnquired ? 'You already enquired' : 'Enquire'} 
              >
                {alreadyEnquired ? 'Already enquired' : 'Enquire'}
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
}
