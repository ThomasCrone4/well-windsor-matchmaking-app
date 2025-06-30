import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../../utils/supabase';
import toast from 'react-hot-toast';
import WorkedMatrix from '../../../components/WorkedMatrix';

export default function FormLogHours({ isEdit }) {
  const [userId, setUserId] = useState(null);
  const [applications, setApplications] = useState([]);
  const [hourBlocks, setHourBlocks] = useState([]);
  const [editEntry, setEditEntry] = useState(null);
  const { id: editIdParam } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) return toast.error('Not logged in');
      setUserId(data.user.id);
    };
    fetchUser();
  }, []);

  const { isLoading: loadingApps } = useQuery({
    queryKey: ['acceptedApplications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('opportunity_id, org_id, opportunity_title, subject')
        .eq('volunteer_id', userId)
        .eq('status', 'accepted');

      if (error) throw error;

      const apps = (data ?? []).map((app) => ({
        opportunity_id: app.opportunity_id,
        org_id: app.org_id,
        label: app.opportunity_title || app.subject || 'Untitled Opportunity',
      }));

      setApplications(apps);
      return apps;
    },
  });

  useEffect(() => {
    if (!editIdParam || !isEdit || !userId) return;
    const fetchEditEntry = async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select('*')
        .eq('id', editIdParam)
        .eq('volunteer_id', userId)
        .single();

      if (error) return toast.error('Failed to load entry');

      const matchIndex = applications.findIndex(
        (a) =>
          a.opportunity_id === data.opportunity_id &&
          a.org_id === data.org_id
      );
      if (matchIndex !== -1) setValue('opportunity_id', matchIndex);
      setValue('notes', data.notes || '');
      setHourBlocks(data.logged_hours || []);
      setEditEntry(data);
    };

    fetchEditEntry();
  }, [editIdParam, applications, isEdit, userId]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (isEdit && editEntry?.id) {
        return await supabase
          .from('volunteer_hours')
          .update(payload)
          .eq('id', editEntry.id);
      } else {
        return await supabase.from('volunteer_hours').insert([payload]);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Hours updated' : 'Hours submitted');
      queryClient.invalidateQueries(['loggedHours', userId]);
      navigate('/volunteer/log-hours');
    },
    onError: () => toast.error('Failed to log hours'),
  });

  const onSubmit = async (data) => {
    if (!userId) return toast.error('No user ID');
    if (!hourBlocks.length) return toast.error('Please add at least one hour block');

    const selectedIndex = Number(data.opportunity_id);
    const selectedApp = applications[selectedIndex];
    if (!selectedApp) return toast.error('Invalid opportunity selected');

    const payload = {
      volunteer_id: userId,
      notes: data.notes?.trim() || '',
      logged_hours: hourBlocks,
      confirmed_by: false,
      opportunity_id: selectedApp.opportunity_id,
      org_id: selectedApp.org_id,
    };

    mutation.mutate(payload);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="relative mb-6">
        <button
          onClick={() => navigate('/volunteer/log-hours')}
          className="absolute left-0 top-1/2 -translate-y-1/2 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
          style={{ minWidth: 90 }}
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-center">
          {isEdit ? 'Edit Logged Hours' : 'Log New Volunteer Hours'}
        </h1>
      </div>

      {loadingApps ? (
        <p>Loading opportunities...</p>
      ) : !applications?.length ? (
        <p className="text-gray-500 italic">No accepted opportunities found.</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 rounded shadow">
          <div>
            <label className="block font-medium text-sm mb-1">Opportunity</label>
            <select
              {...register('opportunity_id', { required: 'Select an opportunity' })}
              className="w-full p-2 border rounded"
            >
              <option value="">Select one</option>
              {applications.map((app, index) => (
                <option key={`${app.opportunity_id}-${app.org_id}`} value={index}>
                  {app.label}
                </option>
              ))}
            </select>
            {errors.opportunity_id && (
              <p className="text-red-500 text-sm mt-1">{errors.opportunity_id.message}</p>
            )}
          </div>

          <div>
            <label className="block font-medium text-sm mb-1">Hour Blocks</label>
            <WorkedMatrix value={hourBlocks} onChange={setHourBlocks} />
          </div>

          <div>
            <label className="block font-medium text-sm mb-1">Notes (optional)</label>
            <textarea
              {...register('notes')}
              className="w-full p-2 border rounded min-h-[100px]"
              placeholder="What did you do during these hours?"
            />
          </div>

          <button
            type="submit"
            disabled={mutation.isLoading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            {mutation.isLoading ? 'Submitting...' : isEdit ? 'Update Hours' : 'Submit Hours'}
          </button>
        </form>
      )}
    </div>
  );
}
