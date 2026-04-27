import { supabaseServer } from '@/lib/supabase-server'

export const WINNER_THRESHOLD_USD = 1000
export const LOSER_THRESHOLD_USD = 1000

export interface PatternLibraryRow {
  id: string
  category: 'visual' | 'copy' | 'behavioral' | 'neuroscience'
  rule_text: string
  confidence: number
  winner_count: number
  created_at: string
  updated_at: string
}

export interface LosingPatternRow {
  id: string
  category: 'visual' | 'copy' | 'behavioral' | 'neuroscience'
  rule_text: string
  confidence: number
  loser_count: number
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
    .order('winner_count', { ascending: false })
    .order('confidence', { ascending: false })

  if (error) return []
  return (data ?? []) as PatternLibraryRow[]
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
