// EditOpportunity.jsx
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../utils/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useEffect } from 'react';

import AvailabilityMatrix from '../../components/AvailabilityMatrix';

const schema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  location: z.string().min(2),
  contact: z.string().min(3),
  skills: z.string().optional(),
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
  no_longer_available: z.boolean().optional(),
});

export default function EditOpportunity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      contact: '',
      skills: '',
      generally_needed: true,
      when_needed: [],
      requires_dbs: false,
      no_longer_available: false,
    },
  });

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
    }
  }, [opportunity, reset]);

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

  const generallyNeeded = watch('generally_needed');
  const requiresDbs = watch('requires_dbs');

  const onSubmit = (formData) => {
    const cleanData = {
      title: formData.title,
      description: formData.description,
      location: formData.location,
      contact: formData.contact,
      skills: formData.skills || null,
      generally_needed: formData.generally_needed,
      when_needed: formData.generally_needed ? null : formData.when_needed,
      requires_dbs: formData.requires_dbs,
      no_longer_available: formData.no_longer_available,
    };

    console.log('Submitting clean PATCH:', cleanData);
    mutation.mutate(cleanData);
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-6 text-blue-700">Edit Opportunity</h1>
      {isLoading ? (
        <p>Loading opportunity...</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block font-semibold">Title</label>
            <input
              type="text"
              {...register('title')}
              className="w-full border rounded px-3 py-2 mt-1"
            />
            {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block font-semibold">Description</label>
            <textarea
              {...register('description')}
              className="w-full border rounded px-3 py-2 mt-1"
            />
            {errors.description && <p className="text-red-500 text-sm">{errors.description.message}</p>}
          </div>

          <div>
            <label className="block font-semibold">Location</label>
            <input
              type="text"
              {...register('location')}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>

          <div>
            <label className="block font-semibold">Contact Method</label>
            <input
              type="text"
              {...register('contact')}
              className="w-full border rounded px-3 py-2 mt-1"
            />
            {errors.contact && <p className="text-red-500 text-sm">{errors.contact.message}</p>}
          </div>

          <div>
            <label className="block font-semibold">Skills (optional)</label>
            <input
              type="text"
              {...register('skills')}
              className="w-full border rounded px-3 py-2 mt-1"
            />
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

          <div className="flex items-center gap-2">
            <input type="checkbox" {...register('no_longer_available')} id="closed" />
            <label htmlFor="closed" className="font-semibold">Mark as No Longer Available</label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}
    </div>
  );
}
