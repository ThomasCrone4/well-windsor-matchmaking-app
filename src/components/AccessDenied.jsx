// ACC-5 — the "access denied" page.
//
// A signed-in person who opened the wrong area used to be dumped at /auth
// with a toast, which reads as though they had been logged out: the natural
// next move is to try signing in again, with the credentials they are
// already using. This says what actually happened and offers the way back.
//
// Only for signed-in people in the wrong place. Someone who is not signed in
// still goes to /auth, because that genuinely is what they need.
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';

// Role values are US-spelled in data and UK-spelled in copy.
const AREA_FOR = {
  organization: 'organisations',
  volunteer: 'volunteers',
};

const HOME_FOR = {
  organization: { to: '/organization-dashboard', label: 'Go to your dashboard' },
  volunteer: { to: '/volunteer-dashboard', label: 'Go to your dashboard' },
};

export default function AccessDenied({ yourRole, allowedRoles = [], area }) {
  const areaFor = area ?? allowedRoles.map((r) => AREA_FOR[r] ?? r).join(' and ');
  const home = HOME_FOR[yourRole];

  return (
    <div className="container-app max-w-xl mx-auto px-4 py-16">
      <div className="card flex flex-col gap-4 text-center items-center">
        <ShieldOff
          className="w-10 h-10"
          style={{ color: 'var(--color-text-muted)' }}
          aria-hidden="true"
        />

        <h1 className="title" style={{ color: 'var(--color-text-primary)' }}>
          That area is for {areaFor || 'a different kind of account'}
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          You are still signed in — this part of Well Windsor just is not for
          your kind of account.
          {yourRole === 'volunteer' && ' Yours is a volunteer account.'}
          {yourRole === 'organization' && ' Yours is an organisation account.'}
        </p>

        <div className="flex flex-wrap gap-3 justify-center pt-2">
          {home && (
            <Link to={home.to} className="btn btn-primary">
              {home.label}
            </Link>
          )}
          <Link to="/opportunities" className="btn btn-secondary">
            Browse roles
          </Link>
        </div>

        <p className="text-sm pt-2" style={{ color: 'var(--color-text-muted)' }}>
          If you think this is wrong, report it from the link at the bottom of
          any page.
        </p>
      </div>
    </div>
  );
}
