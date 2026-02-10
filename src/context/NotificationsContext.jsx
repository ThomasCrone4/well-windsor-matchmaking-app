// src/context/NotificationsContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useSession } from './SessionContext';
import toast from 'react-hot-toast';

const NotificationsContext = createContext();

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}

export function NotificationsProvider({ children }) {
  const { session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Fetch all notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Get unread count
  const unreadCount = notifications.filter(n => !n.read_at).length;

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', userId]);
    },
    onError: (error) => {
      console.error('Failed to mark notification as read:', error);
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', userId]);
      toast.success('All notifications marked as read');
    },
    onError: (error) => {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark notifications as read');
    },
  });

  // Delete notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', userId]);
    },
    onError: (error) => {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    },
  });

  // Create notification (helper for components)
  const createNotification = async (targetUserId, type, message, referenceId = null) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: targetUserId,
          type,
          message,
          reference_id: referenceId,
        });
      
      if (error) throw error;
      
      // Invalidate if it's for current user
      if (targetUserId === userId) {
        queryClient.invalidateQueries(['notifications', userId]);
      }
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  };

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          queryClient.invalidateQueries(['notifications', userId]);
          
          // Show toast for new notification
          if (payload.new?.message) {
            toast(payload.new.message, {
              icon: '🔔',
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const value = {
    notifications,
    unreadCount,
    isLoading,
    isOpen,
    setIsOpen,
    markAsRead: (id) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    deleteNotification: (id) => deleteNotificationMutation.mutate(id),
    createNotification,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}
