// src/routes/AdminRoute.jsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import AccessDenied from '../../components/AccessDenied';

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

async function fetchMyRole() {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle();
  return data?.role ?? null;
}

export default function AdminRoute({ children }) {
  const { data: isAdmin, isPending, isError } = useQuery({
    queryKey: ['is-admin'],
    queryFn: fetchIsAdmin,
    staleTime: 60_000,
  });

  // Only for the denial message. Fetched alongside rather than after, so a
  // denied page does not arrive in two stages.
  const { data: role } = useQuery({
    queryKey: ['my-role'],
    queryFn: fetchMyRole,
    staleTime: 60_000,
  });

  if (isPending) return null;

  // ACC-5: was a toast plus a redirect home. The toast fired from the render
  // body, so it re-fired on every render, and being bounced to the home page
  // never says why.
  if (isError || !isAdmin) {
    return <AccessDenied yourRole={role} area="Well Windsor admins" />;
  }
  return children;
}
