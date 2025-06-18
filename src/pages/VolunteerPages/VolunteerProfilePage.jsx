import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '../../utils/supabase';
import AvailabilityMatrix from '../../components/AvailabilityMatrix';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';
import { useNavigate } from 'react-router-dom';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_number: z.string().optional(),
  home_town: z.string().min(1, 'Select a home town'),
  dob: z.string().optional(),
  skills: z.string().optional(),
  dbs_checked: z.boolean(),
  available_anytime: z.boolean(),
  availability_matrix: z.any(),
  home_town_only: z.boolean(),
  auto_enquiry_opt_in: z.boolean(),
});

export default function VolunteerProfilePage() {
  const [hydrated, setHydrated] = useState(false);
  const { userId, profile, loading } = useUserProfile();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {},
  });

  const availableAnytime = watch('available_anytime');

  useEffect(() => {
    if (!hydrated && profile !== undefined) {
      reset({
        name: profile?.name ?? '',
        contact_number: profile?.contact_number ?? '',
        home_town: profile?.home_town ?? '',
        dob: profile?.dob ?? '',
        skills: profile?.skills ?? '',
        dbs_checked: !!profile?.dbs_checked,
        available_anytime: profile?.available_anytime ?? true,
        availability_matrix: profile?.available_anytime ? [] : profile?.availability_matrix ?? [],
        home_town_only: !!profile?.home_town_only,
        auto_enquiry_opt_in: !!profile?.auto_enquiry_opt_in,
      });
      setHydrated(true);
    }
  }, [profile, hydrated, reset]);

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const update = {
        ...formData,
        availability_matrix: formData.available_anytime
          ? []
          : formData.availability_matrix ?? [],
      };

      const { error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile updated!');
            navigate('/volunteer-dashboard');
    },  
    onError: () => toast.error('Failed to update profile.'),
  });

  const onSubmit = (data) => {
    if (!data.available_anytime && (!data.availability_matrix || data.availability_matrix.length === 0)) {
      toast.error('Please add at least one availability block.');
      return;
    }

    mutation.mutate(data);
  };

  if (loading || !hydrated) {
    return <p className="text-center mt-8">Loading profile...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Edit Your Volunteer Profile</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input
          {...register('name')}
          className="w-full p-2 border rounded"
          placeholder="Full Name"
        />
        {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}

        <input
          {...register('contact_number')}
          className="w-full p-2 border rounded"
          placeholder="Contact Number"
        />

        <select {...register('home_town')} className="w-full p-2 border rounded">
          <option value="">Select your home town</option>
          <option value="Windsor">Windsor</option>
          <option value="Maidenhead">Maidenhead</option>
          <option value="Slough">Slough</option>
        </select>
        {errors.home_town && (
          <p className="text-red-500 text-sm">{errors.home_town.message}</p>
        )}

        <input
          type="date"
          {...register('dob')}
          className="w-full p-2 border rounded"
        />

        <textarea
          {...register('skills')}
          placeholder="Skills / Experience"
          className="w-full p-2 border rounded"
        />

        <label className="block">
          <input type="checkbox" {...register('dbs_checked')} /> DBS Checked
        </label>

        <label className="block">
          <input type="checkbox" {...register('available_anytime')} /> Generally Available (all times)
        </label>

        {!availableAnytime && (
          <Controller
            name="availability_matrix"
            control={control}
            render={({ field }) => (
              <AvailabilityMatrix value={field.value} onChange={field.onChange} />
            )}
          />
        )}

        <label className="block">
          <input type="checkbox" {...register('home_town_only')} /> Only match me to opportunities in my home town
        </label>

        <label className="block">
          <input type="checkbox" {...register('auto_enquiry_opt_in')} /> Auto-enquiry opt-in
        </label>

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
