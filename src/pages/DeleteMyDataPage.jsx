// Workflow 8.2 — the data-deletion route.
//
// A stable address to give people ("go to /delete-my-data") and to link from
// the privacy policy, emails and app-store style listings. It does not delete
// anything itself: deletion is ACC-6's DeleteAccountSection on the profile
// page, which asks the person to type DELETE and calls the delete-account Edge
// Function. This page only gets them there — or, if they cannot sign in, tells
// them how to ask instead.
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import useUserProfile from '../hooks/useUserProfile';
import { useSession } from '../context/SessionContext';

// Role values are US-spelled in data.
const PROFILE_FOR = {
  volunteer: '/volunteer/profile',
  organization: '/organization/profile',
};

export default function DeleteMyDataPage() {
  // Signed in or not comes from the session context, which reads local
  // storage. useUserProfile's own session query throws when there is no
  // session and React Query retries it three times, so a signed-out visitor
  // sat on "Checking…" for several seconds — found by walk_wf8.
  const { session, loading: sessionLoading } = useSession();
  const { profile } = useUserProfile();
  const loading = sessionLoading || (!!session && profile === undefined);
  const profilePath = session ? PROFILE_FOR[profile?.role] : null;

  return (
    <div className="container-app max-w-xl mx-auto px-4 py-16" id="main-content">
      <div className="card flex flex-col gap-4">
        <Trash2 className="w-8 h-8" style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
        <h1 className="title" style={{ color: 'var(--color-text-primary)' }}>Delete my data</h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          Deleting your account removes your profile and everything linked to it, straight away. It
          cannot be undone.{' '}
          <Link to="/privacy#delete" style={{ color: 'var(--color-brand-ink)' }} className="underline">
            What is deleted, and what is kept
          </Link>.
        </p>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Checking whether you are signed in…</p>
        ) : profilePath ? (
          <>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              You are signed in. The <strong>Delete account</strong> section is at the bottom of your
              profile page.
            </p>
            <div>
              <Link to={profilePath} className="btn btn-primary">Go to my profile</Link>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Sign in first, then go to your profile page — the <strong>Delete account</strong> section
              is at the bottom.
            </p>
            <div>
              <Link to="/auth" className="btn btn-primary">Sign in</Link>
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Can&rsquo;t sign in? Email{' '}
              <a href="mailto:hello@wellwindsor.org.uk" style={{ color: 'var(--color-brand-ink)' }} className="underline">
                hello@wellwindsor.org.uk
              </a>{' '}
              from the address you signed up with, and we will delete the account for you.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
