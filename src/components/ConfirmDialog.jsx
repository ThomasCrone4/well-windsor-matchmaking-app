// src/components/ConfirmDialog.jsx
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'danger' // 'danger' | 'primary' | 'warning'
}) {
  const dialogRef = useRef(null);

  // Close on ESC key
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Focus trap
      dialogRef.current?.focus();
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const confirmButtonClass = {
    danger: 'btn-primary !bg-red-600 hover:!bg-red-700',
    primary: 'btn-primary',
    warning: 'btn-primary !bg-yellow-600 hover:!bg-yellow-700'
  }[confirmStyle];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div 
        ref={dialogRef}
        className="rounded-lg shadow-2xl max-w-md w-full p-6"
        style={{
          backgroundColor: 'var(--color-background-elevated)',
          border: '1px solid var(--color-border)'
        }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 
            id="dialog-title"
            className="text-xl font-bold" 
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="icon-btn icon-btn-brand p-1"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message */}
        <div 
          className="mb-6 text-sm leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {message}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="btn-secondary"
            autoFocus
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={confirmButtonClass}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
