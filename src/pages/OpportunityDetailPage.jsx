// One role, in full. This page did not exist before.
//
// /opportunities/:id/enquire is the form you fill in AFTER deciding, and it
// selects five columns -- not enough to decide from. So a volunteer's only
// view of a role was the browse card, and a link to a single role could not
// be shared at all.
//
// Public on purpose: the RLS policy `opportunities: public reads active
// only` already lets anon read an active row, so a logged-out visitor can
// read the whole thing and is asked to sign in only at the point of
// registering interest. A draft or closed role returns nothing here, which
// is the not-found branch.
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useEffect, useState } from 'react';
import { formatOpportunitySchedule, DAYS } from '../utils/schedule';
import OpportunityPhoto from '../components/OpportunityPhoto';

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) return;

      const { data } = await supabase
        .from('user_profiles')
        .select('id, role')
        .eq('id', userId)
        .single();

      if (data) setProfile(data);
    };
    fetchProfile();
  }, []);

  const {
    data: op,
    isPending,
    error,
  } = useQuery({
    queryKey: ['opportunity_detail', id],
    queryFn: async () => {
      // Named columns, not select('*'): '*' would drag the pgvector
      // embedding column across the wire on every view, and would hand a
      // logged-out visitor the organisation's contact address, which this
      // page deliberately does not show.
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select(
          `
          id,
          title,
          description,
          location,
          town,
          requires_dbs,
          when_needed,
          generally_needed,
          volunteers_needed,
          skills,
          status,
          org_id,
          category,
          created_at
        `
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: org } = useQuery({
    queryKey: ['opportunity_detail_org', op?.org_id],
    enabled: !!op?.org_id,
    queryFn: async () => {
      // public_organisations, not user_profiles: a fixed, contact-free
      // column list that cannot widen into an email address.
      const { data, error } = await supabase
        .from('public_organisations')
        .select('id, name, home_town, bio')
        .eq('id', op.org_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  // The schedule lives in TWO places and they disagree. `when_needed` is the
  // jsonb the forms write for their own editing UX; `opportunity_timeblocks`
  // is the normalised mirror that match_opportunities_by_availability
  // actually matches on. On the seed rows when_needed is NULL while a
  // timeblock exists, so formatting from when_needed alone reports
  // "Schedule TBC" for a role that has times -- the facts panel would be
  // stating the opposite of what the matcher just used. Read the table the
  // matcher reads, and fall back to when_needed.
  //
  // anon holds SELECT here and `public_read_active_blocks` gates it on the
  // opportunity being active, so this works logged out.
  const { data: timeblocks } = useQuery({
    queryKey: ['opportunity_timeblocks', id],
    enabled: !!op?.id && !op?.generally_needed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_timeblocks')
        .select('days, start_time, end_time, start_date, end_date')
        .eq('opportunity_id', id);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const isVolunteer = profile?.role === 'volunteer';

  // Whether this volunteer has already registered interest. Defaulted
  // rather than gated on a loading flag: with `enabled` false this query
  // reports isLoading false while disabled, so a guard on it would fall
  // straight through and read undefined.
  const { data: existingApplications } = useQuery({
    queryKey: ['my_application_for', id, profile?.id],
    enabled: !!profile?.id && isVolunteer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id')
        .eq('opportunity_id', id)
        .eq('volunteer_id', profile.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const alreadyRegistered = (existingApplications ?? []).length > 0;

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10" id="main-content">
        <div className="skeleton h-56 w-full rounded-2xl" />
        <div className="skeleton-line mt-6 w-1/3" />
        <div className="skeleton-line mt-3 w-2/3" />
        <div className="skeleton-line mt-3 w-1/2" />
      </div>
    );
  }

  if (error || !op) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center" id="main-content">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          This role isn&rsquo;t available
        </h1>
        <p className="mt-3" style={{ color: 'var(--color-text-secondary)' }}>
          It may have been filled, closed, or never published. Have a look at
          what else is open.
        </p>
        <Link to="/opportunities" className="btn-primary mt-6">
          Browse roles
        </Link>
      </div>
    );
  }

  const orgName = org?.name ?? 'Organisation';

  // opportunity_timeblocks stores days as int[] 0..6 in DAYS order; the
  // formatter wants labels.
  const blocksFromTable = (timeblocks ?? []).map((b) => ({
    ...b,
    days: (b.days ?? []).map((i) => DAYS[i]).filter(Boolean),
  }));

  const schedule = op.generally_needed
    ? 'Flexible — the organisation has no fixed times for this role'
    : formatOpportunitySchedule(
        blocksFromTable.length ? { ...op, when_needed: blocksFromTable } : op
      );

  // Facts the database actually holds. The mockup's panel also has a
  // "Commitment" row (“about 2 hours a week”); there is no column behind
  // that and it is not derivable from the schedule, so it is left out
  // rather than invented.
  const facts = [
    { term: 'When', value: schedule },
    {
      term: 'Where',
      // location is the venue and town is the filter key, but plenty of
      // rows put the same string in both -- "Windsor · Windsor" is not a
      // location, it is a bug wearing a separator.
      value:
        [op.location, op.town === op.location ? null : op.town]
          .filter(Boolean)
          .join(' · ') || 'To be confirmed',
    },
    {
      term: 'DBS check',
      value: op.requires_dbs
        ? 'Required — arranged by the organisation, not by Well Windsor'
        : 'Not required for this role',
    },
    {
      term: 'Volunteers needed',
      value: op.volunteers_needed ? String(op.volunteers_needed) : 'Not specified',
    },
    ...(op.skills?.trim() ? [{ term: 'Helpful skills', value: op.skills }] : []),
  ];

  return (
    <div id="main-content">
      <div className="relative h-52 w-full overflow-hidden sm:h-64 md:h-72">
        <OpportunityPhoto category={op.category} id={op.id} sizes="100vw" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary btn-sm mb-6"
          aria-label="Go back"
        >
          &larr; Back
        </button>

        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr] md:gap-10">
          {/* ---------------- main column ---------------- */}
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--color-brand-ink)' }}
            >
              {orgName}
              {org?.home_town ? ` · ${org.home_town}` : ''}
            </p>

            <h1
              className="mt-1 text-3xl font-bold leading-tight tracking-[-0.025em] md:text-4xl"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {op.title}
            </h1>

            {op.description?.trim() ? (
              <p
                className="mt-5 whitespace-pre-line text-base leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {op.description}
              </p>
            ) : (
              <p className="mt-5 italic" style={{ color: 'var(--color-text-muted)' }}>
                The organisation hasn&rsquo;t written a description for this role
                yet.
              </p>
            )}

            {org?.bio?.trim() && (
              <div className="mt-6">
                <h2
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  About {orgName}
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {org.bio}
                </p>
              </div>
            )}

            {/* ---------------- the action ---------------- */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {!profile ? (
                <Link to="/auth" className="btn-primary px-6 py-3 text-base">
                  Sign in to register interest
                </Link>
              ) : isVolunteer ? (
                alreadyRegistered ? (
                  <button
                    className="btn-secondary cursor-not-allowed px-6 py-3 text-base opacity-60"
                    disabled
                  >
                    Interest registered
                  </button>
                ) : (
                  <Link
                    to={`/opportunities/${op.id}/enquire`}
                    className="btn-primary px-6 py-3 text-base"
                  >
                    Register interest
                  </Link>
                )
              ) : (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  You are signed in as an organisation, so there is nothing to
                  register here.
                </p>
              )}
            </div>

            {isVolunteer && alreadyRegistered && (
              <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                You have already told them you are interested. It is on{' '}
                <Link
                  to="/volunteer-dashboard"
                  className="underline"
                  style={{ color: 'var(--color-brand-ink)' }}
                >
                  your volunteering page
                </Link>
                , where you can withdraw it.
              </p>
            )}

            {/* The honest line. There is no accept or decline in this
                product and the copy must not imply one. */}
            <p className="mt-3 max-w-[56ch] text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {orgName} will email you directly if they would like to take it
              further. You may not hear back from every role you register for —
              that is normal, and it is not a reflection on you.
            </p>
          </div>

          {/* ---------------- facts panel ---------------- */}
          <aside className="self-start">
            <div
              className="rounded-2xl p-5"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-background-elevated)',
              }}
            >
              <dl className="grid gap-4">
                {facts.map((fact) => (
                  <div key={fact.term}>
                    <dt
                      className="text-[10px] font-medium uppercase tracking-[0.1em]"
                      style={{
                        color: 'var(--color-text-muted)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      }}
                    >
                      {fact.term}
                    </dt>
                    <dd
                      className="mt-1 text-sm font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Safeguarding appears wherever a DBS requirement does, not
                only in a page preamble. */}
            {op.requires_dbs && (
              <p
                className="mt-4 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-background-secondary)',
                  color: 'var(--color-text-secondary)',
                  borderLeft: '3px solid var(--color-brand)',
                }}
              >
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  Well Windsor does not vet or DBS-check anyone.
                </strong>{' '}
                {orgName} is responsible for its own checks, and will tell you
                what it needs.
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
