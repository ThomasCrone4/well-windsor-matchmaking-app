-- Run these queries in Supabase SQL Editor one at a time
-- Copy each result and paste into the corresponding markdown file

-- ============================================================================
-- QUERY 1: All Tables and Their Columns
-- ============================================================================
SELECT 
  t.table_schema,
  t.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.column_default,
  c.is_nullable,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale
FROM information_schema.tables t
LEFT JOIN information_schema.columns c 
  ON t.table_schema = c.table_schema 
  AND t.table_name = c.table_name
WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage')
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- ============================================================================
-- QUERY 2: Table Constraints (Primary Keys, Foreign Keys, Unique)
-- ============================================================================
SELECT 
  constraint_schema,
  constraint_name,
  table_name,
  constraint_type,
  column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
  AND tc.table_schema = kcu.table_schema
WHERE constraint_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage')
ORDER BY table_name, constraint_type, constraint_name;

-- ============================================================================
-- QUERY 3: Row Level Security (RLS) Policies
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage')
ORDER BY tablename, policyname;

-- ============================================================================
-- QUERY 4: Indexes
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage')
ORDER BY tablename, indexname;

-- ============================================================================
-- QUERY 5: Functions and Triggers
-- ============================================================================
SELECT 
  routine_schema,
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage')
ORDER BY routine_schema, routine_name;

-- ============================================================================
-- QUERY 6: Extensions Installed
-- ============================================================================
SELECT 
  extname,
  extversion,
  extnamespace::regnamespace
FROM pg_extension
WHERE extname NOT IN ('plpgsql')
ORDER BY extname;
