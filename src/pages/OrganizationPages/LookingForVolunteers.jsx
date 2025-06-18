import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

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
        .eq('role', 'volunteer');

      if (error) throw error;
      return data;
    },
  });

  const filterVolunteers = (vols) => {
    return vols.filter(v => {
      const matchesTown =
        filters.town === 'All' || v.home_town === filters.town;

      const matchesDBS =
        filters.dbs === 'Any' ||
        (filters.dbs === 'DBS Required' ? v.dbs_checked : !v.dbs_checked);

      const matchesSearch =
        v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.skills?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTown && matchesDBS && matchesSearch;
    });
  };

  const handleEnquire = (volunteerId) => {
    navigate(`/volunteers/${volunteerId}/enquire`);  
  };

  if (isLoading) return <p className="text-center mt-20">Loading volunteers...</p>;
  if (error) return <p className="text-center text-red-500 mt-20">Failed to load volunteers.</p>;

  const filtered = filterVolunteers(data || []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">Looking for Volunteers</h1>

      <div className="mb-4 flex flex-wrap gap-4 items-center justify-center">
        <input
          type="text"
          placeholder="Search by name or skills..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="p-2 border rounded w-64"
        />
        <select onChange={(e) => setFilters(f => ({ ...f, town: e.target.value }))} className="p-2 border rounded" value={filters.town}>
          <option value="All">Location</option>
          <option value="Windsor">Windsor</option>
          <option value="Maidenhead">Maidenhead</option>
          <option value="Slough">Slough</option>
        </select>
        <select onChange={(e) => setFilters(f => ({ ...f, dbs: e.target.value }))} className="p-2 border rounded" value={filters.dbs}>
          <option value="Any">DBS status</option>
          <option value="DBS Required">DBS Required</option>
          <option value="No DBS Required">No DBS Required</option>
        </select>

        <button
          onClick={() => {
            setFilters({ town: 'All', dbs: 'Any' });
            setSearchTerm('');
          }}
          className="text-sm text-gray-600 underline hover:text-gray-800"
        >
          Clear Filters
        </button>
      </div>


      {filtered.length === 0 ? (
        <p className="text-center text-gray-600">No volunteers found.</p>
      ) : (
        <ul className="space-y-6">
          {filtered.map((vol) => (
            <li key={vol.id} className="p-6 border rounded-lg shadow-sm bg-white space-y-2">
              <h2 className="text-xl font-semibold">{vol.name}</h2>
              <p className="text-gray-700">{vol.bio}</p>
              <div className="text-sm text-gray-600">🏠 Home Town: {vol.home_town}</div>
              <div className="text-sm text-gray-600">🛠️ Skills: {vol.skills}</div>
              <div className="text-sm text-gray-600">
                📋 Availability: {vol.available_anytime ? 'Anytime' : 'See profile'}
              </div>
              {vol.dbs_checked && (
                <div className="text-sm text-red-600">🔒 DBS Checked</div>
              )}

              <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-2"
                onClick={() => handleEnquire(vol.id)}
              >
                Contact Volunteer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
