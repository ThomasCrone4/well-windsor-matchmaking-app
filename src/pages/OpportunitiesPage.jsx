// src/pages/OpportunitiesPage.jsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { isThisWeek, isThisMonth } from 'date-fns';
import { formatOpportunitySchedule } from '../utils/schedule';
import CardSkeleton from '../components/skeletons/CardSkeleton';
import { TOWN_FILTER_OPTIONS } from '../utils/towns';

/**
 * The availability badge shown to a signed-in volunteer.
 *
 * match_kind comes from the match_opportunities_by_availability RPC and is
 * deliberately NOT derived from match_rank -- rank is an ordering key, and
 * collapsing these five cases into three buckets is what previously put
 * "Full availability match" on every flexible role.
 */
const MATCH_BADGES = {
  FULL: {
    label: 'Full availability match',
    classes: 'badge-success',
    title: 'Your availability covers all of the times this role needs',
  },
  PARTIAL: {
    label: 'Partial availability overlap',
    classes: 'badge-warning',
    title: 'Some of your availability overlaps the times this role needs',
  },
  FLEXIBLE: {
    label: 'Flexible timing',
    classes: 'badge-info',
    title: 'This role can be done at flexible times, so any availability works',
  },
  UNSPECIFIED: {
    label: 'Schedule not specified',
    classes: 'badge-neutral',
    title: 'This organisation has not given specific times, so we cannot compare',
  },
  NONE: {
    label: 'No availability overlap',
    classes: 'badge-neutral',
    title: 'None of your availability overlaps the times this role needs',
  },
};

/**
 * What "Show Matches Only" keeps. UNSPECIFIED is excluded on purpose: with
 * no schedule on the opportunity there is nothing to match against, and
 * calling that a match would be the same overclaim the badge just fixed.
 */
const MATCHING_KINDS = new Set(['FULL', 'PARTIAL', 'FLEXIBLE']);

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

  // preload the opportunities this volunteer has already applied to
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
              town,
              contact,
              requires_dbs,
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

      // non-volunteer path (logged-out visitors and organisations)
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select(`
          id,
          title,
          description,
          location,
          town,
          contact,
          requires_dbs,
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
      // public_organisations, not user_profiles: a fixed, contact-free
      // column list rather than a read of the profile row itself.
      const { data, error } = await supabase
        .from('public_organisations')
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
      toast.error('Please log in to apply.');
      navigate('/auth');
      return;
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || profile?.role !== 'volunteer') {
      toast.error('Only volunteers can apply for opportunities.');
      return;
    }

    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('volunteer_id', user.id)
      .maybeSingle();

    if (existing) {
      toast.error('You have already applied to this opportunity.');
      navigate('/volunteer-dashboard');
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
      // town, not location. location is free text ("St Edward's, Windsor")
      // and comparing it to a town name dropped real listings silently.
      const matchesTown = filters.town === 'All' || op.town === filters.town;

      const start = getEarliestStart(op);
      const matchesStart =
        filters.start === 'Any' ||
        (filters.start === 'This Week' && start && isThisWeek(start)) ||
        (filters.start === 'This Month' && start && isThisMonth(start));

      // Previously read userProfile.home_town_only -- a column that has
      // never existed, so !undefined was always true and this toggle did
      // nothing at all. It filters on the availability match now, which is
      // what its label has always promised.
      const matched = !matchedOnly || MATCHING_KINDS.has(op.match_kind);

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
  // The RPC already returns the volunteer's list ordered by match_rank,
  // then newest first. Nothing to re-sort client-side.
  const finalList = onlyId
    ? filtered.filter((op) => String(op.id) === String(onlyId))
    : filtered;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1
            className="text-3xl md:text-4xl font-bold mb-3"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Volunteer opportunities
          </h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Roles across Windsor, Maidenhead and Slough. Filter by town and by
            when you are free, then register your interest in the ones that fit.
          </p>

          {/* Safeguarding. This was set in the smallest, faintest type on the
              page; it is the most important sentence on it. */}
          <p
            className="mt-4 text-sm rounded-xl px-4 py-3"
            style={{
              backgroundColor: 'var(--color-background-secondary)',
              color: 'var(--color-text-secondary)',
              borderLeft: '3px solid var(--color-brand)',
            }}
          >
            Some roles need a DBS check.{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              Well Windsor does not vet or DBS-check anyone.
            </strong>{' '}
            Each organisation is responsible for its own checks, and will tell
            you what it needs.
          </p>
        </div>

        {userProfile?.role === 'volunteer' && (
          <Link to="/volunteer-dashboard" className="btn-outline whitespace-nowrap">
            Your applications
          </Link>
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
              {TOWN_FILTER_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
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
        <p className="text-center text-gray-600">
          {(opps ?? []).length === 0
            ? 'No opportunities available right now.'
            : 'No opportunities match these filters. Try clearing them.'}
        </p>
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {finalList.map((op) => {
            const alreadyEnquired = !!userProfile?.id && appliedSet.has(op.id);
            const orgName = (op.org_name ?? orgNameById.get(op.org_id)) || 'Organisation';

            // Availability badge, volunteers only -- it is a statement about
            // *your* schedule, so it means nothing to a logged-out visitor.
            const badge =
              userProfile?.role === 'volunteer' ? MATCH_BADGES[op.match_kind] : null;

            return (
              <li key={op.id} className="card p-6 flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-xl font-semibold">{op.title}</h2>
                  {badge && (
                    <span className={badge.classes} title={badge.title}>
                      {badge.label}
                    </span>
                  )}
                </div>

                <p className="text-sm -mt-1" style={{ color: 'var(--color-brand-ink)' }}>
                  <span className="font-medium">{orgName}</span>
                </p>

                <p style={{ color: 'var(--color-text-secondary)' }}>{op.description}</p>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  📍 {op.location}
                  {op.town && op.town !== op.location ? ` (${op.town})` : ''}
                </div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  👥 Volunteers Needed: {op.volunteers_needed ?? 'N/A'}
                </div>

                {/* Schedule summary */}
                {op.generally_needed ? (
                  <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>🕒 Available anytime</p>
                ) : Array.isArray(op.when_needed) && op.when_needed.length > 0 ? (
                  <div className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="font-semibold">🕒 Schedule: </span>
                    <span>{formatOpportunitySchedule(op)}</span>
                  </div>
                ) : null}

                {/* Safeguarding. The platform vets nobody; say so where the
                    requirement is, not only in the page preamble. */}
                {op.requires_dbs && (
                  <p className="text-sm mt-2">
                    <span className="badge-warning">DBS check required</span>{' '}
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      — arranged by the organisation, not by Well Windsor.
                    </span>
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2 mt-auto">
                  {userProfile?.role === 'volunteer' && (
                    <>
                      {alreadyEnquired ? (
                        <button
                          className="btn-secondary opacity-60 cursor-not-allowed"
                          disabled
                          title="You have applied to this opportunity"
                        >
                          Applied
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          onClick={() => handleApply(op.id)}
                          title="Apply for this opportunity"
                        >
                          Apply
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
