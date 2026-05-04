import Anthropic from '@anthropic-ai/sdk'
import { parseClaudeJson } from '@/lib/parseClaudeJson'
import {
  getAllWinnersForSynthesis,
  getAllLosersForSynthesis,
  getLatestBaselineEvolution,
  getHistoricalAdCount,
  storeBaselineEvolution,
  type BaselinePrinciple,
  type WinningAnalysisSummary,
} from '@/lib/pattern-library'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'
import { buildAdSummary } from '@/app/api/analyze/synthesize-patterns/route'

const anthropic = new Anthropic({ timeout: 120000 })

export interface BaselineEvolutionResult {
  evolved: boolean
  version?: number
  ads_analyzed?: number
  reason?: string
}

/**
 * Runs the 4th-pass feedback baseline evolution. Used by both:
 *   - synthesize-patterns/route.ts (auto, fire-and-forget after every historical ad)
 *   - baseline-update/route.ts     (manual, user-triggered safety-net button)
 *
 * Idempotent: re-checks the milestone gate server-side. If the baseline is
 * already current, returns { evolved: false, reason: 'no_milestone_pending' }
 * without making the Claude call.
 *
 * Failure (Claude error, parse error, store error) returns { evolved: false,
 * reason: <message> } and does NOT throw — callers can react to the result
 * without try/catch.
 */
export async function runBaselineEvolution(): Promise<BaselineEvolutionResult> {
  let allWinners: WinningAnalysisSummary[]
  let allLosers: WinningAnalysisSummary[]
  let latestBaseline: Awaited<ReturnType<typeof getLatestBaselineEvolution>>
  let totalHistoricalAds: number

  try {
    [allWinners, allLosers, latestBaseline, totalHistoricalAds] = await Promise.all([
      getAllWinnersForSynthesis(),
      getAllLosersForSynthesis(),
      getLatestBaselineEvolution(),
      getHistoricalAdCount(),
    ])
  } catch (e) {
    return { evolved: false, reason: e instanceof Error ? e.message : 'fetch failed' }
  }

  const currentMilestone = Math.floor(totalHistoricalAds / 50)
  const lastMilestone = latestBaseline ? Math.floor(latestBaseline.ads_analyzed / 50) : 0

  if (currentMilestone <= lastMilestone || currentMilestone < 1) {
    return { evolved: false, reason: 'no_milestone_pending' }
  }

  // Delta only — the existing principles already encode the earlier ads.
  const cutoff = latestBaseline?.created_at ?? null
  const winners = cutoff ? allWinners.filter(w => w.created_at > cutoff) : allWinners
  const losers = cutoff ? allLosers.filter(l => l.created_at > cutoff) : allLosers

  const winnerSummaries = winners
    .map((w, i) => `Winner W${i + 1}: ${buildAdSummary(w.comprehensive_analysis as unknown as ComprehensiveAnalysis, w.spend_usd)}`)
    .join('\n')
  const loserSummaries = losers
    .map((l, i) => `Loser L${i + 1}: ${buildAdSummary(l.comprehensive_analysis as unknown as ComprehensiveAnalysis, l.spend_usd)}`)
    .join('\n')

  const existingPrinciples = latestBaseline?.principles ?? []

  const evolutionPrompt = `You are evolving the feedback mode's core analytical framework based on accumulated historical ad data.

PURPOSE: This is an ADDITIVE update. You are building a growing body of evidence-based principles that supplement the static framework below. You NEVER delete or contradict existing principles directly — you add context, nuance, and counter-evidence. Contradictions are preserved alongside the original principle because they reveal conditional dynamics, not errors.

STATIC FRAMEWORK BASELINE (foundation — never modify these, never add principles that directly contradict them without qualification):

Copywriting framework (minimum-viable-copy principle):
- Start with the minimum. Add an element ONLY when the previous one leaves something unresolved.
- Headline: Maximum impact with minimum words. Length justified only when every word is load-bearing.
- Subheadline: Justified ONLY if headline leaves "so what?" unanswered.
- Benefits: Justified ONLY if the audience needs to justify the decision.
- Trust signal: Default ON for health, money, significant life changes. Otherwise start without.
- CTA: Justified ONLY if the next step is unclear OR there is a specific offer worth leading with.

Awareness levels (Eugene Schwartz): Unaware → Problem-aware → Solution-aware → Product-aware → Most-aware.
Market sophistication levels 1–5: 1=bold claim wins, 3=mechanism differentiates, 5=sensation only.
Congruence principle: every element reinforces the same core message — headline↔visual, sub↔headline tension, body↔headline promise, each benefit a direct consequence of core mechanism, CTA matches the offer, trust validates the specific claim.

EXISTING EVOLVED PRINCIPLES (from all previous updates — return these with any updates applied):
${existingPrinciples.length > 0 ? JSON.stringify(existingPrinciples, null, 2) : '[]'}

ALL HISTORICAL AD DATA (${totalHistoricalAds} total ads):
Winners (≥$1000 spend):
${winnerSummaries || '(none yet)'}

Losers (<$1000 spend):
${loserSummaries || '(none yet)'}

EVOLUTION RULES — follow exactly:
1. REINFORCE: New data supports an existing principle → update supporting_winner_count/loser_count, update evidence_summary. Set type="reinforced". Do not create a duplicate.
2. CONTRADICT: New data contradicts an existing principle → append to that principle_text: "Counter-evidence: [N] ads in [segment] show [opposite finding]. This applies when [condition]. Both findings are valid under different conditions." Set type="contradiction". Do not remove the original.
3. NEW: No existing analog → create new principle. Set type="new". Minimum threshold: 3+ examples supporting it.
4. UNCHANGED: Existing principle with no new evidence → copy it unchanged. Set type="unchanged".
5. REDUNDANT: Principle is entirely duplicated by another → collapse into the more specific one. Do not keep both.

Every principle must be conditional ("When [condition], [finding]"). Cross-segment generalizations belong in the static baseline, not here.

Return a JSON array of the FULL UPDATED cumulative principle set (include ALL existing principles with updates applied — not just new entries). No markdown fences. Return ONLY the JSON array:
[
  {
    "principle_text": "<full principle, including any counter-evidence appended>",
    "category": "copy|visual|behavioral|structural|audience",
    "type": "new|reinforced|contradiction|unchanged",
    "scope_awareness": "<awareness level or null>",
    "scope_sophistication": <1-5 or null>,
    "evidence_summary": "<example numbers: W1, W3, L2>",
    "supporting_winner_count": <integer>,
    "supporting_loser_count": <integer>
  }
]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: evolutionPrompt }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const parsed = parseClaudeJson<BaselinePrinciple[]>(raw)

    const newCount = parsed.filter(p => p.type === 'new').length
    const reinforcedCount = parsed.filter(p => p.type === 'reinforced').length
    const contradictionCount = parsed.filter(p => p.type === 'contradiction').length
    const changeSummary = `v${currentMilestone}: ${totalHistoricalAds} ads. New: ${newCount}, Reinforced: ${reinforcedCount}, Contradictions: ${contradictionCount}.`

    await storeBaselineEvolution(currentMilestone, totalHistoricalAds, parsed, changeSummary)

    return { evolved: true, version: currentMilestone, ads_analyzed: totalHistoricalAds }
  } catch (e) {
    return { evolved: false, reason: e instanceof Error ? e.message : 'evolution failed' }
  }
}
