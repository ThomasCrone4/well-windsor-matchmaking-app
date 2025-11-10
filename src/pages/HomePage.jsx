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
  const [stats, setStats] = useState({ hours: 0, volunteers: 0, opportunities: 0 });

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
    // NOTE: using 'organisation' (UK spelling) to match your DB
    if (role === 'organisation') return '/post-opportunity';
    if (role === 'volunteer') return '/opportunities';
    // fallback if some other role appears
    return '/auth';
  }, [isLoggedIn, role]);

  /**
   * Fetch real-time stats
   */
  useEffect(() => {
    const fetchStats = async () => {
      const { data: hoursRows } = await supabase
        .from('applications')
        .select('logged_hours');

      const { data: volunteerCount } = await supabase.rpc('count_volunteers');

      const { data: oppRows } = await supabase
        .from('volunteer_opportunities')
        .select('id');

      const totalHours = (hoursRows || [])
        .map((r) => Number(r.logged_hours) || 0)
        .reduce((a, b) => a + b, 0);

      setStats({
        hours: totalHours,
        volunteers: volunteerCount ?? 0,
        opportunities: oppRows?.length || 0,
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
      const { data, error } = await supabase
        .from('user_profiles')
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* HERO */}
      <section className="bg-gradient-to-br from-brand-heroFrom to-brand-heroTo">
        <div className="container py-12 text-center">
          <h1 className= "text-3xl md:text-5xl font-bold text-red-500 mb-3">
            This site is under development
          </h1>
          <h1 className="text-3xl md:text-5xl font-bold text-brand-blue mb-3">
            Connect with volunteer opportunities in Windsor
          </h1>
          <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
            Sign up to support local schools and organisations. Find roles that match your skills, location, and availability.
          </p>

          {/* Single "Get Started" that routes based on auth + role */}
          <Link
            to={getStartedPath}
            className="btn-primary px-6 py-3 rounded-2xl shadow-card inline-block"
          >
            Get Started
          </Link>

          {/* Impact quick stats in the hero */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="card">
              <p className="text-3xl font-bold text-brand-blue">
                {stats.hours.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">Volunteer Hours</p>
            </div>
            <div className="card">
              <p className="text-3xl font-bold text-brand-blue">
                {stats.volunteers.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">Volunteers Engaged</p>
            </div>
            <div className="card">
              <p className="text-3xl font-bold text-brand-blue">
                {stats.opportunities.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">Opportunities Posted</p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Two-up cards */}
        <div className="container grid md:grid-cols-2 gap-6 py-10">
          <div className="card">
            <h2 className="text-xl font-semibold mb-2 text-gray-900">For Volunteers</h2>
            <ul className="text-gray-700 list-disc list-inside space-y-1">
              <li>Browse opportunities</li>
              <li>Sign up to volunteer</li>
              <li>Track your impact</li>
            </ul>
            <Link
              to="/opportunities"
              className="mt-4 inline-block btn-primary rounded-xl"
            >
              Find Opportunities
            </Link>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold mb-2 text-gray-900">For Organisations</h2>
            <ul className="text-gray-700 list-disc list-inside space-y-1">
              <li>Browse public volunteer profiles</li>
              <li>Submit volunteer needs</li>
              <li>Engage with the community</li>
            </ul>
            <Link
              to="/organization-dashboard"
              className="mt-4 inline-block btn-primary rounded-xl"
            >
              Submit Needs
            </Link>
          </div>
        </div>

        {/* Upcoming opportunities */}
        <section className="container pb-12">
          <div className="page-header">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">📅 Upcoming Opportunities</h2>
            <div className="flex gap-2">
              <Link to="/opportunities" className="btn-primary rounded-xl">
                More
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card">
            {isLoading ? (
              <p className="p-6 text-gray-600">Loading...</p>
            ) : topThree.length > 0 ? (
              <ul className="divide-y">
                {topThree.map((op) => {
                  const orgName = orgNameById.get(op.org_id) ?? 'Organisation';
                  return (
                    <li key={op.id}>
                      <Link
                        to={`/opportunities?opId=${op.id}`}
                        className="flex items-center justify-between py-4 px-6 block hover:bg-gray-50 transition rounded-xl"
                        aria-label={`View ${op.title}`}
                      >
                        <div>
                          <p className="text-lg font-medium text-gray-900">{op.title}</p>
                          {/* 👇 Replaced location with org name */}
                          <p className="text-sm text-gray-600">by {orgName}</p>
                        </div>

                        {/* Unified schedule label (Days • Time • Date) from schedule.js */}
                        <p className="text-sm text-gray-500">
                          Dates & Times:
                          <span className="ml-2">{formatOpportunitySchedule(op)}</span>
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-6 text-gray-600">No upcoming opportunities.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
