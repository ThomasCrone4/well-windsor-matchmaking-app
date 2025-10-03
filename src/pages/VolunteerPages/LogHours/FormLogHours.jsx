import '../../../index.css';
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
    setError,
    clearErrors,
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

  // Accepted applications for this volunteer
  const { isLoading: loadingApps } = useQuery({
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

  // Existing logs map (application_id -> volunteer_hours.id), used only when creating
  const { data: existingLogsByApp = {} } = useQuery({
    queryKey: ['existingLogsByApp', userId],
    enabled: !!userId && !isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_hours')
        .select(`
          id,
          application_id,
          created_at,
          application:applications ( volunteer_id )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const mine = (data || []).filter((row) => row.application?.volunteer_id === userId);
      const map = {};
      for (const row of mine) {
        if (!map[row.application_id]) map[row.application_id] = row.id; // latest per app
      }
      return map;
    },
  });

  // If editing, fetch the existing entry
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

  // Also fetch its application to display a stable read-only title
  const { data: editAppInfo } = useQuery({
    queryKey: ['applicationInfo', editEntry?.application_id],
    enabled: isEdit && !!editEntry?.application_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, opportunity_title, subject, direction')
        .eq('id', editEntry.application_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Store edit entry once available
  useEffect(() => {
    if (!isEdit || !editEntryData) return;
    setEditEntry(editEntryData);
    setHourBlocks(editEntryData.logged_hours || []);
    setValue('notes', editEntryData.notes || '');
  }, [editEntryData, isEdit, setValue]);

  // When editing, we still set the hidden value for consistency (not user-editable)
  useEffect(() => {
    if (!isEdit || !editEntry) return;
    const index = applications.findIndex((app) => app.id === editEntry.application_id);
    if (index !== -1) setValue('application_id', index.toString());
  }, [applications, editEntry, isEdit, setValue]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (isEdit && editEntry?.id) {
        return await supabase.from('volunteer_hours').update(payload).eq('id', editEntry.id);
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

  /** ---------- Validation helpers ---------- */
  const toDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    return new Date(`${dateStr}T${timeStr}`);
  };

  const blockMinutes = (b) => {
    const start = toDateTime(b.start_date, b.start_time);
    const end = toDateTime(b.end_date || b.start_date, b.end_time);
    if (!start || !end) return 0;
    const diffMs = end.getTime() - start.getTime();
    return diffMs > 0 ? Math.round(diffMs / 60000) : 0;
  };

  const analyzeBlocks = (blocks) => {
    let anyDays = false;
    let anyDates = false;
    let anyTimes = false;
    let anyPositive = false;

    const hasValid = Array.isArray(blocks) && blocks.some((b) => {
      const hasDays = Array.isArray(b.days) && b.days.length > 0;
      const hasDate = !!b.start_date && !!b.end_date; // require both dates
      const hasTimes = !!b.start_time && !!b.end_time;
      const positive = blockMinutes(b) > 0;

      anyDays = anyDays || hasDays;
      anyDates = anyDates || hasDate;
      anyTimes = anyTimes || hasTimes;
      anyPositive = anyPositive || positive;

      return hasDays && hasDate && hasTimes && positive;
    });

    return { hasValid, anyDays, anyDates, anyTimes, anyPositive };
  };

  const onSubmit = async (data) => {
    if (!userId) return toast.error('No user ID');

    // If NEW entry and the selected application already has a log, redirect to edit
    if (!isEdit) {
      const selectedIndex = Number(data.application_id);
      const selectedApp = applications[selectedIndex];
      if (selectedApp?.id) {
        const existingId = existingLogsByApp[selectedApp.id];
        if (existingId) {
          toast('You already logged hours for this post — opening your existing entry.');
          navigate(`/volunteer/log-hours/edit/${existingId}`);
          return;
        }
      }
    }

    // Validate time blocks
    const { hasValid, anyDays, anyDates, anyTimes, anyPositive } = analyzeBlocks(hourBlocks);
    if (!hourBlocks.length || !hasValid) {
      const missing = [];
      if (!anyDays) missing.push('select at least one day');
      if (!anyDates) missing.push('choose a start and end date');
      if (!anyTimes) missing.push('enter start and end time');
      if (!anyPositive) missing.push('ensure end time is after start time');

      const message =
        missing.length > 0
          ? `Please fix your hour blocks: ${missing.join(', ')}.`
          : 'Please add at least one worked block with days, dates, and valid times.';

      setError('root.hourBlocks', { type: 'validate', message });
      toast.error('No valid hours found. Check days, dates, and times.');
      return;
    }
    clearErrors('root.hourBlocks');

    // Resolve application id (locked on edit)
    let applicationId;
    if (isEdit) {
      applicationId = editEntry?.application_id;
      if (!applicationId) return toast.error('Missing application for this entry.');
    } else {
      const selectedIndex = Number(data.application_id);
      const selectedApp = applications[selectedIndex];
      if (!selectedApp?.id) return toast.error('Invalid application selected');
      applicationId = selectedApp.id;
    }

    const payload = {
      application_id: applicationId,
      logged_hours: hourBlocks,
      notes: data.notes?.trim() || '',
      vol_confirmed: true,
      org_confirmed: false,
      finalized: false,
    };

    mutation.mutate(payload);
  };

  // Compute read-only title for edit view
  const editAppLabel =
    isEdit && editEntry
      ? (() => {
          const found = applications.find((a) => a.id === editEntry.application_id);
          if (found) return found.label;
          if (editAppInfo) {
            return editAppInfo.direction === 'to_volunteer'
              ? editAppInfo.subject || 'Untitled Opportunity'
              : editAppInfo.opportunity_title || 'Untitled Opportunity';
          }
          return '';
        })()
      : '';

  return (
    <div className="container-app max-w-2xl py-8">
      {/* Header */}
      <div className="page-header">
        <button
          onClick={() => navigate('/volunteer/log-hours')}
          className="btn btn-secondary"
          type="button"
        >
          ← Back
        </button>
        <h1 className="title">{isEdit ? 'Edit Logged Hours' : 'Log New Volunteer Hours'}</h1>
        <div className="spacer" />
      </div>

      {/* Body */}
      {loadingApps ? (
        <div className="card">
          <p className="muted">Loading opportunities…</p>
        </div>
      ) : (!isEdit && !applications?.length) ? (
        <div className="card">
          <p className="muted italic">No accepted opportunities found.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="card form">
          {/* Opportunity */}
          <div className="field">
            <label className="label required">Opportunity</label>

            {!isEdit ? (
              <select
                {...register('application_id', {
                  required: 'Select an opportunity',
                  onChange: (e) => {
                    const idx = Number(e.target.value);
                    const sel = applications[idx];
                    if (!sel) return;

                    // If this app already has a log, redirect to edit
                    const existingId = existingLogsByApp[sel.id];
                    if (existingId) {
                      toast('You already logged hours for this post — opening your existing entry.');
                      navigate(`/volunteer/log-hours/edit/${existingId}`);
                      return;
                    }
                    setValue('application_id', e.target.value, { shouldValidate: true });
                  },
                })}
                className={`select ${errors.application_id ? 'select-invalid' : ''}`}
                aria-invalid={!!errors.application_id}
                defaultValue=""
              >
                <option value="" disabled>
                  Select one
                </option>
                {applications.map((app, index) => {
                  const hasExisting = !!existingLogsByApp[app.id];
                  return (
                    <option key={app.id} value={index}>
                      {app.label}{hasExisting ? ' — (already logged)' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              // Read-only "permanent" title look on edit
              <div className="input bg-gray-50 cursor-not-allowed">
                {editAppLabel || 'Loading…'}
              </div>
            )}

            {!isEdit && errors.application_id && (
              <p className="error-text">{errors.application_id.message}</p>
            )}
            {isEdit && <p className="help-text">The opportunity can’t be changed on an existing log.</p>}
          </div>

          {/* Hour Blocks */}
          <div className="field">
            <label className="label required">Hour Blocks</label>
            <WorkedMatrix 
              key={editEntry?.id || 'new'}
              value={hourBlocks}
              onChange={setHourBlocks}
            />
            {errors?.root?.hourBlocks && (
              <p className="error-text">{errors.root.hourBlocks.message}</p>
            )}
          </div>

          {/* Notes */}
          <div className="field">
            <label className="label">Notes (optional)</label>
            <textarea
              {...register('notes')}
              className={`textarea ${errors.notes ? 'textarea-invalid' : ''}`}
              placeholder="What did you do during these hours?"
              aria-invalid={!!errors.notes}
            />
            {errors.notes && <p className="error-text">{errors.notes.message}</p>}
          </div>

          <button type="submit" disabled={mutation.isLoading} className="btn btn-primary btn-block">
            {mutation.isLoading ? 'Submitting…' : isEdit ? 'Update Hours' : 'Submit Hours'}
          </button>
        </form>
      )}
    </div>
  );
}
