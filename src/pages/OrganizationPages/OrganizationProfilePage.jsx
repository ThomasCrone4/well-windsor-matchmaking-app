import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';
import { useNavigate } from 'react-router-dom';

const orgSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  home_town: z.string().min(1, 'Select a town'),
  contact_number: z.string().optional(),
  email: z.string().email('Must be a valid email').optional(),
});

export default function OrganisationProfilePage() {
  const [hydrated, setHydrated] = useState(false);
  const { userId, profile, loading } = useUserProfile();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(orgSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!hydrated && profile && profile.role === 'organization') {
      reset({
        name: profile.name ?? '',
        home_town: profile.home_town ?? '',
        contact_number: profile.contact_number ?? '',
        email: profile.email ?? '',
      });
      setHydrated(true);
    }
  }, [profile, hydrated, reset]);

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const { error } = await supabase
        .from('user_profiles')
        .update(formData)
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile updated!');
      navigate('/organization-dashboard');
    },
    onError: () => toast.error('Failed to update profile.'),
  });

  const onSubmit = (data) => {
    mutation.mutate(data);
  };

  const handleDiscard = () => {
    if (profile) {
      reset({
        name: profile.name ?? '',
        home_town: profile.home_town ?? '',
        contact_number: profile.contact_number ?? '',
        email: profile.email ?? '',
      });
      toast.success('Changes discarded');
    }
  };

  if (loading || !hydrated) {
    return <p className="text-center mt-8">Loading profile...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="title">Edit Organisation Profile</h1>

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
            <option value="Windsor">Windsor</option>
            <option value="Maidenhead">Maidenhead</option>
            <option value="Slough">Slough</option>
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

        {/* Contact Email */}
        <div className="form-row">
          <label className="label">
            Contact Email <span className="help-text">(optional)</span>
          </label>
          <input
            {...register('email')}
            type="email"
            className={`input ${errors.email ? 'input-invalid' : ''}`}
            placeholder="e.g. admin@windsorprimary.org.uk"
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="error-text">{errors.email.message}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-2">
          <button type="submit" className="btn btn-primary flex-1" disabled={!isDirty}>
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
