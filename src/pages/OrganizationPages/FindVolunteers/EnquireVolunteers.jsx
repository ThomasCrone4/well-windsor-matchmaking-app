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

    setTimeout(() => {
      navigate('/organization-dashboard');
    }, 1200);
  };

  if (!volunteer) {
    return <p className="text-center mt-8">Loading volunteer profile...</p>;
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded shadow-sm transition"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold">Contact Volunteer</h1>
          <div className="w-20" />
        </div>

        <p className="mb-4 text-gray-700">
          You're contacting <strong>{volunteer.name || 'Unnamed Volunteer'}</strong>{' '}
          from {volunteer.home_town || 'Unknown Town'}
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 bg-white p-6 rounded shadow"
        >
          <div>
            <label className="block font-medium text-sm mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('subject', { required: 'Subject is required' })}
              placeholder="Write your subject"
              className="w-full p-2 border rounded min-h-[50px]"
            ></textarea>
            {errors.subject && (
              <p className="text-red-500 text-sm mt-1">{errors.subject.message}</p>
            )}
          </div>

          <div>
            <label className="block font-medium text-sm mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('message', { required: 'Message is required' })}
              placeholder={`Write your message`}
              className="w-full p-2 border rounded min-h-[120px]"
            ></textarea>
            {errors.subject && (
              <p className="text-red-500 text-sm mt-1">{errors.message.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Send Enquiry
          </button>
        </form>
      </div>
    </>
  );
}
