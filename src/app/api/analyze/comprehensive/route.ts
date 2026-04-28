import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getWinningPatterns,
  getAllWinningAnalyses,
  getAllLosersForSynthesis,
  getLosingPatterns,
  getFrameworkPrinciples,
  getLatestBaselineEvolution,
  storeComprehensiveAnalysis,
  WINNER_THRESHOLD_USD,
  type PatternLibraryRow,
  type LosingPatternRow,
  type WinningAnalysisSummary,
  type FrameworkPrincipleRow,
  type BaselineEvolutionEntry,
} from '@/lib/pattern-library'
import type {
  ExtractedElements,
  HeadlineDNA,
  SubheadlineDNA,
  BodyDNA,
  BenefitsDNA,
  TrustDNA,
  CtaDNA,
} from '@/app/api/analyze/extract-elements/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface ROIAverage {
  region_key: string
  label: string
  description: string
  activation: number
}

export interface LibraryAlignment {
  winner_matches: string[]
  loser_matches: string[]
  verdict: 'aligned_with_winners' | 'aligned_with_losers' | 'mixed' | 'no_analog'
  winning_dna_dimensions: string[]
  losing_dna_dimensions: string[]
}

export interface ElementRewrite {
  proposed_text?: string | null
  proposed_action?: string | null
  proposed_benefits?: string[] | null
  proposed_signals?: string[] | null
  proposed_change?: string | null
  proposed_pattern_interrupt?: string | null
  proposed_offer_text?: string | null
  rationale: string
  expected_lift: string
  dna_changes?: Record<string, unknown> | null
}

export interface ComprehensiveAnalysis {
  copy: {
    headline: {
      text: string; clarity: number; urgency: number; relevance: number; feedback: string
      dna?: HeadlineDNA | null
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
    subheadline: {
      text: string; supports_headline: boolean; clarity: number; feedback: string
      dna?: SubheadlineDNA | null
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
    benefits_features: {
      identified: string[]; clarity: number; prominence: number; feedback: string
      dna?: BenefitsDNA | null
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
    trust_signals: {
      identified: string[]; strength: number; feedback: string
      dna?: TrustDNA | null
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
    safety_signals: {
      identified: string[]; strength: number; feedback: string
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
    proof_signals: {
      identified: string[]; strength: number; feedback: string
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
    cta: {
      text: string; clarity: number; placement: string; contrast: number; feedback: string
      dna?: CtaDNA | null
      library_alignment?: LibraryAlignment | null
      rewrite?: ElementRewrite | null
    }
  }
  body_dna?: BodyDNA | null
  composition_tag: string
  behavioral_economics: {
    scarcity: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    urgency: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    social_proof: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    anchoring: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    loss_aversion: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    authority: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    reciprocity: { present: boolean; strength: number; note: string; rewrite?: ElementRewrite | null }
    overall_feedback: string
  }
  neuroscience: {
    attention_prediction: string
    emotional_encoding: string
    memory_encoding: string
    feedback: string
  }
  visual_dimensions: {
    cta_strength: { score: number; feedback: string; rewrite?: ElementRewrite | null }
    emotional_appeal: { score: number; feedback: string; rewrite?: ElementRewrite | null }
    brand_clarity: { score: number; feedback: string; rewrite?: ElementRewrite | null }
    visual_hierarchy: { score: number; feedback: string; rewrite?: ElementRewrite | null }
  }
  berg_recommendations: string[]
  pattern_matches: string[]
  overall: {
    verdict: string
    top_strength: string
    critical_weakness: string
    priority_fix: string
  }
  market_context: {
    awareness_level: 'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'most_aware'
    awareness_reasoning: string
    sophistication_level: 1 | 2 | 3 | 4 | 5
    sophistication_reasoning: string
  }
  ad_format: {
    type: 'direct_response' | 'native_ugc' | 'advertorial' | 'brand_awareness' | 'product_demo' | 'testimonial' | 'hybrid'
    composition: {
      has_headline: boolean
      has_subheadline: boolean
      has_body_copy: boolean
      has_benefits_list: boolean
      has_trust_signals: boolean
      has_cta: boolean
      has_price_or_offer: boolean
      is_visual_dominant: boolean
      is_text_heavy: boolean
    }
    format_assessment: string
  }
  hook_analysis: {
    scroll_stop_score: number
    pattern_interrupt: string
    first_half_second: string
    hook_feedback: string
    library_alignment?: LibraryAlignment | null
    rewrite?: ElementRewrite | null
  }
  offer_architecture: {
    offer_present: boolean
    offer_text: string | null
    has_price_anchor: boolean
    has_guarantee: boolean
    has_urgency_mechanism: boolean
    has_trial_or_free: boolean
    perceived_value_score: number
    offer_clarity_score: number
    offer_feedback: string
    library_alignment?: LibraryAlignment | null
    rewrite?: ElementRewrite | null
  }
  cognitive_load: {
    score: number
    density: 'minimal' | 'moderate' | 'heavy'
    overload_risk: string
    simplification: string
    rewrite?: ElementRewrite | null
  }
  framework_score: {
    minimum_viable_test: 'pass' | 'fail'
    headline_leaves_gap: boolean
    subheadline_justified: boolean
    benefits_justified: boolean
    trust_signal_justified: boolean
    cta_justified: boolean
    overall_framework_grade: 'A' | 'B' | 'C' | 'D'
    framework_feedback: string
  }
  congruence: {
    overall_score: number
    headline_to_visual: { aligned: boolean; note: string }
    headline_to_subheadline: { aligned: boolean; note: string }
    body_to_headline: { aligned: boolean; note: string }
    benefits_to_headline: { aligned: boolean; note: string }
    cta_to_offer: { aligned: boolean; note: string }
    trust_signals_to_claim: { aligned: boolean; note: string }
    incoherence_summary: string
    fix: string
    library_alignment?: LibraryAlignment | null
    rewrite?: ElementRewrite | null
  }
  combination_analysis: {
    current_combination: string
    combination_assessment: string
    historical_match: {
      winners_with_same_combo_in_segment: number
      losers_with_same_combo_in_segment: number
      winner_examples: string[]
      loser_examples: string[]
      verdict: 'strong_winner_pattern' | 'mixed_record' | 'mostly_loser_pattern' | 'no_segment_data'
      verdict_reasoning: string
    }
    alternative_combination: {
      recommended: string | null
      intent: 'replacement' | 'test_variant' | 'none'
      rationale: string
      element_changes: {
        headline: string
        subheadline: string
        benefits: string[] | string
        trust_signals: string[] | string
        cta: string
        offer: string
      }
      predicted_impact: string
    } | null
  }
}

const anthropic = new Anthropic({ timeout: 120000 })

const AWARENESS_BUCKETS: Array<'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'most_aware'> = [
  'unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware',
]

function fingerprintAd(prefix: string, idx: number, ex: WinningAnalysisSummary, compact: boolean): string[] {
  const ca = ex.comprehensive_analysis as unknown as ComprehensiveAnalysis | null
  if (!ca) return []
  const headline = ca.copy?.headline?.text ?? 'n/a'
  const hd = ca.copy?.headline?.dna ?? null
  const sd = ca.copy?.subheadline?.dna ?? null
  const bd = ca.copy?.benefits_features?.dna ?? null
  const td = ca.copy?.trust_signals?.dna ?? null
  const cd = ca.copy?.cta?.dna ?? null
  const cta = ca.copy?.cta?.text ?? 'n/a'
  const grade = ca.framework_score?.overall_framework_grade ?? '?'
  const soph = ca.market_context?.sophistication_level ?? '?'
  const format = ca.ad_format?.type ?? '?'
  const scrollStop = ca.hook_analysis?.scroll_stop_score ?? 0
  const cogLoad = ca.cognitive_load?.score ?? 0
  const congruence = ca.congruence?.overall_score ?? '?'
  const combo = ca.composition_tag ?? '?'
  const topBE = Object.entries(ca.behavioral_economics ?? {})
    .filter(([k, v]) => k !== 'overall_feedback' && (v as { present?: boolean })?.present)
    .map(([k]) => k).join(', ') || 'none'

  const lines: string[] = []
  lines.push(`${prefix}${idx} ($${ex.spend_usd} spend, soph=${soph}, format=${format}):`)
  lines.push(`  combo=${combo} | grade=${grade} | scroll_stop=${scrollStop} | cog_load=${cogLoad} | congruence=${congruence} | BE=[${topBE}]`)
  if (compact) return lines
  if (hd) {
    lines.push(`  HL="${headline}" (${hd.word_count}w/${hd.char_count}c) | ${hd.voice}/${hd.person}/${hd.tense}/${hd.sentence_type} | structure=${hd.structure_type} | spec=${hd.specificity_level} | mech=${hd.mechanism_present} audience=${hd.audience_explicit} outcome=${hd.outcome_explicit} time=${hd.time_bound} | reg=${hd.emotional_register}/${hd.tone_register} | metaphor=${hd.uses_metaphor} neg=${hd.uses_negation} contrast=${hd.uses_contrast} punct=[${hd.punctuation_signals.join(',')}]`)
  } else {
    lines.push(`  HL="${headline}"`)
  }
  if (sd && sd.role !== 'absent') {
    lines.push(`  SUB="${ca.copy?.subheadline?.text ?? ''}" | role=${sd.role} | ${sd.length_relative_to_headline} | mech=${sd.introduces_mechanism} proof=${sd.introduces_proof} spec=${sd.introduces_specificity} | continuity=${sd.person_continuity} | tonal=${sd.tonal_shift} | reg=${sd.emotional_register}`)
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
  return lines
}

function buildPatternContext(
  patterns: PatternLibraryRow[],
  winningExamples: WinningAnalysisSummary[],
  losingPatterns: LosingPatternRow[] = [],
  losingExamples: WinningAnalysisSummary[] = [],
  frameworkPrinciples: FrameworkPrincipleRow[] = [],
): string {
  if (patterns.length === 0 && winningExamples.length === 0 && losingPatterns.length === 0 && losingExamples.length === 0 && frameworkPrinciples.length === 0) return ''

  const lines: string[] = []

  // Anti-skimming header
  lines.push(`PATTERN LIBRARY USE RULES — non-negotiable:
1. EXPLICIT REFERENCE: When you make a claim about what works/fails in this ad's segment, cite the example number(s): "(matches W3, W7)" or "(seen in 4 of 6 problem_aware winners: W1, W3, W7, W11)".
2. NO PARAPHRASING THE LIBRARY: Do not write "the data shows..." or "winners typically...". Quote the structural fingerprint verbatim from the relevant example.
3. NO GENERALIZATION ACROSS AWARENESS LEVELS: Use only the bucket that matches this ad's awareness classification.
4. COUNT-BASED CLAIMS REQUIRE COUNTS: "in 5 of 6 PROBLEM_AWARE winners (W1, W3, W7, W9, W11)". A claim without a count is invalid.
5. NO EXAMPLE = NO CLAIM: If no example in the relevant bucket supports a claim, do not make it.
`)

  // Block 0 — Learned Guard Rails
  if (frameworkPrinciples.length > 0) {
    lines.push('═══════════════════════════════════════════════════════════════')
    lines.push('LEARNED GUARD RAILS — derived from accumulated historical data')
    lines.push('These supplement and OVERRIDE the static framework where they conflict.')
    lines.push('Each rule cites the winner/loser examples that produced it.')
    lines.push('═══════════════════════════════════════════════════════════════')
    frameworkPrinciples.forEach((g, i) => {
      const scope = `scope=${g.scope_awareness ?? 'global'}/${g.scope_sophistication !== null ? `soph=${g.scope_sophistication}` : 'any-soph'}`
      lines.push(`G${i + 1}. [framework, conf=${g.confidence}, ${scope}]`)
      lines.push(`    "${g.rule_text}"`)
    })
    lines.push('')
  }

  if (patterns.length > 0) {
    lines.push(`--- Winning Ad Patterns (derived from ads with $${WINNER_THRESHOLD_USD}+ spend) — cite as [P<n>] in pattern_matches ---`)
    patterns.forEach((p, i) => {
      lines.push(`[P${i + 1}] [${p.category}] ${p.rule_text}`)
    })
    lines.push('')
  }

  if (losingPatterns.length > 0) {
    lines.push(`--- Anti-Patterns (from ads <$${WINNER_THRESHOLD_USD} spend — treat as warnings) — cite as [A<n>] in pattern_matches ---`)
    losingPatterns.forEach((p, i) => {
      lines.push(`[A${i + 1}] [${p.category}] ${p.rule_text} (seen in ${p.loser_count} losers, confidence: ${p.confidence})`)
    })
    lines.push('')
  }

  // Block 3 — Winners by awareness level
  if (winningExamples.length > 0) {
    lines.push('--- WINNING AD EXAMPLES — grouped by audience awareness level ---')
    AWARENESS_BUCKETS.forEach(awareness => {
      const bucket = winningExamples.filter(ex => {
        const ca = ex.comprehensive_analysis as unknown as ComprehensiveAnalysis | null
        return ca?.market_context?.awareness_level === awareness
      })
      if (bucket.length === 0) return
      const compact = bucket.length > 30
      lines.push('')
      lines.push(`▶ ${awareness.toUpperCase()} winners (${bucket.length} total):`)
      bucket.forEach((ex, i) => {
        lines.push(...fingerprintAd('Example W', i + 1, ex, compact))
      })
    })
    lines.push('')
  }

  // Block 4 — Losers by awareness level
  if (losingExamples.length > 0) {
    lines.push(`--- LOSING AD EXAMPLES — grouped by audience awareness level (<$${WINNER_THRESHOLD_USD} spend) ---`)
    AWARENESS_BUCKETS.forEach(awareness => {
      const bucket = losingExamples.filter(ex => {
        const ca = ex.comprehensive_analysis as unknown as ComprehensiveAnalysis | null
        return ca?.market_context?.awareness_level === awareness
      })
      if (bucket.length === 0) return
      const compact = bucket.length > 30
      lines.push('')
      lines.push(`▶ ${awareness.toUpperCase()} losers (${bucket.length} total):`)
      bucket.forEach((ex, i) => {
        lines.push(...fingerprintAd('Example L', i + 1, ex, compact))
      })
    })
    lines.push('')
  }

  return lines.join('\n')
}

const ROI_AD_CONTEXT = `ROI interpretation for paid media:
- FFA (Face Detection): High = face/person anchoring attention — drives emotion and trust. Low = no human element — consider adding a face if the product allows.
- V1_V2 (Low-Level Visual): High = strong edges/contrast — scroll-stopping in feed. Low = flat visual — will blend in and be ignored.
- V4 (Color/Form): High = vivid, distinctive colors — aids brand recall. Low = muted palette — will not differentiate on a crowded feed.
- LO (Object Recognition): High = product/objects clearly identifiable. Low = visual is ambiguous — viewer won't immediately know what's being sold.
- PPA (Scene Recognition): High = environment/context is readable — good for lifestyle positioning. Low = no scene context.
- VWFA (Text Processing): High = text is legible and competing for visual attention. Low = text too small or contrast insufficient.`

const ROI_AD_CONTEXT_HISTORICAL = `ROI signals (descriptive only):
- FFA (Face Detection): High = face/face-like element anchoring attention. Low = no human anchor; the ad relies on non-human visual elements.
- V1_V2 (Low-Level Visual): High = strong edges/contrast driving feed disruption. Low = flat visual; this ad relies on text or color rather than edge density.
- V4 (Color/Form): High = vivid distinctive palette aiding brand recall. Low = muted palette; differentiation comes from another dimension.
- LO (Object Recognition): High = product/objects clearly identifiable as units. Low = visual is abstract or close-cropped; the product reads as texture rather than object.
- PPA (Scene Recognition): High = environment/context readable; lifestyle positioning. Low = no scene context; isolated subject framing.
- VWFA (Text Processing): High = text is legible and competing for visual attention. Low = text is minimal or de-prioritized; visual carries the message.`

const STATIC_FRAMEWORK_BASELINE = `STATIC FRAMEWORK BASELINE (apply when no LEARNED GUARD RAIL in Block 0 supersedes):

Copywriting framework (minimum-viable-copy principle — apply strictly):
- Start with the minimum. Add an element ONLY when the previous one leaves something unresolved.
- Headline: Aim for maximum impact with minimum words. If an 11-word headline can say the same thing in 5 words without losing meaning, emotional specificity, identity, or audience fit — it should. Length is justified only when every word is load-bearing. Rhythm, flavor, or repetition of the visual do not justify extra words. Headlines longer than 5 words ARE acceptable when each word carries unique weight that cannot be cut.
- Subheadline: Justified ONLY if headline leaves "so what?" unanswered. If headline is complete, subheadline is clutter.
- Benefits: Justified ONLY if the audience needs to justify the decision (not just desire it). Each benefit should answer a specific objection — not restate the headline.
- Trust signal: Default ON for health, money, significant life changes. Otherwise start without and test.
- CTA: Justified ONLY if the next step is unclear OR there is a specific offer worth leading with.

Awareness levels (Eugene Schwartz — assess which level this ad targets):
- Unaware: viewer doesn't know they have a problem. Ad must surface pain first.
- Problem-aware: knows the problem, not the solution category. Ad bridges problem to solution type.
- Solution-aware: knows solutions exist, not this product specifically. Ad differentiates.
- Product-aware: knows this product, hasn't committed. Ad removes barriers or sharpens offer.
- Most-aware: knows the product well, just needs an offer or trigger. Minimal copy, max offer.

Market sophistication levels (1 = low saturation, 5 = highly saturated/jaded):
- Level 1: First-to-market claim. A bold direct claim wins. No mechanism needed.
- Level 2: Market has seen claims. A bigger, more specific claim needed.
- Level 3: Claims saturated. The MECHANISM (how it works) is the differentiator.
- Level 4: Mechanisms saturated. IDENTIFICATION — "for people like you" — is the differentiator.
- Level 5: Everything saturated. SENSATION and experience are the only differentiators.

Congruence principle — every element must reinforce the same core message:
- Headline and visual must tell the same story with no ambiguity.
- Subheadline must resolve the specific tension the headline creates — not introduce a new topic.
- Body must elaborate the headline's promise. If headline is about energy but body talks about sleep mechanics with no energy connection, that is incoherence.
- Each benefit must be a direct consequence of the core mechanism — tangential benefits dilute focus.
- CTA must match the offer or ask — "Shop now" without a visible product or price is incoherent.
- Trust signals must validate the specific claim made, not a different dimension entirely.`

function buildBergPrompt(roiAverages: ROIAverage[], patternContext: string, visualDescription?: string, mode?: string, spendUsd?: number): string {
  const scoreLines = roiAverages
    .map(r => `- ${r.label} (${r.region_key}): ${r.activation.toFixed(3)} — ${r.description}`)
    .join('\n')

  const isLoser = mode === 'historical' && spendUsd !== undefined && spendUsd < WINNER_THRESHOLD_USD
  const isWinner = mode === 'historical' && !isLoser

  const roiContext = mode === 'historical' ? ROI_AD_CONTEXT_HISTORICAL : ROI_AD_CONTEXT

  let ending: string
  if (isLoser) {
    ending = `For each ROI: name it, quote the score, write 2 sentences explaining what its activation level reveals about why this ad failed to generate meaningful spend ($${spendUsd}). Pure observation — no recommendations, no "consider", no "test", no "darken".

GOOD: "V1_V2 — 0.415: Low edge density means the visual did not disrupt the scroll; with $${spendUsd} spend, this confirms the image failed to earn the stop that would have made the headline readable."

BAD: "V1_V2 — 0.415: Low contrast. Darken the background to push edge density and improve scroll-stopping power."

Format as a markdown bulleted list.`
  } else if (isWinner) {
    ending = `For each ROI: name it, quote the score, write 2 sentences explaining what its activation level reveals about this ad's effectiveness for this audience and category. Pure observation — no third sentence with recommendations, no "consider", no "test", no "darken", no "push closer to threshold".

GOOD: "VWFA — 1.000: Text is fully commanding visual attention; this is the single strongest signal in this creative. At high spend in a problem-aware audience, the audience reads this ad more than they recognize the product, and that trade-off worked for this conversion mechanic."

BAD: "VWFA — 1.000: Text is fully commanding attention. Audit the text hierarchy to ensure the offer line occupies the dominant position."

Format as a markdown bulleted list.`
  } else {
    ending = `Give 5–6 specific, actionable recommendations. For each: name the ROI, quote its score, state the ad-performance implication and the exact change to make. Two sentences max — no filler. Reference winning patterns above where relevant.\n\nFormat as a markdown bulleted list.`
  }

  return `You are interpreting BERG fMRI brain activation predictions for a static ad image.

${roiContext}

BERG brain activation scores:
${scoreLines}
${visualDescription ? `\nConfirmed visual content: "${visualDescription}"\n` : ''}
IMPORTANT — interpretation context:
BERG scores model how neural regions respond to low-level visual properties (edges, spatial frequencies, color distributions). They are NOT object detectors.
High FFA on an image with no faces means the visual patterns (curves, skin-tone-like colors, oval shapes) incidentally activated face-processing — not that a face is present.

For each ROI:
- High score + element present in confirmed visual: strong creative signal.
- High score + visual description contradicts element presence: flag as incidental. Example: "FFA elevated despite no human face — likely reflects shape/tonal properties, not a usable face signal."
- Base all analysis on what is actually in the image.
${patternContext ? `\n${patternContext}\n` : ''}
${ending}`
}

function buildConfirmedElementsBlock(confirmed: ExtractedElements): string {
  const lines = ['--- Confirmed ad element extraction (user-verified — use as ground truth, do not re-extract) ---']

  if (confirmed.headline) {
    lines.push(`Headline: "${confirmed.headline}"`)
    const h = confirmed.headline_dna
    if (h) {
      lines.push(`  - words=${h.word_count ?? '?'}, chars=${h.char_count ?? '?'}, reading_level=${h.reading_level ?? '?'}`)
      lines.push(`  - voice=${h.voice ?? '?'}, person=${h.person ?? '?'}, tense=${h.tense ?? '?'}, sentence_type=${h.sentence_type ?? '?'}`)
      lines.push(`  - structure=${h.structure_type ?? '?'}, specificity=${h.specificity_level ?? '?'}, mechanism=${h.mechanism_present}, audience_explicit=${h.audience_explicit}`)
      lines.push(`  - outcome=${h.outcome_explicit}, time_bound=${h.time_bound}, number=${h.number_present}, power_words=[${h.power_words.join(', ')}]`)
      lines.push(`  - emotional_register=${h.emotional_register ?? '?'}, tone=${h.tone_register ?? '?'}`)
      lines.push(`  - metaphor=${h.uses_metaphor}, negation=${h.uses_negation}, contrast=${h.uses_contrast}, punctuation=[${h.punctuation_signals.join(', ')}]`)
    }
  }

  if (confirmed.subheadline) {
    lines.push(`Subheadline: "${confirmed.subheadline}"`)
    const s = confirmed.subheadline_dna
    if (s) {
      lines.push(`  - words=${s.word_count ?? '?'}, chars=${s.char_count ?? '?'}, length_relative=${s.length_relative_to_headline ?? '?'}`)
      lines.push(`  - role=${s.role ?? '?'}, introduces_mechanism=${s.introduces_mechanism}, introduces_proof=${s.introduces_proof}, introduces_specificity=${s.introduces_specificity}, introduces_audience=${s.introduces_audience}`)
      lines.push(`  - person_continuity=${s.person_continuity ?? '?'}, tonal_shift=${s.tonal_shift ?? '?'}, register=${s.emotional_register ?? '?'}, tense=${s.tense ?? '?'}`)
    }
  } else {
    lines.push(`Subheadline: absent`)
  }

  if (confirmed.body_copy) {
    lines.push(`Body copy: "${confirmed.body_copy}"`)
    const b = confirmed.body_dna
    if (b) {
      lines.push(`  - words=${b.word_count ?? '?'}, paragraphs=${b.paragraph_count ?? '?'}, sentences=${b.sentence_count ?? '?'}, avg_sentence_length=${b.avg_sentence_length ?? '?'}`)
      lines.push(`  - frame=${b.frame ?? '?'}, personal_pronoun_density=${b.personal_pronoun_density ?? '?'}`)
    }
  }

  if (confirmed.benefits.length) {
    lines.push(`Benefits (${confirmed.benefits.length}): ${confirmed.benefits.map(b => `"${b}"`).join(', ')}`)
    const bd = confirmed.benefits_dna
    if (bd) {
      lines.push(`  - avg_words=${bd.avg_word_count ?? '?'}, pattern_uniformity=${bd.pattern_uniformity ?? '?'}, outcome_vs_feature=${bd.outcome_vs_feature_split ?? '?'}, specificity=${bd.specificity ?? '?'}`)
    }
  }

  if (confirmed.trust_signals.length) {
    lines.push(`Trust signals (${confirmed.trust_signals.length}): ${confirmed.trust_signals.join(', ')}`)
    const t = confirmed.trust_dna
    if (t) {
      lines.push(`  - types=[${t.types_present.join(', ')}], specific_quantifiers=${t.has_specific_quantifiers}, attribution=${t.source_attribution ?? '?'}`)
    }
  }

  if (confirmed.safety_signals.length) lines.push(`Safety signals: ${confirmed.safety_signals.join(', ')}`)
  if (confirmed.proof_signals.length) lines.push(`Proof signals: ${confirmed.proof_signals.join(', ')}`)

  if (confirmed.cta) {
    lines.push(`CTA: "${confirmed.cta}"`)
    const c = confirmed.cta_dna
    if (c) {
      lines.push(`  - verb=${c.verb ?? '?'}, words=${c.word_count ?? '?'}, framing=${c.framing ?? '?'}, friction=${c.friction_level ?? '?'}, value_anchor=${c.has_value_anchor}, urgency=${c.has_urgency_signal}`)
    }
  }

  if (confirmed.offer_details) lines.push(`Offer: "${confirmed.offer_details}"`)

  lines.push(`Composition: ${confirmed.composition_tag}`)
  lines.push(`Visual: ${confirmed.visual_description}`)
  lines.push(`Format type (user estimate): ${confirmed.ad_format_guess}`)
  return lines.join('\n')
}

const REWRITE_FEEDBACK_BLOCK = `"<null when score >= 7. When score < 7, an object: { 'proposed_text': '<ship-ready copy>', 'rationale': '<DNA dimensions changed and why this lifts the score>', 'expected_lift': '<projected score change + library citation or honest no-analog note>', 'dna_changes': { '<dimension>': '<new value>' } }>"`

const LIBRARY_ALIGNMENT_BLOCK = `{ "winner_matches": ["<W1>","<W3>"], "loser_matches": ["<L2>"], "verdict": "<aligned_with_winners | aligned_with_losers | mixed | no_analog>", "winning_dna_dimensions": ["<dim>"], "losing_dna_dimensions": ["<dim>"] }`

const COMPREHENSIVE_JSON_SCHEMA = `{
  "copy": {
    "headline": {
      "text": "<exact text or null>",
      "clarity": <1-10>, "urgency": <1-10>, "relevance": <1-10>,
      "feedback": "<two sentences — MUST agree with the scores above; do not name a flaw if min(clarity,urgency,relevance) >= 7>",
      "dna": "<HeadlineDNA object — mirror confirmed_elements.headline_dna; only override a field if the visual clearly contradicts it>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": ${REWRITE_FEEDBACK_BLOCK}
    },
    "subheadline": {
      "text": "<exact text or null>", "supports_headline": <true/false>, "clarity": <1-10>,
      "feedback": "<one sentence — must agree with score>",
      "dna": "<SubheadlineDNA object>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": "<null when clarity >= 7 AND supports_headline=true. Otherwise object with proposed_text OR proposed_action ('remove'), rationale, expected_lift, dna_changes>"
    },
    "benefits_features": {
      "identified": ["<benefit 1>"],
      "clarity": <1-10>, "prominence": <1-10>,
      "feedback": "<two sentences — must agree with min(clarity,prominence)>",
      "dna": "<BenefitsDNA object>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": "<null when min(clarity,prominence) >= 7. Otherwise object with proposed_benefits (string[]), proposed_count, rationale, expected_lift>"
    },
    "trust_signals": {
      "identified": ["<signal>"], "strength": <1-10>,
      "feedback": "<two sentences — must agree with strength>",
      "dna": "<TrustDNA object>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": "<null when strength >= 7. Otherwise object with proposed_signals (string[]) OR proposed_action ('remove_or_replace'), rationale, expected_lift>"
    },
    "safety_signals": {
      "identified": ["<signal>"], "strength": <1-10>,
      "feedback": "<two sentences — must agree with strength>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": "<null when strength >= 7. Otherwise object same shape as trust_signals.rewrite>"
    },
    "proof_signals": {
      "identified": ["<verbatim proof claim from confirmed_elements.proof_signals: 'Clinically tested', 'Before/after shown', '3x faster in study', etc.>"],
      "strength": <1-10 — strength of evidence-based claims; 1=none/weak, 10=multiple specific quantified studies/clinical results>,
      "feedback": "<two sentences — must agree with strength; describe whether proof claims address audience skepticism for this awareness/sophistication segment>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": "<null when strength >= 7. Otherwise object: { 'proposed_signals': ['<specific proof claim>'], 'rationale': '<one sentence on which evidence type would lift conversion>', 'expected_lift': '<projected strength change + library citation>' }>"
    },
    "cta": {
      "text": "<exact text or null>", "clarity": <1-10>, "placement": "<location>", "contrast": <1-10>,
      "feedback": "<two sentences — must agree with min(clarity,contrast)>",
      "dna": "<CtaDNA object>",
      "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
      "rewrite": "<null when min(clarity,contrast) >= 7. Otherwise object with proposed_text, dna_changes (verb/framing/friction), rationale, expected_lift>"
    }
  },
  "body_dna": "<BodyDNA object or null — mirror confirmed_elements.body_dna>",
  "composition_tag": "<canonical composition tag from confirmed_elements.composition_tag>",
  "behavioral_economics": {
    "scarcity":      { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<null when present=false OR strength >= 7. Otherwise object: { 'proposed_change': '<one specific structural change>', 'rationale': '<DNA dimensions changed>', 'expected_lift': '<projected strength change + library citation>' }>" },
    "urgency":       { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<same shape as scarcity.rewrite>" },
    "social_proof":  { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<same shape as scarcity.rewrite>" },
    "anchoring":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<same shape as scarcity.rewrite>" },
    "loss_aversion": { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<same shape as scarcity.rewrite>" },
    "authority":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<same shape as scarcity.rewrite>" },
    "reciprocity":   { "present": <true/false>, "strength": <0-10>, "note": "<one sentence — must agree with strength>", "rewrite": "<same shape as scarcity.rewrite>" },
    "overall_feedback": "<two sentences>"
  },
  "neuroscience": {
    "attention_prediction": "<one-two sentences: what captures attention first and why>",
    "emotional_encoding":   "<one-two sentences: emotional response likely triggered>",
    "memory_encoding":      "<one-two sentences: how memorable and what aids or hinders recall>",
    "feedback":             "<two sentences: top neuroscience recommendation>"
  },
  "visual_dimensions": {
    "cta_strength":     { "score": <1-10>, "feedback": "<two sentences — must agree with score>", "rewrite": "<null when score >= 7. Otherwise object: { 'proposed_change': '<structural visual fix>', 'rationale': '<why>', 'expected_lift': '<projected score change>' }>" },
    "emotional_appeal": { "score": <1-10>, "feedback": "<two sentences — must agree with score>", "rewrite": "<same shape>" },
    "brand_clarity":    { "score": <1-10>, "feedback": "<two sentences — must agree with score>", "rewrite": "<same shape>" },
    "visual_hierarchy": { "score": <1-10>, "feedback": "<two sentences — must agree with score>", "rewrite": "<same shape>" }
  },
  "pattern_matches": ["<verbatim rule from the synthesized library, MUST be prefixed with the bracketed library index e.g. '[P3] <rule text>' for winning patterns this ad satisfies, or '[A2] <rule text>' for anti-patterns this ad embodies. Never paraphrase. Never include a rule without its bracketed index.>"],
  "overall": {
    "verdict":           "<three-four sentences: overall assessment>",
    "top_strength":      "<one sentence: strongest element with specific reason>",
    "critical_weakness": "<one sentence: biggest weakness with specific reason>",
    "priority_fix":      "<one sentence: single highest-priority change>"
  },
  "market_context": {
    "awareness_level": "<one of: unaware | problem_aware | solution_aware | product_aware | most_aware>",
    "awareness_reasoning": "<one sentence: why this awareness level>",
    "sophistication_level": <1-5>,
    "sophistication_reasoning": "<one sentence: why this sophistication level>"
  },
  "ad_format": {
    "type": "<one of: direct_response | native_ugc | advertorial | brand_awareness | product_demo | testimonial | hybrid>",
    "composition": {
      "has_headline": <true/false>,
      "has_subheadline": <true/false>,
      "has_body_copy": <true/false>,
      "has_benefits_list": <true/false>,
      "has_trust_signals": <true/false>,
      "has_cta": <true/false>,
      "has_price_or_offer": <true/false>,
      "is_visual_dominant": <true/false>,
      "is_text_heavy": <true/false>
    },
    "format_assessment": "<one sentence: does the format match the likely intent and awareness level>"
  },
  "hook_analysis": {
    "scroll_stop_score": <1-10>,
    "pattern_interrupt": "<what specific element(s) would stop the scroll>",
    "first_half_second": "<what the eye hits first and why it works or doesn't for this audience>",
    "hook_feedback": "<one sentence — if scroll_stop_score >= 7 describe the working pattern interrupt; if <7 propose a specific change>",
    "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
    "rewrite": "<null when scroll_stop_score >= 7. Otherwise object: { 'proposed_pattern_interrupt': '<change to first half-second>', 'rationale': '<why>', 'expected_lift': '<projected score + library citation>' }>"
  },
  "offer_architecture": {
    "offer_present": <true/false>,
    "offer_text": "<exact offer text or null>",
    "has_price_anchor": <true/false>,
    "has_guarantee": <true/false>,
    "has_urgency_mechanism": <true/false>,
    "has_trial_or_free": <true/false>,
    "perceived_value_score": <1-10>,
    "offer_clarity_score": <1-10>,
    "offer_feedback": "<two sentences — must agree with min(perceived_value_score, offer_clarity_score)>",
    "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
    "rewrite": "<null when min(perceived_value_score, offer_clarity_score) >= 7. Otherwise object: { 'proposed_offer_text': '<ship-ready offer>', 'rationale': '<dimensions changed: anchor/guarantee/urgency/trial>', 'expected_lift': '<projected scores + library citation>' }>"
  },
  "cognitive_load": {
    "score": <1-10, where 1=effortless and 10=overwhelming — INVERTED scale: low score = effective; high score = failure>,
    "density": "<one of: minimal | moderate | heavy>",
    "overload_risk": "<what specific element(s) are contributing to overload, or 'none' — must agree with score: praise simplicity when score <= 3, name overload sources when score >= 7>",
    "simplification": "<one specific change to reduce cognitive load — or 'none required' when score <= 3>",
    "rewrite": "<null when score <= 6. When score > 6 (high load = bad), object: { 'proposed_action': '<one of: remove_subheadline | trim_benefits | shorten_headline | remove_trust_block>', 'rationale': '<which element creates overload>', 'expected_lift': '<projected score after subtraction>' }>"
  },
  "framework_score": {
    "minimum_viable_test": "<pass or fail: does every word in the headline earn its place — could any word be cut without losing meaning, impact, emotional specificity, or audience fit?>",
    "headline_leaves_gap": <true/false>,
    "subheadline_justified": <true/false>,
    "benefits_justified": <true/false>,
    "trust_signal_justified": <true/false>,
    "cta_justified": <true/false>,
    "overall_framework_grade": "<A | B | C | D — A=9-10, B=7-8, C=4-6, D=1-3>",
    "framework_feedback": "<two sentences — must agree with grade; do not flag a flaw if grade is A>"
  },
  "congruence": {
    "overall_score": <1-10, where 10=fully congruent>,
    "headline_to_visual":       { "aligned": <true/false>, "note": "<one sentence>" },
    "headline_to_subheadline":  { "aligned": <true/false>, "note": "<one sentence>" },
    "body_to_headline":         { "aligned": <true/false>, "note": "<one sentence>" },
    "benefits_to_headline":     { "aligned": <true/false>, "note": "<one sentence>" },
    "cta_to_offer":             { "aligned": <true/false>, "note": "<one sentence>" },
    "trust_signals_to_claim":   { "aligned": <true/false>, "note": "<one sentence>" },
    "incoherence_summary": "<one sentence: primary mismatch, or 'No incoherence detected'>",
    "fix": "<single most important change to improve congruence>",
    "library_alignment": ${LIBRARY_ALIGNMENT_BLOCK},
    "rewrite": "<null when overall_score >= 7. Otherwise object: { 'proposed_action': '<which alignment to fix and proposed reword>', 'rationale': '<why>', 'expected_lift': '<projected score change>' }>"
  },
  "combination_analysis": {
    "current_combination": "<copy from composition_tag>",
    "combination_assessment": "<two sentences: is this combination appropriate for this ad's awareness/sophistication and creative intent?>",
    "historical_match": {
      "winners_with_same_combo_in_segment": <integer count>,
      "losers_with_same_combo_in_segment": <integer count>,
      "winner_examples": ["<W1>", "<W7>"],
      "loser_examples": ["<L2>"],
      "verdict": "<one of: strong_winner_pattern | mixed_record | mostly_loser_pattern | no_segment_data>",
      "verdict_reasoning": "<one sentence: what the counts and examples show>"
    },
    "alternative_combination": "<null when current is optimal. Otherwise object: { 'recommended': '<composition_tag>', 'intent': '<replacement | test_variant>', 'rationale': '<two sentences citing Block 0 learned rules and/or specific winner examples>', 'element_changes': { 'headline': '<new text or unchanged or remove>', 'subheadline': '<new text or unchanged or remove>', 'benefits': ['<benefit>'] | 'unchanged' | 'remove' | 'trim_to_2', 'trust_signals': ['<signal>'] | 'unchanged' | 'remove', 'cta': '<new text or unchanged>', 'offer': '<new text or unchanged or remove>' }, 'predicted_impact': '<one sentence: which scores improve and which segment-pattern this matches>' }>"
  }
}`

const COMPREHENSIVE_JSON_SCHEMA_HISTORICAL = `{
  "copy": {
    "headline": {
      "text": "<exact text or null>", "clarity": <1-10>, "urgency": <1-10>, "relevance": <1-10>,
      "feedback": "<two sentences — must agree with scores; describe what this headline reveals about WHY this winning ad worked>",
      "dna": "<HeadlineDNA object — mirror confirmed_elements.headline_dna; only override if visual contradicts>"
    },
    "subheadline": {
      "text": "<exact text or null>", "supports_headline": <true/false>, "clarity": <1-10>,
      "feedback": "<one sentence — must agree with score; describe what the subheadline's presence or absence reveals>",
      "dna": "<SubheadlineDNA object>"
    },
    "benefits_features": {
      "identified": ["<benefit 1>"], "clarity": <1-10>, "prominence": <1-10>,
      "feedback": "<two sentences — must agree with min(clarity,prominence); describe benefit structure relative to audience>",
      "dna": "<BenefitsDNA object>"
    },
    "trust_signals": {
      "identified": ["<signal>"], "strength": <1-10>,
      "feedback": "<two sentences — must agree with strength>",
      "dna": "<TrustDNA object>"
    },
    "safety_signals": {
      "identified": ["<signal>"], "strength": <1-10>,
      "feedback": "<two sentences — must agree with strength>"
    },
    "proof_signals": {
      "identified": ["<verbatim proof claim from confirmed_elements.proof_signals>"],
      "strength": <1-10 — strength of evidence-based claims>,
      "feedback": "<two sentences: describe what proof architecture this winning ad uses and what it reveals about audience skepticism>"
    },
    "cta": {
      "text": "<exact text or null>", "clarity": <1-10>, "placement": "<location>", "contrast": <1-10>,
      "feedback": "<two sentences — must agree with min(clarity,contrast)>",
      "dna": "<CtaDNA object>"
    }
  },
  "body_dna": "<BodyDNA object or null>",
  "composition_tag": "<canonical composition tag from confirmed_elements.composition_tag>",
  "behavioral_economics": {
    "scarcity":      { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "urgency":       { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "social_proof":  { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "anchoring":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "loss_aversion": { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "authority":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "reciprocity":   { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "overall_feedback": "<two sentences: which BE levers carry the conversion load and what that reveals>"
  },
  "neuroscience": {
    "attention_prediction": "<one-two sentences: what captures attention first and why>",
    "emotional_encoding":   "<one-two sentences: emotional response likely triggered>",
    "memory_encoding":      "<one-two sentences: how memorable and what aids or hinders recall>",
    "feedback":             "<two sentences: top neural processing insight about why this ad works>"
  },
  "visual_dimensions": {
    "cta_strength":     { "score": <1-10>, "feedback": "<two sentences: observation about this dimension's role in this ad's effectiveness>" },
    "emotional_appeal": { "score": <1-10>, "feedback": "<two sentences: observation about this dimension's role in this ad's effectiveness>" },
    "brand_clarity":    { "score": <1-10>, "feedback": "<two sentences: observation about this dimension's role in this ad's effectiveness>" },
    "visual_hierarchy": { "score": <1-10>, "feedback": "<two sentences: observation about this dimension's role in this ad's effectiveness>" }
  },
  "pattern_matches": ["<verbatim rule from the synthesized library, MUST be prefixed with the bracketed library index e.g. '[P3] <rule text>' for winning patterns this ad satisfies, or '[A2] <rule text>' for anti-patterns this ad embodies. Never paraphrase. Never include a rule without its bracketed index.>"],
  "overall": {
    "verdict":           "<three-four sentences: overall assessment of why this ad worked>",
    "top_strength":      "<one sentence: strongest element with specific reason>",
    "critical_weakness": "<one sentence: single notable structural absence and what it reveals about audience tolerance>",
    "priority_fix":      "<one sentence: single most transferable creative insight from this ad's structure>"
  },
  "market_context": {
    "awareness_level": "<one of: unaware | problem_aware | solution_aware | product_aware | most_aware>",
    "awareness_reasoning": "<one sentence: why this awareness level>",
    "sophistication_level": <1-5>,
    "sophistication_reasoning": "<one sentence: why this sophistication level>"
  },
  "ad_format": {
    "type": "<one of: direct_response | native_ugc | advertorial | brand_awareness | product_demo | testimonial | hybrid>",
    "composition": {
      "has_headline": <true/false>,
      "has_subheadline": <true/false>,
      "has_body_copy": <true/false>,
      "has_benefits_list": <true/false>,
      "has_trust_signals": <true/false>,
      "has_cta": <true/false>,
      "has_price_or_offer": <true/false>,
      "is_visual_dominant": <true/false>,
      "is_text_heavy": <true/false>
    },
    "format_assessment": "<one sentence: what this format reveals about audience match and conversion intent>"
  },
  "hook_analysis": {
    "scroll_stop_score": <1-10>,
    "pattern_interrupt": "<what specific element(s) stopped the scroll>",
    "first_half_second": "<what the eye hits first and why it works for this audience>",
    "hook_feedback": "<one sentence: what this hook's effectiveness reveals about audience attention in this vertical>"
  },
  "offer_architecture": {
    "offer_present": <true/false>,
    "offer_text": "<exact offer text or null>",
    "has_price_anchor": <true/false>,
    "has_guarantee": <true/false>,
    "has_urgency_mechanism": <true/false>,
    "has_trial_or_free": <true/false>,
    "perceived_value_score": <1-10>,
    "offer_clarity_score": <1-10>,
    "offer_feedback": "<two sentences: what the offer architecture reveals about decision pathway here>"
  },
  "cognitive_load": {
    "score": <1-10, where 1=effortless and 10=overwhelming — INVERTED scale>,
    "density": "<one of: minimal | moderate | heavy>",
    "overload_risk": "<what specific element(s) are contributing to overload, or 'none' — must agree with score>",
    "simplification": "<one sentence: what this load level reveals about minimum-viable copy in this category>"
  },
  "framework_score": {
    "minimum_viable_test": "<pass or fail: does every word in the headline earn its place — could any word be cut without losing meaning, impact, emotional specificity, or audience fit?>",
    "headline_leaves_gap": <true/false>,
    "subheadline_justified": <true/false>,
    "benefits_justified": <true/false>,
    "trust_signal_justified": <true/false>,
    "cta_justified": <true/false>,
    "overall_framework_grade": "<A | B | C | D — A=9-10, B=7-8, C=4-6, D=1-3>",
    "framework_feedback": "<two sentences — must agree with grade>"
  },
  "congruence": {
    "overall_score": <1-10, where 10=fully congruent>,
    "headline_to_visual":       { "aligned": <true/false>, "note": "<one sentence>" },
    "headline_to_subheadline":  { "aligned": <true/false>, "note": "<one sentence>" },
    "body_to_headline":         { "aligned": <true/false>, "note": "<one sentence>" },
    "benefits_to_headline":     { "aligned": <true/false>, "note": "<one sentence>" },
    "cta_to_offer":             { "aligned": <true/false>, "note": "<one sentence>" },
    "trust_signals_to_claim":   { "aligned": <true/false>, "note": "<one sentence>" },
    "incoherence_summary": "<one sentence: primary mismatch, or 'No incoherence detected'>",
    "fix": "<one sentence: what the congruence pattern reveals about effective creative architecture here>"
  },
  "combination_analysis": {
    "current_combination": "<copy from composition_tag>",
    "combination_assessment": "<two sentences: what this combination reveals about effective creative architecture for this segment>",
    "historical_match": {
      "winners_with_same_combo_in_segment": <integer count>,
      "losers_with_same_combo_in_segment": <integer count>,
      "winner_examples": ["<W1>"],
      "loser_examples": ["<L2>"],
      "verdict": "<strong_winner_pattern | mixed_record | mostly_loser_pattern | no_segment_data>",
      "verdict_reasoning": "<one sentence>"
    },
    "alternative_combination": "<For winners with all elements 7+: null (combination is optimal). Otherwise object: { 'recommended': '<composition_tag>', 'intent': 'test_variant', 'rationale': '<two sentences: which DNA dimension would extend the working pattern, citing Block 0 learned rules and specific winner examples>', 'element_changes': { 'headline': '<new text or unchanged>', 'subheadline': '<new text or unchanged or remove>', 'benefits': ['<benefit>'] | 'unchanged' | 'remove' | 'trim_to_2', 'trust_signals': ['<signal>'] | 'unchanged' | 'remove', 'cta': '<new text or unchanged>', 'offer': '<new text or unchanged or remove>' }, 'predicted_impact': '<one sentence: which segment-pattern this would extend>' }>"
  }
}`


const COMPREHENSIVE_JSON_SCHEMA_LOSER = `{
  "copy": {
    "headline": {
      "text": "<exact text or null>", "clarity": <1-10>, "urgency": <1-10>, "relevance": <1-10>,
      "feedback": "<two sentences — must agree with scores; describe what this headline reveals about WHY this losing ad failed>",
      "dna": "<HeadlineDNA object — mirror confirmed_elements.headline_dna>"
    },
    "subheadline": {
      "text": "<exact text or null>", "supports_headline": <true/false>, "clarity": <1-10>,
      "feedback": "<one sentence — must agree with score; describe structural failure>",
      "dna": "<SubheadlineDNA object>"
    },
    "benefits_features": {
      "identified": ["<benefit 1>"], "clarity": <1-10>, "prominence": <1-10>,
      "feedback": "<two sentences — must agree with min(clarity,prominence)>",
      "dna": "<BenefitsDNA object>"
    },
    "trust_signals": {
      "identified": ["<signal>"], "strength": <1-10>,
      "feedback": "<two sentences — must agree with strength>",
      "dna": "<TrustDNA object>"
    },
    "safety_signals": {
      "identified": ["<signal>"], "strength": <1-10>,
      "feedback": "<two sentences — must agree with strength>"
    },
    "proof_signals": {
      "identified": ["<verbatim proof claim from confirmed_elements.proof_signals>"],
      "strength": <1-10 — strength of evidence-based claims>,
      "feedback": "<two sentences: describe what proof gap or absence reveals about why this losing ad failed to overcome audience skepticism>"
    },
    "cta": {
      "text": "<exact text or null>", "clarity": <1-10>, "placement": "<location>", "contrast": <1-10>,
      "feedback": "<two sentences — must agree with min(clarity,contrast)>",
      "dna": "<CtaDNA object>"
    }
  },
  "body_dna": "<BodyDNA object or null>",
  "composition_tag": "<canonical composition tag from confirmed_elements.composition_tag>",
  "behavioral_economics": {
    "scarcity":      { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "urgency":       { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "social_proof":  { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "anchoring":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "loss_aversion": { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "authority":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "reciprocity":   { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "overall_feedback": "<two sentences: which BE levers are absent or weak and what that reveals about why conversion stalled>"
  },
  "neuroscience": {
    "attention_prediction": "<one-two sentences: what captures attention first and why>",
    "emotional_encoding":   "<one-two sentences: emotional response likely triggered>",
    "memory_encoding":      "<one-two sentences: how memorable and what aids or hinders recall>",
    "feedback":             "<two sentences: top neural processing insight about why this ad failed to hold attention or drive action>"
  },
  "visual_dimensions": {
    "cta_strength":     { "score": <1-10>, "feedback": "<two sentences: what this score reveals about why the ad failed to drive action>" },
    "emotional_appeal": { "score": <1-10>, "feedback": "<two sentences: what this score reveals about the emotional failure mode>" },
    "brand_clarity":    { "score": <1-10>, "feedback": "<two sentences: what this score reveals about why brand registration failed>" },
    "visual_hierarchy": { "score": <1-10>, "feedback": "<two sentences: what this score reveals about how hierarchy limited performance>" }
  },
  "pattern_matches": ["<verbatim rule from the synthesized library, MUST be prefixed with the bracketed library index e.g. '[A3] <rule text>' for anti-patterns this ad embodies, or '[P2] <rule text>' for winning rules this ad violated. Never paraphrase. Never include a rule without its bracketed index.>"],
  "overall": {
    "verdict":           "<three-four sentences: why this ad failed to achieve meaningful spend — what structural choices limited its distribution>",
    "top_strength":      "<one sentence: what worked structurally, if anything, and why it was insufficient>",
    "critical_weakness": "<one sentence: primary structural failure that most directly explains the low spend>",
    "priority_fix":      "<one sentence: single most diagnostic failure pattern this ad reveals about what does not work in this category>"
  },
  "market_context": {
    "awareness_level": "<one of: unaware | problem_aware | solution_aware | product_aware | most_aware>",
    "awareness_reasoning": "<one sentence: why this awareness level — and whether the ad matched or mismatched it>",
    "sophistication_level": <1-5>,
    "sophistication_reasoning": "<one sentence: why this sophistication level and whether the ad addressed it correctly>"
  },
  "ad_format": {
    "type": "<one of: direct_response | native_ugc | advertorial | brand_awareness | product_demo | testimonial | hybrid>",
    "composition": {
      "has_headline": <true/false>,
      "has_subheadline": <true/false>,
      "has_body_copy": <true/false>,
      "has_benefits_list": <true/false>,
      "has_trust_signals": <true/false>,
      "has_cta": <true/false>,
      "has_price_or_offer": <true/false>,
      "is_visual_dominant": <true/false>,
      "is_text_heavy": <true/false>
    },
    "format_assessment": "<one sentence: what this format reveals about audience mismatch or conversion intent failure>"
  },
  "hook_analysis": {
    "scroll_stop_score": <1-10>,
    "pattern_interrupt": "<what element(s) were intended to stop scroll and why they did or did not work>",
    "first_half_second": "<what the eye hits first and why it failed or succeeded for this audience>",
    "hook_feedback": "<one sentence: what the hook's failure reveals about attention patterns in this vertical>"
  },
  "offer_architecture": {
    "offer_present": <true/false>,
    "offer_text": "<exact offer text or null>",
    "has_price_anchor": <true/false>,
    "has_guarantee": <true/false>,
    "has_urgency_mechanism": <true/false>,
    "has_trial_or_free": <true/false>,
    "perceived_value_score": <1-10>,
    "offer_clarity_score": <1-10>,
    "offer_feedback": "<two sentences: what the offer architecture reveals about why the decision pathway broke down>"
  },
  "cognitive_load": {
    "score": <1-10, where 1=effortless and 10=overwhelming — INVERTED scale>,
    "density": "<one of: minimal | moderate | heavy>",
    "overload_risk": "<what specific element(s) caused friction, or 'none' — must agree with score>",
    "simplification": "<one sentence: what this load level reveals about copy failure in this category>"
  },
  "framework_score": {
    "minimum_viable_test": "<pass or fail: does every word in the headline earn its place — could any word be cut without losing meaning, impact, emotional specificity, or audience fit?>",
    "headline_leaves_gap": <true/false>,
    "subheadline_justified": <true/false>,
    "benefits_justified": <true/false>,
    "trust_signal_justified": <true/false>,
    "cta_justified": <true/false>,
    "overall_framework_grade": "<A | B | C | D — A=9-10, B=7-8, C=4-6, D=1-3>",
    "framework_feedback": "<two sentences — must agree with grade; describe how violations explain the failure>"
  },
  "congruence": {
    "overall_score": <1-10, where 10=fully congruent>,
    "headline_to_visual":       { "aligned": <true/false>, "note": "<one sentence>" },
    "headline_to_subheadline":  { "aligned": <true/false>, "note": "<one sentence>" },
    "body_to_headline":         { "aligned": <true/false>, "note": "<one sentence>" },
    "benefits_to_headline":     { "aligned": <true/false>, "note": "<one sentence>" },
    "cta_to_offer":             { "aligned": <true/false>, "note": "<one sentence>" },
    "trust_signals_to_claim":   { "aligned": <true/false>, "note": "<one sentence>" },
    "incoherence_summary": "<one sentence: primary mismatch that contributed to failure, or 'No incoherence detected'>",
    "fix": "<one sentence: what the congruence failure reveals about creative architecture mistakes in this category>"
  },
  "combination_analysis": {
    "current_combination": "<copy from composition_tag>",
    "combination_assessment": "<two sentences: what this combination reveals about WHY the failure mode emerged in this segment>",
    "historical_match": {
      "winners_with_same_combo_in_segment": <integer count>,
      "losers_with_same_combo_in_segment": <integer count>,
      "winner_examples": ["<W1>"],
      "loser_examples": ["<L2>"],
      "verdict": "<strong_winner_pattern | mixed_record | mostly_loser_pattern | no_segment_data>",
      "verdict_reasoning": "<one sentence>"
    },
    "alternative_combination": "<For losers, this is the diagnostic insight: object: { 'recommended': '<composition_tag>', 'intent': 'replacement', 'rationale': '<two sentences: which DNA dimensions of this loser likely caused the failure and what combination would have likely worked given pattern library evidence — cite Block 0 learned rules and specific winner examples>', 'element_changes': { 'headline': '<new text>', 'subheadline': '<new text or remove>', 'benefits': ['<benefit>'] | 'remove' | 'trim_to_2', 'trust_signals': ['<signal>'] | 'remove', 'cta': '<new text>', 'offer': '<new text or remove>' }, 'predicted_impact': '<one sentence: which winner segment-pattern this aligns with>' }>"
  }
}`

function buildComprehensiveVisionPrompt(
  roiAverages: ROIAverage[],
  patternContext: string,
  confirmedElements?: ExtractedElements,
  mode?: string,
  spendUsd?: number,
  evolvedBaseline?: BaselineEvolutionEntry | null,
): string {
  const scoreLines = roiAverages
    .map(r => `- ${r.label} (${r.region_key}): ${r.activation.toFixed(3)}`)
    .join('\n')

  const isLoser = mode === 'historical' && spendUsd !== undefined && spendUsd < WINNER_THRESHOLD_USD
  const isWinner = mode === 'historical' && !isLoser

  const schema = isLoser ? COMPREHENSIVE_JSON_SCHEMA_LOSER
    : isWinner ? COMPREHENSIVE_JSON_SCHEMA_HISTORICAL
    : COMPREHENSIVE_JSON_SCHEMA

  let preamble: string
  if (isWinner) {
    preamble = `You are a senior advertising strategist analyzing a confirmed winning ad. Your task is to understand WHY it worked — not to critique or suggest improvements. Write observations throughout: what is present, why it works for this audience, what structural choices reveal about effective creative architecture in this category.

FORBIDDEN — do not use these words or any directive grammar:
add, consider, should, remove, test, introduce, improve, increase, audit, expand, replace, darken, sharpen, push, bridge, would dramatically, would materially, would meaningfully, could be made, this could, try, ensure, must.

GOOD (observation — write like this):
"The headline is short and declarative; at high spend in a problem-aware vertical, this reveals the audience did not need a mechanism explained — the problem recognition alone was sufficient to hold attention."

BAD (directive — never write this):
"The headline is short. Consider adding a mechanism or benefit statement to increase specificity and improve conversion rate."

Every field that normally asks 'what to fix' now asks 'what does this reveal'. If you find yourself wanting to write 'add X', rewrite it as 'the absence of X reveals…'.

SCORING CONSISTENCY — MANDATORY:
Every numeric score must agree with its paired feedback string. Score 8+ = feedback describes WHY this worked; score 4-5 = feedback names the specific gap; score 1-3 = feedback names what failed. Inverted scale on cognitive_load: low score = effective. Do not return score-feedback contradictions.`
  } else if (isLoser) {
    preamble = `You are a senior advertising strategist analyzing a confirmed underperforming ad ($${spendUsd} spend). This ad did not achieve meaningful distribution. Your task is to understand WHY it failed — what structural choices limited its reach, where the creative architecture broke down, and what the audience did not respond to.

FORBIDDEN — do not use these words or any directive grammar:
add, consider, should, remove, test, introduce, improve, increase, audit, expand, replace, darken, sharpen, push, bridge, would dramatically, would materially, would meaningfully, could be made, this could, try, ensure, must.

GOOD (observation of failure — write like this):
"The headline names a mechanism without establishing the problem first; at $${spendUsd} spend in a problem-aware vertical, this reveals the audience had not self-identified with the pain sufficiently for a mechanism-first approach to create urgency."

BAD (directive — never write this):
"The headline jumps to the mechanism. Add a problem-statement line above it to establish pain before introducing the solution."

Every field describes what IS present and what it reveals about why this ad failed to generate meaningful spend. If you find yourself wanting to write 'add X', rewrite it as 'the absence of X reveals why conversion stalled'.

SCORING CONSISTENCY — MANDATORY:
Every numeric score must agree with its paired feedback string. Score 8+ = feedback describes WHY this still worked here; score 4-5 = feedback names the specific gap that broke conversion; score 1-3 = feedback names what failed. Inverted scale on cognitive_load: low score = effective; high score = breakage. Do not return score-feedback contradictions.`
  } else {
    preamble = `You are a senior advertising strategist, media buyer, and neuroscience analyst reviewing a static ad image.

SCORING CONSISTENCY — MANDATORY ACROSS EVERY SCORED FIELD:
Every numeric score in this schema is paired with a feedback string. The score and the feedback MUST be internally consistent. Score-to-feedback contract:
- Score 8–10 (or grade A): the element is effective. Feedback MUST explain WHY it works — never name a structural flaw.
- Score 6–7 (or grade B): solid but improvable. Feedback names the specific marginal lift available.
- Score 4–5 (or grade C): mediocre. Feedback identifies the specific gap.
- Score 1–3 (or grade D): fails. Feedback names what is broken and why.

INVERTED SCALES — apply the contract correctly:
- cognitive_load.score: 1=effortless (good), 10=overwhelming (bad). Score 2 means LOW load = EFFECTIVE; score 9 means HIGH load = FAILURE. Feedback for cognitive_load=2 MUST praise the simplicity, not flag overload.

CROSS-FIELD CONSISTENCY:
- If congruence.overall_score is 9, field-level alignment booleans should mostly be true. If most are false, the score is wrong.
- If framework_score.overall_framework_grade is A, *_justified booleans should mostly be true and minimum_viable_test should be "pass".
- If hook_analysis.scroll_stop_score is 8+, hook_feedback must describe the working pattern interrupt — not propose a new one.

VIOLATION CHECK BEFORE OUTPUT: verify every score-feedback pair satisfies the contract. Do not return contradictions.

PRINCIPLE PRECEDENCE — non-negotiable:
When a LEARNED GUARD RAIL (Block 0) contradicts the STATIC FRAMEWORK BASELINE, follow the learned guard rail. The baseline is a default for when historical evidence is silent on this segment. Cite guard rail rule indices (G1, G2, ...) when they drive a recommendation.

DUAL CROSS-REFERENCE — winner AND loser patterns per scored variable:
For each scored variable (headline, subheadline, each benefit, trust signals, CTA, offer, hook, congruence), perform two checks:
- WINNER CHECK: Does this variable's DNA match a pattern in winners (≥$${WINNER_THRESHOLD_USD} spend) within this ad's awareness/sophistication segment? If YES, populate library_alignment.winner_matches with the example numbers.
- LOSER CHECK: Does this variable's DNA match a pattern in losers (<$${WINNER_THRESHOLD_USD} spend) within this segment? If YES, populate library_alignment.loser_matches.
- If matches BOTH: verdict='mixed', name both citations, weight the score by the count balance.
- If matches NEITHER: verdict='no_analog'. Do not invent a pattern reference.

REWRITE QUALITY RULES — non-negotiable:
1. proposed_text must be SHIP-READY copy. No placeholders, no meta-commentary. Just the literal new copy as if it would appear in the ad.
2. proposed_text must differ from the original on AT LEAST one DNA dimension listed in dna_changes. If no structural change is identifiable, leave rewrite as null and let the score stand.
3. Never propose a rewrite that violates a Block 0 LEARNED GUARD RAIL applicable to this ad's segment.
4. Rewrites must be evidence-grounded (winner-bucket analog) or principle-grounded (static framework) — not creative invention. If no winner analog exists, expected_lift uses the honest "no analog" note.
5. For cognitive_load rewrites: the projected score must be the consequence of REMOVING elements, not adding more. The fix for high cog_load is subtraction.

COMBINATION ANALYSIS PROTOCOL:
Step 1: Identify the current combination from confirmed_elements.composition_tag.
Step 2: Query the pattern context for winner/loser examples in this ad's awareness/sophistication segment that share the same composition_tag. Report counts and example numbers in combination_analysis.historical_match.
Step 3: Apply the decision tree to determine intent:
  - mostly_loser_pattern AND winners ≤ 1 AND losers ≥ 3 → intent='replacement'
  - strong_winner_pattern AND all elements 7+ → intent='none', recommended=null
  - strong_winner_pattern BUT one element <7 AND alternative has equal/stronger winner support → intent='test_variant'
  - mixed_record AND all elements 7+ → intent='test_variant' (exploratory)
  - mixed_record AND any element <7 → intent='replacement'
  - no_segment_data → intent='test_variant' with low conviction explicitly flagged
Step 4: If 'replacement' or 'test_variant', construct alternative with ship-ready element_changes (each respecting the rewrite rules above and Block 0 guard rails).
Step 5: predicted_impact must cite the specific winner examples whose combination + DNA inspired the alternative.

FORBIDDEN PHRASES IN FEEDBACK-MODE OUTPUT:
"the data shows", "historical patterns suggest", "research indicates", "winners typically", "in general", "as a rule", "broadly speaking", "the library indicates", "patterns reveal". These are skimming markers — replace with specific example citations or do not make the claim.`
  }

  const analysisInstruction = isWinner
    ? `Analyze this winning ad. Quote actual text, describe actual colors and layout, reference actual visual elements. Observations only — no improvement suggestions. Do not skip any section.`
    : isLoser
    ? `Analyze this underperforming ad. Quote actual text, describe actual colors and layout, reference actual visual elements. Failure analysis only — what broke down, not what to fix. Do not skip any section.`
    : `Analyze this ad image comprehensively. Quote actual text you see, describe actual colors and layout, reference actual visual elements. No generic feedback. Do not skip any section.`

  const evolvedBaselineBlock = (evolvedBaseline && evolvedBaseline.principles.length > 0)
    ? `\nEVOLVED BASELINE PRINCIPLES (data-derived — additive to the static baseline above; v${evolvedBaseline.version}, ${evolvedBaseline.ads_analyzed} historical ads):
These are evidence-based principles derived from accumulated historical ad data. They add specificity to the static baseline. Where a principle describes a "contradiction", both findings are valid under different conditions — the counter-evidence reveals the condition under which the original principle breaks.
${evolvedBaseline.principles.map((p, i) =>
  `[E${i + 1}] [${p.category}${p.scope_awareness ? `, ${p.scope_awareness}` : ''}${p.scope_sophistication ? `, soph=${p.scope_sophistication}` : ''}] ${p.principle_text}`
).join('\n')}`
    : ''

  return `${preamble}
${confirmedElements ? `\n${buildConfirmedElementsBlock(confirmedElements)}\n` : ''}
Writing style: specific and direct — every word earns its place. No filler phrases. Detailed explanations in minimal words.

${STATIC_FRAMEWORK_BASELINE}
${evolvedBaselineBlock}
${patternContext ? `\n${patternContext}\n` : ''}
BERG brain activation scores:
${scoreLines}

${analysisInstruction}

Return a JSON object with EXACTLY this structure — no markdown fences, no extra keys:
${schema}

If pattern_matches is empty because no patterns are available, return [].`
}

async function runBergAnalysis(roiAverages: ROIAverage[], patternContext: string, visualDescription?: string, mode?: string, spendUsd?: number): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: buildBergPrompt(roiAverages, patternContext, visualDescription, mode, spendUsd) }],
  })
  const textBlock = message.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

async function runComprehensiveVisionAnalysis(
  imageBase64: string,
  mimeType: string,
  roiAverages: ROIAverage[],
  patternContext: string,
  confirmedElements?: ExtractedElements,
  mode?: string,
  spendUsd?: number,
  evolvedBaseline?: BaselineEvolutionEntry | null,
): Promise<Omit<ComprehensiveAnalysis, 'berg_recommendations'> | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          { type: 'text', text: buildComprehensiveVisionPrompt(roiAverages, patternContext, confirmedElements, mode, spendUsd, evolvedBaseline) },
        ],
      }],
    })
    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

function parseBergBullets(text: string): string[] {
  return text
    .split('\n')
    .filter(l => /^[-*]\s+/.test(l.trim()))
    .map(l => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
}

function emptyComprehensive(bergBullets: string[]): ComprehensiveAnalysis {
  return {
    copy: {
      headline: { text: '', clarity: 0, urgency: 0, relevance: 0, feedback: '' },
      subheadline: { text: '', supports_headline: false, clarity: 0, feedback: '' },
      benefits_features: { identified: [], clarity: 0, prominence: 0, feedback: '' },
      trust_signals: { identified: [], strength: 0, feedback: '' },
      safety_signals: { identified: [], strength: 0, feedback: '' },
      proof_signals: { identified: [], strength: 0, feedback: '' },
      cta: { text: '', clarity: 0, placement: '', contrast: 0, feedback: '' },
    },
    behavioral_economics: {
      scarcity: { present: false, strength: 0, note: '' },
      urgency: { present: false, strength: 0, note: '' },
      social_proof: { present: false, strength: 0, note: '' },
      anchoring: { present: false, strength: 0, note: '' },
      loss_aversion: { present: false, strength: 0, note: '' },
      authority: { present: false, strength: 0, note: '' },
      reciprocity: { present: false, strength: 0, note: '' },
      overall_feedback: '',
    },
    neuroscience: { attention_prediction: '', emotional_encoding: '', memory_encoding: '', feedback: '' },
    visual_dimensions: {
      cta_strength: { score: 0, feedback: '' },
      emotional_appeal: { score: 0, feedback: '' },
      brand_clarity: { score: 0, feedback: '' },
      visual_hierarchy: { score: 0, feedback: '' },
    },
    berg_recommendations: bergBullets,
    pattern_matches: [],
    overall: { verdict: '', top_strength: '', critical_weakness: '', priority_fix: '' },
    market_context: { awareness_level: 'problem_aware', awareness_reasoning: '', sophistication_level: 1, sophistication_reasoning: '' },
    ad_format: {
      type: 'direct_response',
      composition: {
        has_headline: false, has_subheadline: false, has_body_copy: false,
        has_benefits_list: false, has_trust_signals: false, has_cta: false,
        has_price_or_offer: false, is_visual_dominant: true, is_text_heavy: false,
      },
      format_assessment: '',
    },
    hook_analysis: { scroll_stop_score: 0, pattern_interrupt: '', first_half_second: '', hook_feedback: '' },
    offer_architecture: {
      offer_present: false, offer_text: null,
      has_price_anchor: false, has_guarantee: false, has_urgency_mechanism: false, has_trial_or_free: false,
      perceived_value_score: 0, offer_clarity_score: 0, offer_feedback: '',
    },
    cognitive_load: { score: 0, density: 'minimal', overload_risk: '', simplification: '' },
    framework_score: {
      minimum_viable_test: 'fail',
      headline_leaves_gap: false, subheadline_justified: false, benefits_justified: false,
      trust_signal_justified: false, cta_justified: false,
      overall_framework_grade: 'D', framework_feedback: '',
    },
    congruence: {
      overall_score: 0,
      headline_to_visual: { aligned: false, note: '' },
      headline_to_subheadline: { aligned: false, note: '' },
      body_to_headline: { aligned: false, note: '' },
      benefits_to_headline: { aligned: false, note: '' },
      cta_to_offer: { aligned: false, note: '' },
      trust_signals_to_claim: { aligned: false, note: '' },
      incoherence_summary: '',
      fix: '',
    },
    body_dna: null,
    composition_tag: '',
    combination_analysis: {
      current_combination: '',
      combination_assessment: '',
      historical_match: {
        winners_with_same_combo_in_segment: 0,
        losers_with_same_combo_in_segment: 0,
        winner_examples: [],
        loser_examples: [],
        verdict: 'no_segment_data',
        verdict_reasoning: '',
      },
      alternative_combination: null,
    },
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const roi_averages: ROIAverage[] = body.roi_averages ?? []
  const image_base64: string | undefined = body.image_base64
  const mime_type: string = body.mime_type ?? 'image/jpeg'
  const spend_usd: number | undefined = body.spend_usd !== undefined ? Number(body.spend_usd) : undefined
  const analysis_id: string | undefined = body.analysis_id
  const confirmed_elements: ExtractedElements | undefined = body.confirmed_elements
  const mode: string | undefined = body.mode

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // Send an immediate keep-alive byte so the connection sees activity
      // within the first second; some proxies close idle streams in <15s.
      try { controller.enqueue(encoder.encode('\n')) } catch {}
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode('\n')) } catch {}
      }, 10000)
      try {
        const [patterns, winningExamples, losingPatterns, losingExamples, frameworkPrinciples, evolvedBaseline] = await Promise.all([
          getWinningPatterns(),
          getAllWinningAnalyses(),
          getLosingPatterns(),
          getAllLosersForSynthesis(),
          getFrameworkPrinciples(),
          getLatestBaselineEvolution(),
        ])

        const patternContext = buildPatternContext(patterns, winningExamples, losingPatterns, losingExamples, frameworkPrinciples)
        const visualDescription = confirmed_elements?.visual_description

        const [bergText, visionResult] = await Promise.all([
          runBergAnalysis(roi_averages, patternContext, visualDescription, mode, spend_usd),
          image_base64
            ? runComprehensiveVisionAnalysis(image_base64, mime_type, roi_averages, patternContext, confirmed_elements, mode, spend_usd, evolvedBaseline)
            : Promise.resolve(null),
        ])

        const bergBullets = parseBergBullets(bergText)
        const comprehensive: ComprehensiveAnalysis = visionResult
          ? { ...visionResult, berg_recommendations: bergBullets }
          : emptyComprehensive(bergBullets)

        if (analysis_id) {
          await storeComprehensiveAnalysis(analysis_id, comprehensive as unknown as Record<string, unknown>, spend_usd)

          if (spend_usd !== undefined) {
            fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/analyze/synthesize-patterns`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ triggered_by: analysis_id }),
            }).catch(() => { /* fire and forget */ })
          }
        }

        controller.enqueue(encoder.encode(JSON.stringify({ comprehensive }) + '\n'))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Analysis failed'
        controller.enqueue(encoder.encode(JSON.stringify({ error: msg }) + '\n'))
      } finally {
        clearInterval(ping)
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/json' } })
}
