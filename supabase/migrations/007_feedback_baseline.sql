-- Creates the feedback_baseline_evolution table for storing cumulative
-- evolved principles that supplement the STATIC_FRAMEWORK_BASELINE in
-- feedback mode. Each row stores the FULL cumulative principle set (not a
-- delta) so a single latest-row query returns everything needed.
CREATE TABLE IF NOT EXISTS feedback_baseline_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  ads_analyzed INTEGER NOT NULL,
  principles JSONB NOT NULL DEFAULT '[]',
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_baseline_evolution_version_idx
  ON feedback_baseline_evolution(version DESC);
