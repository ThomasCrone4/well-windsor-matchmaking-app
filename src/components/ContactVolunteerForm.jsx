// The one place an organisation writes to a volunteer.
//
// Used from two entry points: an applicant on an opportunity's
// applicants page (with an opportunity_id), and a cold approach from
// the volunteers browse (without one). Same form, same rules, so there
// is only one thing to get right.

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import ConfirmDialog from './ConfirmDialog';
import {
  sendOutreach,
  cooldownHoursRemaining,
  OUTREACH_SUBJECT_MAX,
  OUTREACH_MESSAGE_MAX,
} from '../utils/outreach';

export default function ContactVolunteerForm({
  volunteerId,
  volunteerName,
  opportunityId = null,
  opportunityTitle = null,
  lastSentAt = null,
  onSent,
  onCancel,
}) {
  const [confirming, setConfirming] = useState(null);
  const [sending, setSending] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      subject: opportunityTitle ? `About ${opportunityTitle}` : '',
      message: '',
    },
  });

  const messageLength = (watch('message') || '').length;
  const hoursLeft = cooldownHoursRemaining(lastSentAt);
  const name = volunteerName || 'this volunteer';

  const send = async ({ subject, message }) => {
    setSending(true);
    try {
      await sendOutreach({
        volunteerId,
        opportunityId,
        subject: subject.trim(),
        message: message.trim(),
      });
      toast.success(`Message sent to ${name}.`);
      onSent?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  // The cooldown is enforced server-side; this is here so an
  // organisation is told before writing a message it cannot send.
  if (hoursLeft > 0) {
    return (
      <div className="card stack">
        <p className="text">
          You contacted <strong>{name}</strong> in the last 24 hours. You can write
          again in {hoursLeft} hour{hoursLeft === 1 ? '' : 's'}.
        </p>
        <p className="caption">
          If they are interested they will reply to your first message directly by email.
        </p>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit((values) => setConfirming(values))} className="card form">
        <div className="form-row">
          <p className="text">
            Writing to <strong>{name}</strong>
            {opportunityTitle ? <> about <strong>{opportunityTitle}</strong></> : null}.
          </p>
          <p className="caption">
            Well Windsor sends this for you, so you never see {name}&rsquo;s email address.
            Replies go straight to your organisation&rsquo;s inbox. You can write to the
            same volunteer once every 24 hours.
          </p>
        </div>

        <div className="form-row">
          <label htmlFor="outreach-subject" className="label required">
            Subject
          </label>
          <input
            id="outreach-subject"
            type="text"
            {...register('subject', {
              required: 'A subject is required',
              maxLength: {
                value: OUTREACH_SUBJECT_MAX,
                message: `Keep the subject under ${OUTREACH_SUBJECT_MAX} characters`,
              },
            })}
            placeholder="Volunteering with us at…"
            className={`input ${errors.subject ? 'input-invalid' : ''}`}
            aria-invalid={!!errors.subject}
          />
          {errors.subject && <p className="error-text">{errors.subject.message}</p>}
        </div>

        <div className="form-row">
          <label htmlFor="outreach-message" className="label required">
            Message
          </label>
          <textarea
            id="outreach-message"
            {...register('message', {
              required: 'A message is required',
              maxLength: {
                value: OUTREACH_MESSAGE_MAX,
                message: `Keep the message under ${OUTREACH_MESSAGE_MAX} characters`,
              },
            })}
            placeholder="Say who you are, what the role involves, and what happens next."
            className={`input textarea textarea-lg ${errors.message ? 'textarea-invalid' : ''}`}
            aria-invalid={!!errors.message}
          />
          <div className="flex justify-between gap-2">
            {errors.message ? (
              <p className="error-text">{errors.message.message}</p>
            ) : (
              <span className="caption">
                Include how you would like them to get in touch.
              </span>
            )}
            <span className="caption">
              {messageLength}/{OUTREACH_MESSAGE_MAX}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn btn-ghost" disabled={sending}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => send(confirming)}
        title="Send this message?"
        confirmText="Send"
        confirmStyle="primary"
        message={
          <>
            <p>
              This will be emailed to <strong>{name}</strong> now. It cannot be unsent,
              and you will not be able to write to them again for 24 hours.
            </p>
            <p className="mt-2">
              Well Windsor does not vet or DBS-check volunteers &mdash; any checks the role
              needs are yours to carry out.
            </p>
          </>
        }
      />
    </>
  );
}
