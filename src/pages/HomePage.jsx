import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Footer from '../components/Footer';
import { Link } from 'react-router-dom';

export default function HomePage() {
  const [stats, setStats] = useState({ hours: 0, volunteers: 0, youth: 0 });

  // Fetch real-time stats
  useEffect(() => {
    const fetchStats = async () => {
      const { data: hoursData } = await supabase
        .from('applications')
        .select('logged_hours', { count: 'exact' });

      const { data: volunteerData } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact' })
        .eq('role', 'volunteer');

      const { data: youthData } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact' })
        .ilike('skills', '%mentoring%'); // crude example for youth-related filter

      setStats({
        hours: hoursData?.length ? hoursData.reduce((acc, row) => acc + row.logged_hours, 0) : 0,
        volunteers: volunteerData?.length || 0,
        youth: youthData?.length || 0,
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
        .select('id, title, location, date_needed')
        .gte('date_needed', new Date().toISOString())
        .order('date_needed', { ascending: true })
        .limit(3);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">

      <main className="flex-1 px-6 py-12 max-w-6xl mx-auto">
        <section className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-800">
            Connect with volunteer opportunities in the Windsor community
          </h1>
          <p className="text-gray-600 mb-6">
            Sign up to support local schools and organisations.
          </p>
          <Link
            to="/auth"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2 rounded shadow transition"
          >
            Get Started
          </Link>
        </section>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="border p-6 rounded shadow bg-white">
            <h2 className="text-xl font-semibold mb-2">For Volunteers</h2>
            <ul className="text-gray-700 list-disc list-inside space-y-1">
              <li>Browse opportunities</li>
              <li>Sign up to volunteer</li>
              <li>Track your impact</li>
            </ul>
            <Link to="/opportunities" className="mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
              Find Opportunities
            </Link>
          </div>

          <div className="border p-6 rounded shadow bg-white">
            <h2 className="text-xl font-semibold mb-2">For Schools/Orgs</h2>
            <ul className="text-gray-700 list-disc list-inside space-y-1">
              <li> Browse public volunteer profiles</li>
              <li>Submit volunteer needs</li>
              <li>Engage with the community</li>
            </ul>
            <Link to="/organization-dashboard" className="mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
              Submit Needs
            </Link>
          </div>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">📅 Upcoming Opportunities</h2>
          {isLoading ? (
            <p>Loading...</p>
          ) : opportunities?.length > 0 ? (
            <ul className="divide-y">
              {opportunities.map((op) => (
                <li key={op.id} className="py-4 flex justify-between">
                  <div>
                    <p className="text-lg font-medium">{op.title}</p>
                    <p className="text-sm text-gray-600">{op.location}</p>
                  </div>
                  <p className="text-sm text-gray-500">{format(new Date(op.date_needed), 'MMM d')}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No upcoming opportunities.</p>
          )}
        </section>

        <section className="text-center">
          <h2 className="text-2xl font-bold mb-6">⚡ Our Impact</h2>
          <div className="grid grid-cols-3 gap-4 text-center text-xl text-gray-700">
            <div>
              <p className="text-3xl font-bold text-blue-600">{stats.hours.toLocaleString()}</p>
              <p className="text-sm">Volunteer Hours</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">{stats.volunteers.toLocaleString()}</p>
              <p className="text-sm">Volunteers Engaged</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">{stats.youth.toLocaleString()}</p>
              <p className="text-sm">Youth Mentored</p>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
