// src/pages/organization/EditOpportunity.jsx
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../../utils/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useEffect, useRef, useState } from 'react';

import AvailabilityMatrix from '../../../components/AvailabilityMatrix';
import useUnsavedChangesWarning from '../../../hooks/useUnsavedWarning';

// 🔁 schedule.js helpers
import {
  toDate,
  toMinutes,
  normalizeDays,
  DAYS,
  blocksFromTimeblockRows,
  sameSchedule,
} from '../../../utils/schedule';
import { useTowns, townOptionsFor } from '../../../utils/towns';
import { OPPORTUNITY_CATEGORIES } from '../../../utils/opportunityImages';
import useUserProfile from '../../../hooks/useUserProfile';
import ApprovalNotice from '../../../components/ApprovalNotice';
import { isPendingOrganisation } from '../../../utils/approval';
import { LIMITS, checkFreeText, charsLeft } from '../../../utils/contentChecks';

const CATEGORY_VALUES = OPPORTUNITY_CATEGORIES.map((c) => c.value);

// This form is reset() straight from the database row, so every field that
// is nullable in the database arrives here as null -- and z.string().optional()
// rejects null, it only permits undefined. `skills` is null on almost every
// opportunity, which made "Save Changes" fail validation and return silently:
// no toast, no error text, no saved row, because the skills input has no error
// slot to render into. Any nullable column reaching this schema needs
// .nullable(), not just .optional().
const nullableText = z.string().nullable().optional();

// APP-5, and the .nullable() trap above applies to every one of these: the
// limits mirror the CHECK constraints on the table so a rejected save says
// something readable instead of surfacing a 23514.
const freeText = (field, { checkWords = false } = {}) =>
  z
    .string()
    .nullable()
    .optional()
    .superRefine((v, ctx) => {
      if (v == null) return;
      checkFreeText(v, field, ctx, { checkWords });
    });

const getSchema = (isDraft, towns, showPicker) =>
  z.object({
    title: isDraft
      ? freeText('title', { checkWords: true })
      : freeText('title', { checkWords: true }).refine(
          (v) => (v ?? '').trim().length >= 2,
          'Title is required'
        ),
    description: freeText('description', { checkWords: true }),
    location: isDraft
      ? freeText('location')
      : freeText('location').refine(
          (v) => (v ?? '').trim().length >= 2,
          'Location is required'
        ),
    // See PostOpportunity: draft may be blank, active may not -- unless
    // there is only one town, which the role is then filed under (ADM-6).
    town: isDraft || !showPicker
      ? nullableText
      : z.string().refine((v) => towns.includes(v), 'Please choose a town'),
    skills: freeText('skills'),
    // Nullable on the table and null on every row that predates it, so
    // reset() feeds this null -- .optional() alone would reject that and
    // make Save Changes fail silently, exactly as `skills` once did.
    category: nullableText.refine(
      (v) => !v || CATEGORY_VALUES.includes(v),
      'Please choose a kind of role'
    ),
    volunteers_needed: isDraft
      ? z.coerce.number().max(LIMITS.volunteers_needed).optional()
      : z.coerce
          .number()
          .min(1, 'Must be at least 1')
          .max(LIMITS.volunteers_needed, `That is more than ${LIMITS.volunteers_needed}. Please check.`),
    when_needed: z
      .array(
        z.object({
          days: z.array(z.string()),
          start_time: z.string(),
          end_time: z.string(),
          start_date: z.string().nullable().optional(),
          end_date: z.string().nullable().optional(),
        })
      )
      .nullable()
      .optional(),
    generally_needed: z.boolean(),
    // Nullable in the database, so the same trap as above.
    requires_dbs: z.boolean().nullable().optional(),
  });

export default function EditOpportunity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const originalData = useRef(null);
  // The schedule as it is in the database right now, so a save can tell a
  // real change from a re-save (ROLE-2).
  const savedBlocks = useRef([]);
  const [isDraft, setIsDraft] = useState(false);
  const { profile } = useUserProfile();
  const pending = isPendingOrganisation(profile);
  const { towns, soleTown, showPicker } = useTowns();

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    control,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(getSchema(isDraft, towns, showPicker)),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      town: '',
      skills: '',
      category: '',
      volunteers_needed: 1,
      generally_needed: true,
      when_needed: [],
      requires_dbs: false,
    },
  });

  useUnsavedChangesWarning(isDirty);

  const { data: opportunity, isLoading } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // ROLE-5. The matrix used to load from the `when_needed` jsonb, which was
  // NULL on every live role — so opening a scheduled role for editing showed
  // an empty matrix, and saving it wrote that emptiness back over real
  // timeblocks. These are the rows matching actually reads.
  const { data: timeblocks, isPending: blocksPending } = useQuery({
    queryKey: ['opportunity_timeblocks_edit', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_timeblocks')
        .select('days, start_time, end_time, start_date, end_date')
        .eq('opportunity_id', id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    // Wait for both: resetting on the opportunity alone would seed the matrix
    // empty and then never re-seed it, because reset() only runs once.
    if (opportunity && !blocksPending) {
      const blocks = blocksFromTimeblockRows(timeblocks ?? []);
      // Ensure the matrix is always an array, and town always a string --
      // a null value on a controlled <select> makes React fall back to
      // uncontrolled and warn.
      const defaults = {
        ...opportunity,
        when_needed: blocks,
        town: opportunity.town ?? '',
        // Same reason as town: a null on a controlled <select> makes React
        // fall back to uncontrolled and warn.
        category: opportunity.category ?? '',
      };
      reset(defaults, { keepDirty: false, keepTouched: false });
      originalData.current = defaults;
      savedBlocks.current = blocks;
      setIsDraft(opportunity.status === 'draft');
    }
  }, [opportunity, timeblocks, blocksPending, reset]);

  useEffect(() => {
    const beforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  /* -------------------- Normalization (via schedule.js) -------------------- */

  /** Date -> 'YYYY-MM-DD' */
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
    const normalizedLabels = normalizeDays(labels); // returns full labels, sorted & deduped
    return normalizedLabels
      .map((label) => DAYS.indexOf(label))
      .filter((i) => i >= 0 && i <= 6);
  };

  /** Matrix blocks -> rows for opportunity_timeblocks */
  const matrixToTimeblockRows = (blocks, opportunity_id) =>
    (blocks ?? [])
      .map((b) => {
        const daysIdx = dayLabelsToIndices(b?.days);
        const startM = toMinutes(b?.start_time);
        const endM = toMinutes(b?.end_time ?? b?.start_time);
        return {
          opportunity_id,
          start_date: toISO(b?.start_date), // 'YYYY-MM-DD' or null
          end_date: toISO(b?.end_date),     // 'YYYY-MM-DD' or null
          days: daysIdx,                    // int[] 0..6 (Mon..Sun)
          start_time: minutesToHHMM(startM),
          end_time: minutesToHHMM(endM),
        };
      })
      .filter(
        (r) =>
          Array.isArray(r.days) &&
          r.days.length > 0 &&
          r.start_time &&
          r.end_time
      );

  /** Delete then insert timeblocks for this opportunity */
  const replaceTimeblocks = async (opportunityId, blocks, generally_needed) => {
    const { error: delErr } = await supabase
      .from('opportunity_timeblocks')
      .delete()
      .eq('opportunity_id', opportunityId);
    if (delErr) throw delErr;

    if (generally_needed) return;

    const rows = matrixToTimeblockRows(blocks, opportunityId);
    if (!rows.length) return;

    const { error: insErr } = await supabase.from('opportunity_timeblocks').insert(rows);
    if (insErr) throw insErr;
  };

  const mutation = useMutation({
    mutationFn: async (payload) => {
      // The blocks travel alongside the row but are not columns on it, so
      // they are split off before the update rather than sent and rejected.
      const { __blocks: blocks, ...updateData } = payload;

      // 1) Update the parent row
      const { error } = await supabase
        .from('volunteer_opportunities')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;

      // 2) The schedule itself, in the only place it lives
      try {
        await replaceTimeblocks(id, blocks ?? [], !!updateData.generally_needed);
        savedBlocks.current = blocks ?? [];
      } catch (e) {
        console.error('Saving timeblocks failed:', e);
        toast.error('Saved details, but failed to save required times. Please retry.');
      }

      return { ...updateData, when_needed: blocks ?? [] };
    },
    onSuccess: (saved) => {
      toast.success('Opportunity updated!');
      queryClient.invalidateQueries(['opportunity', id]);
      queryClient.invalidateQueries(['opportunity_timeblocks_edit', id]);
      queryClient.invalidateQueries(['volunteer_opportunities']);

      originalData.current = { ...(originalData.current || {}), ...saved };

      reset(
        { ...getValues(), ...saved, when_needed: saved.when_needed ?? [] },
        { keepDirty: false, keepTouched: false }
      );
    },
    onError: (err) => {
      console.error('Update error:', err);
      toast.error('Update failed. Try again.');
    },
  });

  const handleSave = (formData, statusOverride = null) => {
    const blocks = formData.generally_needed ? [] : (formData.when_needed ?? []);

    const updateData = {
      title: formData.title ?? '',
      description: formData.description ?? '',
      location: formData.location ?? '',
      // With the picker hidden the saved town stands; a role that never had
      // one is filed under the sole town (by the database, if this is still
      // loading).
      town: formData.town || soleTown || null,
      skills: formData.skills || null,
      category: formData.category || null,
      volunteers_needed: Number(formData.volunteers_needed ?? 1),
      generally_needed: !!formData.generally_needed,
      requires_dbs: !!formData.requires_dbs,
      // `contact` and `when_needed` are not sent: both columns are gone
      // (ROLE-3, ROLE-5). The blocks go to opportunity_timeblocks.
    };

    // ROLE-2. Both forms rewrite the timeblocks on every save, so the table
    // cannot tell a real change from a re-save — bump the counter only when
    // the schedule genuinely differs, and the trigger tells the registrants.
    const scheduleChanged = !sameSchedule(savedBlocks.current, blocks);
    if (scheduleChanged) {
      updateData.schedule_revision = Number(opportunity?.schedule_revision ?? 0) + 1;
    }

    if (statusOverride) updateData.status = statusOverride;

    // If not generally-needed, require at least one block unless saving as draft
    if (
      !updateData.generally_needed &&
      blocks.length === 0 &&
      !statusOverride // saving as current status
    ) {
      toast.error('Please specify times or mark as Generally Needed.');
      return;
    }

    mutation.mutate({ ...updateData, __blocks: blocks });
  };

  /**
   * Never let a validation failure be silent again. Not every field on this
   * form renders an error slot, so without this a rejected submit looks
   * exactly like a save that worked.
   */
  const onInvalid = (formErrors) => {
    const fields = Object.keys(formErrors ?? {});
    console.warn('EditOpportunity validation failed:', formErrors);
    toast.error(
      fields.length
        ? `Could not save. Please check: ${fields.join(', ')}`
        : 'Could not save. Please check the form.'
    );
  };

  const handleDiscard = () => {
    reset(originalData.current, { keepDirty: false, keepTouched: false });
    toast.success('Changes discarded');
  };

  const handleBack = () => {
    if (isDirty) {
      toast.error('You have unsaved changes. Please Save or Discard first.');
      return;
    }
    navigate(-1);
  };

  const generallyNeeded = watch('generally_needed');
  const descriptionLeft = charsLeft(watch('description'), 'description');

  // ROLE-4. A closed role never reopens by itself — a role closed in March
  // must not come back to life in September because its dates happen to be
  // in the future again, discovered only when a volunteer registers. So the
  // offer is made here, in the form, while the organisation is looking at
  // the dates, and only when reopening would actually produce a live role.
  const isClosed = opportunity?.status === 'closed';
  const watchedBlocks = watch('when_needed');
  const scheduleIsInTheFuture = (() => {
    if (generallyNeeded) return true; // nothing to be in the past
    const blocks = Array.isArray(watchedBlocks) ? watchedBlocks : [];
    if (blocks.length === 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return blocks.some((b) => {
      const end = toDate(b?.end_date) ?? toDate(b?.start_date);
      return end ? end >= today : true; // no end date means open-ended
    });
  })();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="page-header">
        <button onClick={handleBack} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0">Edit opportunity</h1>
        <div className="spacer" />
      </div>
      {pending && isDraft && <ApprovalNotice />}

      <div className="card relative">
        {isLoading ? (
          <p className="muted">Loading opportunity...</p>
        ) : (
          <form className="form">
            {/* Title */}
            <div className="form-row">
              <label className="label">
                Title {!isDraft && <span className="required" />}
              </label>
              <input
                {...register('title')}
                className={`input ${errors.title ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.title}
              />
              {errors.title && <p className="error-text">{errors.title.message}</p>}
            </div>

            {/* Description */}
            <div className="form-row">
              <label className="label">
                Description <span className="help-text">(optional)</span>
              </label>
              <textarea
                {...register('description')}
                className={`textarea ${errors.description ? 'textarea-invalid' : ''}`}
                aria-invalid={!!errors.description}
              />
              {errors.description
                ? <p className="error-text">{errors.description.message}</p>
                : <p className="help-text">
                    {descriptionLeft < 0
                      ? `${Math.abs(descriptionLeft).toLocaleString()} characters over the limit`
                      : `${descriptionLeft.toLocaleString()} characters left`}
                  </p>}
            </div>

            {/* Town — the filter key volunteers browse by. Only asked for
                when there is more than one (ADM-6). */}
            {showPicker && (
            <div className="form-row">
              <label className="label">
                Town {!isDraft && <span className="required" />}
              </label>
              <select
                {...register('town')}
                className={`select ${errors.town ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.town}
              >
                <option value="">Select a town…</option>
                {townOptionsFor(towns, watch('town')).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errors.town
                ? <p className="error-text">{errors.town.message}</p>
                : <p className="help-text">Volunteers filter the browse by town.</p>}
            </div>
            )}

            {/* Category — picks the photograph on the listing */}
            <div className="form-row">
              <label className="label">
                Kind of role <span className="help-text">(optional)</span>
              </label>
              <select
                {...register('category')}
                className={`select ${errors.category ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.category}
              >
                <option value="">No preference (use a general photo)</option>
                {OPPORTUNITY_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {errors.category
                ? <p className="error-text">{errors.category.message}</p>
                : <p className="help-text">
                    Chooses the photograph shown on your listing. You cannot
                    upload your own picture yet.
                  </p>}
            </div>

            {/* Location — free text, the human-readable place */}
            <div className="form-row">
              <label className="label">
                Location {!isDraft && <span className="required" />}
              </label>
              <input
                {...register('location')}
                className={`input ${errors.location ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.location}
                placeholder="e.g. St Edward's First School, Parsonage Lane"
              />
              {errors.location
                ? <p className="error-text">{errors.location.message}</p>
                : <p className="help-text">The venue or address.{showPicker && ' Free text. The town above does the filtering.'}</p>}
            </div>

            {/* ROLE-3. The required "Contact Email" field is gone — see the
                note on PostOpportunity. No volunteer ever saw it. */}

            {/* Skills */}
            <div className="form-row">
              <label className="label">
                Skills <span className="help-text">(optional)</span>
              </label>
              <input
                {...register('skills')}
                className="input"
                placeholder="e.g. first aid, event setup"
              />
            </div>

            {/* Volunteers needed */}
            <div className="form-row">
              <label className="label">
                Number of Volunteers Needed {!isDraft && <span className="required" />}
              </label>
              <input
                type="number"
                min={1}
                {...register('volunteers_needed')}
                className={`input ${errors.volunteers_needed ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.volunteers_needed}
              />
              {errors.volunteers_needed && (
                <p className="error-text">{errors.volunteers_needed.message}</p>
              )}
            </div>

            {/* Inline checkboxes */}
            <div className="check-row">
              <label className="check-label">
                <input type="checkbox" {...register('generally_needed')} className="check" />
                Generally Needed (any time)
              </label>

              <label className="check-label">
                <input type="checkbox" {...register('requires_dbs')} className="check" />
                Requires DBS Check
              </label>
            </div>

            {/* Specific times (conditional) */}
            {!generallyNeeded && (
              <div className="form-row">
                <label className="label">Specific Times Needed</label>
                <Controller
                  name="when_needed"
                  control={control}
                  render={({ field }) => (
                    <AvailabilityMatrix value={field.value || []} onChange={field.onChange} />
                  )}
                />
              </div>
            )}

            {/* ROLE-4. The reopen offer, right where the dates are. */}
            {isClosed && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-background-secondary)',
                  color: 'var(--color-text-secondary)',
                  borderLeft: '3px solid var(--color-brand)',
                }}
              >
                <p>
                  <strong style={{ color: 'var(--color-text-primary)' }}>
                    This role is closed.
                  </strong>{' '}
                  {opportunity?.closed_reason
                    ? `You closed it: ${opportunity.closed_reason}.`
                    : 'It is not on the browse and nobody can register interest.'}
                </p>
                <p className="mt-2">
                  {scheduleIsInTheFuture
                    ? 'Its dates are still ahead, so you can put it back on the browse.'
                    : 'Its dates have passed. Give it dates in the future above and you can reopen it.'}
                </p>
                <button
                  type="button"
                  disabled={
                    !scheduleIsInTheFuture || pending || isSubmitting || mutation.isPending
                  }
                  title={
                    pending
                      ? 'Available once Well Windsor approves your organisation'
                      : !scheduleIsInTheFuture
                        ? 'Update the dates first'
                        : undefined
                  }
                  onClick={handleSubmit((data) => handleSave(data, 'active'), onInvalid)}
                  className="btn btn-primary btn-sm mt-3"
                >
                  Reopen this role
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 items-center">
              {isDraft && (
                <button
                  type="button"
                  disabled={pending || isSubmitting || mutation.isPending}
                  title={pending ? 'Available once Well Windsor approves your organisation' : undefined}
                  onClick={handleSubmit((data) => {
                    const requiredSchema = getSchema(false, towns, showPicker); // strict validation
                    const result = requiredSchema.safeParse(data);

                    if (!result.success) {
                      const fieldErrors = result.error.flatten().fieldErrors;
                      Object.entries(fieldErrors).forEach(([field, messages]) => {
                        if (messages && messages.length > 0) {
                          setError(field, { type: 'manual', message: messages[0] });
                        }
                      });
                      toast.error('Please fill in all required fields before posting.');
                      return;
                    }

                    handleSave(data, 'active');
                  }, onInvalid)}
                  className="btn btn-primary"
                >
                  {pending ? 'Post opportunity (after approval)' : 'Post opportunity'}
                </button>
              )}

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  disabled={!isDirty || isSubmitting || mutation.isPending}
                  onClick={handleSubmit((data) => handleSave(data), onInvalid)}
                  className="btn btn-primary"
                >
                  Save Changes
                </button>

                <button
                  type="button"
                  onClick={handleDiscard}
                  className="btn btn-outline"
                  disabled={!isDirty}
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
