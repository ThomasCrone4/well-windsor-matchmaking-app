import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';

export default function LookingForVolunteersPage() {
  const [filters, setFilters] = useState({ town: 'All', dbs: 'Any' });
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const { data, error, isLoading } = useQuery({
    queryKey: ['volunteer_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, home_town, dbs_checked, skills, available_anytime, availability_matrix, bio')
        .eq('role', 'volunteer')
        .eq('public_profile', true);

      if (error) throw error;
      return data;
    },
  });

  const filterVolunteers = (vols) => {
    return vols.filter(v => {
      const matchesTown = filters.town === 'All' || v.home_town === filters.town;
      const matchesDBS =
        filters.dbs === 'Any' ||
        (filters.dbs === 'DBS Required' ? v.dbs_checked : !v.dbs_checked);
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (v.name || '').toLowerCase().includes(q) ||
        (v.skills || '').toLowerCase().includes(q) ||
        (v.bio || '').toLowerCase().includes(q);
      return matchesTown && matchesDBS && matchesSearch;
    });
  };

  const handleEnquire = (volunteerId) => {
    navigate(`/volunteers/${volunteerId}/enquire`);
  };

  const renderAvailability = (vol) => {
    if (vol.available_anytime) return <span className="text-green-700 font-medium">Anytime</span>;
    if (!vol.availability_matrix?.length) return <span className="text-gray-500 italic">Unavailable</span>;

    return (
      <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside mt-1">
        {vol.availability_matrix.map((block, i) => {
          const dayList = block.days?.length
            ? `Every ${block.days.join(', ')}`
            : 'Unspecified days';

          const timeRange =
            block.start_time && block.end_time
              ? `${block.start_time} to ${block.end_time}`
              : 'unspecified times';

          const dateRange =
            block.start_date && block.end_date
              ? `between ${formatDate(block.start_date)} and ${formatDate(block.end_date)}`
              : '';

          return (
            <li key={i}>
              {dayList}, {timeRange} {dateRange && `(${dateRange})`}
            </li>
          );
        })}
      </ul>
    );
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) return <p className="text-center mt-20">Loading volunteers...</p>;
  if (error) return <p className="text-center text-red-600 mt-20">Failed to load volunteers.</p>;

  const filtered = filterVolunteers(data || []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="page-header">
        <h1 className="title">Find Volunteers</h1>

        <div className="flex justify-center mb-6">
          <Link to="/organization/sent-enquiries" className="btn-success">
            Sent Enquiries
          </Link>
        </div>
      </div>
      {/* Filters */}
      <div className="card mb-6">
        <div className="form-grid md:grid-cols-4">
          {/* Search */}
          <div className="form-row">
            <label htmlFor="search" className="label">Search</label>
            <input
              id="search"
              type="text"
              placeholder="Name, skills, bio…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
            />
          </div>

          {/* Town */}
          <div className="form-row">
            <label htmlFor="town" className="label">Town</label>
            <select
              id="town"
              value={filters.town}
              onChange={(e) => setFilters(f => ({ ...f, town: e.target.value }))}
              className="select"
            >
              <option value="All">All</option>
              <option value="Windsor">Windsor</option>
              <option value="Maidenhead">Maidenhead</option>
              <option value="Slough">Slough</option>
            </select>
          </div>

          {/* DBS */}
          <div className="form-row">
            <label htmlFor="dbs" className="label">DBS</label>
            <select
              id="dbs"
              value={filters.dbs}
              onChange={(e) => setFilters(f => ({ ...f, dbs: e.target.value }))}
              className="select"
            >
              <option value="Any">Any</option>
              <option value="DBS Required">DBS Required</option>
              <option value="No DBS Required">No DBS Required</option>
            </select>
          </div>

          {/* Clear */}
          <div className="form-row">
            <label className="label">&nbsp;</label>
            <button
              type="button"
              onClick={() => {
                setFilters({ town: 'All', dbs: 'Any' });
                setSearchTerm('');
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
        <p className="text-center text-gray-600">No volunteers found.</p>
      ) : (
        <ul className="space-y-6">
          {filtered.map((vol) => (
            <li key={vol.id} className="card p-6 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{vol.name}</h2>
                  <p className="text-gray-700">{vol.bio}</p>
                </div>
                {vol.dbs_checked && (
                  <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5">
                    DBS Checked
                  </span>
                )}
              </div>

              <div className="text-sm text-gray-600">🏠 Home Town: {vol.home_town || '—'}</div>
              <div className="text-sm text-gray-600">🛠️ Skills: {vol.skills || '—'}</div>
              <div className="text-sm text-gray-600">
                📋 Availability: {renderAvailability(vol)}
              </div>

              <div className="pt-2">
                <button
                  className="btn-primary"
                  onClick={() => handleEnquire(vol.id)}
                >
                  Contact Volunteer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
