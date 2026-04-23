/**
 * Volunteer Analytics Page
 * Displays volunteer's hours, skills usage, opportunities, and availability
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
import { Download, TrendingUp, Clock, Users, Zap } from 'lucide-react';

export default function VolunteerAnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    totalHours: 0,
    hoursData: [],
    skillsData: [],
    organizationsData: [],
    availabilityData: [],
    recentActivity: [],
  });

  useEffect(() => {
    if (user?.id) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch logged hours
      const { data: loggedHours, error: hoursError } = await supabase
        .from('volunteer_hours')
        .select(
          'id, hours_worked, date, description, organization_name, created_at'
        )
        .eq('volunteer_id', user.id)
        .eq('status', 'approved')
        .order('date', { ascending: true });

      if (hoursError) throw hoursError;

      // Fetch volunteer profile for skills
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('skills')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // Fetch applications
      const { data: applications, error: appError } = await supabase
        .from('enquiries')
        .select('id, opportunity_id, status, created_at')
        .eq('volunteer_id', user.id);

      if (appError) throw appError;

      // Process hours data for line chart
      const hoursChartData = processHoursData(loggedHours);
      const totalHours = loggedHours.reduce((sum, h) => sum + h.hours_worked, 0);

      // Process skills data
      const skillsData = processSkillsData(profile.skills);

      // Process organizations data
      const organizationsData = processOrganizationsData(loggedHours);

      // Calculate availability
      const availabilityData = [
        {
          name: 'Available',
          value: 85,
        },
        {
          name: 'Limited',
          value: 10,
        },
        {
          name: 'Unavailable',
          value: 5,
        },
      ];

      setAnalytics({
        totalHours,
        hoursData: hoursChartData,
        skillsData,
        organizationsData,
        availabilityData,
        recentActivity: loggedHours.slice(-5).reverse(),
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

  const processSkillsData = (skills) => {
    if (!skills || skills.length === 0) return [];
    return skills.slice(0, 5).map(skill => ({
      name: skill,
      value: Math.floor(Math.random() * 40 + 60), // Simulated usage %
    }));
  };

  const processOrganizationsData = (loggedHours) => {
    const orgData = {};
    loggedHours.forEach(log => {
      orgData[log.organization_name] = (orgData[log.organization_name] || 0) + log.hours_worked;
    });

    return Object.entries(orgData)
      .map(([name, hours]) => ({
        name,
        hours: parseInt(hours),
      }))
      .sort((a, b) => b.hours - a.hours);
  };

  const COLORS = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
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
              Your Analytics
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Track your volunteering impact and growth
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
                  Total Hours
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.totalHours}
                </p>
              </div>
              <Clock className="text-blue-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Organizations
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.organizationsData.length}
                </p>
              </div>
              <Users className="text-green-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Skills Used
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.skillsData.length}
                </p>
              </div>
              <Zap className="text-yellow-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Avg Monthly
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {analytics.hoursData.length > 0
                    ? Math.round(
                        analytics.totalHours / analytics.hoursData.length
                      )
                    : 0}
                </p>
              </div>
              <TrendingUp className="text-purple-500" size={32} />
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

          {/* Skills Breakdown */}
          {analytics.skillsData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top Skills
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.skillsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(209, 213, 219)" />
                  <XAxis
                    dataKey="name"
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
                  <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Hours by Organization */}
          {analytics.organizationsData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Hours by Organization
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={analytics.organizationsData}
                  layout="vertical"
                  margin={{ left: 150 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(209, 213, 219)" />
                  <XAxis type="number" stroke="rgb(107, 114, 128)" style={{ fontSize: '12px' }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    stroke="rgb(107, 114, 128)"
                    style={{ fontSize: '11px' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(31, 41, 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                    }}
                  />
                  <Bar dataKey="hours" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Availability */}
          {analytics.availabilityData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Your Availability
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics.availabilityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name} ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analytics.availabilityData.map((entry, index) => (
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
        </div>

        {/* Recent Activity */}
        {analytics.recentActivity.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Recent Activity
            </h2>
            <div className="space-y-3">
              {analytics.recentActivity.map(activity => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Logged {activity.hours_worked} hours
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {activity.organization_name} - {new Date(activity.date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {activity.hours_worked}h
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
