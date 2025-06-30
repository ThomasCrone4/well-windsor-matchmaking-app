import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';

export default function EnquiryPage() {
  const { id: opportunityId } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    const fetchOpportunity = async () => {
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select('*')
        .eq('id', opportunityId)
        .single();

      if (error) {
        toast.error('Failed to load opportunity');
        console.error('Opportunity fetch error:', error);
      } else {
        setOpportunity(data);
      }
    };

    fetchOpportunity();
  }, [opportunityId]);

  const onSubmit = async ({ subject, message }) => {
    const confirmation = window.confirm(
      'Are you sure you want to send this enquiry?\n\nAn email will be sent to the organisation and this action cannot be undone.'
    );

    if (!confirmation) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    if (!user) {
      toast.error('You must be logged in to send an enquiry.');
      return;
    }

    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('volunteer_id', user.id)
      .single();

    if (existing) {
      toast.error('You have already enquired about this opportunity.');
      return;
    }

    const { error } = await supabase.from('applications').insert([
      {
        opportunity_id: opportunityId,
        volunteer_id: user.id,
        subject: subject.trim(),
        message: message.trim(),
        direction: 'to_opportunity',
        opportunity_title: opportunity?.title || null, // ✅ include title
      },
    ]);

    if (error) {
      toast.error('Failed to send enquiry');
      console.error('Application insert error:', error);
      return;
    }

    toast.success('Enquiry sent!');
    setTimeout(() => {
      navigate('/volunteer/sent-enquiries');
    }, 1500);
  };

  if (!opportunity) {
    return <p className="text-center mt-8">Loading opportunity...</p>;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded shadow-sm transition"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold">Send Enquiry</h1>
        <div className="w-20" />
      </div>

      <p className="mb-4 text-gray-700">
        You're sending an enquiry to{' '}
        <strong>{opportunity.title || 'Unnamed Role'}</strong> – {opportunity.location || 'Unknown Location'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block font-medium text-sm mb-1">
            Subject <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('subject', { required: 'Subject is required' })}
            placeholder="Enter your subject"
            className="w-full p-2 border rounded min-h-[50px]"
          />
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
            placeholder="Write your message"
            className="w-full p-2 border rounded min-h-[120px]"
          />
          {errors.message && (
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
  );
}
