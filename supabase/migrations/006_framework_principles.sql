-- Migration 006: Framework category for adaptive learned guard rails
-- Extends pattern_library and anti_pattern_library to store conditional
-- framework principles derived from accumulated winners and losers.

-- Allow 'framework' as a category in both libraries
ALTER TABLE pattern_library DROP CONSTRAINT IF EXISTS pattern_library_category_check;
ALTER TABLE pattern_library ADD CONSTRAINT pattern_library_category_check
  CHECK (category IN ('visual', 'copy', 'behavioral', 'neuroscience', 'framework'));

ALTER TABLE anti_pattern_library DROP CONSTRAINT IF EXISTS anti_pattern_library_category_check;
ALTER TABLE anti_pattern_library ADD CONSTRAINT anti_pattern_library_category_check
  CHECK (category IN ('visual', 'copy', 'behavioral', 'neuroscience', 'framework'));

-- Conditionality and provenance fields for framework rows.
-- scope_awareness/scope_sophistication scope a learned rule to a specific segment.
-- supporting_winner_ids/supporting_loser_ids cite the analyses that produced the rule.
ALTER TABLE pattern_library
  ADD COLUMN IF NOT EXISTS scope_awareness TEXT
    CHECK (scope_awareness IS NULL OR scope_awareness IN
      ('unaware','problem_aware','solution_aware','product_aware','most_aware')),
  ADD COLUMN IF NOT EXISTS scope_sophistication INTEGER
    CHECK (scope_sophistication IS NULL OR scope_sophistication BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS supporting_winner_ids UUID[],
  ADD COLUMN IF NOT EXISTS supporting_loser_ids UUID[];

-- Indexes to make Block 0 filtering fast at prompt-build time
CREATE INDEX IF NOT EXISTS pattern_library_framework_scope_idx
  ON pattern_library(category, scope_awareness, scope_sophistication)
  WHERE category = 'framework';

CREATE INDEX IF NOT EXISTS pattern_library_framework_confidence_idx
  ON pattern_library(confidence DESC)
  WHERE category = 'framework';
