// src/routes/AdminRoute.jsx
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';

async function fetchIsAdmin() {
  try {
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return false;
    
    const { data, error } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', uid)
      .maybeSingle(); // Use maybeSingle to avoid 406 errors
    
    if (error && error.code !== 'PGRST116') {
      console.warn('Admin check error:', error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.warn('Admin check failed:', err.message);
    return false;
  }
}

export default function AdminRoute({ children }) {
  const { data: isAdmin, isLoading, isError } = useQuery({
    queryKey: ['is-admin'],
    queryFn: fetchIsAdmin,
    staleTime: 60_000,
  });

  if (isLoading) return null; // or a spinner
  if (isError || !isAdmin) {
    toast.error('Admins only.');
    return <Navigate to="/" replace />;
  }
  return children;
}
