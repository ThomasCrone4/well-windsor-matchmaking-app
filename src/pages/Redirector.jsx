import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useUserProfile from '../hooks/useUserProfile';
import { toast } from 'react-hot-toast';

export default function Redirector() {
  const navigate = useNavigate();
  const { user, userId, profile, loading, error } = useUserProfile();

  useEffect(() => {
    if (loading) return;

    console.log('🔎 userId:', userId);
    console.log('📄 profile result:', profile);
    console.log('❌ error (if any):', error);

    if (!user || !profile || error) {
      toast.error('Please log in to continue');
      navigate('/auth');
      return;
    }

    if (profile.role === 'volunteer') {
      navigate('/volunteer-dashboard');
    } else if (profile.role === 'organization') {
      navigate('/organization-dashboard');
    } else {
      toast.error('Unknown user role');
      navigate('/auth');
    }
  }, [user, userId, profile, loading, error, navigate]);

  return (
    <div className="flex items-center justify-center h-screen text-xl text-gray-600">
      {loading ? 'Loading your dashboard...' : 'Redirecting...'}
    </div>
  );
}
