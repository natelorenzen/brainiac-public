-- Migration 008: Consolidated features
-- Adds:
--   1. Vertical/category tagging on analyses (D2C subcategory)
--   2. Loss reason classification on losers
--   3. Synthesis queue table for sequential per-ad processing
--   4. Per-ad-format scoping on pattern libraries

-- 1. Vertical/category tagging
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS vertical_category TEXT;
CREATE INDEX IF NOT EXISTS idx_analyses_vertical_category ON analyses(vertical_category);

-- 2. Loss reason (set only when spend_usd < 1000)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS loss_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_analyses_loss_reason ON analyses(loss_reason);

-- 3. Synthesis queue for sequential per-ad processing
CREATE TABLE IF NOT EXISTS synthesis_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_synthesis_queue_status_created ON synthesis_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_synthesis_queue_analysis_id ON synthesis_queue(analysis_id);

ALTER TABLE synthesis_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS synthesis_queue_service_only ON synthesis_queue;
CREATE POLICY synthesis_queue_service_only ON synthesis_queue FOR ALL TO service_role USING (true);

-- 4. Per-ad-format scoping on pattern libraries
ALTER TABLE pattern_library ADD COLUMN IF NOT EXISTS scope_ad_format TEXT;
ALTER TABLE pattern_library ADD COLUMN IF NOT EXISTS scope_vertical TEXT;
ALTER TABLE anti_pattern_library ADD COLUMN IF NOT EXISTS scope_ad_format TEXT;
ALTER TABLE anti_pattern_library ADD COLUMN IF NOT EXISTS scope_vertical TEXT;
ALTER TABLE anti_pattern_library ADD COLUMN IF NOT EXISTS loss_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pattern_library_scope_format ON pattern_library(scope_ad_format);
CREATE INDEX IF NOT EXISTS idx_pattern_library_scope_vertical ON pattern_library(scope_vertical);
CREATE INDEX IF NOT EXISTS idx_anti_pattern_library_scope_format ON anti_pattern_library(scope_ad_format);
CREATE INDEX IF NOT EXISTS idx_anti_pattern_library_scope_vertical ON anti_pattern_library(scope_vertical);
CREATE INDEX IF NOT EXISTS idx_anti_pattern_library_loss_reason ON anti_pattern_library(loss_reason);
