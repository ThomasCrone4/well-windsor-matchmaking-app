// WF9-6. The admin was one page with six tabs in a row, which wrapped onto
// three lines on a narrow screen and mixed unrelated jobs: approving an
// organisation sat beside editing the towns list.
//
// Three pages instead, each answering one question:
//
//   /admin         who is waiting, and who can do what        (Access)
//   /admin/manage  the things on the site                     (Site management)
//   /admin/logs    what has happened, and what went wrong     (Logs and reports)
//
// Access is the landing page because the approval queue is the only part of
// the admin with someone waiting at the other end of it.
import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/admin', label: 'Access', end: true },
  { to: '/admin/manage', label: 'Site management' },
  { to: '/admin/logs', label: 'Logs and reports' },
];

export default function AdminNav({ pendingCount = 0, reportCount = 0 }) {
  const badgeFor = (to) =>
    to === '/admin' ? pendingCount : to === '/admin/logs' ? reportCount : 0;

  return (
    <nav className="mb-8 flex flex-wrap gap-3" aria-label="Admin sections">
      {LINKS.map(({ to, label, end }) => {
        const count = badgeFor(to);
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `btn ${isActive ? 'btn-primary' : 'btn-secondary'} relative`
            }
          >
            {label}
            {/* A count only where it means "waiting for you". The old tab bar
                put one on every tab, including a total of everything that
                exists, which is not a number anyone needs to act on. */}
            {count > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white bg-opacity-20">
                {count}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
