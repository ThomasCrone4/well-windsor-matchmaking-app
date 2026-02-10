# Logged Hours Database Migration Instructions

## Overview
This migration adds soft delete, rejection workflow, audit trails, and notification system to the logged hours feature.

## Prerequisites
- Access to your Supabase dashboard
- SQL Editor access in Supabase
- Backup of your database (recommended)

## Migration Steps

### Step 1: Run the SQL Migration
1. Log into your Supabase dashboard
2. Navigate to **SQL Editor**
3. Open the file: `database_migrations/logged_hours_enhancements.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute

### Step 2: Verify Migration Success
After running the migration, verify the changes:

```sql
-- Check new columns exist on volunteer_hours table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'volunteer_hours' 
AND column_name IN ('deleted_at', 'rejected_by_org', 'rejection_reason', 'last_edited_by', 'last_edited_at');

-- Expected result: 5 rows showing the new columns

-- Check notifications table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'notifications';

-- Expected result: 1 row

-- Check RLS policies are updated
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('volunteer_hours', 'notifications');

-- Expected result: Multiple rows showing policies for both tables
```

### Step 3: Test the Functions
```sql
-- Test notification creation function
SELECT create_notification(
  auth.uid(), -- your user ID
  'hours_logged',
  'Test notification message',
  NULL
);

-- Test getting unread count
SELECT get_unread_notification_count(auth.uid());

-- Clean up test notification
DELETE FROM notifications WHERE message = 'Test notification message';
```

## What This Migration Does

### 1. Enhances `volunteer_hours` Table
- **deleted_at**: Timestamp for soft delete (NULL = active)
- **rejected_by_org**: Boolean flag when org rejects hours
- **rejection_reason**: Required text when rejected
- **last_edited_by**: Tracks who made last edit (volunteer/organization/admin)
- **last_edited_at**: Timestamp of last edit

### 2. Creates `notifications` Table
Stores in-app notifications for:
- Hours logged (alerts org)
- Hours confirmed (alerts other party)
- Hours challenged/edited (alerts other party)
- Hours rejected (alerts volunteer)
- Enquiries and applications

### 3. Updates RLS Policies
- Non-admins see only non-deleted hours (`deleted_at IS NULL`)
- Admins can view all hours including deleted
- Proper permission checks for UPDATE operations
- Organizations can't update finalized hours

### 4. Helper Functions
- `create_notification()`: Create new notifications
- `mark_notification_read()`: Mark specific notification as read
- `get_unread_notification_count()`: Get count of unread notifications

## Rollback Instructions

If you need to undo this migration, run:

```sql
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

-- Note: You'll need to restore the original RLS policies from your backup
```

## Post-Migration Frontend Updates

After running this migration, the following frontend components will:

1. **Filter deleted hours**: All queries now include `WHERE deleted_at IS NULL`
2. **Show rejection status**: ListLogHours displays rejected hours with reasons
3. **Soft delete**: Delete buttons set `deleted_at` instead of hard deleting
4. **Notifications**: Bell icon in navbar shows unread count
5. **Rate limiting**: Max 5 hour submissions per hour (client-side)
6. **Validation**: 24-hour/day max, 100-word notes limit

## Common Issues & Solutions

### Issue: Migration fails with "column already exists"
**Solution**: The migration uses `IF NOT EXISTS` clauses, but if you're re-running it, comment out the `ALTER TABLE ADD COLUMN` statements that already succeeded.

### Issue: RLS policies conflict
**Solution**: The migration drops existing policies before recreating them. If you have custom policies, back them up first.

### Issue: Notifications not showing
**Solution**: Check that:
1. Real-time is enabled in Supabase (Database → Replication)
2. The `notifications` channel is subscribed (check browser console)
3. Your RLS policies allow reading notifications

### Issue: Soft delete not working
**Solution**: Ensure all frontend queries include `.is('deleted_at', null)` or `.filter('deleted_at', 'is', null)`

## Testing Checklist

After migration, test these workflows:

- [ ] Volunteer can log hours
- [ ] Organization can view logged hours
- [ ] Organization can reject hours (with reason)
- [ ] Rejected hours show in volunteer's list
- [ ] Soft delete sets `deleted_at` timestamp
- [ ] Deleted hours don't appear in normal queries
- [ ] Admins can see all hours including deleted
- [ ] Notifications appear in bell icon dropdown
- [ ] Clicking notification navigates to correct page
- [ ] Mark as read works
- [ ] Real-time updates work (new notification appears without refresh)

## Support

If you encounter issues:
1. Check the browser console for errors
2. Check Supabase logs in Dashboard → Logs
3. Verify RLS policies in Dashboard → Authentication → Policies
4. Check that PostgREST is properly configured

## Migration Date
Created: February 9, 2026
