import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';

export default function SendVolunteerEnquiry() {
  const { id: volunteerId } = useParams();
  const navigate = useNavigate();
  const [volunteer, setVolunteer] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    const fetchVolunteer = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', volunteerId)
        .eq('role', 'volunteer')
        .single();

      if (error) {
        toast.error('Failed to load volunteer profile');
        console.error('Volunteer fetch error:', error);
      } else {
        setVolunteer(data);
      }
    };

    fetchVolunteer();
  }, [volunteerId]);

  const onSubmit = async ({ subject, message }) => {
    const confirm = window.confirm(
      'Are you sure you want to send this enquiry to the volunteer?\n\nThis will be logged and cannot be undone.'
    );
    if (!confirm) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const orgUser = sessionData?.session?.user;
    if (!orgUser) {
      toast.error('You must be logged in to send an enquiry.');
      return;
    }

    const finalMessage = message?.trim()
      ? message.trim()
      : "Hi, I'd like to apply for your position!";

    const { error } = await supabase.from('applications').insert([
      {
        org_id: orgUser.id,
        volunteer_id: volunteerId,
        subject: subject || null,
        message: finalMessage,
        direction: 'to_volunteer',
      },
    ]);

    if (error) {
      toast.error('Failed to send enquiry');
      console.error('Insert error:', error);
      return;
    }

    toast.success('Enquiry sent!');
    setTimeout(() => navigate('/organization-dashboard'), 1200);
  };

  if (!volunteer) {
    return <p className="text-center mt-8">Loading volunteer profile...</p>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          ← Back
        </button>
        <h1 className="title !mb-0">Contact Volunteer</h1>
        <div className="spacer" />
      </div>

      <p className="muted mb-4">
        You're contacting <strong>{volunteer.name || 'Unnamed Volunteer'}</strong>{' '}
        from {volunteer.home_town || 'Unknown Town'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="card form">
        <div className="form-row">
          <label className="label">
            Subject <span className="required" />
          </label>
          <textarea
            {...register('subject', { required: 'Subject is required' })}
            placeholder="Write your subject"
            className={`input textarea textarea-sm ${errors.subject ? 'textarea-invalid' : ''}`}
            aria-invalid={!!errors.subject}
          />
          {errors.subject && <p className="error-text">{errors.subject.message}</p>}
        </div>

        <div className="form-row">
          <label className="label">
            Message <span className="required" />
          </label>
          <textarea
            {...register('message', { required: 'Message is required' })}
            placeholder="Write your message"
            className={`input textarea textarea-lg ${errors.message ? 'textarea-invalid' : ''}`}
            aria-invalid={!!errors.message}
          />
          {errors.message && <p className="error-text">{errors.message.message}</p>}
        </div>

        <button type="submit" className="btn btn-primary btn-block">
          Send Enquiry
        </button>
      </form>
    </div>
  );
}
