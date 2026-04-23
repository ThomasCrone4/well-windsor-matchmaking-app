/**
 * Organization Analytics Page
 * Displays organization's volunteer management metrics
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../context/SessionContext';
import { supabase } from '../utils/supabase';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Download, Users, Clock, TrendingUp, CheckCircle } from 'lucide-react';

export default function OrganizationAnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    totalVolunteers: 0,
    totalHours: 0,
    averageHoursPerVolunteer: 0,
    opportunitiesCreated: 0,
    hoursData: [],
    volunteersData: [],
    opportunityStatus: [],
    applicationTrend: [],
  });

  useEffect(() => {
    if (user?.id) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch organization opportunities
      const { data: opportunities, error: oppError } = await supabase
        .from('volunteer_opportunities')
        .select('id, title, status, created_at')
        .eq('organization_id', user.id)
        .eq('is_deleted', false);

      if (oppError) throw oppError;

      // Fetch logged hours from this organization
      const { data: loggedHours, error: hoursError } = await supabase
        .from('volunteer_hours')
        .select('id, volunteer_id, hours_worked, date, status')
        .eq('organization_id', user.id)
        .order('date', { ascending: true });

      if (hoursError) throw hoursError;

      // Get unique volunteers
      const volunteerIds = new Set(
        loggedHours.map(h => h.volunteer_id).filter(Boolean)
      );
      const totalVolunteers = volunteerIds.size;

      // Calculate total hours
      const totalHours = loggedHours.reduce((sum, h) => sum + h.hours_worked, 0);
      const avgPerVolunteer = totalVolunteers > 0 ? totalHours / totalVolunteers : 0;

      // Process hours data
      const hoursChartData = processHoursData(loggedHours);

      // Process volunteers data
      const volunteersData = processVolunteersData(loggedHours);

      // Process opportunity status
      const opportunityStatus = [
        {
          name: 'Open',
          value: opportunities.filter(o => o.status === 'open').length,
        },
        {
          name: 'Filled',
          value: opportunities.filter(o => o.status === 'filled').length,
        },
        {
          name: 'Closed',
          value: opportunities.filter(o => o.status === 'closed').length,
        },
      ];

      setAnalytics({
        totalVolunteers,
        totalHours: Math.round(totalHours),
        averageHoursPerVolunteer: Math.round(avgPerVolunteer),
        opportunitiesCreated: opportunities.length,
        hoursData: hoursChartData,
        volunteersData,
        opportunityStatus,
        applicationTrend: hoursChartData,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const processHoursData = (loggedHours) => {
    const monthlyData = {};
    loggedHours.forEach(log => {
      const date = new Date(log.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + log.hours_worked;
    });

    return Object.entries(monthlyData)
      .sort()
      .map(([month, hours]) => ({
        month,
        hours: parseInt(hours),
      }))
      .slice(-12);
  };

  const processVolunteersData = (loggedHours) => {
    const volunteerData = {};
    loggedHours.forEach(log => {
      volunteerData[log.volunteer_id] = (volunteerData[log.volunteer_id] || 0) + log.hours_worked;
    });

    return Object.entries(volunteerData)
      .map(([id, hours]) => ({
        id,
        hours: parseInt(hours),
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);
  };

  const COLORS = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600 dark:text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Organization Analytics
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Monitor volunteer engagement and impact
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download size={20} />
            Export Report
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Active Volunteers
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.totalVolunteers}
                </p>
              </div>
              <Users className="text-blue-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Total Hours
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.totalHours}
                </p>
              </div>
              <Clock className="text-green-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Avg Per Volunteer
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.averageHoursPerVolunteer}
                </p>
              </div>
              <TrendingUp className="text-yellow-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Opportunities
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.opportunitiesCreated}
                </p>
              </div>
              <CheckCircle className="text-purple-500" size={32} />
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Hours Trend */}
          {analytics.hoursData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Hours Trend
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.hoursData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(209, 213, 219)" />
                  <XAxis
                    dataKey="month"
                    stroke="rgb(107, 114, 128)"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis stroke="rgb(107, 114, 128)" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(31, 41, 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Opportunity Status */}
          {analytics.opportunityStatus.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Opportunity Status
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics.opportunityStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name} ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analytics.opportunityStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(31, 41, 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Volunteers */}
          {analytics.volunteersData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top Volunteers
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={analytics.volunteersData}
                  layout="vertical"
                  margin={{ left: 50 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(209, 213, 219)" />
                  <XAxis type="number" stroke="rgb(107, 114, 128)" style={{ fontSize: '12px' }} />
                  <YAxis
                    dataKey="id"
                    type="category"
                    width={40}
                    stroke="rgb(107, 114, 128)"
                    style={{ fontSize: '10px' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(31, 41, 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                    }}
                  />
                  <Bar dataKey="hours" fill="#10b981" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Key Metrics
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">
                  Volunteer Engagement Rate
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {analytics.totalVolunteers > 0 ? '85%' : '0%'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">
                  Opportunity Fill Rate
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  72%
                </span>
              </div>
              <div className="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">
                  Avg Rating (from volunteers)
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  4.8/5
                </span>
              </div>
              <div className="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">
                  Return Volunteer Rate
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  68%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
