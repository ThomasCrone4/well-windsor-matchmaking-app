-- Migration: ML Matching & Analytics Setup
-- Date: 2026-02-09
-- Description: Add vector embeddings for ML matching and audit tables for analytics

-- ================================================
-- Part 1: Enable pgvector extension
-- ================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ================================================
-- Part 2: Add embedding columns to user_profiles
-- ================================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS embedding_text TEXT,
ADD COLUMN IF NOT EXISTS embedding_vector vector(1536),
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP;

-- Add comments to explain columns
COMMENT ON COLUMN user_profiles.embedding_text IS 'Concatenated searchable text (name, bio, skills)';
COMMENT ON COLUMN user_profiles.embedding_vector IS 'OpenAI text-embedding-3-small vector';
COMMENT ON COLUMN user_profiles.embedding_updated_at IS 'When embedding was last generated';

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_user_embedding ON user_profiles USING ivfflat (embedding_vector vector_cosine_ops);

-- ================================================
-- Part 3: Add embedding columns to volunteer_opportunities
-- ================================================

ALTER TABLE volunteer_opportunities
ADD COLUMN IF NOT EXISTS embedding_text TEXT,
ADD COLUMN IF NOT EXISTS embedding_vector vector(1536),
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP;

-- Add comments to explain columns
COMMENT ON COLUMN volunteer_opportunities.embedding_text IS 'Concatenated title + description';
COMMENT ON COLUMN volunteer_opportunities.embedding_vector IS 'OpenAI embedding of opportunity';
COMMENT ON COLUMN volunteer_opportunities.embedding_updated_at IS 'When embedding was last generated';

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_opportunity_embedding ON volunteer_opportunities USING ivfflat (embedding_vector vector_cosine_ops);

-- ================================================
-- Part 4: Create match_results tracking table
-- ================================================

CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  volunteer_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES volunteer_opportunities(id) ON DELETE CASCADE,
  
  -- Match scores (0.00 to 1.00)
  match_score DECIMAL(3,2) NOT NULL,
  skills_similarity DECIMAL(3,2),
  bio_similarity DECIMAL(3,2),
  availability_match DECIMAL(3,2),
  
  -- Engagement tracking
  viewed_at TIMESTAMP DEFAULT NOW(),
  application_made BOOLEAN DEFAULT FALSE,
  application_made_at TIMESTAMP,
  was_successful BOOLEAN,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_volunteer ON match_results(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_match_opportunity ON match_results(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_match_score ON match_results(match_score DESC);

-- ================================================
-- Part 5: Create audit_logs table for admin tracking
-- ================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL, -- 'ban_user', 'suspend_user', 'delete_data', 'feature_toggle', etc.
  target_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_table VARCHAR(50),
  target_record_id UUID,
  
  old_values JSONB, -- What changed from
  new_values JSONB, -- What changed to
  metadata JSONB, -- Additional context
  
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_user ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ================================================
-- Part 6: Create user_status table for ban/suspend
-- ================================================

CREATE TABLE IF NOT EXISTS user_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  is_banned BOOLEAN DEFAULT FALSE,
  is_suspended BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  ban_date TIMESTAMP,
  unban_date TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_status_banned ON user_status(is_banned) WHERE is_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_status_suspended ON user_status(is_suspended) WHERE is_suspended = TRUE;

-- ================================================
-- Part 7: Create site_settings table
-- ================================================

CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Feature flags
  feature_ml_matching BOOLEAN DEFAULT TRUE,
  feature_analytics BOOLEAN DEFAULT TRUE,
  feature_notifications BOOLEAN DEFAULT TRUE,
  
  -- System state
  maintenance_mode BOOLEAN DEFAULT FALSE,
  maintenance_message TEXT,
  
  -- Platform announcement
  announcement_active BOOLEAN DEFAULT FALSE,
  announcement_title VARCHAR(255),
  announcement_message TEXT,
  announcement_type VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'error'
  
  -- Settings metadata
  updated_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_features ON site_settings(feature_ml_matching, feature_analytics);

-- ================================================
-- Part 8: Update RLS policies for audit_logs
-- ================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;
CREATE POLICY "Admins can view all audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (auth.uid() IN (SELECT user_id FROM admins));

DROP POLICY IF EXISTS "Admins can insert audit logs" ON audit_logs;
CREATE POLICY "Admins can insert audit logs"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ================================================
-- Part 9: Update RLS policies for user_status
-- ================================================

ALTER TABLE user_status ENABLE ROW LEVEL SECURITY;

-- Users can view their own status
DROP POLICY IF EXISTS "Users can view their own status" ON user_status;
CREATE POLICY "Users can view their own status"
ON user_status FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can view all statuses
DROP POLICY IF EXISTS "Admins can view all user statuses" ON user_status;
CREATE POLICY "Admins can view all user statuses"
ON user_status FOR SELECT
TO authenticated
USING (auth.uid() IN (SELECT user_id FROM admins));

-- Admins can update statuses
DROP POLICY IF EXISTS "Admins can update user status" ON user_status;
CREATE POLICY "Admins can update user status"
ON user_status FOR UPDATE
TO authenticated
USING (auth.uid() IN (SELECT user_id FROM admins))
WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ================================================
-- Part 10: Update RLS policies for site_settings
-- ================================================

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can view settings (they're public)
DROP POLICY IF EXISTS "Anyone can view site settings" ON site_settings;
CREATE POLICY "Anyone can view site settings"
ON site_settings FOR SELECT
TO authenticated
USING (true);

-- Only admins can update settings
DROP POLICY IF EXISTS "Only admins can update site settings" ON site_settings;
CREATE POLICY "Only admins can update site settings"
ON site_settings FOR UPDATE
TO authenticated
USING (auth.uid() IN (SELECT user_id FROM admins))
WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ================================================
-- Part 11: Create helper functions
-- ================================================

-- Function to calculate volunteer-opportunity match
CREATE OR REPLACE FUNCTION calculate_match_score(
  volunteer_embedding vector,
  opportunity_embedding vector,
  has_availability BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  match_score DECIMAL,
  semantic_similarity DECIMAL
) AS $$
BEGIN
  -- Calculate cosine similarity (0 to 1 scale, converted to percentage)
  RETURN QUERY SELECT
    CAST((1 - (volunteer_embedding <=> opportunity_embedding)) * 100 AS DECIMAL(5,2)),
    CAST((1 - (volunteer_embedding <=> opportunity_embedding)) * 100 AS DECIMAL(5,2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to log admin action
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_id UUID,
  p_action_type VARCHAR(50),
  p_target_user_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    admin_id, action_type, target_user_id, 
    old_values, new_values, reason
  )
  VALUES (
    p_admin_id, p_action_type, p_target_user_id,
    p_old_values, p_new_values, p_reason
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current site settings
CREATE OR REPLACE FUNCTION get_site_settings()
RETURNS TABLE(
  feature_ml_matching BOOLEAN,
  feature_analytics BOOLEAN,
  feature_notifications BOOLEAN,
  maintenance_mode BOOLEAN,
  maintenance_message TEXT,
  announcement_active BOOLEAN,
  announcement_title VARCHAR(255),
  announcement_message TEXT,
  announcement_type VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.feature_ml_matching,
    s.feature_analytics,
    s.feature_notifications,
    s.maintenance_mode,
    s.maintenance_message,
    s.announcement_active,
    s.announcement_title,
    s.announcement_message,
    s.announcement_type
  FROM site_settings s
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- Part 12: Create missing RPC functions for admin dashboard
-- ================================================

-- Get total hours tracked (approved by both volunteer and org)
CREATE OR REPLACE FUNCTION hours_total_sum()
RETURNS TABLE(total_hours NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(SUM(COALESCE(vh.total_hours, 0)), 0)::NUMERIC 
  FROM volunteer_hours vh
  WHERE vh.vol_confirmed = true AND vh.org_confirmed = true AND vh.finalized = true;
END;
$$ LANGUAGE plpgsql;

-- Get hours by volunteer (approved entries only)
CREATE OR REPLACE FUNCTION hours_by_volunteer()
RETURNS TABLE(volunteer_id UUID, volunteer_name TEXT, total_hours NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT app.volunteer_id, up.name, COALESCE(SUM(COALESCE(vh.total_hours, 0)), 0)::NUMERIC
  FROM volunteer_hours vh
  LEFT JOIN applications app ON vh.application_id = app.id
  LEFT JOIN user_profiles up ON app.volunteer_id = up.id
  WHERE vh.vol_confirmed = true AND vh.org_confirmed = true AND vh.finalized = true
  GROUP BY app.volunteer_id, up.name
  ORDER BY SUM(COALESCE(vh.total_hours, 0)) DESC;
END;
$$ LANGUAGE plpgsql;

-- Get hours by opportunity/organization (approved entries only)
CREATE OR REPLACE FUNCTION hours_by_org()
RETURNS TABLE(org_id UUID, org_name TEXT, total_hours NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT vo.org_id, up.name, COALESCE(SUM(COALESCE(vh.total_hours, 0)), 0)::NUMERIC
  FROM volunteer_hours vh
  LEFT JOIN applications app ON vh.application_id = app.id
  LEFT JOIN volunteer_opportunities vo ON app.opportunity_id = vo.id
  LEFT JOIN user_profiles up ON vo.org_id = up.id
  WHERE vh.vol_confirmed = true AND vh.org_confirmed = true AND vh.finalized = true
  GROUP BY vo.org_id, up.name
  ORDER BY SUM(COALESCE(vh.total_hours, 0)) DESC;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- Part 14: Verification Queries
-- ================================================

/*
-- Check vector columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('user_profiles', 'volunteer_opportunities')
AND column_name LIKE '%embedding%';

-- Check new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('match_results', 'audit_logs', 'user_status', 'site_settings');

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('user_profiles', 'volunteer_opportunities', 'match_results', 'audit_logs');
*/

-- ================================================
-- Part 15: Rollback Script
-- ================================================

/*
-- To rollback:

DROP TABLE IF EXISTS site_settings CASCADE;
DROP TABLE IF EXISTS user_status CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS match_results CASCADE;

ALTER TABLE volunteer_opportunities
DROP COLUMN IF EXISTS embedding_text,
DROP COLUMN IF EXISTS embedding_vector,
DROP COLUMN IF EXISTS embedding_updated_at;

ALTER TABLE user_profiles
DROP COLUMN IF EXISTS embedding_text,
DROP COLUMN IF EXISTS embedding_vector,
DROP COLUMN IF EXISTS embedding_updated_at;

DROP EXTENSION IF EXISTS vector;
*/
