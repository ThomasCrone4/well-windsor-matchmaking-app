import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CardSkeleton from '../../../components/skeletons/CardSkeleton';
import { summariseOutreach, cooldownHoursRemaining } from '../../../utils/outreach';
import useUserProfile from '../../../hooks/useUserProfile';
import ApprovalNotice from '../../../components/ApprovalNotice';
import { isPendingOrganisation } from '../../../utils/approval';
import { useTowns } from '../../../utils/towns';
import Pagination from '../../../components/Pagination';

export default function LookingForVolunteersPage() {
  const [filters, setFilters] = useState({ town: 'All', skill: 'All' });
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // WF9-4. 10 a page, the same component and the same rules as the browse:
  // the page number in the query string so Back works, clamped so a silly
  // ?page= shows the last page rather than an empty one, and back to page 1
  // whenever a filter changes.
  const PER_PAGE = 10;
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const setPage = (n) => {
    const next = new URLSearchParams(searchParams);
    if (n <= 1) next.delete('page');
    else next.set('page', String(n));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const resetPage = () => {
    if (page !== 1) setPage(1);
  };
  const { profile } = useUserProfile();
  // The view returns nothing to an unapproved organisation, which on its
  // own reads as "there are no volunteers". Say why instead.
  const pending = isPendingOrganisation(profile);

  // 1) Get current org user id
  const { data: sessionUser } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const orgId = sessionUser?.id;

  // 2) Load volunteers list
  const { data, error, isLoading } = useQuery({
    queryKey: ['volunteer_profiles'],
    queryFn: async () => {
      // The role and public_profile filters used to live here, in the
      // client, where anyone could bypass them by calling the API directly.
      // They are now enforced by the public_volunteers view, which also
      // omits dob, email and contact_number entirely.
      // WF9-4: ordered, because this list is now sliced into pages. Postgres
      // makes no promise about the order of an unordered SELECT, so without
      // this two requests could return the same rows in a different sequence
      // and a volunteer could appear on both page 1 and page 2, or on
      // neither. That is invisible until the list is paginated.
      const { data, error } = await supabase
        .from('public_volunteers')
        .select('id, name, home_town, skills, bio, skill_ids, skill_names')
        .order('name', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // 3) Load which volunteers this org has already written to. The log is
  //    the org's own outreach; org_outreach_sent is filtered to the
  //    caller, so there is no org_id predicate to get wrong here.
  const { data: outreachRows, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['org_outreach_sent'],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_outreach_sent')
        .select('volunteer_id, created_at, status')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const outreachByVolunteer = useMemo(() => summariseOutreach(outreachRows), [outreachRows]);

  // The active towns. This used to be derived from the volunteers listed,
  // because home_town was free text and a real volunteer was in London. It
  // is a foreign key to `towns` now, and a town cannot be deactivated while
  // anyone lives in it, so every volunteer is in one of these. And with only
  // one, there is no filter at all (ADM-6, src/utils/towns.js).
  const { towns, showPicker: showTownFilter } = useTowns();

  // POLISH-4. The skill filter's options, built from the skills the listed
  // volunteers actually hold rather than from the whole managed list -- the
  // same rule as the organisation filter on the browse, so no choice can lead
  // to an empty page. A skill the admin has since hidden still appears here
  // while somebody holds it, which is the point of hiding being soft.
  const skillOptions = useMemo(() => {
    const seen = new Map();
    for (const v of data ?? []) {
      (v.skill_ids ?? []).forEach((id, i) => {
        const name = (v.skill_names ?? [])[i];
        if (name && !seen.has(id)) seen.set(id, name);
      });
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filterVolunteers = (vols) =>
    vols.filter((v) => {
      const matchesTown =
        !showTownFilter || filters.town === 'All' || v.home_town === filters.town;
      // POLISH-4. By id, not by name: filtering on a label would go wrong the
      // moment an admin renames a skill, and the rename would silently empty
      // this list rather than failing loudly.
      const matchesSkill =
        filters.skill === 'All' || (v.skill_ids ?? []).includes(filters.skill);
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (v.name || '').toLowerCase().includes(q) ||
        (v.skill_names ?? []).join(' ').toLowerCase().includes(q) ||
        (v.bio || '').toLowerCase().includes(q);
      return matchesTown && matchesSkill && matchesSearch;
    });

  const handleEnquire = (volunteerId) => {
    if (!orgId) {
      toast.error('Please log in as an organisation.');
      navigate('/auth');
      return;
    }

    // Told here as well as on the compose page, so nobody writes a
    // message they cannot send. The server enforces it either way.
    const hoursLeft = cooldownHoursRemaining(outreachByVolunteer.get(volunteerId)?.lastSentAt);
    if (hoursLeft > 0) {
      toast.error(
        `You contacted this volunteer in the last 24 hours. You can write again in ${hoursLeft} hour${
          hoursLeft === 1 ? '' : 's'
        }.`
      );
      return;
    }

    navigate(`/volunteers/${volunteerId}/enquire`);
  };

  // WF9-2. renderAvailability() and its date formatter stood here, printing
  // a volunteer's weekly grid on their card ("Every Monday, Tuesday, 09:00 to
  // 16:00"). It read the most confidently worded stale data on the site: a
  // grid filled in at sign-up and almost never revisited. An organisation now
  // asks about times in its own message, where the answer is current.

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="title">Find volunteers</h1>
      <CardSkeleton count={6} />
    </div>
  );
  if (error)
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="empty" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="empty-title">Could not load volunteers</p>
          <p className="empty-desc">Please refresh the page and try again.</p>
        </div>
      </div>
    );

  const filtered = filterVolunteers(data || []);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" id="main-content">
      <div className="page-head">
        {pending && (
          <ApprovalNotice>
            Volunteers who have chosen to be discoverable appear here once Well
            Windsor has approved your organisation. That review protects them:
            it is the only check between a volunteer and whoever signs up.
          </ApprovalNotice>
        )}
        <h1 className="title">Find volunteers</h1>
        <p className="page-description">
          Volunteers who have chosen to be listed here. Write to anyone who looks like a fit
          and we will email them on your behalf. Their reply comes straight to your inbox.
          You can write to the same volunteer once every 24 hours.
        </p>

        {/* Was a lone centred green button in the middle of a left-aligned
            page. btn-success is a status colour, not an action colour. */}
        <div className="page-actions">
          <Link to="/organization/sent-enquiries" className="btn-secondary">
            Messages sent
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className={`form-grid ${showTownFilter ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {/* Search */}
          <div className="form-row">
            <label htmlFor="search" className="label">Search</label>
            <input
              id="search"
              type="text"
              placeholder="Name, skills, bio…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                resetPage();
              }}
              className="input"
            />
          </div>

          {/* Skill (POLISH-4). Built from the skills volunteers actually
              hold, not from the whole list, so no choice can lead to an empty
              page -- the same rule as the organisation filter on the browse.
              A hidden skill still appears here while somebody holds it. */}
          <div className="form-row">
            <label htmlFor="skill" className="label">Skill</label>
            <select
              id="skill"
              value={filters.skill}
              onChange={(e) => {
                setFilters((f) => ({ ...f, skill: e.target.value }));
                resetPage();
              }}
              className="select"
            >
              <option value="All">All skills</option>
              {skillOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Town — only when there is more than one (ADM-6) */}
          {showTownFilter && (
            <div className="form-row">
              <label htmlFor="town" className="label">Town</label>
              <select
                id="town"
                value={filters.town}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, town: e.target.value }));
                  resetPage();
                }}
                className="select"
              >
                {['All', ...towns].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
   

          {/* Clear */}
          <div className="form-row">
            <label className="label">&nbsp;</label>
            <button
              type="button"
              onClick={() => {
                setFilters({ town: 'All'});
                setSearchTerm('');
                resetPage();
              }}
              className="btn-secondary"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No volunteers match those filters</p>
          <p className="empty-desc">
            Only volunteers who have chosen to be listed appear here. Try
            clearing the search.
          </p>
        </div>
      ) : (
        <ul className="space-y-6">
          {visible.map((vol) => {
            const outreach = outreachByVolunteer.get(vol.id);
            const hoursLeft = cooldownHoursRemaining(outreach?.lastSentAt);
            return (
              // data-volunteer-id so a card has a stable identity in the
              // DOM. Two volunteers can share a name, and two throwaway
              // accounts on production share name, bio, town AND skills --
              // so nothing on screen distinguished them, and "is any row
              // served on two pages at once" was not checkable at all.
              <li key={vol.id} data-volunteer-id={vol.id} className="card p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{vol.name}</h2>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{vol.bio}</p>
                  </div>
                  {outreach?.contacted && (
                    <span className="badge badge-success shrink-0">Contacted</span>
                  )}
                </div>

                {/* Was three text-gray-600 lines led by 🏠 🛠️ 📋 -- a
                    hardcoded grey that responded to neither theme, and
                    emoji standing in for labels. */}
                <dl className="grid gap-3 pt-1 sm:grid-cols-2">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] block" style={{ color: 'var(--color-text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>Home town</span>
                    <dd className="mt-0.5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {vol.home_town || 'Not given'}
                    </dd>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] block" style={{ color: 'var(--color-text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>Skills</span>
                    <dd className="mt-1">
                      {(vol.skill_names ?? []).length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {vol.skill_names.map((n) => (
                            <span key={n} className="chip">{n}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          None listed
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="pt-2">
                  <button
                    className={`btn-primary ${hoursLeft > 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                    disabled={hoursLeft > 0 || isLoadingContacts}
                    onClick={() => handleEnquire(vol.id)}
                    title={
                      hoursLeft > 0
                        ? `You contacted this volunteer recently. You can write again in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
                        : 'Contact volunteer'
                    }
                  >
                    {hoursLeft > 0
                      ? `Contact again in ${hoursLeft}h`
                      : outreach?.contacted
                      ? 'Contact again'
                      : 'Contact volunteer'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={safePage}
        pageCount={pageCount}
        onChange={setPage}
        total={filtered.length}
        perPage={PER_PAGE}
        noun="volunteer"
      />
    </div>
  );
}
