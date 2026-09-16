// ACC-8 — change your own sign-in email.
//
// Decided against routing this through an admin. An admin asked by email to
// change an address has no way to verify the request: that is not a check,
// it is a person who can be talked into it once. Double confirmation is the
// stronger control, and it is the standard pattern.
//
// Supabase sends the confirmation itself. With "Secure email change" on, a
// link goes to BOTH the old and the new address and the change completes only
// when both are followed — so a stolen session cannot quietly move an account,
// which is the whole point of ACC-8.
//
// ADM-8 stays as the fallback for someone locked out of both addresses.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { supabase } from '../utils/supabase';

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter the new email address')
    .email('That does not look like an email address')
    .max(320, 'That email address is too long'),
});

export default function ChangeEmailSection({ currentEmail }) {
  const [pending, setPending] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    const next = email.trim().toLowerCase();
    if (currentEmail && next === currentEmail.trim().toLowerCase()) {
      toast.error('That is already your sign-in email.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: next });

    if (error) {
      toast.error(error.message || 'Could not start the email change.');
      return;
    }

    setPending(next);
    reset();
    toast.success('Check your inbox to confirm the change.');
  };

  // Every handleSubmit gets an onInvalid: a rejected submit that shows
  // nothing at all is how saving an opportunity was silently impossible for
  // months.
  const onInvalid = (formErrors) => {
    const first = Object.values(formErrors)[0];
    toast.error(first?.message ?? 'Please check the address and try again.');
  };

  return (
    <section className="card mt-8" aria-labelledby="change-email-heading">
      <h2 id="change-email-heading" className="section-title">
        Sign-in email
      </h2>

      <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
        You currently sign in as{' '}
        <strong style={{ color: 'var(--color-text-primary)' }}>
          {currentEmail ?? '—'}
        </strong>
        .
      </p>

      {pending ? (
        <div
          className="mt-4 p-4"
          style={{
            backgroundColor: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            We have sent a confirmation link to <strong>{pending}</strong>, and
            told <strong>{currentEmail}</strong> that a change was requested.
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Nothing changes until the link is followed. Until then, keep signing
            in with your current address. If you did not expect this, ignore the
            email and the change will not happen.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="form mt-4">
          <div className="form-row">
            <label className="label" htmlFor="new-email">
              New email address
            </label>
            <input
              id="new-email"
              type="email"
              autoComplete="email"
              className={`input ${errors.email ? 'input-invalid' : ''}`}
              placeholder="you@example.com"
              {...register('email')}
            />
            {errors.email && <p className="error-text">{errors.email.message}</p>}
            <p className="help-text">
              We will email both your current and your new address. The change
              only takes effect once you follow the link we send to the new one.
            </p>
          </div>

          <div>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send confirmation'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
