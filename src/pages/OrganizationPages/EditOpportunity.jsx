import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../utils/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useEffect, useRef, useState } from 'react';

import AvailabilityMatrix from '../../components/AvailabilityMatrix';
import useUnsavedChangesWarning from '../../hooks/useUnsavedWarning';

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
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-6 text-blue-700">Edit Opportunity</h1>

      {isLoading ? (
        <p>Loading opportunity...</p>
      ) : (
        <form className="space-y-5">
          <div>
            <label className="block font-semibold">Title</label>
            <input {...register('title')} className="w-full border rounded px-3 py-2 mt-1" />
            {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block font-semibold">Description</label>
            <textarea {...register('description')} className="w-full border rounded px-3 py-2 mt-1" />
            {errors.description && <p className="text-red-500 text-sm">{errors.description.message}</p>}
          </div>

          <div>
            <label className="block font-semibold">Location</label>
            <input {...register('location')} className="w-full border rounded px-3 py-2 mt-1" />
          </div>

          <div>
            <label className="block font-semibold">Contact Email</label>
            <input {...register('contact')} className="w-full border rounded px-3 py-2 mt-1" />
            {errors.contact && <p className="text-red-500 text-sm">{errors.contact.message}</p>}
          </div>

          <div>
            <label className="block font-semibold">Skills (optional)</label>
            <input {...register('skills')} className="w-full border rounded px-3 py-2 mt-1" />
          </div>

          <div>
            <label className="block font-semibold">Number of Volunteers Needed</label>
            <input
              type="number"
              min={1}
              {...register('volunteers_needed')}
              className="w-full border rounded px-3 py-2 mt-1"
            />
            {errors.volunteers_needed && (
              <p className="text-red-500 text-sm">{errors.volunteers_needed.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" {...register('generally_needed')} id="generally_needed" />
            <label htmlFor="generally_needed" className="font-semibold">
              Generally Needed (any time)
            </label>
          </div>

          {!generallyNeeded && (
            <div>
              <label className="block font-medium mb-1 mt-4">Specific Times Needed</label>
              <Controller
                name="when_needed"
                control={control}
                render={({ field }) => (
                  <AvailabilityMatrix value={field.value || []} onChange={field.onChange} />
                )}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" {...register('requires_dbs')} id="requires_dbs" />
            <label htmlFor="requires_dbs" className="font-semibold">Requires DBS Check</label>
          </div>
          
          <div className="flex flex-wrap gap-4 pt-4 items-center">
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
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
              >
                Post Opportunity
              </button>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((data) => handleSave(data))}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              Save Changes
            </button>

            <button
              type="button"
              onClick={handleDiscard}
              className="text-gray-700 border border-gray-400 px-6 py-2 rounded hover:bg-gray-100"
            >
              Discard Changes
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
