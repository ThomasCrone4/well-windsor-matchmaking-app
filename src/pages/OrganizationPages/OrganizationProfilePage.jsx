import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';

const orgSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  town: z.string().min(1, 'Select a town'),
  contact_number: z.string().optional(),
  contact_email: z.string().email('Must be a valid email').optional(),
});

export default function OrganisationProfilePage() {
  const [hydrated, setHydrated] = useState(false);
  const { userId, profile, loading } = useUserProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(orgSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!hydrated && profile && profile.role === 'organization') {
      reset({
        name: profile.name ?? '',
        town: profile.town ?? '',
        contact_number: profile.contact_number ?? '',
        contact_email: profile.contact_email ?? '',
      });
      setHydrated(true);
    }
  }, [profile, hydrated, reset]);

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const { error } = await supabase
        .from('user_profiles')
        .update(formData)
        .eq('id', userId)

      if (error) throw error;
    },
    onSuccess: () => toast.success('Profile updated!'),
    onError: () => toast.error('Failed to update profile.'),
  });

  const onSubmit = (data) => {
    mutation.mutate(data);
  };

  if (loading || !hydrated) {
    return <p className="text-center mt-8">Loading profile...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Edit Organisation Profile</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input
          {...register('name')}
          className="w-full p-2 border rounded"
          placeholder="Organisation Name"
        />
        {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}

        <select {...register('town')} className="w-full p-2 border rounded">
          <option value="">Select your town</option>
          <option value="Windsor">Windsor</option>
          <option value="Maidenhead">Maidenhead</option>
          <option value="Slough">Slough</option>
        </select>
        {errors.town && <p className="text-red-500 text-sm">{errors.town.message}</p>}

        <input
          {...register('contact_number')}
          className="w-full p-2 border rounded"
          placeholder="Contact Number"
        />

        <input
          {...register('contact_email')}
          type="email"
          className="w-full p-2 border rounded"
          placeholder="Contact Email"
        />
        {errors.contact_email && (
          <p className="text-red-500 text-sm">{errors.contact_email.message}</p>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Save Profile
        </button>
      </form>
    </div>
  );
}
