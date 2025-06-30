import { Link, useNavigate } from 'react-router-dom';
import { UserCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useSession } from '../context/SessionContext';

export default function Navbar() {
  const { session } = useSession();
  const userId = session?.user?.id;

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries(['user_profile']);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [queryClient]);

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
    <nav className="bg-white shadow-md py-4 px-6 flex justify-between items-center">
      <Link to="/" className="text-2xl font-bold text-blue-700">
        <img src="/WellWindsorLogo.png" alt="Well Windsor Logo" className="h-25 w-auto" />
      </Link>

      <div className="flex items-center gap-6">
        <Link to="/opportunities" className="text-gray-700 hover:text-blue-600">
          Opportunities
        </Link>

        {/* Show Looking for Volunteers only for organizations */}
        {isLoggedIn && role === 'organization' && (
          <Link to="/volunteers" className="text-gray-700 hover:text-blue-600">
            Looking for Volunteers
          </Link>
        )}

        {/* Show Log Hours only for volunteers */}
        {isLoggedIn && role === 'volunteer' && (
          <Link to="/volunteer/log-hours" className="text-gray-700 hover:text-blue-600">
            Log Hours
          </Link>
        )}

        {!isLoggedIn ? (
          <Link to="/auth" className="text-gray-700 hover:text-blue-600">
            Login / Signup
          </Link>
        ) : (
          <>
            <Link to="/redirect" className="text-gray-700 hover:text-blue-600">
              Dashboard
            </Link>

            <Link to={profileLink} className="text-gray-700 hover:text-blue-600 flex items-center gap-1">
              <UserCircle className="w-6 h-6" />
            </Link>

            <button
              onClick={handleLogout}
              className="text-red-600 hover:underline font-medium"
            >
              Log Out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
