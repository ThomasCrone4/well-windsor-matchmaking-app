// Cold approach to a volunteer from the volunteers browse.
//
// Same compose form as the applicants page, without an opportunity
// attached. This used to write a row to `applications` with
// direction = 'to_volunteer' and send nothing; an approach is now an
// email, sent by the server, logged in org_outreach.

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../utils/supabase';
import ContactVolunteerForm from '../../../components/ContactVolunteerForm';
import { summariseOutreach } from '../../../utils/outreach';

export default function EnquireVolunteersPage() {
  const { id: volunteerId } = useParams();
  const navigate = useNavigate();

  const { data: volunteer, isLoading, error } = useQuery({
    queryKey: ['public_volunteer', volunteerId],
    queryFn: async () => {
      // public_volunteers is consent-gated on public_profile and omits
      // every contact field. The base table is not readable here.
      const { data, error } = await supabase
        .from('public_volunteers')
        .select('id, name, home_town, skills, bio')
        .eq('id', volunteerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: outreachRows } = useQuery({
    queryKey: ['org_outreach_sent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_outreach_sent')
        .select('volunteer_id, created_at, status')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const lastSentAt = summariseOutreach(outreachRows).get(volunteerId)?.lastSentAt ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" id="main-content">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0">Contact volunteer</h1>
        <div className="spacer" />
      </div>

      {isLoading ? (
        <p className="text-center muted mt-8">Loading volunteer profile…</p>
      ) : error ? (
        <p className="error-text text-center mt-8">Failed to load this volunteer.</p>
      ) : !volunteer ? (
        <p className="muted text-center mt-8">
          This volunteer is no longer listed. Only volunteers who have made their profile
          discoverable can be contacted this way.
        </p>
      ) : (
        <>
          <div className="card stack mb-4">
            <h2 className="card-title">{volunteer.name || 'Unnamed volunteer'}</h2>
            <p className="caption">{volunteer.home_town || 'Town not given'}</p>
            {volunteer.skills?.trim() && <p className="muted">🛠️ Skills: {volunteer.skills}</p>}
            {volunteer.bio?.trim() && <p className="text">{volunteer.bio}</p>}
          </div>

          <ContactVolunteerForm
            volunteerId={volunteer.id}
            volunteerName={volunteer.name}
            lastSentAt={lastSentAt}
            onSent={() => navigate('/organization/sent-enquiries')}
            onCancel={() => navigate(-1)}
          />
        </>
      )}
    </div>
  );
}
