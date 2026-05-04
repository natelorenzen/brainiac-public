import { supabaseServer } from '@/lib/supabase-server'

export const WINNER_THRESHOLD_USD = 1000
export const LOSER_THRESHOLD_USD = 1000

export interface BaselinePrinciple {
  principle_text: string
  category: 'copy' | 'visual' | 'behavioral' | 'structural' | 'audience'
  type: 'new' | 'reinforced' | 'contradiction' | 'unchanged'
  scope_awareness: string | null
  scope_sophistication: number | null
  evidence_summary: string
  supporting_winner_count: number
  supporting_loser_count: number
}

export interface BaselineEvolutionEntry {
  id: string
  version: number
  ads_analyzed: number
  principles: BaselinePrinciple[]
  change_summary: string
  created_at: string
}

export interface PatternLibraryRow {
  id: string
  category: 'visual' | 'copy' | 'behavioral' | 'neuroscience' | 'framework'
  rule_text: string
  confidence: number
  winner_count: number
  created_at: string
  updated_at: string
}

export interface LosingPatternRow {
  id: string
  category: 'visual' | 'copy' | 'behavioral' | 'neuroscience' | 'framework'
  rule_text: string
  confidence: number
  loser_count: number
  created_at: string
  updated_at: string
}

export interface FrameworkPrincipleRow {
  id: string
  category: 'framework'
  rule_text: string
  confidence: number
  winner_count: number
  scope_awareness: 'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'most_aware' | null
  scope_sophistication: 1 | 2 | 3 | 4 | 5 | null
  supporting_winner_ids: string[] | null
  supporting_loser_ids: string[] | null
  created_at: string
  updated_at: string
}

export interface WinningAnalysisSummary {
  id: string
  comprehensive_analysis: Record<string, unknown>
  spend_usd: number
  loss_reason?: string | null
  vertical_category?: string | null
  created_at: string
}

export async function getWinningPatterns(): Promise<PatternLibraryRow[]> {
  const { data, error } = await supabaseServer
    .from('pattern_library')
    .select('*')
    .neq('category', 'framework')
    .order('winner_count', { ascending: false })
    .order('confidence', { ascending: false })

  if (error) return []
  return (data ?? []) as PatternLibraryRow[]
}

export async function getFrameworkPrinciples(
  awareness?: string | null,
  sophistication?: number | null,
): Promise<FrameworkPrincipleRow[]> {
  // Fetch all framework rules; framework table is small (<200 rows expected).
  // Filter in JS so the AND-of-OR semantics ("scope is null OR matches" for
  // each axis independently) work correctly. Stacked PostgREST .or() calls
  // overwrite each other, so the SQL approach is fragile.
  const { data, error } = await supabaseServer
    .from('pattern_library')
    .select('*')
    .eq('category', 'framework')
    .order('confidence', { ascending: false })

  if (error) return []
  const all = (data ?? []) as FrameworkPrincipleRow[]
  return all.filter(p =>
    (!awareness || p.scope_awareness === null || p.scope_awareness === awareness) &&
    (sophistication === undefined || sophistication === null || p.scope_sophistication === null || p.scope_sophistication === sophistication)
  )
}

export async function getLosingPatterns(): Promise<LosingPatternRow[]> {
  const { data, error } = await supabaseServer
    .from('anti_pattern_library')
    .select('*')
    .order('loser_count', { ascending: false })
    .order('confidence', { ascending: false })

  if (error) return []
  return (data ?? []) as LosingPatternRow[]
}

export async function getAllWinningAnalyses(): Promise<WinningAnalysisSummary[]> {
  const { data, error } = await supabaseServer
    .from('analyses')
    .select('id, comprehensive_analysis, spend_usd, loss_reason, vertical_category, created_at')
    .eq('is_winner', true)
    .not('comprehensive_analysis', 'is', null)
    .order('spend_usd', { ascending: false })

  if (error) return []
  return (data ?? []) as WinningAnalysisSummary[]
}

export async function getAllLosersForSynthesis(): Promise<WinningAnalysisSummary[]> {
  const { data, error } = await supabaseServer
    .from('analyses')
    .select('id, comprehensive_analysis, spend_usd, loss_reason, vertical_category, created_at')
    .eq('is_winner', false)
    .not('spend_usd', 'is', null)
    .lt('spend_usd', LOSER_THRESHOLD_USD)
    .not('comprehensive_analysis', 'is', null)
    .order('spend_usd', { ascending: true })

  if (error) return []
  return (data ?? []) as WinningAnalysisSummary[]
}

export async function storeComprehensiveAnalysis(
  analysisId: string,
  data: Record<string, unknown>,
  spendUsd?: number,
): Promise<void> {
  const update: Record<string, unknown> = { comprehensive_analysis: data }
  if (spendUsd !== undefined) update.spend_usd = spendUsd

  await supabaseServer
    .from('analyses')
    .update(update)
    .eq('id', analysisId)
}

export async function getAllWinnersForSynthesis(): Promise<WinningAnalysisSummary[]> {
  const { data, error } = await supabaseServer
    .from('analyses')
    .select('id, comprehensive_analysis, spend_usd, loss_reason, vertical_category, created_at')
    .eq('is_winner', true)
    .not('comprehensive_analysis', 'is', null)
    .order('spend_usd', { ascending: false })

  if (error) return []
  return (data ?? []) as WinningAnalysisSummary[]
}

export async function upsertPatterns(
  patterns: {
    category: string
    rule_text: string
    confidence: number
    scope_ad_format?: string | null
    scope_vertical?: string | null
  }[],
): Promise<void> {
  for (const p of patterns) {
    const { data: existing } = await supabaseServer
      .from('pattern_library')
      .select('id, winner_count')
      .neq('category', 'framework')
      .ilike('rule_text', p.rule_text.slice(0, 60) + '%')
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabaseServer
        .from('pattern_library')
        .update({
          winner_count: (existing.winner_count ?? 1) + 1,
          updated_at: new Date().toISOString(),
          scope_ad_format: p.scope_ad_format ?? null,
          scope_vertical: p.scope_vertical ?? null,
          // confidence intentionally NOT updated — preserve original value
        })
        .eq('id', existing.id)
    } else {
      await supabaseServer.from('pattern_library').insert({
        category: p.category,
        rule_text: p.rule_text,
        confidence: p.confidence,
        winner_count: 1,
        scope_ad_format: p.scope_ad_format ?? null,
        scope_vertical: p.scope_vertical ?? null,
      })
    }
  }
}

export async function upsertFrameworkPrinciples(
  principles: {
    rule_text: string
    confidence: number
    scope_awareness: string | null
    scope_sophistication: number | null
    supporting_winner_ids: string[]
    supporting_loser_ids: string[]
  }[],
): Promise<void> {
  for (const p of principles) {
    const { data: existing } = await supabaseServer
      .from('pattern_library')
      .select('id, winner_count')
      .eq('category', 'framework')
      .ilike('rule_text', p.rule_text.slice(0, 60) + '%')
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabaseServer
        .from('pattern_library')
        .update({
          winner_count: (existing.winner_count ?? 1) + 1,
          confidence: p.confidence,
          scope_awareness: p.scope_awareness,
          scope_sophistication: p.scope_sophistication,
          supporting_winner_ids: p.supporting_winner_ids,
          supporting_loser_ids: p.supporting_loser_ids,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabaseServer.from('pattern_library').insert({
        category: 'framework',
        rule_text: p.rule_text,
        confidence: p.confidence,
        winner_count: 1,
        scope_awareness: p.scope_awareness,
        scope_sophistication: p.scope_sophistication,
        supporting_winner_ids: p.supporting_winner_ids,
        supporting_loser_ids: p.supporting_loser_ids,
      })
    }
  }
}

export async function getLatestBaselineEvolution(): Promise<BaselineEvolutionEntry | null> {
  const { data } = await supabaseServer
    .from('feedback_baseline_evolution')
    .select('*')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as BaselineEvolutionEntry | null) ?? null
}

export async function getHistoricalAdCount(): Promise<number> {
  const { count } = await supabaseServer
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'thumbnail')
    .eq('status', 'complete')
    .not('spend_usd', 'is', null)
  return count ?? 0
}

export async function storeBaselineEvolution(
  version: number,
  ads_analyzed: number,
  principles: BaselinePrinciple[],
  change_summary: string,
): Promise<void> {
  await supabaseServer.from('feedback_baseline_evolution').insert({
    version,
    ads_analyzed,
    principles,
    change_summary,
  })
}

// --- Synthesis queue (sequential per-ad processing) ---

export interface SynthesisJob {
  id: string
  analysis_id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

export async function enqueueSynthesis(analysisId: string): Promise<void> {
  await supabaseServer.from('synthesis_queue').insert({
    analysis_id: analysisId,
    status: 'pending',
  })
}

// Atomically claim the next pending job. Returns null if queue is empty.
// Uses an UPDATE with a subquery to claim a single row in one statement,
// avoiding races between concurrent claimNextSynthesisJob() calls.
export async function claimNextSynthesisJob(): Promise<SynthesisJob | null> {
  // Step 1: find the oldest pending job
  const { data: pending } = await supabaseServer
    .from('synthesis_queue')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!pending) return null

  // Step 2: try to claim it (only succeeds if still pending)
  const { data: claimed, error } = await supabaseServer
    .from('synthesis_queue')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (error || !claimed) return null
  return claimed as SynthesisJob
}

export async function markSynthesisDone(jobId: string): Promise<void> {
  await supabaseServer
    .from('synthesis_queue')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function markSynthesisFailed(jobId: string, errorMessage: string): Promise<void> {
  await supabaseServer
    .from('synthesis_queue')
    .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: errorMessage })
    .eq('id', jobId)
}

export async function hasPendingSynthesisJobs(): Promise<boolean> {
  const { count } = await supabaseServer
    .from('synthesis_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return (count ?? 0) > 0
}

export async function getAnalysisById(analysisId: string): Promise<WinningAnalysisSummary | null> {
  const { data } = await supabaseServer
    .from('analyses')
    .select('id, comprehensive_analysis, spend_usd, loss_reason, vertical_category')
    .eq('id', analysisId)
    .maybeSingle()
  return (data as WinningAnalysisSummary | null) ?? null
}

export async function setAnalysisLossReason(analysisId: string, lossReason: string): Promise<void> {
  await supabaseServer.from('analyses').update({ loss_reason: lossReason }).eq('id', analysisId)
}

export async function setAnalysisVerticalCategory(analysisId: string, vertical: string): Promise<void> {
  await supabaseServer.from('analyses').update({ vertical_category: vertical }).eq('id', analysisId)
}

export async function upsertAntiPatterns(
  patterns: {
    category: string
    rule_text: string
    confidence: number
    loss_reason?: string | null
    scope_ad_format?: string | null
    scope_vertical?: string | null
  }[],
): Promise<void> {
  for (const p of patterns) {
    const { data: existing } = await supabaseServer
      .from('anti_pattern_library')
      .select('id, loser_count')
      .ilike('rule_text', p.rule_text.slice(0, 60) + '%')
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabaseServer
        .from('anti_pattern_library')
        .update({
          loser_count: (existing.loser_count ?? 1) + 1,
          updated_at: new Date().toISOString(),
          loss_reason: p.loss_reason ?? null,
          scope_ad_format: p.scope_ad_format ?? null,
          scope_vertical: p.scope_vertical ?? null,
        })
        .eq('id', existing.id)
    } else {
      await supabaseServer.from('anti_pattern_library').insert({
        category: p.category,
        rule_text: p.rule_text,
        confidence: p.confidence,
        loser_count: 1,
        loss_reason: p.loss_reason ?? null,
        scope_ad_format: p.scope_ad_format ?? null,
        scope_vertical: p.scope_vertical ?? null,
      })
    }
  }
}

// --- Phase 4.4: dimension-level pattern stats (deterministic SQL) ---
//
// Pure aggregation over historical analyses. No Claude. Counts how many
// winners/losers carry each value of a DNA dimension and computes a
// win rate per value. Used in pattern context AND the Historical
// Analysis tab.

export interface DimensionStat {
  dimension: string         // e.g. "headline_dna.structure_type"
  value: string             // e.g. "pain_agitation"
  winner_count: number
  loser_count: number
  total: number
  win_rate: number          // 0..1
}

const DIMENSION_PATHS = [
  ['headline_dna', 'structure_type'],
  ['headline_dna', 'emotional_register'],
  ['headline_dna', 'tone_register'],
  ['headline_dna', 'specificity_level'],
  ['headline_dna', 'voice'],
  ['headline_dna', 'sentence_type'],
  ['subheadline_dna', 'role'],
  ['subheadline_dna', 'tonal_shift'],
  ['benefits_dna', 'pattern_uniformity'],
  ['benefits_dna', 'outcome_vs_feature_split'],
  ['trust_dna', 'source_attribution'],
  ['cta_dna', 'framing'],
  ['cta_dna', 'friction_level'],
  ['body_dna', 'frame'],
  ['ad_format', 'type'],
  ['market_context', 'awareness_level'],
] as const

function readDnaValue(ca: Record<string, unknown>, path: readonly string[]): string | null {
  let cur: unknown = ca
  // copy.{el}.dna.{field}  OR  el.dna.{field}  OR  {el}.{field}  pattern
  if (path[0].endsWith('_dna')) {
    const elKey = path[0].replace('_dna', '')
    cur = (((ca.copy as Record<string, unknown>)?.[elKey] as Record<string, unknown>)?.dna)
      ?? ((ca[elKey] as Record<string, unknown>)?.dna)
      ?? null
  } else {
    cur = ca[path[0]]
  }
  if (!cur) return null
  for (let i = 1; i < path.length; i++) {
    cur = (cur as Record<string, unknown>)?.[path[i]]
    if (cur == null) return null
  }
  return typeof cur === 'string' ? cur : null
}

export async function getDimensionStats(): Promise<DimensionStat[]> {
  const { data } = await supabaseServer
    .from('analyses')
    .select('comprehensive_analysis, is_winner, spend_usd')
    .not('comprehensive_analysis', 'is', null)
    .not('spend_usd', 'is', null)

  const rows = (data ?? []) as { comprehensive_analysis: Record<string, unknown>; is_winner: boolean | null; spend_usd: number | null }[]

  const accum = new Map<string, { winner: number; loser: number }>()
  for (const r of rows) {
    const isWinner = r.is_winner === true
    for (const path of DIMENSION_PATHS) {
      const value = readDnaValue(r.comprehensive_analysis, path)
      if (!value || value === 'absent') continue
      const key = `${path.join('.')}=${value}`
      const cur = accum.get(key) ?? { winner: 0, loser: 0 }
      if (isWinner) cur.winner += 1
      else cur.loser += 1
      accum.set(key, cur)
    }
  }

  const out: DimensionStat[] = []
  for (const [key, counts] of accum.entries()) {
    const [dimension, value] = key.split('=')
    const total = counts.winner + counts.loser
    if (total < 2) continue
    out.push({
      dimension,
      value,
      winner_count: counts.winner,
      loser_count: counts.loser,
      total,
      win_rate: counts.winner / total,
    })
  }

  out.sort((a, b) => b.total - a.total)
  return out
}

// --- Phase 4.5: BERG x DNA correlation (Pearson r) ---
//
// For each (ROI, scored field) pair, compute Pearson r across all
// historical ads. This is the connection between brain activation and
// creative structure that no other tool surfaces. Pure compute.

export interface BergDnaCorrelation {
  roi_region: string
  metric_path: string       // e.g. "hook_analysis.scroll_stop_score"
  r: number
  n: number
}

const NUMERIC_METRICS: { label: string; read: (ca: Record<string, unknown>) => number | null }[] = [
  { label: 'hook_analysis.scroll_stop_score', read: ca => num(((ca.hook_analysis as Record<string, unknown>)?.scroll_stop_score)) },
  { label: 'cognitive_load.score',           read: ca => num(((ca.cognitive_load as Record<string, unknown>)?.score)) },
  { label: 'congruence.overall_score',       read: ca => num(((ca.congruence as Record<string, unknown>)?.overall_score)) },
  { label: 'visual_dimensions.cta_strength', read: ca => num((((ca.visual_dimensions as Record<string, unknown>)?.cta_strength as Record<string, unknown>)?.score)) },
  { label: 'visual_dimensions.emotional_appeal', read: ca => num((((ca.visual_dimensions as Record<string, unknown>)?.emotional_appeal as Record<string, unknown>)?.score)) },
  { label: 'visual_dimensions.brand_clarity', read: ca => num((((ca.visual_dimensions as Record<string, unknown>)?.brand_clarity as Record<string, unknown>)?.score)) },
  { label: 'visual_dimensions.visual_hierarchy', read: ca => num((((ca.visual_dimensions as Record<string, unknown>)?.visual_hierarchy as Record<string, unknown>)?.score)) },
  { label: 'copy.headline.clarity',          read: ca => num((((ca.copy as Record<string, unknown>)?.headline as Record<string, unknown>)?.clarity)) },
  { label: 'copy.cta.clarity',               read: ca => num((((ca.copy as Record<string, unknown>)?.cta as Record<string, unknown>)?.clarity)) },
]

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  if (denom === 0) return null
  return num / denom
}

export async function getBergDnaCorrelations(): Promise<BergDnaCorrelation[]> {
  const { data } = await supabaseServer
    .from('analyses')
    .select('comprehensive_analysis, roi_data')
    .not('comprehensive_analysis', 'is', null)
    .not('roi_data', 'is', null)

  const rows = (data ?? []) as { comprehensive_analysis: Record<string, unknown>; roi_data: Array<{ region_key: string; activation: number }> | null }[]

  // Collect ROI regions across all rows
  const roiKeys = new Set<string>()
  for (const r of rows) {
    for (const region of r.roi_data ?? []) roiKeys.add(region.region_key)
  }

  const out: BergDnaCorrelation[] = []
  for (const roi of roiKeys) {
    for (const metric of NUMERIC_METRICS) {
      const xs: number[] = []
      const ys: number[] = []
      for (const r of rows) {
        const region = r.roi_data?.find(x => x.region_key === roi)
        const x = region ? num(region.activation) : null
        const y = metric.read(r.comprehensive_analysis)
        if (x != null && y != null) {
          xs.push(x); ys.push(y)
        }
      }
      const r = pearson(xs, ys)
      if (r != null && Math.abs(r) >= 0.3 && xs.length >= 5) {
        out.push({ roi_region: roi, metric_path: metric.label, r, n: xs.length })
      }
    }
  }

  out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  return out
}

// --- Phase 4.7: deterministic pattern confidence ---
//
// Recompute confidence for every pattern row based on its actual
// supporting count divided by (winner_count + loser_count for the
// matching anti-pattern, if any). Closer to evidence-derived
// confidence than the Claude-assigned heuristic value.

export async function recomputePatternConfidence(): Promise<void> {
  const { data: winners } = await supabaseServer
    .from('pattern_library')
    .select('id, rule_text, winner_count')
    .neq('category', 'framework')

  for (const w of (winners ?? []) as { id: string; rule_text: string; winner_count: number | null }[]) {
    // Find anti-pattern with similar rule text (same opening 60 chars)
    const { data: anti } = await supabaseServer
      .from('anti_pattern_library')
      .select('loser_count')
      .ilike('rule_text', w.rule_text.slice(0, 60) + '%')
      .limit(1)
      .maybeSingle()

    const wc = w.winner_count ?? 0
    const lc = anti?.loser_count ?? 0
    const total = wc + lc
    const conf = total > 0 ? wc / total : 1.0
    await supabaseServer
      .from('pattern_library')
      .update({ confidence: conf, updated_at: new Date().toISOString() })
      .eq('id', w.id)
  }
}

// --- Per-awareness-level breakdown (Historical Analysis tab) ---

export interface AwarenessBreakdown {
  awareness_level: string
  total: number
  winners: number
  losers: number
  win_rate: number
}

export async function getAwarenessBreakdown(): Promise<AwarenessBreakdown[]> {
  const { data } = await supabaseServer
    .from('analyses')
    .select('comprehensive_analysis, is_winner')
    .not('comprehensive_analysis', 'is', null)
    .not('spend_usd', 'is', null)

  const rows = (data ?? []) as { comprehensive_analysis: Record<string, unknown>; is_winner: boolean | null }[]
  const accum = new Map<string, { winners: number; losers: number }>()
  for (const r of rows) {
    const aw = ((r.comprehensive_analysis.market_context as Record<string, unknown>)?.awareness_level as string) ?? 'unknown'
    const cur = accum.get(aw) ?? { winners: 0, losers: 0 }
    if (r.is_winner === true) cur.winners += 1
    else cur.losers += 1
    accum.set(aw, cur)
  }
  const out: AwarenessBreakdown[] = []
  for (const [level, counts] of accum.entries()) {
    const total = counts.winners + counts.losers
    out.push({
      awareness_level: level,
      total,
      winners: counts.winners,
      losers: counts.losers,
      win_rate: total > 0 ? counts.winners / total : 0,
    })
  }
  return out
}

// --- All baseline evolution versions (for Historical Analysis tab) ---

export async function getAllBaselineEvolutions(): Promise<BaselineEvolutionEntry[]> {
  const { data } = await supabaseServer
    .from('feedback_baseline_evolution')
    .select('*')
    .order('version', { ascending: false })
  return (data ?? []) as BaselineEvolutionEntry[]
}

// --- Longitudinal trends (Historical Analysis tab) ---

export interface TrendPoint {
  created_at: string
  framework_grade: string | null
  scroll_stop_score: number | null
  congruence_score: number | null
  cognitive_load: number | null
  is_winner: boolean | null
  spend_usd: number | null
}

export async function getTrendPoints(): Promise<TrendPoint[]> {
  const { data } = await supabaseServer
    .from('analyses')
    .select('comprehensive_analysis, is_winner, spend_usd, created_at')
    .not('comprehensive_analysis', 'is', null)
    .not('spend_usd', 'is', null)
    .order('created_at', { ascending: true })

  const rows = (data ?? []) as { comprehensive_analysis: Record<string, unknown>; is_winner: boolean | null; spend_usd: number | null; created_at: string }[]
  return rows.map(r => {
    const ca = r.comprehensive_analysis
    return {
      created_at: r.created_at,
      framework_grade: ((ca.framework_score as Record<string, unknown>)?.overall_framework_grade as string) ?? null,
      scroll_stop_score: num((ca.hook_analysis as Record<string, unknown>)?.scroll_stop_score),
      congruence_score: num((ca.congruence as Record<string, unknown>)?.overall_score),
      cognitive_load: num((ca.cognitive_load as Record<string, unknown>)?.score),
      is_winner: r.is_winner,
      spend_usd: r.spend_usd,
    }
  })
}
