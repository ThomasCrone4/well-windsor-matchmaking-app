// Registering interest in an opportunity.
//
// Two things this deliberately does not do. It does not send the
// organisation an email — that would let anyone spam a small charity
// by applying repeatedly, and the page used to claim it did. And it
// does not set org_id: a trigger derives that from the opportunity, so
// the column is not even granted to the client.

import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useState } from 'react';
import { supabase } from '../../../utils/supabase';
import ConfirmDialog from '../../../components/ConfirmDialog';

const MESSAGE_MAX = 3000;

export default function EnquireOpportunitiesPage() {
  const { id: opportunityId } = useParams();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const { data: opportunity, isLoading, error } = useQuery({
    queryKey: ['opportunity', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select('id, title, location, requires_dbs, status')
        .eq('id', opportunityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const apply = async ({ subject, message }) => {
    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      toast.error('You must be signed in to register interest.');
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from('applications').insert([
      {
        opportunity_id: opportunityId,
        volunteer_id: user.id,
        subject: subject.trim(),
        message: message.trim(),
        opportunity_title: opportunity?.title ?? null,
      },
    ]);

    setSubmitting(false);

    if (insertError) {
      // A unique constraint now enforces one application per
      // opportunity, rather than a client-side check that a direct API
      // call could skip.
      if (insertError.code === '23505') {
        toast.error('You have already registered interest in this role.');
        navigate('/volunteer-dashboard');
        return;
      }
      toast.error(insertError.message || 'Could not register your interest');
      console.error('Application insert error:', insertError);
      return;
    }

    toast.success('Interest registered');
    navigate('/volunteer-dashboard');
  };

  if (isLoading) return <p className="text-center muted mt-8">Loading opportunity…</p>;
  if (error || !opportunity) {
    return (
      <p className="error-text text-center mt-8">
        This opportunity could not be loaded. It may have been closed.
      </p>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8" id="main-content">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0">Register interest</h1>
        <div className="spacer" />
      </div>

      <p className="muted mb-2">
        You&rsquo;re registering interest in <strong>{opportunity.title || 'this role'}</strong>
        {opportunity.location ? ` – ${opportunity.location}` : ''}
      </p>

      {opportunity.requires_dbs && (
        <p className="badge badge-warning mb-4">This role requires a DBS check</p>
      )}

      <div className="card stack mb-4">
        <p className="text">
          This goes onto the organisation&rsquo;s list of interested volunteers. They will
          email you directly if they would like to hear more.
        </p>
        <p className="caption">
          You may not hear back from every role you register for — organisations only contact the
          people they want to take further, and silence is not a rejection you need to read
          anything into. Well Windsor does not vet or DBS-check organisations, and is not
          party to any arrangement you make with them.
        </p>
      </div>

      <form onSubmit={handleSubmit((values) => setConfirming(values))} className="card form">
        <div className="form-row">
          <label htmlFor="application-subject" className="label required">
            Subject
          </label>
          <input
            id="application-subject"
            type="text"
            {...register('subject', {
              required: 'A subject is required',
              maxLength: { value: 200, message: 'Keep the subject under 200 characters' },
            })}
            placeholder="Interested in helping with…"
            className={`input ${errors.subject ? 'input-invalid' : ''}`}
            aria-invalid={!!errors.subject}
          />
          {errors.subject && <p className="error-text">{errors.subject.message}</p>}
        </div>

        <div className="form-row">
          <label htmlFor="application-message" className="label required">
            Message
          </label>
          <textarea
            id="application-message"
            {...register('message', {
              required: 'A message is required',
              maxLength: {
                value: MESSAGE_MAX,
                message: `Keep your message under ${MESSAGE_MAX} characters`,
              },
            })}
            placeholder="Tell them a little about yourself and why this role appeals to you."
            className={`input textarea textarea-lg ${errors.message ? 'textarea-invalid' : ''}`}
            aria-invalid={!!errors.message}
          />
          {errors.message && <p className="error-text">{errors.message.message}</p>}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Sending…' : 'Register interest'}
        </button>
      </form>

      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => apply(confirming)}
        title="Register your interest?"
        confirmText="Send"
        confirmStyle="primary"
        message={
          <>
            <p>
              <strong>{opportunity.title || 'This organisation'}</strong> will be able to see
              your name, your profile and this message.
            </p>
            <p className="mt-2">
              They will not see your email address, phone number or date of birth unless you
              reply to them yourself. You can withdraw this from your dashboard.
            </p>
          </>
        }
      />
    </div>
  );
}
