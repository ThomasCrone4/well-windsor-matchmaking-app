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

const getOpportunitySchema = (isDraft) =>
  z.object({
    title: isDraft ? z.string().optional() : z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    location: isDraft ? z.string().optional() : z.string().min(1, 'Location is required'),
    contact: isDraft ? z.string().optional() : z.string().min(1, 'Contact method is required'),
    generally_needed: z.boolean(),
    when_needed: z.any(),
    requires_dbs: z.boolean(),
    volunteers_needed: z.coerce.number().min(1, 'Must be at least 1 volunteer'),
  });

export default function PostOpportunity() {
  const navigate = useNavigate();
  const [orgId, setOrgId] = useState(null);
  const [isDraft, setIsDraft] = useState(false);

  const schema = useMemo(() => getOpportunitySchema(isDraft), [isDraft]);

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
      contact: '',
      generally_needed: true,
      when_needed: [],
      requires_dbs: false,
      volunteers_needed: 1,
    },
  });

  const generallyNeeded = watch('generally_needed');

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
      contact: data.contact || '',
      generally_needed: !!data.generally_needed,
      when_needed: data.generally_needed ? null : (data.when_needed ?? []), // keep JSON for editing UX
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
      await replaceTimeblocks(opportunityId, postData.when_needed ?? [], postData.generally_needed);
    } catch (e) {
      console.error('Saving timeblocks failed:', e);
      toast.error('Opportunity saved, but failed to save required times. Please edit and retry.');
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
        <h1 className="title !mb-0">Post a New Opportunity</h1>
        <p className="page-description">
          Create a new volunteer opportunity with scheduling details and requirements. Save as a draft to edit later or publish immediately.
        </p>
      </div>

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

          {/* Description */}
          <div className="form-row">
            <label htmlFor="description" className="label">Description</label>
            <textarea
              id="description"
              {...register('description')}
              className={`textarea ${errors.description ? 'textarea-invalid' : ''}`}
              placeholder="Brief outline of the role, tasks, and impact."
            />
          </div>

          {/* Location */}
          <div className="form-row">
            <label htmlFor="location" className="label required">Location</label>
            <input
              id="location"
              {...register('location')}
              className={`input ${errors.location ? 'input-invalid' : ''}`}
              aria-invalid={!!errors.location}
              placeholder="e.g. Windsor"
            />
            {errors.location && <p className="error-text">{errors.location.message}</p>}
          </div>

          {/* Contact */}
          <div className="form-row">
            <label htmlFor="contact" className="label required">Contact Email</label>
            <input
              id="contact"
              {...register('contact')}
              className={`input ${errors.contact ? 'input-invalid' : ''}`}
              aria-invalid={!!errors.contact}
              placeholder="e.g. email@org.com"
              type="email"
            />
            {errors.contact && <p className="error-text">{errors.contact.message}</p>}
          </div>

          {/* Skills (optional) */}
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
                handleSubmit((form) => submitOpportunity(form, 'active'))();
              }, 0);
            }}
            className="btn-primary w-full"
          >
            Post Opportunity
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setIsDraft(true);
              setTimeout(() => {
                handleSubmit((form) => submitOpportunity(form, 'draft'))();
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
