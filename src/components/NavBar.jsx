// src/components/Navbar.jsx
import { Link, useNavigate } from 'react-router-dom';
import { UserCircle, Moon, Sun } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
  const { session } = useSession();
  const userId = session?.user?.id;
  const { theme, toggleTheme, isDark } = useTheme();

  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      const { data, error } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', userId)
        .single();
      // if not found, data is null/single() may 406; treat as false
      if (error && error.code !== 'PGRST116') throw error; // ignore "Results contain 0 rows" style error
      return Boolean(data);
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
  const role = profileData?.role;
  const profileLink =
    role === 'organization'
      ? '/organization/profile'
      : role === 'volunteer'
      ? '/volunteer/profile'
      : '/';

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 btn-primary"
      >
        Skip to main content
      </a>
      
      <nav className="shadow-md py-4 px-6 flex justify-between items-center" style={{ backgroundColor: 'var(--color-background-elevated)', borderBottom: '1px solid var(--color-border)' }}>
        <Link to="/" className="text-2xl font-bold text-blue-700">
          <img src="/WellWindsorLogo.png" alt="Well Windsor Logo" className="h-25 w-auto" />
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/opportunities" className="btn-secondary">
            Opportunities
          </Link>

          {/* Show Looking for Volunteers only for organizations */}
          {isLoggedIn && role === 'organization' && (
            <>
              <Link to="/volunteers" className="btn-secondary">
                Looking for Volunteers
            </Link>
            {/* <Link to="/organization/logged-hours" className="btn-secondary">Logged Hours</Link> */}
          </>
        )}

        {/* Admin link (only visible to users in the `admins` table) */}
        {isLoggedIn && isAdmin && (
          <Link to="/admin" className="btn-secondary">
            Admin
          </Link>
        )}

        {!isLoggedIn ? (
          <Link to="/auth" className="btn-primary">
            Login / Signup
          </Link>
        ) : (
          <>
            {role === 'volunteer' && (
              <Link to="/volunteer-dashboard" className="btn-secondary">
                Dashboard
              </Link>
            )}

            {role === 'organization' && (
              <Link to="/organization-dashboard" className="btn-secondary">
                Dashboard
              </Link>
            )}

            <Link to={profileLink} className="text-brand-teal hover:text-blue-600 flex items-center gap-1" aria-label="Profile">
              <UserCircle className="w-10 h-10" aria-hidden="true" />
            </Link>

            <button
              onClick={handleLogout}
              className="btn-secondary !bg-red-600 hover:!bg-red-600 !text-white"
              aria-label="Log out"
            >
              Log Out
            </button>
          </>
        )}

        {/* Theme toggle button */}
        <button
          onClick={toggleTheme}
          className="icon-btn icon-btn-brand p-2"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Moon className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </nav>
    </>
  );
}
