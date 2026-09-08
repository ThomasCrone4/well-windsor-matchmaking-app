// src/components/NotificationsDropdown.jsx
import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useNotifications } from '../context/NotificationsContext';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsDropdown() {
  const {
    notifications,
    unreadCount,
    isOpen,
    setIsOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();
  
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, setIsOpen]);

  // No notification type routes anywhere yet. The hours_* types this used to
  // map to went with Log Hours, and nothing has ever written to `notifications`
  // (0 rows). Returning null renders the row as plain, unclickable text rather
  // than a link into the catch-all redirect; add cases here when something
  // starts writing notifications.
  const getNotificationLink = () => null;

  const getNotificationIcon = () => '🔔';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell icon button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="icon-btn icon-btn-brand relative p-2"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        title="Notifications"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span 
            style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
            className="absolute -top-1 -right-1 text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center"
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-96 rounded-lg shadow-2xl z-50 overflow-hidden"
          style={{ 
            backgroundColor: 'var(--color-background-elevated)',
            border: '1px solid var(--color-border)',
            maxHeight: '32rem'
          }}
        >
          {/* Header */}
          <div 
            className="px-4 py-3 flex justify-between items-center"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Notifications
            </h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="icon-btn icon-btn-brand text-sm p-1"
                  title="Mark all as read"
                  aria-label="Mark all notifications as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="icon-btn icon-btn-brand text-sm p-1"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications list */}
          <div className="overflow-y-auto" style={{ maxHeight: '28rem' }}>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>
                <Bell className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const link = getNotificationLink();
                  const isUnread = !notification.read_at;
                  
                  const NotificationContent = (
                    <div 
                      className="px-4 py-3 flex gap-3 hover:bg-opacity-50 transition-colors"
                      style={{ 
                        backgroundColor: isUnread ? 'var(--color-brand-teal-light)' : 'transparent',
                        borderBottom: '1px solid var(--color-border)',
                        opacity: isUnread ? 1 : 0.7,
                      }}
                    >
                      {/* Icon */}
                      <div className="text-2xl flex-shrink-0">
                        {getNotificationIcon()}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p 
                          className="text-sm mb-1"
                          style={{ 
                            color: 'var(--color-text-primary)',
                            fontWeight: isUnread ? '600' : '400'
                          }}
                        >
                          {notification.message}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {isUnread && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            className="icon-btn icon-btn-brand text-xs p-1"
                            title="Mark as read"
                            aria-label="Mark as read"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className="icon-btn icon-btn-brand text-xs p-1 hover:!bg-red-600 hover:!text-white"
                          title="Delete notification"
                          aria-label="Delete notification"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );

                  return (
                    <li key={notification.id}>
                      {link ? (
                        <Link 
                          to={link} 
                          onClick={() => {
                            if (isUnread) markAsRead(notification.id);
                            setIsOpen(false);
                          }}
                        >
                          {NotificationContent}
                        </Link>
                      ) : (
                        <div 
                          onClick={() => {
                            if (isUnread) markAsRead(notification.id);
                          }}
                          className="cursor-pointer"
                        >
                          {NotificationContent}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div 
              className="px-4 py-2 text-center text-sm"
              style={{ 
                borderTop: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)'
              }}
            >
              Showing {notifications.length} most recent notifications
            </div>
          )}
        </div>
      )}
    </div>
  );
}
