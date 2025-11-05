// src/routes/AdminRoute.jsx
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';

async function fetchIsAdmin() {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) return false;
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', uid)
    .single();
  if (error && error.code !== 'PGRST116') {
    // ignore "no rows" style errors as false
    throw error;
  }
  return Boolean(data);
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
