// ADM-7 — report a problem.
//
// Open to anyone, signed in or not, because the person most likely to hit
// something broken is a visitor who cannot get past it. It lives in the
// footer so it is reachable from every page.
//
// The insert deliberately does NOT ask for the row back. A reporter holds
// no read access — anon has no SELECT grant at all and the SELECT policy is
// admins-only — so a PostgREST default of `return=representation` fails on
// the RETURNING even though the INSERT itself is permitted. Adding
// .select() here would break reporting for everyone.
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../utils/supabase';

const MAX_MESSAGE = 2000;

// Mirrors the database CHECKs (problem_reports_message_sane,
// problem_reports_contact_email_sane) so the person is told in words
// rather than by a 23514.
const reportSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Please tell us what went wrong.')
    .max(MAX_MESSAGE, `Please keep this under ${MAX_MESSAGE} characters.`),
  contact_email: z
    .string()
    .trim()
    .email('That does not look like an email address.')
    .max(320, 'That email address is too long.')
    .optional()
    .or(z.literal('')),
});

export default function ReportProblemDialog({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(reportSchema),
    defaultValues: { message: '', contact_email: '' },
  });

  const message = watch('message') ?? '';

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      dialogRef.current?.focus();
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('problem_reports').insert({
        message: values.message.trim(),
        contact_email: values.contact_email?.trim() || null,
        page_url: window.location.pathname + window.location.search,
      });

      if (error) throw error;

      toast.success('Thank you. Your report has been sent.');
      reset();
      onClose();
    } catch (error) {
      // The rate limiter raises a check_violation with a readable message;
      // show it rather than a generic failure.
      const readable =
        error?.code === '23514' && error?.message?.includes('Too many')
          ? error.message
          : 'Sorry, your report could not be sent. Please email hello@wellwindsor.org.uk.';
      toast.error(readable);
      console.error('Failed to submit problem report:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Every handleSubmit gets an onInvalid: a rejected submit that shows
  // nothing at all is how saving an opportunity was silently impossible
  // for months.
  const onInvalid = (formErrors) => {
    const first = Object.values(formErrors)[0];
    toast.error(first?.message ?? 'Please check the form and try again.');
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
    >
      <div
        ref={dialogRef}
        className="rounded-lg shadow-2xl max-w-lg w-full p-6"
        style={{
          backgroundColor: 'var(--color-background-elevated)',
          border: '1px solid var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="flex justify-between items-center mb-2">
          <h2
            id="report-dialog-title"
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Report a problem
          </h2>
          <button onClick={onClose} className="icon-btn icon-btn-brand p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Tell us what went wrong and we will look into it. You do not need an
          account to send this.
        </p>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="form">
          <div className="form-row">
            <label className="label" htmlFor="report-message">
              What happened?
            </label>
            <textarea
              id="report-message"
              rows={5}
              maxLength={MAX_MESSAGE}
              className={`input ${errors.message ? 'input-invalid' : ''}`}
              placeholder="The browse page is blank when I filter by Windsor."
              {...register('message')}
            />
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--color-danger)' }}>
                {errors.message?.message ?? ''}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {message.length}/{MAX_MESSAGE}
              </span>
            </div>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="report-email">
              Your email (optional)
            </label>
            <input
              id="report-email"
              type="email"
              className={`input ${errors.contact_email ? 'input-invalid' : ''}`}
              placeholder="So we can reply if we need more detail"
              {...register('contact_email')}
            />
            <span className="text-xs" style={{ color: 'var(--color-danger)' }}>
              {errors.contact_email?.message ?? ''}
            </span>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
