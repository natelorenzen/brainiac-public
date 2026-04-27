import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getAllWinnersForSynthesis,
  getAllLosersForSynthesis,
  upsertPatterns,
  upsertAntiPatterns,
  WINNER_THRESHOLD_USD,
} from '@/lib/pattern-library'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const anthropic = new Anthropic({ timeout: 120000 })

function buildAdSummary(ca: ComprehensiveAnalysis, spendUsd: number): string {
  const headline = ca.copy?.headline?.text ?? 'n/a'
  const headlineWords = headline !== 'n/a' ? headline.trim().split(/\s+/).length : 0
  const hasSubheadline = !!ca.copy?.subheadline?.text
  const benefits = ca.copy?.benefits_features?.identified ?? []
  const hasTrust = (ca.copy?.trust_signals?.identified?.length ?? 0) > 0
  const cta = ca.copy?.cta?.text ?? 'n/a'
  const offer = (ca as ComprehensiveAnalysis & { offer_architecture?: { offer_present?: boolean } }).offer_architecture?.offer_present ?? false
  const grade = (ca as ComprehensiveAnalysis & { framework_score?: { overall_framework_grade?: string } }).framework_score?.overall_framework_grade ?? '?'
  const awareness = (ca as ComprehensiveAnalysis & { market_context?: { awareness_level?: string } }).market_context?.awareness_level ?? 'unknown'
  const scrollStop = (ca as ComprehensiveAnalysis & { hook_analysis?: { scroll_stop_score?: number } }).hook_analysis?.scroll_stop_score ?? 0
  const cogLoad = (ca as ComprehensiveAnalysis & { cognitive_load?: { score?: number } }).cognitive_load?.score ?? 0
  const congruenceScore = (ca as ComprehensiveAnalysis & { congruence?: { overall_score?: number } }).congruence?.overall_score ?? 'n/a'
  const activeBE = Object.entries(ca.behavioral_economics ?? {})
    .filter(([k, v]) => k !== 'overall_feedback' && (v as { present?: boolean }).present)
    .map(([k]) => k).join(', ') || 'none'

  return `$${spendUsd} spend | headline="${headline}" (${headlineWords}w) | subheadline=${hasSubheadline} | benefits=${benefits.length} | trust=${hasTrust} | cta="${cta}" | offer=${offer} | grade=${grade} | awareness=${awareness} | scroll_stop=${scrollStop}/10 | cog_load=${cogLoad}/10 | congruence=${congruenceScore}/10 | BE=[${activeBE}]`
}

export async function POST(_req: NextRequest) {
  const [winners, losers] = await Promise.all([
    getAllWinnersForSynthesis(),
    getAllLosersForSynthesis(),
  ])

  let synthesized = 0
  let antiPatterns = 0

  // Winner synthesis
  if (winners.length >= 2) {
    const summaries = winners
      .map(w => buildAdSummary(w.comprehensive_analysis as unknown as ComprehensiveAnalysis, w.spend_usd))
      .map((s, i) => `Winner ${i + 1}: ${s}`)
      .join('\n')

    const prompt = `You are analyzing ${winners.length} winning ads (each with $${WINNER_THRESHOLD_USD}+ spend) to extract transferable creative principles.

CRITICAL RULES FOR PATTERN EXTRACTION:
- If some winners use benefits and some do not — BOTH can work. Generate a conditional rule, e.g. "Benefits help when the audience needs to justify the decision; test without benefits first for impulse purchases."
- Never generate a rule that negates what another winner proves. If one winner succeeded with 3 benefits and another with zero, do NOT write "benefits are required."
- Capture variation explicitly: note when different structural choices all led to success. This variation IS the insight.
- Rules must be specific and actionable — not "good headlines win" but "headlines under 6 words consistently appear in low-awareness winners (${winners.length} of ${winners.length} examples reviewed)."
- Confidence should reflect how many winners support the rule (1.0 = all, 0.5 = half). For conditional rules, confidence = share of winners where the condition applies and the rule held.
- Preserve nuance: "X can work AND not-X can also work" is a valid, valuable pattern.

Here are all ${winners.length} winning ad summaries:
${summaries}

Extract 6–10 specific, transferable, non-contradictory rules. Return ONLY a JSON array with no markdown fences:
[
  { "category": "visual|copy|behavioral|neuroscience", "rule_text": "<specific actionable rule>", "confidence": <0.0-1.0> }
]`

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = message.content.find(b => b.type === 'text')
      const raw = textBlock?.type === 'text' ? textBlock.text : ''
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned) as { category: string; rule_text: string; confidence: number }[]
      await upsertPatterns(parsed)
      synthesized = parsed.length
    } catch { /* non-fatal */ }
  }

  // Loser synthesis
  if (losers.length >= 2) {
    const loserSummaries = losers
      .map(w => buildAdSummary(w.comprehensive_analysis as unknown as ComprehensiveAnalysis, w.spend_usd))
      .map((s, i) => `Loser ${i + 1}: ${s}`)
      .join('\n')

    const loserPrompt = `You are analyzing ${losers.length} losing ads (each with <$${WINNER_THRESHOLD_USD} spend) to extract anti-patterns — creative choices that consistently underperform.

CRITICAL RULES:
- Frame every rule as "avoid X" or "X consistently underperforms when Y" — these are warnings, not absolute prohibitions.
- Conditional rules are valid: "Short headlines underperform for solution-aware audiences, but may work for unaware ones."
- Confidence = share of losers where this pattern appears. Never claim 1.0 unless every loser shows it.
- Do NOT generate anti-patterns that contradict what winners prove works. If both a winner and a loser used benefit lists, the benefit list itself is not the anti-pattern — look deeper at execution differences.
- Be specific: "body copy over 40 words consistently appears in low-spend ads" not "bad copy loses."
- Separate offer-driven failures from creative-driven failures: if the offer is absent and spend is low, that is an offer failure. If the offer is present but creative elements are weak, that is a creative failure.

Here are all ${losers.length} losing ad summaries:
${loserSummaries}

Extract 4–8 specific, transferable anti-patterns. Return ONLY a JSON array with no markdown fences:
[
  { "category": "visual|copy|behavioral|neuroscience", "rule_text": "<specific avoid/underperforms rule>", "confidence": <0.0-1.0> }
]`

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: loserPrompt }],
      })

      const textBlock = message.content.find(b => b.type === 'text')
      const raw = textBlock?.type === 'text' ? textBlock.text : ''
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned) as { category: string; rule_text: string; confidence: number }[]
      await upsertAntiPatterns(parsed)
      antiPatterns = parsed.length
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    synthesized,
    anti_patterns: antiPatterns,
    winner_count: winners.length,
    loser_count: losers.length,
    skipped: winners.length < 2 && losers.length < 2,
  })
}
