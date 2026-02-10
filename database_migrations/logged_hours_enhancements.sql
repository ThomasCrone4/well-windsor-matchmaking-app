-- Migration: Logged Hours Enhancements
-- Date: 2026-02-09
-- Description: Add soft delete, rejection workflow, and audit trail fields to volunteer_hours table
--              Create notifications system for hours-related alerts

-- ================================================
-- Part 1: Enhance volunteer_hours table
-- ================================================

-- Add new columns to volunteer_hours table
ALTER TABLE volunteer_hours
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rejected_by_org BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_edited_by VARCHAR(20) DEFAULT 'volunteer',
ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP DEFAULT NOW();

-- Add check constraint for last_edited_by
ALTER TABLE volunteer_hours
DROP CONSTRAINT IF EXISTS volunteer_hours_last_edited_by_check;

ALTER TABLE volunteer_hours
ADD CONSTRAINT volunteer_hours_last_edited_by_check 
CHECK (last_edited_by IN ('volunteer', 'organization', 'admin'));

-- Add check: rejection_reason required if rejected_by_org is true
ALTER TABLE volunteer_hours
DROP CONSTRAINT IF EXISTS volunteer_hours_rejection_reason_check;

ALTER TABLE volunteer_hours
ADD CONSTRAINT volunteer_hours_rejection_reason_check
CHECK (
  (rejected_by_org = FALSE OR rejection_reason IS NOT NULL)
);

-- Comment on new columns
COMMENT ON COLUMN volunteer_hours.deleted_at IS 'Timestamp when entry was soft-deleted (NULL = active)';
COMMENT ON COLUMN volunteer_hours.rejected_by_org IS 'True if organization rejected these hours';
COMMENT ON COLUMN volunteer_hours.rejection_reason IS 'Required explanation when rejected_by_org is true';
COMMENT ON COLUMN volunteer_hours.last_edited_by IS 'Who made the last edit: volunteer, organization, or admin';
COMMENT ON COLUMN volunteer_hours.last_edited_at IS 'Timestamp of last edit';

-- ================================================
-- Part 2: Create notifications table
-- ================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  reference_id UUID,
  message TEXT NOT NULL,
  read_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
ON notifications(user_id, read_at) 
WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_created 
ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type 
ON notifications(type);

-- Comment on table
COMMENT ON TABLE notifications IS 'Stores in-app notifications for users about hours, enquiries, applications';
COMMENT ON COLUMN notifications.type IS 'Notification type: hours_logged, hours_confirmed, hours_challenged, hours_rejected, enquiry_received, etc.';
COMMENT ON COLUMN notifications.reference_id IS 'Foreign key to related record (volunteer_hours.id, application.id, etc.)';

-- ================================================
-- Part 3: Update RLS policies for soft delete
-- ================================================

-- Drop existing policies on volunteer_hours (we'll recreate them with soft delete filter)
DROP POLICY IF EXISTS "Volunteers can view their own hours" ON volunteer_hours;
DROP POLICY IF EXISTS "Organizations can view hours for their opportunities" ON volunteer_hours;
DROP POLICY IF EXISTS "Volunteers can insert their own hours" ON volunteer_hours;
DROP POLICY IF EXISTS "Volunteers can update their own hours" ON volunteer_hours;
DROP POLICY IF EXISTS "Organizations can update hours for their opportunities" ON volunteer_hours;
DROP POLICY IF EXISTS "Volunteers can delete their own hours" ON volunteer_hours;
DROP POLICY IF EXISTS "Organizations can delete hours for their opportunities" ON volunteer_hours;

-- Recreate SELECT policies with deleted_at filter
CREATE POLICY "Volunteers can view their own non-deleted hours"
ON volunteer_hours FOR SELECT
TO authenticated
USING (
  application_id IN (
    SELECT id FROM applications WHERE volunteer_id = auth.uid()
  )
  AND deleted_at IS NULL
);

CREATE POLICY "Organizations can view non-deleted hours for their opportunities"
ON volunteer_hours FOR SELECT
TO authenticated
USING (
  application_id IN (
    SELECT id FROM applications WHERE org_id = auth.uid()
  )
  AND deleted_at IS NULL
);

-- Admins can view ALL hours including deleted
CREATE POLICY "Admins can view all hours including deleted"
ON volunteer_hours FOR SELECT
TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM admins)
);

-- INSERT policy (volunteers only)
CREATE POLICY "Volunteers can insert their own hours"
ON volunteer_hours FOR INSERT
TO authenticated
WITH CHECK (
  application_id IN (
    SELECT id FROM applications WHERE volunteer_id = auth.uid()
  )
);

-- UPDATE policies
CREATE POLICY "Volunteers can update their own non-deleted hours"
ON volunteer_hours FOR UPDATE
TO authenticated
USING (
  application_id IN (
    SELECT id FROM applications WHERE volunteer_id = auth.uid()
  )
  AND deleted_at IS NULL
  AND finalized = FALSE
)
WITH CHECK (
  application_id IN (
    SELECT id FROM applications WHERE volunteer_id = auth.uid()
  )
);

CREATE POLICY "Organizations can update non-deleted hours for their opportunities"
ON volunteer_hours FOR UPDATE
TO authenticated
USING (
  application_id IN (
    SELECT id FROM applications WHERE org_id = auth.uid()
  )
  AND deleted_at IS NULL
  AND finalized = FALSE
)
WITH CHECK (
  application_id IN (
    SELECT id FROM applications WHERE org_id = auth.uid()
  )
);

-- Admins can update any hours (including forcing finalized status)
CREATE POLICY "Admins can update any hours"
ON volunteer_hours FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM admins)
)
WITH CHECK (
  auth.uid() IN (SELECT user_id FROM admins)
);

-- DELETE policies (actually UPDATE to set deleted_at)
-- Note: We'll handle soft delete in application code, but keep hard delete for admins
CREATE POLICY "Admins can hard delete hours"
ON volunteer_hours FOR DELETE
TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM admins)
);

-- ================================================
-- Part 4: RLS policies for notifications table
-- ================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- System/backend can insert notifications (for now, allow authenticated users)
-- In production, you'd use a service role key for backend operations
CREATE POLICY "Authenticated users can insert notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications"
ON notifications FOR ALL
TO authenticated
USING (auth.uid() IN (SELECT user_id FROM admins))
WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ================================================
-- Part 5: Create helper functions
-- ================================================

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type VARCHAR(50),
  p_message TEXT,
  p_reference_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, message, reference_id)
  VALUES (p_user_id, p_type, p_message, p_reference_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND read_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM notifications
  WHERE user_id = p_user_id
    AND read_at IS NULL;
  
  RETURN v_count;
END;
$$;

-- ================================================
-- Part 6: Update existing queries to filter deleted
-- ================================================

-- Note: Application code should add "WHERE deleted_at IS NULL" to all queries
-- RLS policies above already enforce this for non-admin users

-- ================================================
-- Verification queries (run these to confirm)
-- ================================================

-- Check new columns exist
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'volunteer_hours' 
-- AND column_name IN ('deleted_at', 'rejected_by_org', 'rejection_reason', 'last_edited_by', 'last_edited_at');

-- Check notifications table exists
-- SELECT * FROM information_schema.tables WHERE table_name = 'notifications';

-- Check RLS policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('volunteer_hours', 'notifications');

-- ================================================
-- Rollback script (if needed)
-- ================================================

/*
-- To rollback this migration:

-- Drop notifications table
DROP TABLE IF EXISTS notifications CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS create_notification(UUID, VARCHAR, TEXT, UUID);
DROP FUNCTION IF EXISTS mark_notification_read(UUID);
DROP FUNCTION IF EXISTS get_unread_notification_count(UUID);

-- Remove new columns from volunteer_hours
ALTER TABLE volunteer_hours
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS rejected_by_org,
DROP COLUMN IF EXISTS rejection_reason,
DROP COLUMN IF EXISTS last_edited_by,
DROP COLUMN IF EXISTS last_edited_at;

-- Restore original RLS policies (you'd need to recreate them from backup)
*/
