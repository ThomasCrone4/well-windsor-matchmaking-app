import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';
import AvailabilityMatrix from '../../components/AvailabilityMatrix';
import { useNavigate } from 'react-router-dom';

const OpportunitySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  location: z.string().min(1, 'Location is required'),
  contact: z.string().min(1, 'Contact method is required'),
  generally_needed: z.boolean(),
  when_needed: z.any(),
  requires_dbs: z.boolean(),
  dbs_mandatory: z.boolean(),
});

export default function PostOpportunity() {
  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(OpportunitySchema),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      contact: '',
      generally_needed: true,
      when_needed: [],
      requires_dbs: false,
      dbs_mandatory: false,
    },
  });

  const navigate = useNavigate();
  const [orgId, setOrgId] = useState(null);

  const generallyNeeded = watch('generally_needed');
  const requiresDbs = watch('requires_dbs');

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

  const onSubmit = async (data) => {
    if (!orgId) {
      toast.error('Organization ID not loaded');
      return;
    }

    if (!data.generally_needed && (!data.when_needed || data.when_needed.length === 0)) {
      toast.error('Please specify availability schedule or mark as Generally Needed');
      return;
    }

    const postData = {
      org_id: orgId,
      title: data.title,
      description: data.description,
      location: data.location,
      contact: data.contact,
      generally_needed: data.generally_needed,
      when_needed: data.generally_needed ? null : data.when_needed,
      requires_dbs: data.requires_dbs,
      dbs_mandatory: data.dbs_mandatory,
      no_longer_available: false,
    };

    const { error } = await supabase.from('volunteer_opportunities').insert([postData]);

    if (error) {
      toast.error(`Failed to post opportunity: ${error.message}`);
    } else {
      toast.success('Opportunity posted!');
      setTimeout(() => navigate('/organization-dashboard'), 1000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-center">Post a New Opportunity</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-6 rounded shadow">
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
          <label className="block font-medium">Contact Method</label>
          <input
            {...register('contact')}
            placeholder="e.g. email@org.com"
            className="w-full p-2 border rounded"
          />
          {errors.contact && <p className="text-red-500 text-sm">{errors.contact.message}</p>}
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

        {requiresDbs && (
          <label className="block ml-4">
            <input type="checkbox" {...register('dbs_mandatory')} />
            {' '}DBS is mandatory (not just preferred)
          </label>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Post Opportunity
        </button>
      </form>
    </div>
  );
}
