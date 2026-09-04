// src/pages/HomePage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

// 🧠 Reusable schedule helpers (works with AvailabilityMatrix block shape)
import {
  formatOpportunitySchedule,
  compareByEarliestStart,
} from '../utils/schedule';

export default function HomePage() {
  const [stats, setStats] = useState({ organisations: 0, volunteers: 0, opportunities: 0 });

  /**
   * Auth & profile
   */
  const { data: authData } = useQuery({
    queryKey: ['auth_session_home'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data?.session ?? null;
    },
    staleTime: 60_000,
  });

  const userId = authData?.user?.id ?? null;

  const { data: profileData } = useQuery({
    queryKey: ['profile_home', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, role')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const isLoggedIn = !!userId;
  const role = profileData?.role ?? null;

  const getStartedPath = useMemo(() => {
    if (!isLoggedIn) return '/auth';
    // The DB and the rest of the app use the US spelling 'organization'.
    // This previously tested 'organisation', so every logged-in org fell
    // through to the /auth fallback below.
    if (role === 'organization') return '/post-opportunity';
    if (role === 'volunteer') return '/opportunities';
    // fallback if some other role appears
    return '/auth';
  }, [isLoggedIn, role]);

  /**
   * Fetch real-time stats
   */
  // Three counts that are all real. The fourth used to be "Volunteer
  // Hours", summed from applications.logged_hours — a column that was
  // never written to and has now been dropped, so the number was
  // always 0 dressed up as an achievement.
  useEffect(() => {
    const fetchStats = async () => {
      // Both counts go through SECURITY DEFINER functions: anon holds no
      // read grant on user_profiles, so counting from the table would
      // show 0 to exactly the logged-out visitors this page is for.
      const { data: volunteerCount } = await supabase.rpc('count_volunteers');
      const { data: organisationCount } = await supabase.rpc('count_organisations');

      const { count: opportunityCount } = await supabase
        .from('volunteer_opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      setStats({
        organisations: organisationCount ?? 0,
        volunteers: volunteerCount ?? 0,
        opportunities: opportunityCount ?? 0,
      });
    };
    fetchStats();
  }, []);

  /**
   * Fetch opportunities for the "Upcoming" list on Home
   * (includes org_id for name lookup)
   */
  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['upcoming_opportunities_home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select(`
          id,
          title,
          description,
          location,
          contact,
          requires_dbs,
          when_needed,
          generally_needed,
          volunteers_needed,
          status,
          created_at,
          org_id
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false }); // show newest first
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // 🔎 Build a distinct list of org_ids and fetch org names in one query
  const orgIds = useMemo(() => {
    const ids = new Set((opportunities ?? []).map((o) => o.org_id).filter(Boolean));
    return Array.from(ids);
  }, [opportunities]);

  const { data: orgRows } = useQuery({
    queryKey: ['org_names_home', orgIds],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      // public_organisations, not user_profiles. This page is mostly read
      // by logged-out visitors, and the view is a fixed column list that
      // cannot start returning an email or phone number the way a profile
      // row can.
      const { data, error } = await supabase
        .from('public_organisations')
        .select('id, name')
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

  // Sort by earliest start using schedule util; then show top 3
  const topThree = useMemo(() => {
    if (!opportunities) return [];
    return [...opportunities].sort(compareByEarliestStart).slice(0, 3);
  }, [opportunities]);


  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(165deg, var(--color-brand-subtle) 0%, var(--color-background) 62%)',
          }}
        />
        <div className="container relative py-12 md:py-20">
          <div className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
            <div>
              <p
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase mb-5"
                style={{
                  backgroundColor: 'var(--color-brand)',
                  color: 'var(--color-on-brand)',
                }}
              >
                Windsor &middot; Maidenhead &middot; Slough
              </p>

              <h1
                className="text-4xl md:text-6xl font-bold leading-[1.05] mb-4"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Connect with volunteer opportunities in Windsor
              </h1>

              <p
                className="text-lg md:text-xl max-w-xl mb-8"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Support local schools and organisations. Find roles that match
                your skills, your town and the hours you actually have.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link to={getStartedPath} className="btn-primary px-6 py-3 text-base">
                  Get Started
                </Link>
                <Link to="/opportunities" className="btn-outline px-6 py-3 text-base">
                  Browse opportunities
                </Link>
              </div>
            </div>

            {/* The logo PNG has an opaque white background baked in, so it
                is framed deliberately as a plaque rather than left to float
                as a white rectangle on the dark theme. */}
            <div className="hidden md:flex justify-center">
              <div
                className="rounded-3xl p-5 shadow-card"
                style={{ backgroundColor: '#ffffff' }}
              >
                <img
                  src="/WellWindsorLogo.png"
                  alt=""
                  aria-hidden="true"
                  className="w-full max-w-[300px] h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- STATS BAND ----------------
          The brand cyan used as a fill, with on-brand ink on top. It is
          1.66:1 against white, so it can only ever appear this way round. */}
      <section
        style={{
          backgroundColor: 'var(--color-brand)',
          color: 'var(--color-on-brand)',
        }}
      >
        <div className="container py-8">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {[
              [stats.volunteers, 'Volunteers registered'],
              [stats.organisations, 'Local organisations'],
              [stats.opportunities, 'Open opportunities'],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="text-4xl font-bold leading-none">
                  {value.toLocaleString()}
                </dd>
                <dt className="mt-2 text-sm font-medium opacity-80">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <main className="flex-1">
        {/* ---------------- TWO-UP ---------------- */}
        <div className="container grid md:grid-cols-2 gap-6 py-12 md:py-16">
          <div className="card">
            <h2
              className="text-xl font-semibold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              For volunteers
            </h2>
            <ul
              className="space-y-2 mb-5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <li>Browse roles by town, skills and when you are free</li>
              <li>See at a glance which ones fit your availability</li>
              <li>Register your interest in a couple of clicks</li>
            </ul>
            <Link to="/opportunities" className="btn-primary">
              Find opportunities
            </Link>
          </div>

          <div className="card">
            <h2
              className="text-xl font-semibold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              For organisations
            </h2>
            <ul
              className="space-y-2 mb-5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <li>Post what you need and who you need it from</li>
              <li>Browse volunteers who have chosen to be listed</li>
              <li>Contact the people you want, by email, directly</li>
            </ul>
            <Link to="/organization-dashboard" className="btn-primary">
              Post a role
            </Link>
          </div>
        </div>

        {/* ---------------- UPCOMING ---------------- */}
        <section className="container pb-16">
          <div className="flex items-end justify-between mb-5 gap-4">
            <h2
              className="text-2xl md:text-3xl font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Upcoming opportunities
            </h2>
            <Link
              to="/opportunities"
              className="text-sm font-semibold whitespace-nowrap"
              style={{ color: 'var(--color-brand-ink)' }}
            >
              See all &rarr;
            </Link>
          </div>

          {isLoading ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading&hellip;</p>
          ) : topThree.length > 0 ? (
            <ul className="grid gap-4 md:grid-cols-3">
              {topThree.map((op) => {
                const orgName = orgNameById.get(op.org_id) ?? 'Organisation';
                return (
                  <li key={op.id}>
                    <Link
                      to={`/opportunities?opId=${op.id}`}
                      className="card h-full flex flex-col hover:-translate-y-0.5 transition-transform"
                      aria-label={`View ${op.title}`}
                    >
                      <p
                        className="text-lg font-semibold mb-1"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {op.title}
                      </p>
                      <p
                        className="text-sm mb-4"
                        style={{ color: 'var(--color-brand-ink)' }}
                      >
                        {orgName}
                      </p>
                      <p
                        className="text-sm mt-auto"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {formatOpportunitySchedule(op)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              No upcoming opportunities.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
