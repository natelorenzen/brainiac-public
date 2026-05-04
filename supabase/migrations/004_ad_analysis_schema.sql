-- Add spend tracking and comprehensive analysis to analyses table
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS spend_usd NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS comprehensive_analysis JSONB;

-- is_winner computed column (requires spend_usd to exist first)
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS is_winner BOOLEAN GENERATED ALWAYS AS (spend_usd >= 1000) STORED;

-- Shared global pattern library — evolves as winning ads accumulate
CREATE TABLE IF NOT EXISTS pattern_library (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL CHECK (category IN ('visual', 'copy', 'behavioral', 'neuroscience')),
  rule_text    TEXT NOT NULL,
  confidence   NUMERIC(4, 3) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  winner_count INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS on pattern_library — it's a shared global table, read by all authenticated users
ALTER TABLE pattern_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pattern_library_read" ON pattern_library
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pattern_library_service_write" ON pattern_library
  FOR ALL TO service_role USING (true);
