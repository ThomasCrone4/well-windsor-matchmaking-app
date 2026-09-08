import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import CardSkeleton from '../../../components/skeletons/CardSkeleton';
import { summariseOutreach, cooldownHoursRemaining } from '../../../utils/outreach';

export default function LookingForVolunteersPage() {
  const [filters, setFilters] = useState({ town: 'All'});
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // 1) Get current org user id
  const { data: sessionUser } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const orgId = sessionUser?.id;

  // 2) Load volunteers list
  const { data, error, isLoading } = useQuery({
    queryKey: ['volunteer_profiles'],
    queryFn: async () => {
      // The role and public_profile filters used to live here, in the
      // client, where anyone could bypass them by calling the API directly.
      // They are now enforced by the public_volunteers view, which also
      // omits dob, email and contact_number entirely.
      const { data, error } = await supabase
        .from('public_volunteers')
        .select('id, name, home_town, skills, available_anytime, availability_matrix, bio');
      if (error) throw error;
      return data;
    },
  });

  // 3) Load which volunteers this org has already written to. The log is
  //    the org's own outreach; org_outreach_sent is filtered to the
  //    caller, so there is no org_id predicate to get wrong here.
  const { data: outreachRows, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['org_outreach_sent'],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_outreach_sent')
        .select('volunteer_id, created_at, status')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const outreachByVolunteer = useMemo(() => summariseOutreach(outreachRows), [outreachRows]);

  // Derived from the volunteers actually listed, not from a hardcoded
  // ['Windsor','Maidenhead','Slough'] as it was before. This filter is
  // about where the PEOPLE are, which is not the same question as which
  // towns the service posts roles in -- home_town has no CHECK constraint
  // and there is a real volunteer in London. A fixed list both named towns
  // nobody lives in and hid the one town somebody does.
  const townOptions = useMemo(() => {
    const towns = new Set(
      (data ?? []).map((v) => (v.home_town ?? '').trim()).filter(Boolean)
    );
    return ['All', ...Array.from(towns).sort()];
  }, [data]);

  const filterVolunteers = (vols) =>
    vols.filter((v) => {
      const matchesTown = filters.town === 'All' || v.home_town === filters.town;
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (v.name || '').toLowerCase().includes(q) ||
        (v.skills || '').toLowerCase().includes(q) ||
        (v.bio || '').toLowerCase().includes(q);
      return matchesTown && matchesSearch;
    });

  const handleEnquire = (volunteerId) => {
    if (!orgId) {
      toast.error('Please log in as an organisation.');
      navigate('/auth');
      return;
    }

    // Told here as well as on the compose page, so nobody writes a
    // message they cannot send. The server enforces it either way.
    const hoursLeft = cooldownHoursRemaining(outreachByVolunteer.get(volunteerId)?.lastSentAt);
    if (hoursLeft > 0) {
      toast.error(
        `You contacted this volunteer in the last 24 hours. You can write again in ${hoursLeft} hour${
          hoursLeft === 1 ? '' : 's'
        }.`
      );
      return;
    }

    navigate(`/volunteers/${volunteerId}/enquire`);
  };

  const renderAvailability = (vol) => {
    if (vol.available_anytime) return <span className="text-green-700 font-medium">Anytime</span>;
    if (!vol.availability_matrix?.length) return <span className="text-gray-500 italic">Unavailable</span>;

    return (
      <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside mt-1">
        {vol.availability_matrix.map((block, i) => {
          const dayList = block.days?.length ? `Every ${block.days.join(', ')}` : 'Unspecified days';
          const timeRange = block.start_time && block.end_time ? `${block.start_time} to ${block.end_time}` : 'unspecified times';
          const dateRange = block.start_date && block.end_date ? `between ${formatDate(block.start_date)} and ${formatDate(block.end_date)}` : '';
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
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="title">Find Volunteers</h1>
      <CardSkeleton count={6} />
    </div>
  );
  if (error) return <p className="text-center text-red-600 mt-20">Failed to load volunteers.</p>;

  const filtered = filterVolunteers(data || []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8">
        <h1 className="title">Find Volunteers</h1>
        <p className="page-description">
          Volunteers who have chosen to be listed here. Write to anyone who looks like a fit
          and we will email them on your behalf — their reply comes straight to your inbox.
          You can write to the same volunteer once every 24 hours.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex justify-center">
          <Link to="/organization/sent-enquiries" className="btn-success">Messages sent</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="form-grid md:grid-cols-3">
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
              onChange={(e) => setFilters((f) => ({ ...f, town: e.target.value }))}
              className="select"
            >
              {townOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
   

          {/* Clear */}
          <div className="form-row">
            <label className="label">&nbsp;</label>
            <button
              type="button"
              onClick={() => {
                setFilters({ town: 'All'});
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
          {filtered.map((vol) => {
            const outreach = outreachByVolunteer.get(vol.id);
            const hoursLeft = cooldownHoursRemaining(outreach?.lastSentAt);
            return (
              <li key={vol.id} className="card p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{vol.name}</h2>
                    <p className="text-gray-700">{vol.bio}</p>
                  </div>
                  {outreach?.contacted && (
                    <span className="badge badge-success shrink-0">Contacted</span>
                  )}
                </div>

                <div className="text-sm text-gray-600">🏠 Home Town: {vol.home_town || '—'}</div>
                {vol.skills?.trim() ? (
                  <div className="text-sm text-gray-600">🛠️ Skills: {vol.skills}</div>
                ) : null}
                <div className="text-sm text-gray-600">📋 Availability: {renderAvailability(vol)}</div>

                <div className="pt-2">
                  <button
                    className={`btn-primary ${hoursLeft > 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                    disabled={hoursLeft > 0 || isLoadingContacts}
                    onClick={() => handleEnquire(vol.id)}
                    title={
                      hoursLeft > 0
                        ? `You contacted this volunteer recently — you can write again in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
                        : 'Contact volunteer'
                    }
                  >
                    {hoursLeft > 0
                      ? `Contact again in ${hoursLeft}h`
                      : outreach?.contacted
                      ? 'Contact again'
                      : 'Contact volunteer'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
