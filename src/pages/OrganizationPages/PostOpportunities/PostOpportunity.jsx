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
      <h1 className="text-2xl font-bold mb-6 text-center">Post a New Opportunity</h1>

      <form className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block font-medium">Title</label>
          <input {...register('title')} className="w-full p-2 border rounded" />
          {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Description</label>
          <textarea {...register('description')} className="w-full p-2 border rounded" />
        </div>

        <div>
          <label className="block font-medium">Location</label>
          <input {...register('location')} className="w-full p-2 border rounded" />
          {errors.location && <p className="text-red-500 text-sm">{errors.location.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Contact Email</label>
          <input
            {...register('contact')}
            placeholder="e.g. email@org.com"
            className="w-full p-2 border rounded"
          />
          {errors.contact && <p className="text-red-500 text-sm">{errors.contact.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Number of Volunteers Needed</label>
          <input
            type="number"
            min={1}
            {...register('volunteers_needed')}
            className="w-full p-2 border rounded"
          />
          {errors.volunteers_needed && (
            <p className="text-red-500 text-sm">{errors.volunteers_needed.message}</p>
          )}
        </div>

        <label className="block">
          <input type="checkbox" {...register('generally_needed')} />
          {' '}Generally Needed (any time)
        </label>

        {!generallyNeeded && (
          <div>
            <label className="block font-medium">Specific Times Needed</label>
            <Controller
              name="when_needed"
              control={control}
              render={({ field }) => (
                <AvailabilityMatrix value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        )}

        <label className="block mt-4">
          <input type="checkbox" {...register('requires_dbs')} />
          {' '}Requires DBS check
        </label>

        <div className="space-y-4 pt-6">
          <button
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              setIsDraft(false);
              setTimeout(() => {
                handleSubmit((data) => submitOpportunity(data, 'Active'))();
              }, 0);
            }}
            className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700"
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
            className="w-full bg-gray-300 text-gray-800 py-3 rounded hover:bg-gray-400"
          >
            Save as Draft
          </button>
        </div>
      </form>
    </div>
  );
}
