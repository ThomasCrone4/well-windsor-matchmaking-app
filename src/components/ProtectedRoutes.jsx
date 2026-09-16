// components/ProtectedRoutes.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AccessDenied from './AccessDenied';

export default function ProtectedRoute({ allowedRoles = [], children }) {
  // 'checking' -> 'allowed' | 'denied'. Not signed in is not a state here:
  // that redirects, because signing in really is what the person needs.
  const [state, setState] = useState('checking');
  const [role, setRole] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (!user) {
        if (!cancelled) {
          toast.error('Please log in first.', { id: 'login-required' });
          navigate('/auth');
        }
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      // ACC-5: a signed-in person in the wrong area is shown a page saying
      // so, rather than being sent to /auth with a toast — which reads as
      // "you have been logged out" and invites them to sign in again with
      // the account they are already using.
      if (!profile || !allowedRoles.includes(profile.role)) {
        setRole(profile?.role ?? null);
        setState('denied');
        return;
      }

      setState('allowed');
    };

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [allowedRoles, navigate]);

  if (state === 'checking') {
    return (
      <p className="text-center mt-12" style={{ color: 'var(--color-text-secondary)' }}>
        Checking permissions…
      </p>
    );
  }

  if (state === 'denied') {
    return <AccessDenied yourRole={role} allowedRoles={allowedRoles} />;
  }

  return children;
}
