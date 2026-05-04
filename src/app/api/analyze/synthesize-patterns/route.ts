import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { parseClaudeJson } from '@/lib/parseClaudeJson'
import {
  getAllWinnersForSynthesis,
  getAllLosersForSynthesis,
  upsertPatterns,
  upsertAntiPatterns,
  upsertFrameworkPrinciples,
  getLatestBaselineEvolution,
  claimNextSynthesisJob,
  markSynthesisDone,
  markSynthesisFailed,
  hasPendingSynthesisJobs,
  setAnalysisLossReason,
  recomputePatternConfidence,
  WINNER_THRESHOLD_USD,
} from '@/lib/pattern-library'
import { runBaselineEvolution } from '@/lib/baseline-evolution'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const anthropic = new Anthropic({ timeout: 120000 })

// Loss-reason enum — every loser is classified into ONE of these.
// Anti-patterns are derived per reason so a "weak hook" loser doesn't
// contaminate the "no offer" anti-pattern bucket.
export const LOSS_REASONS = [
  'weak_hook',
  'no_offer',
  'no_proof',
  'wrong_audience',
  'saturated_pattern',
  'congruence_failure',
  'cognitive_overload',
  'weak_cta',
  'other',
] as const
export type LossReason = typeof LOSS_REASONS[number]

async function classifyLossReason(ca: ComprehensiveAnalysis, spendUsd: number): Promise<LossReason> {
  const fingerprint = buildAdSummary(ca, spendUsd, null)
  const prompt = `Classify why this losing ad ($${spendUsd} spend) failed. Pick EXACTLY ONE reason from the enum.

Enum:
- weak_hook: scroll-stop score is low; pattern interrupt absent or generic
- no_offer: offer architecture missing or unclear; no price anchor / guarantee / urgency
- no_proof: no trust/proof signals; audience cannot validate the claim
- wrong_audience: awareness or sophistication mismatch with the messaging
- saturated_pattern: structure_type is overused for the segment; nothing differentiated
- congruence_failure: elements contradict each other (headline-visual, headline-CTA, etc.)
- cognitive_overload: too many elements or words; density "heavy" with score >= 7
- weak_cta: CTA verb generic, framing weak, friction high
- other: failure does not fit the above

Ad fingerprint:
${fingerprint}

Return ONLY the enum value as a single string — no JSON, no explanation. Just one of: ${LOSS_REASONS.join(' | ')}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 32,
      messages: [{ role: 'user', content: prompt }],
    })
    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : ''
    const candidate = raw.replace(/[^a-z_]/gi, '').toLowerCase()
    if ((LOSS_REASONS as readonly string[]).includes(candidate)) {
      return candidate as LossReason
    }
  } catch { /* fall through */ }
  return 'other'
}

export function buildAdSummary(ca: ComprehensiveAnalysis, spendUsd: number, lossReason?: LossReason | null): string {
  const headline = ca.copy?.headline?.text ?? 'n/a'
  const cta = ca.copy?.cta?.text ?? 'n/a'
  const hd = ca.copy?.headline?.dna ?? null
  const sd = ca.copy?.subheadline?.dna ?? null
  const bd = ca.copy?.benefits_features?.dna ?? null
  const td = ca.copy?.trust_signals?.dna ?? null
  const cd = ca.copy?.cta?.dna ?? null
  const grade = ca.framework_score?.overall_framework_grade ?? '?'
  const awareness = ca.market_context?.awareness_level ?? 'unknown'
  const soph = ca.market_context?.sophistication_level ?? '?'
  const format = ca.ad_format?.type ?? '?'
  const scrollStop = ca.hook_analysis?.scroll_stop_score ?? 0
  const cogLoad = ca.cognitive_load?.score ?? 0
  const congruence = ca.congruence?.overall_score ?? '?'
  const combo = ca.composition_tag ?? '?'
  const activeBE = Object.entries(ca.behavioral_economics ?? {})
    .filter(([k, v]) => k !== 'overall_feedback' && (v as { present?: boolean })?.present)
    .map(([k]) => k).join(', ') || 'none'

  const lines: string[] = []
  const reasonTag = lossReason ? ` reason=${lossReason}` : ''
  lines.push(`($${spendUsd} spend, ${awareness}, soph=${soph}, format=${format}${reasonTag})`)
  lines.push(`  combo=${combo} | grade=${grade} | scroll_stop=${scrollStop} | cog_load=${cogLoad} | congruence=${congruence} | BE=[${activeBE}]`)
  if (hd) {
    lines.push(`  HL="${headline}" (${hd.word_count}w/${hd.char_count}c) | ${hd.voice}/${hd.person}/${hd.tense}/${hd.sentence_type} | structure=${hd.structure_type} | spec=${hd.specificity_level} | mech=${hd.mechanism_present} aud=${hd.audience_explicit} out=${hd.outcome_explicit} time=${hd.time_bound} | reg=${hd.emotional_register}/${hd.tone_register} | metaphor=${hd.uses_metaphor} neg=${hd.uses_negation} contrast=${hd.uses_contrast} punct=[${hd.punctuation_signals.join(',')}]`)
  } else {
    lines.push(`  HL="${headline}"`)
  }
  if (sd && sd.role !== 'absent') {
    lines.push(`  SUB role=${sd.role} | ${sd.length_relative_to_headline} | mech=${sd.introduces_mechanism} proof=${sd.introduces_proof} spec=${sd.introduces_specificity} | continuity=${sd.person_continuity} | tonal=${sd.tonal_shift} | reg=${sd.emotional_register}`)
  }
  if (bd && bd.count > 0) {
    lines.push(`  BEN(${bd.count}): avg=${bd.avg_word_count}w | ${bd.pattern_uniformity} | ${bd.outcome_vs_feature_split} | spec=${bd.specificity}`)
  }
  if (td && td.count > 0) {
    lines.push(`  TRU(${td.count}): [${td.types_present.join(', ')}] | quant=${td.has_specific_quantifiers} | ${td.source_attribution}`)
  }
  if (cd) {
    lines.push(`  CTA="${cta}" verb=${cd.verb} | ${cd.word_count}w | ${cd.framing} | ${cd.friction_level}_friction | value=${cd.has_value_anchor} urgency=${cd.has_urgency_signal}`)
  }
  return lines.join('\n')
}

export async function POST(_req: NextRequest) {
  // Claim a single pending job from the queue. If nothing is pending,
  // exit immediately — this also acts as a no-op when called as a
  // worker-kick from the comprehensive route.
  const job = await claimNextSynthesisJob()
  if (!job) return NextResponse.json({ skipped: true, reason: 'queue_empty' })

  let synthesized = 0
  let antiPatterns = 0
  let frameworkPrinciples = 0
  let baselineEvolved = false

  try {
    const [allWinners, allLosers, latestBaseline] = await Promise.all([
      getAllWinnersForSynthesis(),
      getAllLosersForSynthesis(),
      getLatestBaselineEvolution(),
    ])

    // Baseline+delta: when a feedback baseline exists, only synthesize the
    // delta ads (created after the baseline snapshot). The baseline already
    // encodes the patterns from all earlier ads, so re-synthesizing them
    // would produce duplicate rules and degrade signal quality.
    // When no baseline exists, synthesize all ads.
    const cutoff = latestBaseline?.created_at ?? null
    const winners = cutoff
      ? allWinners.filter(w => w.created_at > cutoff)
      : allWinners
    const losers = cutoff
      ? allLosers.filter(l => l.created_at > cutoff)
      : allLosers

    // Backfill loss_reason on any losers in this batch missing one. This
    // keeps the anti-pattern bucket coherent — "weak hook" losers don't
    // contaminate the "no proof" anti-pattern.
    for (const l of losers) {
      if (!l.loss_reason) {
        const reason = await classifyLossReason(
          l.comprehensive_analysis as unknown as ComprehensiveAnalysis,
          l.spend_usd,
        )
        await setAnalysisLossReason(l.id, reason)
        l.loss_reason = reason
      }
    }

  // Winner synthesis
  if (winners.length >= 2) {
    const summaries = winners
      .map(w => buildAdSummary(w.comprehensive_analysis as unknown as ComprehensiveAnalysis, w.spend_usd))
      .map((s, i) => `Winner ${i + 1}: ${s}`)
      .join('\n')

    const baselineNote = latestBaseline
      ? `IMPORTANT: A feedback baseline (v${latestBaseline.version}) already encodes patterns from the first ${latestBaseline.ads_analyzed} historical ads. The ${winners.length} winner(s) below are NEW since then. Update existing rules (reinforce or add nuance) rather than recreating rules the baseline already captures.\n\n`
      : ''

    const prompt = `You are analyzing ${winners.length} winning ads (each with $${WINNER_THRESHOLD_USD}+ spend) to extract transferable creative principles.

${baselineNote}CRITICAL RULES FOR PATTERN EXTRACTION:
- If some winners use benefits and some do not — BOTH can work. Generate a conditional rule, e.g. "Benefits help when the audience needs to justify the decision; test without benefits first for impulse purchases."
- Never generate a rule that negates what another winner proves. If one winner succeeded with 3 benefits and another with zero, do NOT write "benefits are required."
- Capture variation explicitly: note when different structural choices all led to success. This variation IS the insight.
- Rules must be specific and actionable — not "good headlines win" but "headlines under 6 words consistently appear in low-awareness winners (${winners.length} of ${winners.length} examples reviewed)."
- Confidence should reflect how many winners support the rule (1.0 = all, 0.5 = half). For conditional rules, confidence = share of winners where the condition applies and the rule held.
- Preserve nuance: "X can work AND not-X can also work" is a valid, valuable pattern.

Here are all ${winners.length} winning ad summaries:
${summaries}

Extract 6–10 specific, transferable, non-contradictory rules. Each rule includes the dominant ad_format and vertical_category in its supporting winners so it can be scoped (use null when supporting winners span multiple formats/verticals — those rules apply globally).

Return ONLY a JSON array with no markdown fences:
[
  { "category": "visual|copy|behavioral|neuroscience", "rule_text": "<specific actionable rule>", "confidence": <0.0-1.0>, "scope_ad_format": "<dominant format or null>", "scope_vertical": "<dominant vertical or null>" }
]`

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = message.content.find(b => b.type === 'text')
      const raw = textBlock?.type === 'text' ? textBlock.text : ''
      const parsed = parseClaudeJson<{ category: string; rule_text: string; confidence: number; scope_ad_format?: string | null; scope_vertical?: string | null }[]>(raw)
      await upsertPatterns(parsed)
      synthesized = parsed.length
    } catch { /* non-fatal */ }
  }

  // Loser synthesis — grouped by loss_reason so different failure modes
  // produce different anti-patterns. Each loser carries its classified
  // loss_reason in the fingerprint; Claude is instructed to derive
  // reason-scoped rules (avoid the "weak hook" rule contaminating the
  // "no proof" bucket).
  if (losers.length >= 2) {
    const loserSummaries = losers
      .map(w => buildAdSummary(w.comprehensive_analysis as unknown as ComprehensiveAnalysis, w.spend_usd, w.loss_reason as LossReason | null | undefined))
      .map((s, i) => `Loser ${i + 1}: ${s}`)
      .join('\n')

    const loserBaselineNote = latestBaseline
      ? `IMPORTANT: A feedback baseline (v${latestBaseline.version}) already encodes anti-patterns from the first ${latestBaseline.ads_analyzed} historical ads. The ${losers.length} loser(s) below are NEW since then. Derive incremental anti-patterns — reinforce or add nuance to existing patterns rather than restating what is already captured.\n\n`
      : ''

    const loserPrompt = `You are analyzing ${losers.length} losing ads (each with <$${WINNER_THRESHOLD_USD} spend) to extract anti-patterns — creative choices that consistently underperform.

${loserBaselineNote}Each loser is tagged with a single reason for failure: ${LOSS_REASONS.join(' | ')}. Group your anti-patterns BY reason — do not mix losers from different failure modes when deriving a rule. A "weak_hook" pattern should not be contaminated by "no_offer" losers.

CRITICAL RULES:
- Frame every rule as "avoid X" or "X consistently underperforms when Y" — these are warnings, not absolute prohibitions.
- Each rule MUST cite the loss_reason it is scoped to (use the loss_reason field in the output).
- Conditional rules are valid: "Short headlines underperform for solution-aware audiences, but may work for unaware ones."
- Confidence = share of losers WITH THE SAME loss_reason where this pattern appears. Never claim 1.0 unless every same-reason loser shows it.
- Do NOT generate anti-patterns that contradict what winners prove works. If both a winner and a loser used benefit lists, the benefit list itself is not the anti-pattern — look deeper at execution differences.
- Be specific: "body copy over 40 words consistently appears in cognitive_overload losers" not "bad copy loses."

Here are all ${losers.length} losing ad summaries (each tagged with reason=...):
${loserSummaries}

Extract 4–8 specific, transferable anti-patterns scoped to their failure reason. Return ONLY a JSON array with no markdown fences:
[
  { "category": "visual|copy|behavioral|neuroscience", "loss_reason": "<one of: ${LOSS_REASONS.join(' | ')}>", "rule_text": "<specific avoid/underperforms rule>", "confidence": <0.0-1.0>, "scope_ad_format": "<dominant format or null>", "scope_vertical": "<dominant vertical or null>" }
]`

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: loserPrompt }],
      })

      const textBlock = message.content.find(b => b.type === 'text')
      const raw = textBlock?.type === 'text' ? textBlock.text : ''
      const parsed = parseClaudeJson<{ category: string; loss_reason?: string; rule_text: string; confidence: number; scope_ad_format?: string | null; scope_vertical?: string | null }[]>(raw)
      await upsertAntiPatterns(parsed)
      antiPatterns = parsed.length
    } catch { /* non-fatal */ }
  }

  // Framework synthesis — derives conditional segment-scoped guard rails from accumulated history.
  // REQUIRES migration 006_framework_principles.sql to be applied to Supabase first
  // (extends pattern_library.category constraint to include 'framework' and adds
  // scope_awareness, scope_sophistication, supporting_winner_ids, supporting_loser_ids
  // columns). Without it, this block fails with a CHECK constraint violation.
  if (winners.length + losers.length >= 10) {
    const winnerLines = winners
      .map((w, i) => `Winner W${i + 1} [id=${w.id}]: ${buildAdSummary(w.comprehensive_analysis as unknown as ComprehensiveAnalysis, w.spend_usd)}`)
      .join('\n')
    const loserLines = losers
      .map((l, i) => `Loser L${i + 1} [id=${l.id}]: ${buildAdSummary(l.comprehensive_analysis as unknown as ComprehensiveAnalysis, l.spend_usd)}`)
      .join('\n')

    const frameworkPrompt = `You are deriving CONDITIONAL FRAMEWORK PRINCIPLES from accumulated winning and losing ad data.

A framework principle is a guard rail that should override the default copywriting framework when historical evidence consistently demonstrates a specific segment behaves differently.

Inputs (every ad has its full DNA fingerprint):
${winnerLines}

${loserLines}

EXTRACTION RULES:
1. Each principle MUST be conditional on (awareness_level, sophistication_level, or both). Global rules without scope are forbidden — those belong in the static framework.
2. Each principle MUST cite the specific winner and loser ids supporting it.
3. Each principle MUST identify a SPECIFIC structural choice that diverges from the static framework's default — e.g., "headline_structure_type=pain_agitation outperforms mechanism_reveal" or "composition_tag=headline+cta winners exist at high spend in this segment despite breaking minimum-stack defaults."
4. Confidence: share of supporting cases / total cases in the matching segment. Minimum threshold for inclusion: 0.7 with at least 3 supporting examples in the same segment.
5. Phrase each principle as a CONDITIONAL ACTION: "When ad is {scope}, prefer {choice} because (W{ids}) and avoid {opposite} because (L{ids})."
6. Also identify combination patterns: composition_tag combinations that consistently win or lose within a segment.

Return ONLY a JSON array, no markdown fences:
[
  {
    "scope_awareness": "<unaware|problem_aware|solution_aware|product_aware|most_aware|null>",
    "scope_sophistication": <1|2|3|4|5|null>,
    "rule_text": "<conditional principle>",
    "confidence": <0.0-1.0>,
    "supporting_winner_ids": ["<uuid>"],
    "supporting_loser_ids": ["<uuid>"]
  }
]`

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: frameworkPrompt }],
      })

      const textBlock = message.content.find(b => b.type === 'text')
      const raw = textBlock?.type === 'text' ? textBlock.text : ''
      const parsed = parseClaudeJson<{
        scope_awareness: string | null
        scope_sophistication: number | null
        rule_text: string
        confidence: number
        supporting_winner_ids: string[]
        supporting_loser_ids: string[]
      }[]>(raw)
      await upsertFrameworkPrinciples(parsed.map(p => ({
        rule_text: p.rule_text,
        confidence: p.confidence,
        scope_awareness: p.scope_awareness,
        scope_sophistication: p.scope_sophistication,
        supporting_winner_ids: p.supporting_winner_ids ?? [],
        supporting_loser_ids: p.supporting_loser_ids ?? [],
      })))
      frameworkPrinciples = parsed.length
    } catch { /* non-fatal */ }
  }

  // 4th pass — Feedback Baseline Evolution at every 50-ad milestone.
  // Delegated to the shared helper so the manual /api/analyze/baseline-update
  // safety-net endpoint runs the exact same logic. Non-fatal — the helper
  // catches its own errors and returns { evolved: false, reason }.
  // Requires migration 007_feedback_baseline.sql to be applied to Supabase.
  const baselineResult = await runBaselineEvolution()
  baselineEvolved = baselineResult.evolved

    // Recompute every pattern's confidence based on actual winner/loser
    // counts now that this job's contributions have been written.
    await recomputePatternConfidence().catch(() => { /* non-fatal */ })

    await markSynthesisDone(job.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'synthesis failed'
    await markSynthesisFailed(job.id, msg)
  }

  // Self-trigger if queue still has pending jobs. Sequential — by design,
  // we never run two synthesis jobs in parallel. The next call will claim
  // the next job, run, and chain again until the queue drains.
  if (await hasPendingSynthesisJobs()) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/analyze/synthesize-patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => { /* fire and forget */ })
  }

  return NextResponse.json({
    job_id: job.id,
    analysis_id: job.analysis_id,
    synthesized,
    anti_patterns: antiPatterns,
    framework_principles: frameworkPrinciples,
    baseline_evolved: baselineEvolved,
  })
}
