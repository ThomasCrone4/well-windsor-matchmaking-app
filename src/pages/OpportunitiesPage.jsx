// src/pages/OpportunitiesPage.jsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  formatOpportunitySchedule,
  blocksFromTimeblockRows,
  compareByNextDate,
} from '../utils/schedule';
import CardSkeleton from '../components/skeletons/CardSkeleton';
import OpportunityPhoto from '../components/OpportunityPhoto';
import { useTowns } from '../utils/towns';
import Pagination from '../components/Pagination';

// WF9-2. The availability badge ("Full availability match" and its four
// siblings) and the "Show Matches Only" toggle were here. Both are gone with
// availability matching itself: a weekly grid filled in at sign-up goes stale
// within a week or two, so a badge built on it was making a confident claim
// out of data nobody had reason to keep current. AvailabilityMatrix.jsx stays
// -- the post and edit forms use it for a ROLE's schedule, which an
// organisation does keep current because it is the role's actual times.

export default function OpportunitiesPage() {
  // The Town filter exists only while more than one town is active (ADM-6,
  // src/utils/towns.js). With one town there is nothing to filter by, and
  // `town` stays 'All', which matches everything.
  // WF9-3. The "When" filter is gone. It offered This Week / This Month over
  // a role's FIRST date, which is a different question from "is it on this
  // week", and the answer is now in the ordering instead: soonest next date
  // first. What replaces it is an organisation filter, which is the thing
  // people actually asked for -- "what does my child's school need?"
  const [filters, setFilters] = useState({ town: 'All', org: 'All' });
  const { towns, showPicker: showTownFilter } = useTowns();
  const [userProfile, setUserProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const onlyId = searchParams.get('opId');

  // The page number lives in the query string so Back works: open a role from
  // page 3, press Back, and you are on page 3 rather than at the top.
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const setPage = (n) => {
    const next = new URLSearchParams(searchParams);
    if (n <= 1) next.delete('page');
    else next.set('page', String(n));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // public_opportunities is the single definition of a publicly visible role:
  // active, not removed, and posted by an approved organisation (WF9-1). It
  // has owner rights, so the caller's RLS can neither widen nor narrow it --
  // an admin, an organisation and a logged-out visitor read the same list.
  //
  // WF9-2: there is one query here now, not two. A volunteer used to take a
  // different path entirely -- the match_opportunities_by_availability RPC --
  // so the page had two queries returning slightly different shapes, and a
  // fallback for when the RPC failed. Availability matching is gone, so every
  // reader takes the same path.
  const {
    data: opps,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['public_opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_opportunities')
        .select(`
          id,
          title,
          description,
          location,
          town,
          skills,
          requires_dbs,
          generally_needed,
          volunteers_needed,
          status,
          org_id,
          org_name,
          category,
          created_at
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ROLE-5. The schedule lives in opportunity_timeblocks and nowhere else now.
  // This list used to read the `when_needed` jsonb, which was NULL on every
  // live role while eight of them had real times — so the cards showed no
  // schedule at all and the "This Week"/"This Month" filter had nothing to
  // work with on the logged-out path. One query for the visible ids covers
  // both paths: anon holds SELECT here and `public_read_active_blocks` gates
  // it on the parent being active and not removed.
  const oppIds = useMemo(
    () => (opps ?? []).map((o) => o.id).filter(Boolean),
    [opps]
  );

  const { data: blockRows } = useQuery({
    queryKey: ['browse_timeblocks', oppIds],
    enabled: oppIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_timeblocks')
        .select('opportunity_id, days, start_time, end_time, start_date, end_date')
        .in('opportunity_id', oppIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const blocksByOpp = useMemo(() => {
    const map = new Map();
    for (const row of blocksFromTimeblockRows(blockRows ?? [])) {
      const list = map.get(row.opportunity_id) ?? [];
      list.push(row);
      map.set(row.opportunity_id, list);
    }
    return map;
  }, [blockRows]);

  const handleApply = async (opportunityId) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    if (!user) {
      toast.error('Please sign in to register your interest.');
      navigate('/auth');
      return;
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || profile?.role !== 'volunteer') {
      toast.error('Only volunteers can register interest in a role.');
      return;
    }

    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('volunteer_id', user.id)
      .maybeSingle();

    if (existing) {
      toast.error('You have already registered interest in this role.');
      navigate('/volunteer-dashboard');
      return;
    }

    navigate(`/opportunities/${opportunityId}/enquire`);
  };

  // Only organisations that have a live role, so no option can lead to an
  // empty page. Built from the rows already fetched rather than from
  // public_organisations, which lists every approved organisation including
  // those with nothing posted.
  const orgOptions = useMemo(() => {
    const byId = new Map();
    for (const op of opps ?? []) {
      if (op.org_id && op.org_name && !byId.has(op.org_id)) {
        byId.set(op.org_id, { id: op.org_id, name: op.org_name });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [opps]);

  // Changing a filter returns to page 1. Without this, filtering while on
  // page 3 of an unfiltered list lands on page 3 of a two-page result, which
  // renders as "no opportunities match these filters" -- the filter looks
  // broken when it merely worked.
  const changeFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    if (page !== 1) setPage(1);
  };

  const filterOpportunities = (items) => {
    return items.filter((op) => {
      // town, not location. location is free text ("St Edward's, Windsor")
      // and comparing it to a town name dropped real listings silently.
      // Ignored once the filter is hidden, so a town picked while two were
      // active cannot keep filtering after the second is deactivated.
      const matchesTown =
        !showTownFilter || filters.town === 'All' || op.town === filters.town;

      const matchesOrg = filters.org === 'All' || op.org_id === filters.org;

      // BRW-4. Title alone missed the obvious searches: someone looking for
      // "reading" or "first aid" found nothing unless an organisation had put
      // the word in the title, and searching for a school by name found
      // nothing at all. Description, skills and the organisation's name are
      // all on the card already — this searches what the reader can see.
      const haystack = [op.title, op.description, op.skills, op.org_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = haystack.includes(searchTerm.trim().toLowerCase());

      return matchesTown && matchesOrg && matchesSearch;
    });
  };

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="title">Volunteer opportunities</h1>
      <CardSkeleton count={6} />
    </div>
  );
  if (error)
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="empty" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="empty-title">Could not load opportunities</p>
          <p className="empty-desc">
            Please refresh the page and try again.
          </p>
        </div>
      </div>
    );

  // Every card needs its timeblocks attached before sorting: the ordering key
  // is the role's next date, and that lives in opportunity_timeblocks.
  const withBlocks = (opps ?? []).map((op) => ({
    ...op,
    timeblocks: blocksByOpp.get(op.id) ?? [],
  }));

  const filtered = filterOpportunities(withBlocks);

  // WF9-3. Soonest next date first, "any time" roles after the dated ones.
  // The old order was newest-posted first, which told a reader which
  // organisation had typed most recently and nothing about when they could
  // turn up.
  const sorted = [...filtered].sort(compareByNextDate);

  const finalList = onlyId
    ? sorted.filter((op) => String(op.id) === String(onlyId))
    : sorted;

  // 10 a page. `?opId=` is a single-role deep link, so it is never paginated.
  const PER_PAGE = 10;
  const pageCount = Math.max(1, Math.ceil(finalList.length / PER_PAGE));
  // Clamp rather than trust the query string: ?page=99 or ?page=abc should
  // show the last page, not an empty one that looks like "no results".
  const safePage = Math.min(page, pageCount);
  const visible = onlyId
    ? finalList
    : finalList.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

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
            Volunteering with schools and organisations across Windsor. Filter
            by when you are free, then register your interest in the ones that
            fit.
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
            Your volunteering
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-6">
        {/* Three columns, or four when there is a town to choose. */}
        <div className={`form-grid ${showTownFilter ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {/* Search */}
          <div className="form-row">
            <label htmlFor="search" className="label">Search</label>
            <input
              id="search"
              type="text"
              placeholder="Search roles, skills or organisations…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (page !== 1) setPage(1);
              }}
              className="input"
            />
          </div>

          {/* Town */}
          {showTownFilter && (
            <div className="form-row">
              <label htmlFor="town" className="label">Town</label>
              <select
                id="town"
                value={filters.town}
                onChange={(e) => changeFilter({ town: e.target.value })}
                className="select"
              >
                <option value="All">All towns</option>
                {towns.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Organisation. Built from the roles actually on screen, so every
              option leads somewhere: an organisation with nothing live is not
              offered, and no choice can produce an empty page. */}
          <div className="form-row">
            <label htmlFor="org" className="label">Organisation</label>
            <select
              id="org"
              value={filters.org}
              onChange={(e) => changeFilter({ org: e.target.value })}
              className="select"
            >
              <option value="All">All organisations</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* WF9-2: "Show Matches Only" stood here, next to Clear Filters. */}
          <div className="form-row">
            <button
              type="button"
              onClick={() => {
                setFilters({ town: 'All', org: 'All' });
                setSearchTerm('');
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
        /* text-gray-600 was hardcoded here and responded to neither theme. */
        <p className="text-center" style={{ color: 'var(--color-text-secondary)' }}>
          {(opps ?? []).length === 0
            ? 'No opportunities available right now.'
            : 'No opportunities match these filters. Try clearing them.'}
        </p>
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {visible.map((op) => {
            const alreadyEnquired = !!userProfile?.id && appliedSet.has(op.id);
            const orgName = op.org_name || 'Organisation';
            const blocks = blocksByOpp.get(op.id) ?? [];

            return (
              <li key={op.id} className="card !p-0 flex flex-col overflow-hidden">
                {/* Photograph chosen from the category. There is no image
                    column and no upload, so this is a fallback, not a
                    picture of this role -- see utils/opportunityImages.js. */}
                <Link
                  to={`/opportunities/${op.id}`}
                  className="block h-40 sm:h-44 overflow-hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <OpportunityPhoto
                    category={op.category}
                    id={op.id}
                    sizes="(min-width: 1024px) 45vw, 100vw"
                  />
                </Link>

                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p
                    className="text-xs font-semibold"
                    style={{ color: 'var(--color-brand-ink)' }}
                  >
                    {orgName}
                  </p>

                  <h2 className="text-lg font-semibold leading-snug">
                    <Link to={`/opportunities/${op.id}`} className="hover:underline">
                      {op.title}
                    </Link>
                  </h2>

                  <p
                    className="text-sm line-3"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {op.description}
                  </p>

                  {/* Tags. The schedule, the place and the volunteer count
                      were three labelled lines of emoji; they are the same
                      facts, read faster. */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {op.requires_dbs && <span className="tag">DBS check</span>}
                    {/* ROLE-5. This now reads the same rows the matcher and
                        the detail page read, so the tag can no longer
                        contradict them. It used to read `when_needed`, which
                        was NULL on every live role — the reason no card has
                        ever shown a schedule. Still silent rather than
                        "Schedule TBC" when a non-flexible role genuinely has
                        no times: saying nothing is honest, guessing is not. */}
                    {op.generally_needed ? (
                      <span className="tag-plain">Flexible timing</span>
                    ) : blocks.length > 0 ? (
                      <span className="tag-plain">
                        {formatOpportunitySchedule({ ...op, timeblocks: blocks })}
                      </span>
                    ) : null}
                    {/* location is meant to be the venue -- "St Edward's,
                        Parsonage Lane". On every row today it just repeats
                        the town, so this would print "Windsor" on all
                        fourteen cards: a tag that says the same thing
                        everywhere carries no information. Show it only once
                        it says something the town does not. */}
                    {op.location && op.location !== op.town && (
                      <span className="tag-plain">{op.location}</span>
                    )}
                    {op.volunteers_needed > 1 && (
                      <span className="tag-plain">{op.volunteers_needed} needed</span>
                    )}
                  </div>

                  {/* Safeguarding. The platform vets nobody; say so where the
                      requirement is, not only in the page preamble. */}
                  {op.requires_dbs && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      The DBS check is arranged by the organisation, not by Well
                      Windsor.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-3 mt-auto">
                    <Link to={`/opportunities/${op.id}`} className="btn-secondary btn-sm">
                      Read more
                    </Link>

                    {userProfile?.role === 'volunteer' && (
                      <>
                        {alreadyEnquired ? (
                          <button
                            className="btn-secondary btn-sm opacity-60 cursor-not-allowed"
                            disabled
                            title="You have already registered interest in this role"
                          >
                            Interest registered
                          </button>
                        ) : (
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => handleApply(op.id)}
                            title="Register interest in this role"
                          >
                            Register interest
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!onlyId && (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          total={finalList.length}
          noun="role"
        />
      )}
    </div>
  );
}
