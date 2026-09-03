// Applicants for one opportunity.
//
// There is no accept/deny here any more. An application is an
// expression of interest; the organisation reads it and either writes
// to the volunteer or sets them aside. Nothing the organisation does on
// this page is shown to the volunteer, by design — silence means no.
//
// Applicants come from the opportunity_applicants view rather than from
// applications joined to user_profiles: RLS filters rows and not
// columns, so reading the profile table directly would mean reading
// dob, email and contact_number too.

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../../../utils/supabase';
import ContactVolunteerForm from '../../../components/ContactVolunteerForm';
import ListSkeleton from '../../../components/skeletons/ListSkeleton';
import { summariseOutreach, cooldownHoursRemaining } from '../../../utils/outreach';

export default function OpportunityApplicantsPage() {
  const { id: opportunityId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [composingFor, setComposingFor] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showDismissed, setShowDismissed] = useState(false);

  const { data: applicants, isLoading, error } = useQuery({
    queryKey: ['opportunity_applicants', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_applicants')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('applied_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Who this organisation has already written to, so the list can say so
  // before it offers a button that the server would refuse.
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

  const outreachByVolunteer = useMemo(() => summariseOutreach(outreachRows), [outreachRows]);

  const setDismissed = useMutation({
    mutationFn: async ({ applicationId, dismissed }) => {
      const { error } = await supabase
        .from('applications')
        .update({ dismissed_at: dismissed ? new Date().toISOString() : null })
        .eq('id', applicationId);
      if (error) throw error;
    },
    onSuccess: (_result, { dismissed }) => {
      toast.success(dismissed ? 'Moved to dismissed' : 'Moved back to applicants');
      queryClient.invalidateQueries({ queryKey: ['opportunity_applicants', opportunityId] });
    },
    onError: () => toast.error('Could not update this applicant'),
  });

  const { active, dismissed } = useMemo(() => {
    const groups = { active: [], dismissed: [] };
    for (const applicant of applicants ?? []) {
      groups[applicant.dismissed_at ? 'dismissed' : 'active'].push(applicant);
    }
    return groups;
  }, [applicants]);

  const opportunityTitle = applicants?.[0]?.opportunity_title ?? 'this opportunity';

  const renderApplicant = (applicant, isDismissed) => {
    const outreach = outreachByVolunteer.get(applicant.volunteer_id);
    const hoursLeft = cooldownHoursRemaining(outreach?.lastSentAt);
    const isComposing = composingFor === applicant.application_id;
    const isLong = (applicant.message || '').length > 240;
    const isExpanded = expanded[applicant.application_id];
    const shownMessage =
      isLong && !isExpanded ? `${applicant.message.slice(0, 240)}…` : applicant.message;

    return (
      <li key={applicant.application_id} className="card stack">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="card-title">{applicant.volunteer_name || 'Unnamed volunteer'}</h3>
          {outreach?.contacted && (
            <span className="badge badge-success">
              Contacted {format(new Date(outreach.lastSentAt), 'd MMM')}
            </span>
          )}
        </div>

        <p className="caption">
          Applied {format(new Date(applicant.applied_at), 'd MMM yyyy')}
          {applicant.home_town ? ` · ${applicant.home_town}` : ''}
        </p>

        {applicant.skills?.trim() && <p className="muted">🛠️ Skills: {applicant.skills}</p>}
        {applicant.bio?.trim() && <p className="text">{applicant.bio}</p>}

        {applicant.subject?.trim() && (
          <p className="highlight">📝 {applicant.subject}</p>
        )}

        {applicant.message?.trim() && (
          <div className="text whitespace-pre-line">{shownMessage}</div>
        )}
        {isLong && (
          <button
            type="button"
            onClick={() =>
              setExpanded((prev) => ({
                ...prev,
                [applicant.application_id]: !prev[applicant.application_id],
              }))
            }
            className="btn btn-ghost btn-sm self-start"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}

        {isComposing ? (
          <ContactVolunteerForm
            volunteerId={applicant.volunteer_id}
            volunteerName={applicant.volunteer_name}
            opportunityId={applicant.opportunity_id}
            opportunityTitle={applicant.opportunity_title}
            lastSentAt={outreach?.lastSentAt}
            onCancel={() => setComposingFor(null)}
            onSent={() => {
              setComposingFor(null);
              queryClient.invalidateQueries({ queryKey: ['org_outreach_sent'] });
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setComposingFor(applicant.application_id)}
              disabled={hoursLeft > 0}
              title={
                hoursLeft > 0
                  ? `You contacted this volunteer recently — you can write again in ${hoursLeft} hour${
                      hoursLeft === 1 ? '' : 's'
                    }`
                  : 'Write to this applicant'
              }
            >
              {hoursLeft > 0
                ? `Contact again in ${hoursLeft}h`
                : outreach?.contacted
                ? 'Contact again'
                : 'Contact this applicant'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setDismissed.mutate({
                  applicationId: applicant.application_id,
                  dismissed: !isDismissed,
                })
              }
              disabled={setDismissed.isPending}
            >
              {isDismissed ? 'Move back to applicants' : 'Dismiss'}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" id="main-content">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0">Applicants</h1>
        <div className="spacer" />
      </div>

      <p className="page-description">
        People who have applied to <strong>{opportunityTitle}</strong>. Write to anyone you
        would like to hear more from — we send the email for you, and their reply comes
        straight to your inbox. Dismissing an applicant only tidies this list; they are
        never told either way.
      </p>

      {isLoading ? (
        <ListSkeleton items={4} />
      ) : error ? (
        <div className="text-center mt-10">
          <p className="error-text">Failed to load applicants.</p>
          <p className="caption">{error.message}</p>
        </div>
      ) : (applicants ?? []).length === 0 ? (
        <p className="muted italic mt-6">
          No one has applied yet. Applications appear here as they arrive — we do not email
          you about them.
        </p>
      ) : (
        <>
          <h2 className="section-title mt-6 mb-2 text-left">
            Applicants ({active.length})
          </h2>
          {active.length === 0 ? (
            <p className="muted italic">Every applicant has been dismissed.</p>
          ) : (
            <ul className="stack-lg">{active.map((a) => renderApplicant(a, false))}</ul>
          )}

          {dismissed.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowDismissed((open) => !open)}
                className="btn btn-ghost btn-sm"
                aria-expanded={showDismissed}
              >
                {showDismissed ? '▾' : '▸'} Dismissed ({dismissed.length})
              </button>
              {showDismissed && (
                <ul className="stack-lg mt-3">
                  {dismissed.map((a) => renderApplicant(a, true))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
