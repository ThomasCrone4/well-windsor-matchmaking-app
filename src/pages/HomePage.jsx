// src/pages/HomePage.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function HomePage() {
  const [stats, setStats] = useState({ hours: 0, volunteers: 0, opportunities: 0});

  // Fetch real-time stats
  useEffect(() => {
    const fetchStats = async () => {
      // Sum hours from applications.logged_hours (adjust table/column if different)
      const { data: hoursRows, error: hoursErr } = await supabase
        .from('applications')
        .select('logged_hours');

      // Volunteers count
      const { data: volunteersRows, error: volErr } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('role', 'volunteer');

      // Opportunities count
      const { data: oppRows, error: oppErr } = await supabase
        .from('volunteer_opportunities')
        .select('id')
        

      if (hoursErr || volErr || oppErr) {
        // swallow errors silently for the hero; you could toast.error here
      }

      const totalHours = (hoursRows || [])
        .map(r => Number(r.logged_hours) || 0)
        .reduce((a, b) => a + b, 0);

      setStats({
        hours: totalHours,
        volunteers: volunteersRows?.length || 0,
        opportunities: oppRows?.length || 0,
      });
    };
    fetchStats();
  }, []);

  // Fetch upcoming opportunities
  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['upcoming_opportunities'],
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
        .order('date_needed', { ascending: true })
        .limit(3);
        
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* HERO */}
      <section className="bg-gradient-to-br from-brand-heroFrom to-brand-heroTo">
        <div className="container py-12 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-brand-blue mb-3">
            Connect with volunteer opportunities in Windsor
          </h1>
          <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
            Sign up to support local schools and organisations. Find roles that match your skills, location, and availability.
          </p>
          <Link
            to="/auth"
            className="btn-primary px-6 py-3 rounded-2xl shadow-card"
          >
            Get Started
          </Link>

          {/* Impact quick stats in the hero */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="card">
              <p className="text-3xl font-bold text-brand-blue">{stats.hours.toLocaleString()}</p>
              <p className="text-sm text-gray-600">Volunteer Hours</p>
            </div>
            <div className="card">
              <p className="text-3xl font-bold text-brand-blue">{stats.volunteers.toLocaleString()}</p>
              <p className="text-sm text-gray-600">Volunteers Engaged</p>
            </div>
            <div className="card">
              <p className="text-3xl font-bold text-brand-blue">{stats.opportunities.toLocaleString()}</p>
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
            <div className='flex gap-2'>
              <Link
                to="/opportunities"
                className="btn-primary rounded-xl"
              >
                More
              </Link>
            </div>
          </div>


          <div className="bg-white rounded-2xl shadow-card">
            {isLoading ? (
              <p className="p-6 text-gray-600">Loading...</p>
            ) : opportunities?.length > 0 ? (
              <ul className="divide-y">
                {opportunities.map((op) => (
                <li key={op.id}>
                  <Link
                    to={`/opportunities?opId=${op.id}`}
                    className="flex items-center justify-between py-4 px-6 block hover:bg-gray-50 transition rounded-xl"
                    aria-label={`View ${op.title}`}
                  >
                    <div>
                      <p className="text-lg font-medium text-gray-900">{op.title}</p>
                      <p className="text-sm text-gray-600">{op.location || 'Location TBC'}</p>
                    </div>
                    <p className="text-sm text-gray-500">
                      {op.date_needed ? format(new Date(op.date_needed), 'MMM d') : 'Anytime'}
                    </p>
                  </Link>
                </li>
              ))}
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
