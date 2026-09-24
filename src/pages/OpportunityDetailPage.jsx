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
//
// WF9-1: the two people RLS does NOT hide a non-public role from are the
// organisation that posted it and an administrator, and for them the page
// used to look exactly like the live one, register button and all. It now
// checks public_opportunities -- the single definition of publicly visible --
// and says plainly that nobody else can see this.
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useEffect, useState } from 'react';
import { blocksFromTimeblockRows } from '../utils/schedule';
import RoleDetailBody from '../components/RoleDetailBody';

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
          generally_needed,
          volunteers_needed,
          status,
          deleted_at,
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

  // WF9-1. This page deliberately still reads the TABLE above, because an
  // organisation previewing its own draft has to be able to see it. That is
  // also why it cannot tell, from the row alone, whether anyone else can:
  // a removed role keeps `status = 'active'`, and a role whose organisation
  // has not been approved looks perfectly ordinary from here.
  //
  // So ask public_opportunities, which is the one definition of publicly
  // visible, rather than re-deriving the rule from three columns and getting
  // a fourth answer. A row back means a volunteer would see this page; no row
  // means the notice below, and no register button.
  const { data: publicRow, isPending: publicPending } = useQuery({
    queryKey: ['opportunity_is_public', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_opportunities')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const isPubliclyVisible = !!publicRow;

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

  // ROLE-5. opportunity_timeblocks is the schedule — the whole schedule, and
  // the only one. The `when_needed` jsonb this page used to fall back to has
  // been dropped: it was NULL on every live role while eight of them had real
  // timeblocks, so the fallback could only ever have said "Schedule TBC"
  // about a role whose times the matcher had just used.
  //
  // anon holds SELECT here and `public_read_active_blocks` gates it on the
  // parent being active and not removed, so this works logged out and goes
  // quiet the moment a role is taken down.
  // The chosen skills. A separate query for the same reason the timeblocks
  // are: they are rows, not a column, and anon can read them exactly when it
  // can read the role (the opportunity_skills read policy mirrors
  // public_read_active_blocks).
  const { data: opSkills } = useQuery({
    queryKey: ['opportunity_skills', id],
    enabled: !!op?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_skills')
        .select('skill_id, skills(name, sort_order)')
        .eq('opportunity_id', id);
      if (error) throw error;
      return (data ?? []).sort(
        (a, b) => (a.skills?.sort_order ?? 0) - (b.skills?.sort_order ?? 0)
      );
    },
    staleTime: 60_000,
  });

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

  // Both queries are gated together so the notice and the register button
  // cannot flash the wrong state for a frame while the second one lands.
  if (isPending || publicPending) {
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

  // Why this role is not public, in the order that matters: removal is
  // terminal and beats everything, then the role's own status, and only then
  // the organisation's approval. Anyone reading this is the organisation that
  // owns the role or an administrator -- a volunteer or a logged-out visitor
  // cannot read the row at all, and gets the not-found branch above.
  const notPublicReason = isPubliclyVisible
    ? null
    : op.deleted_at
      ? 'This role has been removed, so volunteers can no longer see it or register for it. Removal is permanent.'
      : op.status === 'draft'
        ? 'This is a draft. Only you can see it. Publish it from your dashboard when it is ready.'
        : op.status === 'closed'
          ? 'This role is closed, so it is not on the public list. You can reopen it from the edit form while its dates are still ahead.'
          : 'This role is not on the public list yet, because the organisation that posted it is still waiting to be approved.';

  const blocks = blocksFromTimeblockRows(timeblocks ?? []);

  // POLISH-4. Rows in opportunity_skills, read straight off the role. This
  // page reads the TABLE rather than public_opportunities (an organisation
  // has to be able to preview its own draft), so the names come from a join
  // of their own rather than the view's skill_names array.
  const skillList = (opSkills ?? []).map((r) => r.skills?.name).filter(Boolean);

  // Everything that turns these into chips, When rows and a next session
  // lives in RoleDetailBody now, so the preview on the role forms renders
  // the same thing rather than a second copy of the rules.
  // WF-polish. The full-bleed photograph is gone. It was never the
  // organisation's -- opportunityImages.js picks one of six stock pictures
  // from the role's category, and with almost no row carrying a category most
  // got one of three neutral fallbacks hashed off the id. It could not be
  // sharp either: the widest rendition is 800px and the band was the width of
  // the window, so the browser upscaled it and then cropped a 3:2 photo into a
  // 288px letterbox. The browse cards keep theirs, where 800w is ample.
  return (
    <div id="main-content">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary btn-sm mb-6"
          aria-label="Go back"
        >
          &larr; Back
        </button>

        {notPublicReason && (
          <div
            className="mb-6 rounded-xl px-4 py-3 text-sm"
            role="status"
            style={{
              backgroundColor: 'var(--color-background-secondary)',
              color: 'var(--color-text-secondary)',
              borderLeft: '3px solid var(--color-brand)',
            }}
          >
            <strong style={{ color: 'var(--color-text-primary)' }}>
              Not visible to volunteers.
            </strong>{' '}
            {notPublicReason}
          </div>
        )}

        <div>
          <RoleDetailBody
            op={op}
            orgName={orgName}
            orgHomeTown={org?.home_town}
            orgBio={org?.bio}
            blocks={blocks}
            skillNames={skillList}
          />

          <hr className="my-8" style={{ borderColor: 'var(--color-border)' }} />

          {/* ---------------- the action ---------------- */}
          <div className="flex flex-wrap items-center gap-3">
            {!isPubliclyVisible ? (
              // No register button on a role nobody can register for. The
              // reason is already on screen in the notice above, so this
              // says nothing further.
              null
            ) : !profile ? (
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
              product and the copy must not imply one. It is a promise about
              what happens after registering, so it goes with the register
              button: on a role nobody can register for it would be describing
              something that cannot happen. */}
          {isPubliclyVisible && (
            <p className="mt-3 max-w-[56ch] text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {orgName} will email you directly if they would like to take it
              further. You may not hear back from every role you register for.
              That is normal, and it is not a reflection on you.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
