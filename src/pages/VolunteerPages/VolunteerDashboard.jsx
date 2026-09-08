// One page for everything a volunteer has going on.
//
// Previously this showed only enquiries *received* from organisations,
// with an accept/deny state machine, while applications the volunteer
// had *sent* lived on a separate page. Both halves have changed: there
// is nothing to accept or deny any more, and an approach from an
// organisation arrives as an email rather than as a row to action here.
//
// So this page is a record, not an inbox: what you registered interest
// in, and who has written to you.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { supabase } from '../../utils/supabase';
import ConfirmDialog from '../../components/ConfirmDialog';
import ListSkeleton from '../../components/skeletons/ListSkeleton';

export default function VolunteerDashboard() {
  const [userId, setUserId] = useState(null);
  const [withdrawing, setWithdrawing] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user?.id) {
        toast.error('Please log in');
        navigate('/auth');
        return;
      }
      setUserId(data.user.id);
    };
    fetchUser();
  }, [navigate]);

  // isPending rather than isLoading: both queries are disabled until the
  // session resolves, and react-query v5 reports isLoading false for a
  // disabled query — so a loading guard on isLoading falls through to
  // rendering with data still undefined.
  const {
    data: applicationsData,
    isPending: loadingApplications,
    error: applicationsError,
  } = useQuery({
    queryKey: ['my_applications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          created_at,
          subject,
          message,
          org:org_id ( name ),
          volunteer_opportunities ( title, location, date_needed )
        `)
        .eq('volunteer_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Approaches from organisations. The email itself has already been
  // delivered; this is the record of it, so nothing here needs actioning.
  const { data: approachesData, isPending: loadingApproaches } = useQuery({
    queryKey: ['my_approaches', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_outreach')
        .select('id, created_at, subject, message, org:org_id ( name, home_town, email )')
        .eq('volunteer_id', userId)
        .eq('status', 'sent')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const applications = applicationsData ?? [];
  const approaches = approachesData ?? [];

  const withdraw = useMutation({
    mutationFn: async (applicationId) => {
      const { error } = await supabase.from('applications').delete().eq('id', applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Interest withdrawn');
      queryClient.invalidateQueries({ queryKey: ['my_applications', userId] });
      queryClient.invalidateQueries({ queryKey: ['my_applied_opportunity_ids'] });
    },
    onError: () => toast.error('Could not withdraw this'),
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" id="main-content">
      <div className="page-head">
        <h1 className="title">Your volunteering</h1>
        <p className="page-description">
          Roles you have registered interest in, and organisations that have been in touch.
          Organisations get in touch by email with the people they would like to hear more
          from, so check your inbox — and don&rsquo;t worry if you don&rsquo;t hear back
          about every one. That is normal, and it isn&rsquo;t a reflection on you.
        </p>

        <div className="page-actions">
          <Link to="/opportunities" className="btn-primary">
            Find opportunities
          </Link>
        </div>
      </div>

      <h2 className="list-head">
        Roles you&rsquo;ve registered for{applications.length ? ` (${applications.length})` : ''}
      </h2>

      {loadingApplications ? (
        <ListSkeleton items={3} />
      ) : applicationsError ? (
        <div className="empty" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="empty-title">Could not load your roles</p>
          <p className="empty-desc">Please refresh the page and try again.</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Nothing registered yet</p>
          <p className="empty-desc">
            When you find a role that fits, register your interest and it will
            appear here.
          </p>
          <div className="empty-cta">
            <Link to="/opportunities" className="btn-primary">
              Browse roles in Windsor
            </Link>
          </div>
        </div>
      ) : (
        <ul className="stack-lg">
          {applications.map((application) => (
            <li key={application.id} className="card stack">
              <h3 className="card-title">
                {application.volunteer_opportunities?.title || 'Opportunity'}
              </h3>
              <p className="caption">
                {application.org?.name || 'Organisation'} ·{' '}
                {application.volunteer_opportunities?.location || 'Location not given'}
              </p>
              <p className="caption">
                Registered {format(new Date(application.created_at), 'PPP')}
              </p>

              {application.subject?.trim() && (
                <p className="highlight">{application.subject}</p>
              )}
              {application.message?.trim() && (
                <p className="text whitespace-pre-line">{application.message}</p>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-sm self-start"
                onClick={() => setWithdrawing(application)}
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="list-head mt-12">
        Organisations that have contacted you{approaches.length ? ` (${approaches.length})` : ''}
      </h2>

      {loadingApproaches ? (
        <ListSkeleton items={2} />
      ) : approaches.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No messages yet</p>
          <p className="empty-desc">
            When an organisation writes to you, the message goes to your email
            address and a copy appears here.
          </p>
        </div>
      ) : (
        <ul className="stack-lg">
          {approaches.map((approach) => (
            <li key={approach.id} className="card stack">
              <h3 className="card-title">{approach.org?.name || 'An organisation'}</h3>
              <p className="caption">
                {format(new Date(approach.created_at), 'PPP p')}
                {approach.org?.home_town ? ` · ${approach.org.home_town}` : ''}
              </p>
              <p className="highlight">{approach.subject}</p>
              <p className="text whitespace-pre-line">{approach.message}</p>
              {approach.org?.email && (
                <p className="caption">
                  Reply to them at{' '}
                  <a href={`mailto:${approach.org.email}`} className="underline">
                    {approach.org.email}
                  </a>{' '}
                  — or just reply to their email.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!withdrawing}
        onClose={() => setWithdrawing(null)}
        onConfirm={() => withdraw.mutate(withdrawing.id)}
        title="Withdraw your interest?"
        confirmText="Withdraw"
        confirmStyle="danger"
        message={
          <>
            <p>
              This takes you off the organisation&rsquo;s list of people
              interested in{' '}
              <strong>
                {withdrawing?.volunteer_opportunities?.title || 'this opportunity'}
              </strong>
              .
            </p>
            <p className="mt-2">
              You can register again later if you change your mind.
            </p>
          </>
        }
      />
    </div>
  );
}
