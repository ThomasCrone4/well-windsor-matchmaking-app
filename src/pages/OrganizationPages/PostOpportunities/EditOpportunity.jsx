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
import { toDate, toMinutes, normalizeDays, DAYS } from '../../../utils/schedule';
import { TOWNS } from '../../../utils/towns';

// This form is reset() straight from the database row, so every field that
// is nullable in the database arrives here as null -- and z.string().optional()
// rejects null, it only permits undefined. `skills` is null on almost every
// opportunity, which made "Save Changes" fail validation and return silently:
// no toast, no error text, no saved row, because the skills input has no error
// slot to render into. Any nullable column reaching this schema needs
// .nullable(), not just .optional().
const nullableText = z.string().nullable().optional();

const getSchema = (isDraft) =>
  z.object({
    title: isDraft ? nullableText : z.string().min(2, 'Title is required'),
    description: nullableText,
    location: isDraft ? nullableText : z.string().min(2, 'Location is required'),
    // See PostOpportunity: draft may be blank, active may not.
    town: isDraft
      ? nullableText
      : z.string().refine((v) => TOWNS.includes(v), 'Please choose a town'),
    contact: isDraft ? nullableText : z.string().min(3, 'Contact mail is required'),
    skills: nullableText,
    volunteers_needed: isDraft
      ? z.coerce.number().optional()
      : z.coerce.number().min(1, 'Must be at least 1'),
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
  const [isDraft, setIsDraft] = useState(false);

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
    resolver: zodResolver(getSchema(isDraft)),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      town: '',
      contact: '',
      skills: '',
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

  useEffect(() => {
    if (opportunity) {
      // Ensure the matrix is always an array, and town always a string --
      // a null value on a controlled <select> makes React fall back to
      // uncontrolled and warn.
      const defaults = {
        ...opportunity,
        when_needed: opportunity.when_needed ?? [],
        town: opportunity.town ?? '',
      };
      reset(defaults, { keepDirty: false, keepTouched: false });
      originalData.current = defaults;
      setIsDraft(opportunity.status === 'draft');
    }
  }, [opportunity, reset]);

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
    mutationFn: async (formData) => {
      // 1) Update the parent row
      const { error } = await supabase
        .from('volunteer_opportunities')
        .update(formData)
        .eq('id', id);
      if (error) throw error;

      // 2) Mirror normalized blocks into opportunity_timeblocks
      try {
        await replaceTimeblocks(id, formData.when_needed ?? [], !!formData.generally_needed);
      } catch (e) {
        console.error('Saving timeblocks failed:', e);
        toast.error('Saved details, but failed to save required times. Please retry.');
      }

      return formData;
    },
    onSuccess: (saved) => {
      toast.success('Opportunity updated!');
      queryClient.invalidateQueries(['opportunity', id]);
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
    const updateData = {
      title: formData.title ?? '',
      description: formData.description ?? '',
      location: formData.location ?? '',
      town: formData.town || null,
      contact: formData.contact ?? '',
      skills: formData.skills || null,
      volunteers_needed: Number(formData.volunteers_needed ?? 1),
      generally_needed: !!formData.generally_needed,
      when_needed: formData.generally_needed ? null : (formData.when_needed ?? []), // keep JSON for UI/editing
      requires_dbs: !!formData.requires_dbs,
    };

    if (statusOverride) updateData.status = statusOverride;

    // If not generally-needed, require at least one block unless saving as draft
    if (
      !updateData.generally_needed &&
      (!updateData.when_needed || updateData.when_needed.length === 0) &&
      !statusOverride // saving as current status
    ) {
      toast.error('Please specify times or mark as Generally Needed.');
      return;
    }

    mutation.mutate(updateData);
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
        ? `Could not save — please check: ${fields.join(', ')}`
        : 'Could not save — please check the form.'
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="page-header">
        <button onClick={handleBack} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0"> Edit Opportunity</h1>
        <div className="spacer" />
      </div>
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
              {errors.description && <p className="error-text">{errors.description.message}</p>}
            </div>

            {/* Town — the filter key volunteers browse by */}
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
                {TOWNS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errors.town
                ? <p className="error-text">{errors.town.message}</p>
                : <p className="help-text">Volunteers filter the browse by town.</p>}
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
                : <p className="help-text">The venue or address. Free text — the town above does the filtering.</p>}
            </div>

            {/* Contact Email */}
            <div className="form-row">
              <label className="label">
                Contact Email {!isDraft && <span className="required" />}
              </label>
              <input
                {...register('contact')}
                className={`input ${errors.contact ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.contact}
              />
              {errors.contact && <p className="error-text">{errors.contact.message}</p>}
            </div>

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

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 items-center">
              {isDraft && (
                <button
                  type="button"
                  disabled={isSubmitting || mutation.isPending}
                  onClick={handleSubmit((data) => {
                    const requiredSchema = getSchema(false); // strict validation
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
                  className="btn btn-success"
                >
                  Post Opportunity
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
