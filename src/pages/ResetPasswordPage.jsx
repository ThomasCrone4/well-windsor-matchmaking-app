// ResetPasswordPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const schema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm: z.string()
}).refine((vals) => vals.password === vals.confirm, {
  path: ['confirm'],
  message: 'Passwords do not match'
});

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' }
  });

  // When the user lands here from the email, Supabase will create a recovery session.
  // We can simply allow them to set a new password.
  useEffect(() => {
    // Optional: you can verify there’s a current session, but updateUser will error if not.
    const prepare = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          // Sometimes the session takes a tick to hydrate; allow anyway and show helpful text if it fails.
        }
      } finally {
        setSessionReady(true);
      }
    };
    prepare();
  }, []);

  const onSubmit = async (vals) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: vals.password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Password updated. Please log in.');
      reset();
      navigate('/'); // or navigate back to your /login route
    } catch (err) {
      console.error(err);
      toast.error('Could not update password.');
    }
  };

  if (!sessionReady) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <form onSubmit={handleSubmit(onSubmit)} className="card w-full max-w-md form">
        <h2 className="title">Set a New Password</h2>

        <div className="form-row">
          <label className="label">New Password <span className="required" /></label>
          <input
            type="password"
            className="input"
            {...register('password')}
            aria-invalid={!!errors.password}
            placeholder="******"
          />
          {errors.password && <p className="error-text">{errors.password.message}</p>}
        </div>

        <div className="form-row">
          <label className="label">Confirm Password <span className="required" /></label>
          <input
            type="password"
            className="input"
            {...register('confirm')}
            aria-invalid={!!errors.confirm}
            placeholder="******"
          />
          {errors.confirm && <p className="error-text">{errors.confirm.message}</p>}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save New Password'}
        </button>
      </form>
    </div>
  );
}
