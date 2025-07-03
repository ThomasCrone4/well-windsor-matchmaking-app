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

  const { isLoading: loadingApps, data: acceptedApps = [] } = useQuery({
    queryKey: ['acceptedApplications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, opportunity_id, opportunity_title, subject, direction')
        .eq('volunteer_id', userId)
        .eq('status', 'accepted');

      if (error) throw error;

      const apps = (data ?? []).map((app) => ({
        id: app.id,
        label:
          app.direction === 'to_volunteer'
            ? app.subject || 'Untitled Opportunity'
            : app.opportunity_title || 'Untitled Opportunity',
      }));

      setApplications(apps);
      return apps;
    },
  });

  const { data: editEntryData } = useQuery({
    queryKey: ['editLogEntry', editIdParam],
    enabled: !!editIdParam && isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select('*')
        .eq('id', editIdParam)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // First: store edit entry once available
  useEffect(() => {
    if (!isEdit || !editEntryData) return;
    setEditEntry(editEntryData);
    setHourBlocks(editEntryData.logged_hours || []);
    setValue('notes', editEntryData.notes || '');
  }, [editEntryData, isEdit, setValue]);

  // Then: once apps are ready, populate dropdown selection
  useEffect(() => {
    if (!isEdit || !editEntry) return;
    const index = applications.findIndex(app => app.id === editEntry.application_id);
    if (index !== -1) setValue('application_id', index.toString());
  }, [applications, editEntry, isEdit, setValue]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (isEdit && editEntry?.id) {
        return await supabase
          .from('volunteer_hours')
          .update(payload)
          .eq('id', editEntry.id);
      } else {
        return await supabase
          .from('volunteer_hours')
          .insert([payload]);
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

    const selectedIndex = Number(data.application_id);
    const selectedApp = applications[selectedIndex];
    if (!selectedApp?.id) return toast.error('Invalid application selected');

    const payload = {
      application_id: selectedApp.id,
      logged_hours: hourBlocks,
      notes: data.notes?.trim() || '',
      vol_confirmed: true,
      org_confirmed: false,
      finalized: false,
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
              {...register('application_id', { required: 'Select an opportunity' })}
              className="w-full p-2 border rounded"
            >
              <option value="">Select one</option>
              {applications.map((app, index) => (
                <option key={app.id} value={index}>
                  {app.label}
                </option>
              ))}
            </select>
            {errors.application_id && (
              <p className="text-red-500 text-sm mt-1">{errors.application_id.message}</p>
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
