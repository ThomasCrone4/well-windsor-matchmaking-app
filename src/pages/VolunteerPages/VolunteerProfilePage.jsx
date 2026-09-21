// src/pages/volunteer/VolunteerProfilePage.jsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';
import useUserProfile from '../../hooks/useUserProfile';
import FormSkeleton from '../../components/skeletons/FormSkeleton';

import { useTowns, townOptionsFor } from '../../utils/towns';
import { MIN_VOLUNTEER_AGE, isOldEnough } from '../../utils/age';
import DeleteAccountSection from '../../components/DeleteAccountSection';
import ChangeEmailSection from '../../components/ChangeEmailSection';
import SkillsPicker from '../../components/SkillsPicker';
import { fetchSkillIds, replaceSkills, useSkills } from '../../utils/skills';

const profileSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    contact_number: z.string().optional(),
    // Not required here: with one town there is no picker to fill it in
    // (ADM-6), and a hidden field that fails validation fails silently.
    // onSubmit asks for it when the picker is showing.
    home_town: z.string().nullable().optional(),
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
    public_profile: z.boolean(),
  })
  .refine((d) => !d.public_profile || !!d.bio?.trim(), {
    message: 'Bio is required to appear publicly',
    path: ['public_profile_bio'],
  })
  // POLISH-4. The skills refine that stood here is gone: `skills` is no
  // longer a registered input, so it would be undefined on every submit and
  // would block every public profile. The rule itself is unchanged -- a
  // public profile still needs at least one skill -- and is checked in
  // onSubmit against the picker, where the message can be shown next to the
  // control. A hidden required field failing validation silently is the WF7
  // trap; this keeps it visible.
  ;

export default function VolunteerProfilePage() {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const { user, userId, profile, loading } = useUserProfile();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
    getValues,
  } = useForm({
    mode: 'onChange', // Enable real-time validation
    resolver: zodResolver(profileSchema),
    defaultValues: {},
  });

  const publicProfile = watch('public_profile');

  // POLISH-4. Chosen skills are rows in volunteer_skills, not a column.
  const { byId: skillsById } = useSkills();
  const [skillIds, setSkillIds] = useState([]);
  const [savedSkillIds, setSavedSkillIds] = useState([]);
  const [skillsError, setSkillsError] = useState('');

  // The picker is not a registered input, so react-hook-form's isDirty knows
  // nothing about it -- and both buttons below are `disabled={!isDirty && !skillsDirty}`.
  // Without this, changing ONLY your skills leaves Save greyed out and the
  // change unsaveable. The same trap as EditOpportunity; found by the walk,
  // not by reading the code.
  const skillsDirty =
    skillIds.length !== savedSkillIds.length ||
    skillIds.some((v) => !savedSkillIds.includes(v));

  useEffect(() => {
    let cancelled = false;
    if (!userId) return undefined;
    fetchSkillIds('volunteer', userId)
      .then((ids) => {
        if (cancelled) return;
        setSkillIds(ids);
        setSavedSkillIds(ids);
      })
      .catch((e) => console.error('Loading skills failed:', e));
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const { towns, soleTown, showPicker } = useTowns();

  useEffect(() => {
    if (!hydrated && profile !== undefined) {
      reset({
        name: profile?.name ?? '',
        contact_number: profile?.contact_number ?? '',
        home_town: profile?.home_town ?? '',
        dob: profile?.dob ?? '',
        bio: profile?.bio ?? '',
        skills: profile?.skills ?? '',
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
    home_town: trimOrNull(formData.home_town) ?? soleTown,
    bio: trimOrNull(formData.bio),
    // POLISH-4, transitional. The rows in volunteer_skills are the real
    // answer, written by the mutation. This text column is still written
    // because user_profiles_public_needs_detail is a CHECK requiring a
    // non-empty string before a volunteer may be public -- a CHECK cannot
    // query another table, so it cannot be taught about the join table. The
    // pending migration swaps it for a trigger and drops this column; until
    // then, writing only the rows would make every public profile unsaveable
    // with a 23514.
    skills: trimOrNull(
      skillIds.map((id) => skillsById.get(id)?.name).filter(Boolean).join(', ')
    ),

    // date
    dob: emptyToNull(formData.dob),

    // booleans
    public_profile: !!formData.public_profile,
  });

  // WF9-2. Five helpers stood here -- toISO, minutesToHHMM, dayLabelsToIndices,
  // matrixToRows and mirrorAvailability -- whose whole job was to translate the
  // availability grid into rows of `volunteer_availability` and rewrite that
  // table on every save. The table is going, so they go with it. Note what they
  // cost while they existed: a save wrote the same availability twice, once as
  // jsonb on the profile and once as normalised rows, and the second write was
  // wrapped in a try/catch that only told the volunteer "Saved profile, but
  // failed to save detailed availability" -- two sources of truth that could
  // silently disagree.

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

      await replaceSkills('volunteer', userId, skillIds);
      setSavedSkillIds(skillIds);

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
    if (showPicker && !trimOrNull(data.home_town)) {
      toast.error('Please select your home town.');
      return;
    }
    if (data.public_profile && skillIds.length === 0) {
      setSkillsError('Choose at least one skill to appear in volunteer searches.');
      return;
    }
    setSkillsError('');
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
        public_profile: !!profile?.public_profile,
      });
      // reset() does not reach the picker, which is not a registered input.
      // Without this, "discard" would leave the skills as edited.
      setSkillIds(savedSkillIds);
      setSkillsError('');
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
          Update your profile and skills so organisations can find you. Make your profile public to appear in volunteer searches.
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

        {/* Home Town — only when there is more than one (ADM-6) */}
        {showPicker && (
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
            {townOptionsFor(towns, watch('home_town')).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.home_town && <p className="error-text">{errors.home_town.message}</p>}
        </div>
        )}

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

        {/* Skills. POLISH-4: a managed list, not free text. */}
        <div>
          <SkillsPicker
            id="skills"
            label="Skills"
            hint={publicProfile ? '(at least one, to appear in searches)' : '(optional)'}
            value={skillIds}
            onChange={(next) => {
              setSkillIds(next);
              if (skillsError) setSkillsError('');
            }}
            invalid={!!skillsError}
          />
          {skillsError && <p className="error-text">{skillsError}</p>}
        </div>

        {/*
          CON-6. This was a checkbox sitting beside "Flexible Availability" --
          a control WF9-2 has now removed outright, along with the availability
          grid below it -- which is not somewhere anyone would find it. ACC-4
          only holds — discoverable staying ON by default — because turning it
          off is easy, so the switch has to be findable, say plainly what it
          does, and say what stays true when it is off. Every unprompted
          outreach email points here.
        */}
        <div
          id="discoverable"
          className="card"
          style={{ borderColor: publicProfile ? 'var(--color-brand-ink)' : 'var(--color-border)' }}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register('public_profile')}
              className="check mt-1"
              aria-describedby="discoverable-help"
            />
            <span>
              <span
                className="block font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Let approved organisations find and email me
              </span>
              <span
                id="discoverable-help"
                className="block text-sm mt-1"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {publicProfile
                  ? 'Organisations Well Windsor has approved can see your name, town, skills and bio, and can write to you through us. They never see your email address unless you reply.'
                  : 'You are not listed. Organisations cannot find you or write to you out of the blue, but one whose role you register for can still reply to you.'}
              </span>
            </span>
          </label>

          {/* The errors themselves sit on the bio and skills fields, which is
              where they get fixed. This switch is below both, so ticking it
              would otherwise surface a message off-screen. */}
          {(errors.public_profile_bio || skillsError) && (
            <p className="error-text mt-2">
              Add a bio and your skills above before organisations can find you.
            </p>
          )}
        </div>

        {/* WF9-2: the weekly availability grid stood here. A volunteer filled
            it in once and it was stale a fortnight later, so everything built
            on it -- the match badge, "Show matches only", the availability an
            organisation saw on a profile -- was quietly making claims out of
            data nobody had a reason to keep up to date. */}

        {/* Actions */}
        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            className="btn btn-primary flex-1"
            disabled={(!isDirty && !skillsDirty) || mutation.isPending}
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

      <ChangeEmailSection currentEmail={user?.email} />

      <DeleteAccountSection />
    </div>
  );
}
