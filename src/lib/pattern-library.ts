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
    .select('id, comprehensive_analysis, spend_usd')
    .eq('is_winner', true)
    .not('comprehensive_analysis', 'is', null)
    .order('spend_usd', { ascending: false })

  if (error) return []
  return (data ?? []) as WinningAnalysisSummary[]
}

export async function getAllLosersForSynthesis(): Promise<WinningAnalysisSummary[]> {
  const { data, error } = await supabaseServer
    .from('analyses')
    .select('id, comprehensive_analysis, spend_usd')
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
    .select('id, comprehensive_analysis, spend_usd')
    .eq('is_winner', true)
    .not('comprehensive_analysis', 'is', null)
    .order('spend_usd', { ascending: false })

  if (error) return []
  return (data ?? []) as WinningAnalysisSummary[]
}

export async function upsertPatterns(
  patterns: { category: string; rule_text: string; confidence: number }[],
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
          // confidence intentionally NOT updated — preserve original value
        })
        .eq('id', existing.id)
    } else {
      await supabaseServer.from('pattern_library').insert({
        category: p.category,
        rule_text: p.rule_text,
        confidence: p.confidence,
        winner_count: 1,
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

export async function upsertAntiPatterns(
  patterns: { category: string; rule_text: string; confidence: number }[],
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
        })
        .eq('id', existing.id)
    } else {
      await supabaseServer.from('anti_pattern_library').insert({
        category: p.category,
        rule_text: p.rule_text,
        confidence: p.confidence,
        loser_count: 1,
      })
    }
  }
}
