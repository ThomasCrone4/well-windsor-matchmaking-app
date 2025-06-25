// components/ProtectedRoute.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let didRedirect = false;

    const checkAccess = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (!user) {
        if (!didRedirect) {
          toast.error('Please log in first.', { id: 'login-required' });
          navigate('/auth');
          didRedirect = true;
        }
        return;
      }

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || !profile || !allowedRoles.includes(profile.role)) {
        if (!didRedirect) {
          toast.error('Access denied.', { id: 'access-denied' });
          navigate('/auth');
          didRedirect = true;
        }
        return;
      }

      setChecking(false);
    };

    checkAccess();
  }, [allowedRoles, navigate]);

  if (checking) {
    return <p className="text-center mt-12">Checking permissions...</p>;
  }

  return children;
}
