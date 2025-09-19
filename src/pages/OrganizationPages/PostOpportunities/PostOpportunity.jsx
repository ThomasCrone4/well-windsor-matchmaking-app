import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import AvailabilityMatrix from '../../../components/AvailabilityMatrix';
import { useNavigate } from 'react-router-dom';

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
      generally_needed: data.generally_needed,
      when_needed: data.generally_needed ? null : data.when_needed,
      requires_dbs: data.requires_dbs,
      volunteers_needed: data.volunteers_needed,
      status,
    };

    const { error } = await supabase.from('volunteer_opportunities').insert([postData]);

    if (error) {
      toast.error(`Failed to save opportunity: ${error.message}`);
    } else {
      toast.success(status === 'draft' ? 'Saved as draft!' : 'Opportunity posted!');
      navigate('/organization-dashboard');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
        ← Back
        </button>
        <h1 className="title !mb-0">Post a New Opportunity</h1>
        <div className="spacer" />
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

          {/* DBS */}
          <div className="form-row">
            <label className="check-label">
              <input type="checkbox" {...register('requires_dbs')} className="check" />
              Requires DBS check
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-6">
          <button
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              setIsDraft(false);
              setTimeout(() => {
                handleSubmit((data) => submitOpportunity(data, 'Active'))();
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
                handleSubmit((data) => submitOpportunity(data, 'draft'))();
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
