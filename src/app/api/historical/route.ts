import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import {
  getWinningPatterns,
  getLosingPatterns,
  getFrameworkPrinciples,
  getAllBaselineEvolutions,
  getDimensionStats,
  getBergDnaCorrelations,
  getAwarenessBreakdown,
  getTrendPoints,
} from '@/lib/pattern-library'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Single endpoint that returns the full Historical Analysis tab payload.
// Bundling avoids sequential round-trips on page load.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Aggregate stats — winner/loser counts, total spend, win rate, avg
  // framework grade, spend efficiency. All historical (non-feedback) ads.
  const { data: ads } = await supabaseServer
    .from('analyses')
    .select('comprehensive_analysis, is_winner, spend_usd')
    .eq('type', 'thumbnail')
    .eq('status', 'complete')
    .not('spend_usd', 'is', null)

  const allAds = (ads ?? []) as { comprehensive_analysis: Record<string, unknown> | null; is_winner: boolean | null; spend_usd: number | null }[]
  const winners = allAds.filter(a => a.is_winner === true)
  const losers = allAds.filter(a => a.is_winner !== true)
  const totalSpend = allAds.reduce((s, a) => s + (Number(a.spend_usd) || 0), 0)
  const winnerSpend = winners.reduce((s, a) => s + (Number(a.spend_usd) || 0), 0)

  // Average framework grade — convert A=4, B=3, C=2, D=1, then back.
  const gradeMap: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 }
  const reverseGradeMap: Record<number, string> = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' }
  const grades = allAds
    .map(a => ((a.comprehensive_analysis?.framework_score as Record<string, unknown>)?.overall_framework_grade as string) ?? null)
    .filter((g): g is string => g != null && gradeMap[g] != null)
    .map(g => gradeMap[g])
  const avgGradeNum = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null
  const avgGrade = avgGradeNum != null ? reverseGradeMap[avgGradeNum] : null

  const stats = {
    total: allAds.length,
    winners: winners.length,
    losers: losers.length,
    win_rate: allAds.length > 0 ? winners.length / allAds.length : 0,
    total_spend: totalSpend,
    spend_efficiency: winners.length > 0 ? winnerSpend / winners.length : 0,
    avg_framework_grade: avgGrade,
  }

  const [
    winningPatterns,
    losingPatterns,
    frameworkPrinciples,
    baselineEvolutions,
    awarenessBreakdown,
    dimensionStats,
    bergDnaCorrelations,
    trends,
  ] = await Promise.all([
    getWinningPatterns(),
    getLosingPatterns(),
    getFrameworkPrinciples(),
    getAllBaselineEvolutions(),
    getAwarenessBreakdown(),
    getDimensionStats(),
    getBergDnaCorrelations(),
    getTrendPoints(),
  ])

  // Compute next baseline evolution milestone
  const NEXT_MILESTONE = 50
  const lastEvolutionAds = baselineEvolutions[0]?.ads_analyzed ?? 0
  const nextMilestoneAt = Math.ceil((stats.total + 1) / NEXT_MILESTONE) * NEXT_MILESTONE
  const adsUntilNextMilestone = Math.max(0, nextMilestoneAt - stats.total)

  // Pattern unlock thresholds — these mirror the conditions in
  // synthesize-patterns/route.ts. Each threshold is the number of ads
  // required before a synthesis pass starts producing rules. Surfacing
  // these lets the UI tell the user exactly how many more ads they
  // need rather than the unhelpful "analyze more historical ads".
  const WINNER_PATTERN_THRESHOLD = 2
  const ANTI_PATTERN_THRESHOLD = 2
  const FRAMEWORK_THRESHOLD = 10
  const totalAds = stats.total

  const patternThresholds = {
    winning_patterns: {
      threshold: WINNER_PATTERN_THRESHOLD,
      current: stats.winners,
      remaining: Math.max(0, WINNER_PATTERN_THRESHOLD - stats.winners),
      unlocked: stats.winners >= WINNER_PATTERN_THRESHOLD,
      requires: 'winners',
    },
    anti_patterns: {
      threshold: ANTI_PATTERN_THRESHOLD,
      current: stats.losers,
      remaining: Math.max(0, ANTI_PATTERN_THRESHOLD - stats.losers),
      unlocked: stats.losers >= ANTI_PATTERN_THRESHOLD,
      requires: 'losers',
    },
    framework_guard_rails: {
      threshold: FRAMEWORK_THRESHOLD,
      current: totalAds,
      remaining: Math.max(0, FRAMEWORK_THRESHOLD - totalAds),
      unlocked: totalAds >= FRAMEWORK_THRESHOLD,
      requires: 'historical ads',
    },
  }

  return NextResponse.json({
    stats,
    awareness_breakdown: awarenessBreakdown,
    winning_patterns: winningPatterns,
    losing_patterns: losingPatterns,
    framework_principles: frameworkPrinciples,
    pattern_thresholds: patternThresholds,
    baseline_evolutions: baselineEvolutions,
    next_milestone: {
      ads_at_last_evolution: lastEvolutionAds,
      next_milestone_at: nextMilestoneAt,
      ads_until_next_milestone: adsUntilNextMilestone,
    },
    dimension_stats: dimensionStats,
    berg_dna_correlations: bergDnaCorrelations,
    trends,
  })
}
