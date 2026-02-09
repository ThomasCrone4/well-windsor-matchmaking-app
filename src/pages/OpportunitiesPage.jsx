// src/pages/OpportunitiesPage.jsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { isThisWeek, isThisMonth } from 'date-fns';
import { formatOpportunitySchedule } from '../utils/schedule';
import CardSkeleton from '../components/skeletons/CardSkeleton';

export default function OpportunitiesPage() {
  const [filters, setFilters] = useState({ town: 'All', start: 'Any' });
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onlyId = searchParams.get('opId');

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

  // preload opportunity_ids this volunteer has already enquired about
  const { data: myApps } = useQuery({
    queryKey: ['my_applied_opportunity_ids', userProfile?.id],
    enabled: !!userProfile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('opportunity_id')
        .eq('volunteer_id', userProfile.id);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });

  const appliedSet = useMemo(
    () => new Set((myApps ?? []).map((r) => r.opportunity_id)),
    [myApps]
  );

  // Fetch opportunities (volunteers use RPC to get match_kind etc.)
  const {
    data: opps,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['volunteer_opportunities', userProfile?.id, userProfile?.role],
    queryFn: async () => {
      if (userProfile?.role === 'volunteer') {
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('match_opportunities_by_availability', { p_volunteer_id: userProfile.id });

        if (rpcError) {
          console.error('RPC match_opportunities_for_volunteer failed:', rpcError);
          toast.error('Matching unavailable — showing all active opportunities');
          const { data: plain, error: plainErr } = await supabase
            .from('volunteer_opportunities')
            .select(`
              id,
              title,
              description,
              location,
              contact,
              when_needed,
              generally_needed,
              volunteers_needed,
              status,
              org_id,
              created_at
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false });
          if (plainErr) throw plainErr;
          return plain ?? [];
        }
        return rpcData ?? [];
      }

      // non-volunteer path
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select(`
          id,
          title,
          description,
          location,
          contact,
          when_needed,
          generally_needed,
          volunteers_needed,
          status,
          org_id,
          created_at
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // org names for non-volunteer path (RPC already includes org_name)
  const nonVolunteer = userProfile?.role !== 'volunteer';
  const orgIds = useMemo(() => {
    if (!nonVolunteer) return [];
    return Array.from(new Set((opps ?? []).map((o) => o.org_id).filter(Boolean)));
  }, [opps, nonVolunteer]);

  const { data: orgRows } = useQuery({
    queryKey: ['org_names_by_id', orgIds],
    enabled: nonVolunteer && orgIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id,name')
        .in('id', orgIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const orgNameById = useMemo(() => {
    const map = new Map();
    (orgRows ?? []).forEach((r) => map.set(r.id, r.name));
    return map;
  }, [orgRows]);

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
      .maybeSingle();

    if (existing) {
      toast.error('You have already enquired about this opportunity.');
      navigate('/volunteer/sent-enquiries');
      return;
    }

    navigate(`/opportunities/${opportunityId}/enquire`);
  };

  // Earliest start for filtering:
  const getEarliestStart = (op) => {
    if (op?.earliest_start) {
      const d = new Date(op.earliest_start);
      return isNaN(d.valueOf()) ? null : d;
    }
    if (!op?.when_needed || !Array.isArray(op.when_needed)) return null;
    const validDates = op.when_needed
      .map((b) => (b?.start_date ? new Date(b.start_date) : null))
      .filter((d) => d instanceof Date && !isNaN(d.valueOf()));
    if (validDates.length === 0) return null;
    return new Date(Math.min(...validDates.map((d) => d.valueOf())));
  };

  const filterOpportunities = (items) => {
    return items.filter((op) => {
      const matchesTown = filters.town === 'All' || op.location === filters.town;

      const start = getEarliestStart(op);
      const matchesStart =
        filters.start === 'Any' ||
        (filters.start === 'This Week' && start && isThisWeek(start)) ||
        (filters.start === 'This Month' && start && isThisMonth(start));

      const matched =
        !matchedOnly ||
        (userProfile &&
          (!userProfile.home_town_only || op.location === userProfile.home_town));

      const matchesSearch = (op.title || '').toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTown && matchesStart && matched && matchesSearch;
    });
  };

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="title">Volunteer Opportunities</h1>
      <CardSkeleton count={6} />
    </div>
  );
  if (error)
    return (
      <p className="text-center text-red-500 mt-20">
        Failed to load opportunities: {error.message || 'Unknown error'}
      </p>
    );

  const filtered = filterOpportunities(opps || []);
  const finalList = onlyId
    ? (filtered || []).filter((op) => String(op.id) === String(onlyId))
    : filtered || [];

  // ---- UI helpers for the top-right badge ----
  const getMatchBadge = (matchKind) => {
    switch (matchKind) {
      case 'FULL':
        return {
          label: 'Full availability match',
          classes:
            'bg-green-100 text-green-800 border border-green-200',
          title: 'Your availability fully covers the required times',
        };
      case 'PARTIAL':
        return {
          label: 'Partial availability overlap',
          classes:
            'bg-amber-100 text-amber-800 border border-amber-200',
          title: 'Some overlap between your availability and the required times',
        };
      default:
        return {
          label: 'No availability overlap',
          classes:
            'bg-gray-100 text-gray-700 border border-gray-200',
          title: 'None of your availability overlaps the required times',
        };
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8">
        <h1 className="title">Volunteer Opportunities</h1>
        <p className="page-description">
          Browse volunteer opportunities across Well-Windsor and apply to those matching your skills and availability. Use the filters below to find opportunities by location and start date.
        </p>
      </div>
      
      <div className="mb-6">
        {userProfile?.role === 'volunteer' && (
          <div className="flex justify-center">
            <Link to="/volunteer/sent-enquiries" className="btn btn-success">
              Sent Enquiries
            </Link>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="form-grid md:grid-cols-4">
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
              onChange={(e) => setFilters((f) => ({ ...f, town: e.target.value }))}
              className="select"
            >
              <option value="All">All</option>
              <option value="Windsor">Windsor</option>
              <option value="Maidenhead">Maidenhead</option>
              <option value="Slough">Slough</option>
            </select>
          </div>

          {/* When */}
          <div className="form-row">
            <label htmlFor="when" className="label">When</label>
            <select
              id="when"
              value={filters.start}
              onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
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
                setFilters({ town: 'All', start: 'Any' });
                setSearchTerm('');
                setMatchedOnly(false);
                navigate('/opportunities');
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
          {finalList.map((op) => {
            const alreadyEnquired = !!userProfile?.id && appliedSet.has(op.id);
            const orgName = (op.org_name ?? orgNameById.get(op.org_id)) || 'Organisation';

            // Badge (volunteer only)
            const showBadge = userProfile?.role === 'volunteer' && op.match_kind;
            const badge = showBadge ? getMatchBadge(op.match_kind) : null;

            return (
              <li key={op.id} className="card p-6 space-y-2 relative">
                {/* top-right match badge */}
                {badge && (
                  <span
                    className={`absolute right-4 top-4 text-[11px] md:text-xs px-2.5 py-1 rounded-full font-medium ${badge.classes}`}
                    title={badge.title}
                  >
                    {badge.label}
                  </span>
                )}

                <h2 className="text-xl font-semibold">{op.title}</h2>
                <p className="text-sm text-gray-500 -mt-1">
                  by <span className="font-medium">{orgName}</span>
                </p>

                <p className="text-gray-700">{op.description}</p>
                <div className="text-sm text-gray-600">📍 Location: {op.location}</div>
                <div className="text-sm text-gray-600">
                  👥 Volunteers Needed: {op.volunteers_needed ?? 'N/A'}
                </div>

                {/* Schedule summary */}
                {op.generally_needed ? (
                  <p className="text-sm text-green-700 font-medium">🕒 Available anytime</p>
                ) : Array.isArray(op.when_needed) && op.when_needed.length > 0 ? (
                  <div className="text-sm text-gray-700 mt-2">
                    <span className="font-semibold">🕒 Schedule: </span>
                    <span>{formatOpportunitySchedule(op)}</span>
                  </div>
                ) : null}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    className={`btn-primary ${alreadyEnquired ? 'opacity-60 cursor-not-allowed' : ''}`}
                    disabled={alreadyEnquired}
                    onClick={() => handleApply(op.id)}
                    title={alreadyEnquired ? 'You already enquired' : 'Enquire'}
                  >
                    {alreadyEnquired ? 'Already enquired' : 'Enquire'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
