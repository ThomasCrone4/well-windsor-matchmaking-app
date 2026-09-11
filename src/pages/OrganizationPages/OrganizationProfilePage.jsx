import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';
import FormSkeleton from '../../components/skeletons/FormSkeleton';
import { townOptionsFor } from '../../utils/towns';

const orgSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  home_town: z.string().min(1, 'Select a town'),
  contact_number: z.string().optional(),
});

export default function OrganisationProfilePage() {
  const [hydrated, setHydrated] = useState(false);
  const { user, userId, profile, loading } = useUserProfile();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,                // ← keeps a saved town in the select's options
    getValues,            // ← needed to sync values post-save
    formState: { errors, isDirty },
  } = useForm({
    mode: 'onChange', // Enable real-time validation
    resolver: zodResolver(orgSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!hydrated && profile && profile.role === 'organization') {
      reset({
        name: profile.name ?? '',
        home_town: profile.home_town ?? '',
        contact_number: profile.contact_number ?? '',
      });
      setHydrated(true);
    }
  }, [profile, hydrated, reset]);

  // small normalizer
  const trimOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const mutation = useMutation({
    mutationFn: async (formData) => {
      if (!userId) throw new Error('No user id');

      const update = {
        name: trimOrNull(formData.name),
        home_town: trimOrNull(formData.home_town),
        contact_number: trimOrNull(formData.contact_number),
        // No `email`. It is not client-writable any more (the audit found
        // send-outreach trusted it), and replies to your messages go to
        // your login address, which is what send-outreach now uses.
      };

      const { error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', userId);

      if (error) throw error;
      return update; // returned to onSuccess
    },
    onSuccess: (update) => {
      // update cache immediately
      queryClient.setQueryData(['user_profile', userId], (prev) =>
        prev ? { ...prev, ...update } : prev
      );

      // ensure fresh fetch next mount
      queryClient.invalidateQueries({ queryKey: ['user_profile', userId] });

      // KEY: mark form as pristine so buttons grey out like the volunteer page
      reset(
        { ...getValues(), ...update },
        { keepDirty: false, keepTouched: false }
      );

      toast.success('Profile updated!');
    },
    onError: (err) => toast.error(err?.message || 'Failed to update profile.'),
  });

  const onSubmit = (data) => mutation.mutate(data);

  const handleDiscard = () => {
    if (profile) {
      reset({
        name: profile.name ?? '',
        home_town: profile.home_town ?? '',
        contact_number: profile.contact_number ?? '',
      });
      toast.success('Changes discarded');
    }
  };

  if (loading || !hydrated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="title">Your organisation</h1>
        <FormSkeleton fields={5} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8">
        <h1 className="title">Your organisation</h1>
        <p className="page-description">
          Manage your organisation's contact information and profile. This information helps volunteers connect with you.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="form">
        {/* Organisation Name */}
        <div className="form-row">
          <label className="label">
            Organisation Name <span className="required" />
          </label>
          <input
            {...register('name')}
            className="input"
            placeholder="e.g. Windsor Primary School"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="error-text">{errors.name.message}</p>}
        </div>

        {/* Town */}
        <div className="form-row">
          <label className="label">
            Town <span className="required" />
          </label>
          <select
            {...register('home_town')}
            className={`select ${errors.home_town ? 'select-invalid' : ''}`}
            aria-invalid={!!errors.home_town}
          >
            <option value="">Select your town</option>
            {townOptionsFor(watch('home_town')).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.home_town && <p className="error-text">{errors.home_town.message}</p>}
        </div>

        {/* Contact Number */}
        <div className="form-row">
          <label className="label">
            Contact Number <span className="help-text">(optional)</span>
          </label>
          <input
            {...register('contact_number')}
            className="input"
            placeholder="e.g. 01753 123456"
          />
        </div>

        {/* Where replies go. This was an editable "Contact Email" that
            wrote user_profiles.email -- the column send-outreach used to
            trust. Replies now always go to the login address. */}
        <div className="form-row">
          <span className="label">Replies go to</span>
          <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {user?.email ?? '—'}
          </p>
          <p className="help-text">
            When you write to a volunteer, their reply comes to the email you
            sign in with, so they will see this address. You won&rsquo;t see
            theirs unless they reply.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            className="btn btn-primary flex-1"
            disabled={!isDirty || mutation.isPending}
          >
            Save Profile
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="btn btn-outline flex-1"
            disabled={!isDirty}
          >
            Discard Changes
          </button>
        </div>
      </form>
    </div>
  );
}
