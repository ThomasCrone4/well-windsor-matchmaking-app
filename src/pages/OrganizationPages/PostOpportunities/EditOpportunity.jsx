import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../../utils/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useEffect, useRef, useState } from 'react';

import AvailabilityMatrix from '../../../components/AvailabilityMatrix';
import useUnsavedChangesWarning from '../../../hooks/useUnsavedWarning';

const getSchema = (isDraft) =>
  z.object({
    title: isDraft ? z.string().optional() : z.string().min(2, 'Title is required'),
    description: z.string().optional(),
    location: isDraft ? z.string().optional() : z.string().min(2, 'Location is required'),
    contact: isDraft ? z.string().optional() : z.string().min(3, 'Contact mail is required'),
    skills: z.string().optional(),
    volunteers_needed: isDraft
      ? z.coerce.number().optional()
      : z.coerce.number().min(1, 'Must be at least 1'),
    when_needed: z
      .array(
        z.object({
          days: z.array(z.string()),
          start_time: z.string(),
          end_time: z.string(),
          start_date: z.string(),
          end_date: z.string(),
        })
      )
      .nullable()
      .optional(),
    generally_needed: z.boolean(),
    requires_dbs: z.boolean(),
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
      reset(opportunity);
      originalData.current = opportunity;
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

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const { error } = await supabase
        .from('volunteer_opportunities')
        .update(formData)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Opportunity updated!');
      queryClient.invalidateQueries(['opportunity', id]);
      queryClient.invalidateQueries(['volunteer_opportunities']);
      navigate('/organization-dashboard');
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
      contact: formData.contact ?? '',
      skills: formData.skills || null,
      volunteers_needed: formData.volunteers_needed,
      generally_needed: formData.generally_needed,
      when_needed: formData.generally_needed ? null : formData.when_needed,
      requires_dbs: formData.requires_dbs,
    };

    if (statusOverride) updateData.status = statusOverride;

    mutation.mutate(updateData);
  };

  const handleDiscard = () => {
    if (window.confirm('Are you sure you want to discard changes?')) {
      reset(originalData.current);
      toast('Changes discarded.');
      navigate('/organization-dashboard');
    }
  };

  const generallyNeeded = watch('generally_needed');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="card">
        <h1 className="title">Edit Opportunity</h1>

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
              <label className="label">Description <span className="help-text">(optional)</span></label>
              <textarea
                {...register('description')}
                className={`textarea ${errors.description ? 'textarea-invalid' : ''}`}
                aria-invalid={!!errors.description}
              />
              {errors.description && <p className="error-text">{errors.description.message}</p>}
            </div>

            {/* Location */}
            <div className="form-row">
              <label className="label">
                Location {!isDraft && <span className="required" />}
              </label>
              <input
                {...register('location')}
                className={`input ${errors.location ? 'input-invalid' : ''}`}
                aria-invalid={!!errors.location}
              />
              {errors.location && <p className="error-text">{errors.location.message}</p>}
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
              <label className="label">Skills <span className="help-text">(optional)</span></label>
              <input
                {...register('skills')}
                className="input"
                placeholder="e.g. first aid, event setup"
              />
            </div>

            {/* Volunteers needed */}
            <div className="form-row">
              <label className="label">Number of Volunteers Needed {!isDraft && <span className="required" />}</label>
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
                  disabled={isSubmitting}
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
                  })}
                  className="btn btn-success"
                >
                  Post Opportunity
                </button>
              )}

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit((data) => handleSave(data))}
                className="btn btn-primary"
              >
                Save Changes
              </button>

              <button
                type="button"
                onClick={handleDiscard}
                className="btn btn-outline"
              >
                Discard Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
