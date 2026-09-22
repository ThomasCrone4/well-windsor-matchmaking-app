// src/pages/organization/PostOpportunity.jsx
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import AvailabilityMatrix from '../../../components/AvailabilityMatrix';
import { useNavigate } from 'react-router-dom';

// 🔁 use your schedule.js
import { toDate, toMinutes, normalizeDays, DAYS } from '../../../utils/schedule';
import { useTowns } from '../../../utils/towns';
import { OPPORTUNITY_CATEGORIES } from '../../../utils/opportunityImages';
import useUserProfile from '../../../hooks/useUserProfile';
import ApprovalNotice from '../../../components/ApprovalNotice';
import { isPendingOrganisation } from '../../../utils/approval';
import { LIMITS, checkFreeText, charsLeft } from '../../../utils/contentChecks';
import SkillsPicker from '../../../components/SkillsPicker';
import { replaceSkills } from '../../../utils/skills';

const CATEGORY_VALUES = OPPORTUNITY_CATEGORIES.map((c) => c.value);

// APP-5. Length limits mirror the CHECK constraints on the table, so the form
// can say it in words instead of surfacing a 23514 nobody can read; the word
// list is client-side only. See src/utils/contentChecks.js for why the split
// is that way round.
// `.superRefine()` returns a ZodEffects, which is NOT a ZodString and has no
// `.min()`. Calling it threw at module scope and took the whole page down
// into the ErrorBoundary — a crash the build and eslint were both clean on,
// and that only the Playwright walk found. So the length rule is applied to
// the string first, and the refinement wraps the result.
const freeText = (field, { checkWords = false, min = 0, minMessage } = {}) => {
  const base = min > 0 ? z.string().min(min, minMessage) : z.string();
  return base.superRefine((v, ctx) => checkFreeText(v, field, ctx, { checkWords }));
};

const getOpportunitySchema = (isDraft, towns, showPicker) =>
  z.object({
    title: isDraft
      ? freeText('title', { checkWords: true }).optional()
      : freeText('title', { checkWords: true, min: 1, minMessage: 'Title is required' }),
    description: freeText('description', { checkWords: true }).optional(),
    location: isDraft
      ? freeText('location').optional()
      : freeText('location', { min: 1, minMessage: 'Location is required' }),
    // The filter key volunteers browse by. A draft may leave it blank; a
    // published opportunity may not (there is a CHECK constraint saying so),
    // because an active listing with no town is unreachable from a filtered
    // browse. With one town there is no picker and nothing to validate: the
    // role is filed under that town (ADM-6, src/utils/towns.js).
    town: isDraft || !showPicker
      ? z.string().optional()
      : z.string().refine((v) => towns.includes(v), 'Please choose a town'),
    // The skills input has been on this form all along and every value
    // typed into it was discarded: zod strips keys the schema does not
    // name, so `data.skills` never reached submitOpportunity -- and
    // postData did not send it either. Proven by the 2026-09-11 core-loop
    // walk, which posted "first aid, marshalling" and read back NULL.
    // Optional in both states -- the browse falls back to a neutral image.
    // It MUST be declared here even so: zod strips keys the schema does not
    // mention, so a field that is registered but unlisted silently never
    // reaches the submit handler. That is what happens to `skills` on this
    // form today.
    category: z
      .string()
      .nullable()
      .optional()
      .refine((v) => !v || CATEGORY_VALUES.includes(v), 'Please choose a category'),
    generally_needed: z.boolean(),
    // Still called when_needed here: it is the AvailabilityMatrix field name,
    // not a column. The column of that name is gone -- these blocks are
    // written to opportunity_timeblocks and nowhere else (ROLE-5).
    when_needed: z.any(),
    requires_dbs: z.boolean(),
    volunteers_needed: z.coerce
      .number()
      .min(1, 'Must be at least 1 volunteer')
      .max(LIMITS.volunteers_needed, `That is more than ${LIMITS.volunteers_needed}. Please check.`),
  });

export default function PostOpportunity() {
  const navigate = useNavigate();
  const [orgId, setOrgId] = useState(null);
  const { profile } = useUserProfile();
  // Publishing waits for approval (RLS refuses it otherwise); drafts do not.
  const pending = isPendingOrganisation(profile);
  const [isDraft, setIsDraft] = useState(false);
  const { towns, soleTown, showPicker } = useTowns();

  const schema = useMemo(
    () => getOpportunitySchema(isDraft, towns, showPicker),
    [isDraft, towns, showPicker]
  );

  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm({
    mode: 'onChange', // Enable real-time validation
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      town: '',
      category: '',
      generally_needed: true,
      when_needed: [],
      requires_dbs: false,
      volunteers_needed: 1,
    },
  });

  // POLISH-4. The chosen skill ids live here rather than in react-hook-form:
  // the picker is not a registered <input>, and mirroring them into the form
  // state would make two places the value lives -- which is how `skills`
  // itself once went missing on this very form (see the schema note above).
  const [skillIds, setSkillIds] = useState([]);

  const generallyNeeded = watch('generally_needed');
  const descriptionLeft = charsLeft(watch('description'), 'description');

  useEffect(() => {
    const fetchOrgId = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        toast.error('Could not get user ID');
        return;
      }
      setOrgId(userData.user.id);
    };
    fetchOrgId();
  }, []);

  /* -------------------- Normalization helpers (via schedule.js) -------------------- */

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
    // normalizeDays returns full labels ('Monday'..'Sunday'), sorted & deduped
    const normalizedLabels = normalizeDays(labels);
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
          start_date: toISO(b?.start_date),       // 'YYYY-MM-DD' or null
          end_date: toISO(b?.end_date),           // 'YYYY-MM-DD' or null
          days: daysIdx,                           // int[] 0..6
          start_time: minutesToHHMM(startM),       // 'HH:MM'
          end_time: minutesToHHMM(endM),           // 'HH:MM'
        };
      })
      .filter(
        (r) =>
          Array.isArray(r.days) &&
          r.days.length > 0 &&
          r.start_time &&
          r.end_time
      );

  /** Delete then insert timeblocks for a given opportunity */
  const replaceTimeblocks = async (opportunityId, blocks, generally_needed) => {
    // Clear existing (safe even on create)
    const { error: delErr } = await supabase
      .from('opportunity_timeblocks')
      .delete()
      .eq('opportunity_id', opportunityId);
    if (delErr) throw delErr;

    if (generally_needed) return; // no blocks to insert

    const rows = matrixToTimeblockRows(blocks, opportunityId);
    if (!rows.length) return;

    const { error: insErr } = await supabase.from('opportunity_timeblocks').insert(rows);
    if (insErr) throw insErr;
  };

  /**
   * A rejected submit must never be silent. Not every field here renders an
   * error slot -- `skills` still does not -- so without this, a validation
   * failure looks exactly like a save that worked. That is precisely how
   * saving an opportunity was impossible for months on the edit form, which
   * has had this handler since; this form never did.
   */
  const onInvalid = (formErrors) => {
    const fields = Object.keys(formErrors ?? {});
    console.warn('PostOpportunity validation failed:', formErrors);
    const first = fields.map((f) => formErrors[f]?.message).find(Boolean);
    toast.error(
      first || (fields.length
        ? `Could not post. Please check: ${fields.join(', ')}`
        : 'Could not post. Please check the form.')
    );
  };

  const submitOpportunity = async (data, status) => {
    if (!orgId) {
      toast.error('Organization ID not loaded');
      return;
    }

    if (
      !data.generally_needed &&
      (!data.when_needed || data.when_needed.length === 0) &&
      status !== 'draft'
    ) {
      toast.error('Please specify availability schedule or mark as Generally Needed');
      return;
    }

    const postData = {
      org_id: orgId,
      title: data.title || '',
      description: data.description || '',
      location: data.location || '',
      // null rather than '' -- the foreign key accepts a real town or NULL,
      // and a draft is allowed to have neither yet. With the picker hidden
      // this is the sole town, or null while the towns query is still
      // loading, in which case the database files it under that town itself.
      town: (showPicker ? data.town : soleTown) || null,
      // POLISH-4: skills are rows in opportunity_skills now, written below
      // once the role has an id. The text column is left untouched -- it is
      // dropped in supabase/pending/ after this client is live.
      // null rather than '': the CHECK accepts the three values or NULL,
      // and '' would be rejected outright.
      category: data.category || null,
      generally_needed: !!data.generally_needed,
      // No `when_needed` and no `contact`: both columns are gone (ROLE-5,
      // ROLE-3). The schedule goes to opportunity_timeblocks below, which is
      // where matching and the public pages have always read it from.
      requires_dbs: !!data.requires_dbs,
      volunteers_needed: Number(data.volunteers_needed) || 1,
      status,
    };

    // 1) Create opportunity and get its id
    const { data: inserted, error } = await supabase
      .from('volunteer_opportunities')
      .insert([postData])
      .select('id')
      .single();

    if (error) {
      toast.error(`Failed to save opportunity: ${error.message}`);
      return;
    }

    const opportunityId = inserted?.id;
    if (!opportunityId) {
      toast.error('Created opportunity but did not receive an id.');
      return;
    }

    // 2) Mirror matrix into opportunity_timeblocks with normalized values
    try {
      await replaceTimeblocks(opportunityId, data.when_needed ?? [], postData.generally_needed);
    } catch (e) {
      console.error('Saving timeblocks failed:', e);
      toast.error('Opportunity saved, but failed to save required times. Please edit and retry.');
      navigate('/organization-dashboard');
      return;
    }

    // POLISH-4. Same shape as the timeblocks write above, and the same
    // failure handling: the role exists either way, so say what was and was
    // not saved rather than pretending the whole thing failed.
    try {
      await replaceSkills('opportunity', opportunityId, skillIds);
    } catch (e) {
      console.error('Saving skills failed:', e);
      toast.error('Opportunity saved, but its skills did not save. Please edit and retry.');
      navigate('/organization-dashboard');
      return;
    }

    toast.success(status === 'draft' ? 'Saved as draft!' : 'Opportunity posted!');
    navigate('/organization-dashboard');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" id="main-content">
      <div className="mb-8">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm" aria-label="Go back">
          ← Back
        </button>
        <h1 className="title !mb-0">Post an opportunity</h1>
        <p className="page-description">
          Describe the role and when you need people. Save it as a draft to finish later, or post it and it goes live on the browse straight away.
        </p>
      </div>

      {pending && <ApprovalNotice />}

      <form className="card-post">
        <div className="form-grid">
          {/* Title */}
          <div className="form-row">
            <label htmlFor="title" className="label required">Title</label>
            <input
              id="title"
              {...register('title')}
              className={`input ${errors.title ? 'input-invalid' : ''}`}
              aria-invalid={!!errors.title}
              placeholder="e.g. After School Reading Support"
            />
            {errors.title
              ? <p className="error-text">{errors.title.message}</p>
              : <p className="help-text">Clear, descriptive titles help volunteers find you.</p>}
          </div>

          {/* Description. APP-5: the counter is here because the limit is
              real -- there is a CHECK constraint behind it -- and finding
              that out on submit, after writing 6,000 characters, is the
              worst possible moment. */}
          <div className="form-row">
            <label htmlFor="description" className="label">Description</label>
            <textarea
              id="description"
              {...register('description')}
              className={`textarea ${errors.description ? 'textarea-invalid' : ''}`}
              aria-invalid={!!errors.description}
              placeholder="Brief outline of the role, tasks, and impact."
            />
            {errors.description
              ? <p className="error-text">{errors.description.message}</p>
              : <p className="help-text">
                  {descriptionLeft < 0
                    ? `${Math.abs(descriptionLeft).toLocaleString()} characters over the limit`
                    : `${descriptionLeft.toLocaleString()} characters left`}
                </p>}
          </div>

          {/* Town — the filter key volunteers browse by. Only asked for when
              there is more than one (ADM-6). */}
          {showPicker && (
          <div className="form-row">
            <label htmlFor="town" className="label required">Town</label>
            <select
              id="town"
              {...register('town')}
              className={`select ${errors.town ? 'input-invalid' : ''}`}
              aria-invalid={!!errors.town}
            >
              <option value="">Select a town…</option>
              {towns.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.town
              ? <p className="error-text">{errors.town.message}</p>
              : <p className="help-text">Volunteers filter the browse by town.</p>}
          </div>
          )}

          {/* Category — picks the photograph on the listing. Optional:
              without one the card gets a neutral Windsor image rather than
              an empty slot. */}
          <div className="form-row">
            <label htmlFor="category" className="label">
              Kind of role <span className="help-text">(optional)</span>
            </label>
            <select
              id="category"
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
            <label htmlFor="location" className="label required">Location</label>
            <input
              id="location"
              {...register('location')}
              className={`input ${errors.location ? 'input-invalid' : ''}`}
              aria-invalid={!!errors.location}
              placeholder="e.g. St Edward's First School, Parsonage Lane"
            />
            {errors.location
              ? <p className="error-text">{errors.location.message}</p>
              : <p className="help-text">The venue or address.{showPicker && ' Free text. The town above does the filtering.'}</p>}
          </div>

          {/* ROLE-3. The required "Contact Email" field that stood here is
              gone. No volunteer ever saw it -- an organisation is reached
              through the Reply-To on the message it sends, never through a
              column on a role -- and of the fourteen live values, seven
              repeated the organisation's own login address and seven were
              invented seed addresses. One fewer required field on the
              longest form on the site. */}

          {/* Skills (optional). POLISH-4: a managed list, not free text. */}
          <SkillsPicker
            id="skills"
            label="Helpful but not required skills"
            hint="(optional)"
            value={skillIds}
            onChange={setSkillIds}
          />

          {/* Volunteers Needed */}
          <div className="form-row">
            <label htmlFor="volunteers_needed" className="label">Number of Volunteers Needed</label>
            <input
              id="volunteers_needed"
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

          {/* Generally Needed */}
          <div className="form-row">
            <label className="check-label">
              <input type="checkbox" {...register('generally_needed')} className="check" />
              Generally Needed (any time)
            </label>
            <p className="help-text">Tick if this role can be done at flexible times.</p>
          </div>

          {/* DBS. The field existed in the schema and the insert but had no
              input on this form, so it could only ever be set by editing the
              opportunity afterwards. */}
          <div className="form-row">
            <label className="check-label">
              <input type="checkbox" {...register('requires_dbs')} className="check" />
              Requires DBS Check
            </label>
            <p className="help-text">
              Shown on the listing. Well Windsor does not vet or DBS-check
              volunteers. Arranging and verifying the check is yours to do.
            </p>
          </div>

          {/* Specific Times Needed */}
          {!generallyNeeded && (
            <div className="form-row">
              <label className="label">Specific Times Needed</label>
              <Controller
                name="when_needed"
                control={control}
                render={({ field }) => (
                  <AvailabilityMatrix value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-6">
          <button
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              setIsDraft(false);
              setTimeout(() => {
                handleSubmit((form) => submitOpportunity(form, 'active'), onInvalid)();
              }, 0);
            }}
            className="btn-primary w-full"
            disabled={pending}
            title={pending ? 'Available once Well Windsor approves your organisation' : undefined}
          >
            {pending ? 'Post opportunity (after approval)' : 'Post opportunity'}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setIsDraft(true);
              setTimeout(() => {
                handleSubmit((form) => submitOpportunity(form, 'draft'), onInvalid)();
              }, 0);
            }}
            className="btn-secondary w-full"
          >
            Save as Draft
          </button>
        </div>
      </form>
    </div>
  );
}
