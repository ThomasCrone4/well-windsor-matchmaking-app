// hooks/useUserProfile.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useEffect } from 'react';

export default function useUserProfile() {
  const queryClient = useQueryClient();

  // Subscribe to auth changes and trigger refetch
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries(['session']);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  const userId = sessionQuery.data?.id;

  const profileQuery = useQuery({
    queryKey: ['user_profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*') // ✅ ensures all fields come through
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId, // ✅ only fetch profile when session is loaded
    staleTime: 0, // optional: cache profile
    refetchOnMount: 'always',  // refetch whenever this screen mounts
    refetchOnWindowFocus: true,     // (optional) refetch when tab regains focus
    refetchOnReconnect: true,       // (optional) refetch after network reconnect
  });

  return {
    user: sessionQuery.data,
    userId,
    profile: profileQuery.data,
    loading: sessionQuery.isLoading || profileQuery.isLoading,
    error: sessionQuery.error || profileQuery.error,
  };
}
