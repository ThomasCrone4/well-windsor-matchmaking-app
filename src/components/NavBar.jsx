// src/components/NavBar.jsx
//
// Two things this fixes, both visible on a phone.
//
// The wordmark was a text node with an <img> beside it carrying `h-25`,
// which is not a Tailwind class -- the scale has h-24 and h-28 and nothing
// between -- so the 890x788 logo rendered at whatever the flex row would
// give it. It is a fixed 50px tall now, which is what the near-square
// lockup needs to stay readable.
//
// And there was no mobile menu at all: every link sat in one flex row that
// wrapped into a stack of buttons at 375px. The links live behind a
// disclosure below `md` now. The mark's own lettering is cyan, so the bar
// it sits on must never be cyan -- it is the elevated surface token.
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UserCircle, Moon, Sun, Menu, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';
import NotificationsDropdown from './NotificationsDropdown';

export default function Navbar() {
  const { session } = useSession();
  const userId = session?.user?.id;
  const { toggleTheme, isDark } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  // Invalidate profile on auth state changes
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries(['user_profile']);
      queryClient.invalidateQueries(['is-admin']);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [queryClient]);

  // A menu that survives navigation is a trap on a phone: you tap a link,
  // the page changes underneath and the panel is still covering it.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Fetch profile for role-based links
  const { data: profileData } = useQuery({
    queryKey: ['user_profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Check admin membership
  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle(); // Use maybeSingle instead of single to avoid 406

        if (error && error.code !== 'PGRST116') {
          console.warn('Admin check error:', error.message);
          return false;
        }
        return Boolean(data);
      } catch (err) {
        console.warn('Admin check failed:', err.message);
        return false;
      }
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
    window.location.reload();
  };

  const isLoggedIn = !!userId;
  // The database spells this 'organization'. Comparing against the UK
  // spelling used in copy silently matches nothing.
  const role = profileData?.role;
  const isOrg = role === 'organization';
  const isVolunteer = role === 'volunteer';
  const profileLink = isOrg
    ? '/organization/profile'
    : isVolunteer
    ? '/volunteer/profile'
    : '/';

  // One list, rendered twice -- as a row on desktop and a stack in the
  // disclosure. Building the two independently is how they drift apart.
  const links = [
    { to: '/opportunities', label: 'Opportunities' },
    ...(isLoggedIn && isOrg ? [{ to: '/volunteers', label: 'Find volunteers' }] : []),
    ...(isLoggedIn && isVolunteer
      ? [{ to: '/volunteer-dashboard', label: 'Your volunteering' }]
      : []),
    ...(isLoggedIn && isOrg ? [{ to: '/organization-dashboard', label: 'Dashboard' }] : []),
    ...(isLoggedIn && isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  const navLinkClass =
    'text-sm font-medium rounded-lg px-1 py-1 transition-colors hover:opacity-70';

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 btn-primary"
      >
        Skip to main content
      </a>

      <nav
        className="relative"
        style={{
          backgroundColor: 'var(--color-background-elevated)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex-none" aria-label="Well Windsor — home">
            <picture>
              <source srcSet="/WellWindsorLogo.webp" type="image/webp" />
              <img
                src="/WellWindsorLogo.png"
                alt="Well Windsor"
                width="890"
                height="788"
                className="h-[50px] w-auto"
              />
            </picture>
          </Link>

          {/* ---------- desktop ---------- */}
          <div className="ml-auto hidden items-center gap-5 md:flex">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={navLinkClass}
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {link.label}
              </Link>
            ))}

            {!isLoggedIn ? (
              <Link to="/auth" className="btn-primary !rounded-full px-5 py-2 text-sm">
                Sign in
              </Link>
            ) : (
              <>
                <Link
                  to={profileLink}
                  className="flex items-center"
                  style={{ color: 'var(--color-brand-ink)' }}
                  aria-label="Profile"
                  title="Profile"
                >
                  <UserCircle className="h-7 w-7" aria-hidden="true" />
                </Link>

                <NotificationsDropdown />

                <button
                  onClick={handleLogout}
                  className="btn-secondary !rounded-full px-4 py-2 text-sm"
                  aria-label="Log out"
                >
                  Log out
                </button>
              </>
            )}

            <button
              onClick={toggleTheme}
              className="icon-btn icon-btn-brand p-2"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* ---------- mobile bar ---------- */}
          <div className="ml-auto flex items-center gap-1 md:hidden">
            {isLoggedIn && <NotificationsDropdown />}

            <button
              onClick={toggleTheme}
              className="icon-btn icon-btn-brand p-2"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            <button
              ref={menuButtonRef}
              onClick={() => setMenuOpen((open) => !open)}
              className="icon-btn p-2"
              style={{ color: 'var(--color-text-primary)' }}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
            >
              {menuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* ---------- mobile panel ---------- */}
        <div
          id="mobile-menu"
          hidden={!menuOpen}
          className="md:hidden"
          style={{
            backgroundColor: 'var(--color-background-elevated)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="flex flex-col gap-1 px-4 py-3">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg px-2 py-2.5 text-base font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {link.label}
              </Link>
            ))}

            {isLoggedIn && (
              <Link
                to={profileLink}
                className="rounded-lg px-2 py-2.5 text-base font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Your profile
              </Link>
            )}

            <div className="mt-2">
              {!isLoggedIn ? (
                <Link to="/auth" className="btn-primary btn-block !rounded-full py-2.5">
                  Sign in
                </Link>
              ) : (
                <button
                  onClick={handleLogout}
                  className="btn-secondary btn-block !rounded-full py-2.5"
                >
                  Log out
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
