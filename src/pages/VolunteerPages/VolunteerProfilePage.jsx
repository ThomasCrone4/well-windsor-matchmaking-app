// src/pages/volunteer/VolunteerProfilePage.jsx
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '../../utils/supabase';
import AvailabilityMatrix from '../../components/AvailabilityMatrix';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';
import FormSkeleton from '../../components/skeletons/FormSkeleton';

// ✅ import the schedule helpers you already have
import { toDate, toMinutes, normalizeDays, DAYS } from '../../utils/schedule';
import { townOptionsFor } from '../../utils/towns';
import { MIN_VOLUNTEER_AGE, isOldEnough } from '../../utils/age';

const profileSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    contact_number: z.string().optional(),
    home_town: z.string().min(1, 'Select a home town'),
    // Required, and 18+. It used to be optional here, and clearing it
    // switched the database's age check off entirely -- that CHECK passed
    // on NULL. The database now refuses a volunteer with no date of birth,
    // so this form has to insist too or saving would fail with a
    // constraint error instead of a sentence.
    dob: z
      .string({ required_error: 'Date of birth is required' })
      .min(1, 'Date of birth is required')
      .refine(isOldEnough, `Volunteers must be ${MIN_VOLUNTEER_AGE} or over`),
    bio: z.string().optional(),
    skills: z.string().optional(),
    available_anytime: z.boolean(),
    availability_matrix: z.any(),
    public_profile: z.boolean(),
  })
  .refine((d) => !d.public_profile || !!d.bio?.trim(), {
    message: 'Bio is required to appear publicly',
    path: ['public_profile_bio'],
  })
  .refine((d) => !d.public_profile || !!d.skills?.trim(), {
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
    mode: 'onChange', // Enable real-time validation
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

  // --- helpers ---
  const emptyToNull = (v) => (v === '' || v === undefined ? null : v);
  const trimOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const normalizeUpdate = (formData) => ({
    // text
    name: trimOrNull(formData.name),
    contact_number: trimOrNull(formData.contact_number),
    home_town: trimOrNull(formData.home_town),
    bio: trimOrNull(formData.bio),
    skills: trimOrNull(formData.skills),

    // date
    dob: emptyToNull(formData.dob),

    // booleans
    available_anytime: !!formData.available_anytime,
    public_profile: !!formData.public_profile,

    // jsonb (keep for editing UI)
    availability_matrix: formData.available_anytime
      ? null
      : Array.isArray(formData.availability_matrix)
      ? formData.availability_matrix
      : [],
  });

  /** Format Date -> 'YYYY-MM-DD' using schedule.toDate */
  const toISO = (d) => {
    const dt = toDate(d);
    if (!dt) return null;
    const yyyy = String(dt.getFullYear());
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  /** Minutes -> 'HH:MM' */
  const minutesToHHMM = (mins) => {
    if (mins == null) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  /** Day labels -> numeric indices (0..6) using DAYS order */
  const dayLabelsToIndices = (labels) => {
    // normalizeDays returns full labels ('Monday'..'Sunday'), sorted & deduped
    const normalizedLabels = normalizeDays(labels);
    return normalizedLabels
      .map((label) => DAYS.indexOf(label))
      .filter((i) => i >= 0 && i <= 6);
  };

  /**
   * Convert AvailabilityMatrix blocks -> rows for volunteer_availability table.
   * Uses schedule.js to normalize dates/times/days so everything is comparable.
   */
  const matrixToRows = (blocks, uid) =>
    (blocks ?? [])
      .map((b) => {
        const daysIdx = dayLabelsToIndices(b?.days);
        const startM = toMinutes(b?.start_time);
        const endM = toMinutes(b?.end_time ?? b?.start_time);

        return {
          volunteer_id: uid,
          start_date: toISO(b?.start_date),            // 'YYYY-MM-DD' or null
          end_date: toISO(b?.end_date),                // 'YYYY-MM-DD' or null
          days: daysIdx,                               // int[] 0..6 (same order as DAYS)
          start_time: minutesToHHMM(startM),           // 'HH:MM'
          end_time: minutesToHHMM(endM),               // 'HH:MM'
        };
      })
      // must have at least one day and valid times
      .filter(
        (r) =>
          Array.isArray(r.days) &&
          r.days.length > 0 &&
          r.start_time &&
          r.end_time
      );

  /**
   * Mirror availability to volunteer_availability table.
   * Strategy: delete all then insert current (simple & RLS-friendly).
   */
  const mirrorAvailability = async (uid, available_anytime_flag, matrixBlocks) => {
    // Always clear existing rows first
    const { error: delErr } = await supabase
      .from('volunteer_availability')
      .delete()
      .eq('volunteer_id', uid);
    if (delErr) throw delErr;

    if (available_anytime_flag) {
      // nothing to insert
      return;
    }

    const rows = matrixToRows(matrixBlocks, uid);
    if (!rows.length) return; // no blocks to insert

    const { error: insErr } = await supabase.from('volunteer_availability').insert(rows);
    if (insErr) throw insErr;
  };

  const mutation = useMutation({
    mutationFn: async (formData) => {
      if (!userId) throw new Error('No user id');

      const update = normalizeUpdate(formData);

      // 1) Update user_profiles (keeps JSON for UI)
      const { error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', userId);

      if (error) throw error;

      // 2) Mirror to volunteer_availability using schedule.js normalization
      try {
        await mirrorAvailability(userId, update.available_anytime, update.availability_matrix ?? []);
      } catch (e) {
        console.error('Mirror availability failed:', e);
        toast.error('Saved profile, but failed to save detailed availability. Please retry.');
      }

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
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="title">Your profile</h1>
        <FormSkeleton fields={8} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8">
        <h1 className="title">Your profile</h1>
        <p className="page-description">
          Update your profile, skills, and availability for organisations to discover you. Make your profile public to appear in volunteer searches.
        </p>
      </div>

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
            {townOptionsFor(watch('home_town')).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.home_town && <p className="error-text">{errors.home_town.message}</p>}
        </div>

        {/* Date of Birth */}
        <div className="form-row">
          <label className="label">
            Date of birth <span className="required" />
          </label>
          <input
            type="date"
            {...register('dob')}
            className={`input ${errors.dob ? 'input-invalid' : ''}`}
            aria-invalid={!!errors.dob}
          />
          {errors.dob
            ? <p className="error-text">{errors.dob.message}</p>
            : <p className="help-text">Volunteers must be {MIN_VOLUNTEER_AGE} or over. Organisations never see your date of birth.</p>}
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
          {/* Flexible Availability */}
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
