import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '../../utils/supabase';
import AvailabilityMatrix from '../../components/AvailabilityMatrix';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_number: z.string().optional(),
  home_town: z.string().min(1, 'Select a home town'),
  dob: z.string().optional(),
  bio: z.string().optional(),
  skills: z.string().optional(),
  available_anytime: z.boolean(),
  availability_matrix: z.any(),
  public_profile: z.boolean(),
})
.refine(d => !d.public_profile || !!d.bio?.trim(), {
  message: 'Bio is required to appear publicly',
  path: ['public_profile_bio'],
})
.refine(d => !d.public_profile || !!d.skills?.trim(), {
  message: 'Skills are required to appear publicly',
  path: ['public_profile_skills'],
});


export default function VolunteerProfilePage() {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const { userId, profile, loading } = useUserProfile();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty },
    getValues,
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {},
  });

  const availableAnytime = watch('available_anytime');
  const publicProfile = watch('public_profile');

  useEffect(() => {
    if (!hydrated && profile !== undefined) {
      reset({
        name: profile?.name ?? '',
        contact_number: profile?.contact_number ?? '',
        home_town: profile?.home_town ?? '',
        dob: profile?.dob ?? '',
        bio: profile?.bio ?? '',
        skills: profile?.skills ?? '',
        available_anytime: profile?.available_anytime ?? true,
        availability_matrix: profile?.available_anytime ? [] : profile?.availability_matrix ?? [],
        public_profile: !!profile?.public_profile,
      });
      setHydrated(true);
    }
  }, [profile, hydrated, reset]);

  // helpers at top-level (or inside the component)
  const emptyToNull = (v) => (v === '' || v === undefined ? null : v);
  const trimOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const normalizeUpdate = (formData) => ({
    // text
    name: trimOrNull(formData.name),                     // required by schema (but trim anyway)
    contact_number: trimOrNull(formData.contact_number),
    home_town: trimOrNull(formData.home_town),           // required by schema
    bio: trimOrNull(formData.bio),
    skills: trimOrNull(formData.skills),

    // date
    dob: emptyToNull(formData.dob),                      // '' -> null (fixes 400 on DATE)

    // booleans
    available_anytime: !!formData.available_anytime,
    public_profile: !!formData.public_profile,

    // jsonb
    availability_matrix: formData.available_anytime
      ? null                                               // store empty array when "anytime"
      : Array.isArray(formData.availability_matrix)
        ? formData.availability_matrix
        : [],
  });

  const mutation = useMutation({
    mutationFn: async (formData) => {
      if (!userId) throw new Error('No user id');        // avoid bad filter → 400

      const update = normalizeUpdate(formData);

      const { error } = await supabase
        .from('user_profiles')
        .update(update)                                   // only valid columns with safe types
        .eq('id', userId);

      if (error) throw error;
      return update;
    },
    onSuccess: (update) => {
     // Instant UI: merge new values into the cached profile
     queryClient.setQueryData(['user_profile', userId], (prev) =>
       prev ? { ...prev, ...update } : prev
     );

     // Safety: ensure a fresh fetch next time the page mounts
     queryClient.invalidateQueries({ queryKey: ['user_profile', userId] });

     toast.success('Profile updated!');
     reset(getValues(), { keepDirty: false, keepTouched: false });
   },
    onError: (err) => {
      // surface the exact DB message to debug quickly
      toast.error(err?.message || 'Failed to update profile.');
    },
  });


  const onSubmit = (data) => {
    if (!data.available_anytime && (!data.availability_matrix || data.availability_matrix.length === 0)) {
      toast.error('Please add at least one availability block.');
      return;
    }

    mutation.mutate(data);
  };

  const handleDiscard = () => {
    if (profile) {
      reset({
        name: profile?.name ?? '',
        contact_number: profile?.contact_number ?? '',
        home_town: profile?.home_town ?? '',
        dob: profile?.dob ?? '',
        bio: profile?.bio ?? '',
        skills: profile?.skills ?? '',
        available_anytime: profile?.available_anytime ?? true,
        availability_matrix: profile?.available_anytime ? [] : profile?.availability_matrix ?? [],
        public_profile: !!profile?.public_profile,
      });
      toast.success('Changes discarded');
    }
  };


  if (loading || !hydrated) {
    return <p className="text-center mt-8">Loading profile...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="title">Edit Your Volunteer Profile</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="form">
        {/* Full Name */}
        <div className="form-row">
          <label className="label">
            Full Name <span className="required" />
          </label>
          <input
            {...register('name')}
            className="input"
            placeholder="Your full name"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="error-text">{errors.name.message}</p>}
        </div>

        {/* Contact Number */}
        <div className="form-row">
          <label className="label">
            Contact Number <span className="help-text">(optional)</span>
          </label>
          <input
            {...register('contact_number')}
            className="input"
            placeholder="e.g. 07123 456789"
          />
        </div>

        {/* Home Town */}
        <div className="form-row">
          <label className="label">
            Home Town <span className="required" />
          </label>
          <select
            {...register('home_town')}
            className={`select ${errors.home_town ? 'select-invalid' : ''}`}
            aria-invalid={!!errors.home_town}
          >
            <option value="">Select your home town</option>
            <option value="Windsor">Windsor</option>
            <option value="Maidenhead">Maidenhead</option>
            <option value="Slough">Slough</option>
          </select>
          {errors.home_town && <p className="error-text">{errors.home_town.message}</p>}
        </div>

        {/* Date of Birth */}
        <div className="form-row">
          <label className="label">
            Date of Birth <span className="help-text">(optional)</span>
          </label>
          <input type="date" {...register('dob')} className="input" />
        </div>

        {/* Bio */}
        <div className="form-row">
          <label className="label">
            Bio{' '}
            {publicProfile ? <span className="required" /> : <span className="help-text">(optional)</span>}
          </label>
          <textarea
            {...register('bio')}
            className="textarea"
            placeholder="Tell us about yourself..."
          />
          {errors.bio && <p className="error-text">{errors.bio.message}</p>}
          {errors.public_profile_bio && <p className="error-text">{errors.public_profile_bio.message}</p>}
        </div>

        {/* Skills */}
        <div className="form-row">
          <label className="label">
            Skills / Experience{' '}
            {publicProfile ? <span className="required" /> : <span className="help-text">(optional)</span>}
          </label>
          <textarea
            {...register('skills')}
            className="textarea"
            placeholder="e.g. Working with children, first aid, cooking"
          />
          {errors.skills && <p className="error-text">{errors.skills.message}</p>}
          {errors.public_profile_skills && <p className="error-text">{errors.public_profile_skills.message}</p>}
        </div>

        <div className="check-row">
          
          {/* Generally Available */}
          <label className="check-label">
            <input type="checkbox" {...register('available_anytime')} className="check" />
            Flexible Availability
          </label>

          {/* Public Profile */}
          <label className="check-label">
           <input type="checkbox" {...register('public_profile')} className="check" />
           Allow organisations to view my profile and contact me
         </label>
        </div>

        {/* Availability Matrix */}
        {!availableAnytime && (
          <Controller
            name="availability_matrix"
            control={control}
            render={({ field }) => (
              <AvailabilityMatrix value={field.value} onChange={field.onChange} />
            )}
          />
        )}        

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
