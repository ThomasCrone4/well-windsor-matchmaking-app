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
      <h1 className="text-2xl font-bold mb-4">Edit Organisation Profile</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        <div>
          <label className="block font-medium text-sm mb-1">
            Organisation Name <span className="text-red-500">*</span>
          </label>
          <input
            {...register('name')}
            className="w-full p-2 border rounded"
            placeholder="e.g. Windsor Primary School"
          />
          {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block font-medium text-sm mb-1">
            Town <span className="text-red-500">*</span>
          </label>
          <select {...register('home_town')} className="w-full p-2 border rounded">
            <option value="">Select your town</option>
            <option value="Windsor">Windsor</option>
            <option value="Maidenhead">Maidenhead</option>
            <option value="Slough">Slough</option>
          </select>
          {errors.home_town && <p className="text-red-500 text-sm">{errors.home_town.message}</p>}
        </div>

        <div>
          <label className="block font-medium text-sm mb-1">
            Contact Number <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...register('contact_number')}
            className="w-full p-2 border rounded"
            placeholder="e.g. 01753 123456"
          />
        </div>

        <div>
          <label className="block font-medium text-sm mb-1">
            Contact Email <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...register('email')}
            type="email"
            className="w-full p-2 border rounded"
            placeholder="e.g. admin@windsorprimary.org.uk"
          />
          {errors.email && (
            <p className="text-red-500 text-sm">{errors.email.message}</p>
          )}
        </div>

        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={!isDirty}
          >
            Save Profile
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
            disabled={!isDirty}
          >
            Discard Changes
          </button>
        </div>
      </form>
    </div>
  );
}
