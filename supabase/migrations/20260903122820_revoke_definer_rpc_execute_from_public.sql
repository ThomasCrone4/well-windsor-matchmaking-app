-- The previous REVOKE ... FROM anon, authenticated was insufficient:
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and anon
-- inherits it. Verified by probe: create_notification still executed as
-- anon and failed only on a foreign-key check, not on permissions.

REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, character varying, text, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid, character varying, uuid, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count(uuid)  FROM PUBLIC, anon;

-- Restore the two the app legitimately needs for signed-in users.
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(uuid)   TO authenticated;

-- Public home-page stats stay open to anon; aggregate counts only.
GRANT EXECUTE ON FUNCTION public.count_volunteers()   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_counts()  TO anon, authenticated;
