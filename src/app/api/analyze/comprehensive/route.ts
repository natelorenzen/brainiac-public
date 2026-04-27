import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getWinningPatterns,
  getRecentWinningAnalyses,
  storeComprehensiveAnalysis,
  WINNER_THRESHOLD_USD,
  type PatternLibraryRow,
  type WinningAnalysisSummary,
} from '@/lib/pattern-library'
import type { ExtractedElements } from '@/app/api/analyze/extract-elements/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface ROIAverage {
  region_key: string
  label: string
  description: string
  activation: number
}

export interface ComprehensiveAnalysis {
  copy: {
    headline: { text: string; clarity: number; urgency: number; relevance: number; feedback: string }
    subheadline: { text: string; supports_headline: boolean; clarity: number; feedback: string }
    benefits_features: { identified: string[]; clarity: number; prominence: number; feedback: string }
    trust_signals: { identified: string[]; strength: number; feedback: string }
    safety_signals: { identified: string[]; strength: number; feedback: string }
    cta: { text: string; clarity: number; placement: string; contrast: number; feedback: string }
  }
  behavioral_economics: {
    scarcity: { present: boolean; strength: number; note: string }
    urgency: { present: boolean; strength: number; note: string }
    social_proof: { present: boolean; strength: number; note: string }
    anchoring: { present: boolean; strength: number; note: string }
    loss_aversion: { present: boolean; strength: number; note: string }
    authority: { present: boolean; strength: number; note: string }
    reciprocity: { present: boolean; strength: number; note: string }
    overall_feedback: string
  }
  neuroscience: {
    attention_prediction: string
    emotional_encoding: string
    memory_encoding: string
    feedback: string
  }
  visual_dimensions: {
    cta_strength: { score: number; feedback: string }
    emotional_appeal: { score: number; feedback: string }
    brand_clarity: { score: number; feedback: string }
    visual_hierarchy: { score: number; feedback: string }
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
  }
  cognitive_load: {
    score: number
    density: 'minimal' | 'moderate' | 'heavy'
    overload_risk: string
    simplification: string
  }
  platform_fit: {
    optimised_for: string[]
    weak_for: string[]
    reasoning: string
    adaptation_notes: string
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
}

const anthropic = new Anthropic({ timeout: 120000 })

function buildPatternContext(
  patterns: PatternLibraryRow[],
  winningExamples: WinningAnalysisSummary[],
): string {
  if (patterns.length === 0 && winningExamples.length === 0) return ''

  const lines: string[] = []

  if (patterns.length > 0) {
    lines.push(`--- Winning Ad Patterns (derived from ads with $${WINNER_THRESHOLD_USD}+ spend) ---`)
    patterns.forEach((p, i) => {
      lines.push(`${i + 1}. [${p.category}] ${p.rule_text}`)
    })
  }

  if (winningExamples.length > 0) {
    lines.push('')
    lines.push('--- Recent Winning Ad Examples ---')
    winningExamples.forEach((ex, i) => {
      const ca = ex.comprehensive_analysis as unknown as ComprehensiveAnalysis | null
      if (!ca) return
      const headline = ca.copy?.headline?.text ?? 'unknown'
      const cta = ca.copy?.cta?.text ?? 'unknown'
      const topBE = Object.entries(ca.behavioral_economics ?? {})
        .filter(([k, v]) => k !== 'overall_feedback' && (v as { present: boolean }).present)
        .map(([k]) => k)
        .join(', ')
      lines.push(`Example ${i + 1} ($${ex.spend_usd} spend): headline="${headline}", CTA="${cta}", behavioral signals=${topBE || 'none'}`)
    })
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

const FRAMEWORK_CONTEXT = `Copywriting framework (minimum-viable-copy principle — apply strictly):
- Start with the minimum. Add an element ONLY when the previous one leaves something unresolved.
- Headline: Should communicate the core feeling with the visual in 5 words or fewer. Does it?
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
- Level 5: Everything saturated. SENSATION and experience are the only differentiators.`

function buildBergPrompt(roiAverages: ROIAverage[], patternContext: string): string {
  const scoreLines = roiAverages
    .map(r => `- ${r.label} (${r.region_key}): ${r.activation.toFixed(3)} — ${r.description}`)
    .join('\n')

  return `You are interpreting BERG fMRI brain activation predictions for a static ad image for paid media performance.

${ROI_AD_CONTEXT}

BERG brain activation scores for this ad:
${scoreLines}
${patternContext ? `\n${patternContext}\n` : ''}
Give 5–6 specific, actionable suggestions to improve this ad's performance in paid media. For each suggestion: name the ROI, quote its score, explain what it means about the creative in ad-performance terms, and state the specific change to make. Do not guarantee outcomes. Where relevant, reference the winning patterns above.

Format as a markdown bulleted list. Each bullet is two to three sentences.`
}

function buildConfirmedElementsBlock(confirmed: ExtractedElements): string {
  const lines = ['--- Confirmed ad element extraction (user-verified — use as ground truth, do not re-extract) ---']
  if (confirmed.headline) lines.push(`Headline: "${confirmed.headline}"`)
  if (confirmed.subheadline) lines.push(`Subheadline: "${confirmed.subheadline}"`)
  if (confirmed.body_copy) lines.push(`Body copy: "${confirmed.body_copy}"`)
  if (confirmed.benefits.length) lines.push(`Benefits: ${confirmed.benefits.map(b => `"${b}"`).join(', ')}`)
  if (confirmed.trust_signals.length) lines.push(`Trust signals: ${confirmed.trust_signals.join(', ')}`)
  if (confirmed.safety_signals.length) lines.push(`Safety signals: ${confirmed.safety_signals.join(', ')}`)
  if (confirmed.proof_signals.length) lines.push(`Proof signals: ${confirmed.proof_signals.join(', ')}`)
  if (confirmed.cta) lines.push(`CTA: "${confirmed.cta}"`)
  if (confirmed.offer_details) lines.push(`Offer: "${confirmed.offer_details}"`)
  lines.push(`Visual: ${confirmed.visual_description}`)
  lines.push(`Format type (user estimate): ${confirmed.ad_format_guess}`)
  return lines.join('\n')
}

const COMPREHENSIVE_JSON_SCHEMA = `{
  "copy": {
    "headline": { "text": "<exact text or null>", "clarity": <1-10>, "urgency": <1-10>, "relevance": <1-10>, "feedback": "<two sentences>" },
    "subheadline": { "text": "<exact text or null>", "supports_headline": <true/false>, "clarity": <1-10>, "feedback": "<one sentence>" },
    "benefits_features": { "identified": ["<benefit 1>"], "clarity": <1-10>, "prominence": <1-10>, "feedback": "<two sentences>" },
    "trust_signals": { "identified": ["<signal>"], "strength": <1-10>, "feedback": "<two sentences>" },
    "safety_signals": { "identified": ["<signal>"], "strength": <1-10>, "feedback": "<two sentences>" },
    "cta": { "text": "<exact text or null>", "clarity": <1-10>, "placement": "<location>", "contrast": <1-10>, "feedback": "<two sentences>" }
  },
  "behavioral_economics": {
    "scarcity":      { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "urgency":       { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "social_proof":  { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "anchoring":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "loss_aversion": { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "authority":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "reciprocity":   { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "overall_feedback": "<two sentences>"
  },
  "neuroscience": {
    "attention_prediction": "<one-two sentences: what captures attention first and why>",
    "emotional_encoding":   "<one-two sentences: emotional response likely triggered>",
    "memory_encoding":      "<one-two sentences: how memorable and what aids or hinders recall>",
    "feedback":             "<two sentences: top neuroscience recommendation>"
  },
  "visual_dimensions": {
    "cta_strength":     { "score": <1-10>, "feedback": "<two sentences>" },
    "emotional_appeal": { "score": <1-10>, "feedback": "<two sentences>" },
    "brand_clarity":    { "score": <1-10>, "feedback": "<two sentences>" },
    "visual_hierarchy": { "score": <1-10>, "feedback": "<two sentences>" }
  },
  "pattern_matches": ["<winning rule this ad satisfies or violates, verbatim from the patterns>"],
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
    "hook_feedback": "<one specific change to strengthen the hook>"
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
    "offer_feedback": "<two sentences: offer strength and what to improve>"
  },
  "cognitive_load": {
    "score": <1-10, where 1=effortless and 10=overwhelming>,
    "density": "<one of: minimal | moderate | heavy>",
    "overload_risk": "<what specific element(s) are contributing to overload, or 'none'>",
    "simplification": "<one specific change to reduce cognitive load>"
  },
  "platform_fit": {
    "optimised_for": ["<platform 1>"],
    "weak_for": ["<platform 1>"],
    "reasoning": "<two sentences: why this format fits or doesn't fit each platform>",
    "adaptation_notes": "<one-two sentences: specific changes for the weakest platform>"
  },
  "framework_score": {
    "minimum_viable_test": "<pass or fail: does visual + 5 words communicate the core feeling?>",
    "headline_leaves_gap": <true/false>,
    "subheadline_justified": <true/false>,
    "benefits_justified": <true/false>,
    "trust_signal_justified": <true/false>,
    "cta_justified": <true/false>,
    "overall_framework_grade": "<A | B | C | D>",
    "framework_feedback": "<two sentences: where the framework is violated or over-built>"
  }
}`

function buildComprehensiveVisionPrompt(
  roiAverages: ROIAverage[],
  patternContext: string,
  confirmedElements?: ExtractedElements,
): string {
  const scoreLines = roiAverages
    .map(r => `- ${r.label} (${r.region_key}): ${r.activation.toFixed(3)}`)
    .join('\n')

  return `You are a senior advertising strategist, media buyer, and neuroscience analyst reviewing a static ad image.
${confirmedElements ? `\n${buildConfirmedElementsBlock(confirmedElements)}\n` : ''}
${FRAMEWORK_CONTEXT}
${patternContext ? `\n${patternContext}\n` : ''}
BERG brain activation scores:
${scoreLines}

Analyze this ad image comprehensively. Be specific — quote actual text you see, describe actual colors and layout, reference actual visual elements. Do not give generic feedback. Do not skip any section.

Return a JSON object with EXACTLY this structure — no markdown fences, no extra keys:
${COMPREHENSIVE_JSON_SCHEMA}

If pattern_matches is empty because no patterns are available, return [].`
}

async function runBergAnalysis(roiAverages: ROIAverage[], patternContext: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: buildBergPrompt(roiAverages, patternContext) }],
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
): Promise<Omit<ComprehensiveAnalysis, 'berg_recommendations'> | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
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
          { type: 'text', text: buildComprehensiveVisionPrompt(roiAverages, patternContext, confirmedElements) },
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
    platform_fit: { optimised_for: [], weak_for: [], reasoning: '', adaptation_notes: '' },
    framework_score: {
      minimum_viable_test: 'fail',
      headline_leaves_gap: false, subheadline_justified: false, benefits_justified: false,
      trust_signal_justified: false, cta_justified: false,
      overall_framework_grade: 'D', framework_feedback: '',
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

  const [patterns, winningExamples] = await Promise.all([
    getWinningPatterns(8),
    getRecentWinningAnalyses(3),
  ])

  const patternContext = buildPatternContext(patterns, winningExamples)

  let bergText: string
  let visionResult: Omit<ComprehensiveAnalysis, 'berg_recommendations'> | null
  try {
    ;[bergText, visionResult] = await Promise.all([
      runBergAnalysis(roi_averages, patternContext),
      image_base64
        ? runComprehensiveVisionAnalysis(image_base64, mime_type, roi_averages, patternContext, confirmed_elements)
        : Promise.resolve(null),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Anthropic API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const bergBullets = parseBergBullets(bergText)
  const comprehensive: ComprehensiveAnalysis = visionResult
    ? { ...visionResult, berg_recommendations: bergBullets }
    : emptyComprehensive(bergBullets)

  if (analysis_id) {
    await storeComprehensiveAnalysis(analysis_id, comprehensive as unknown as Record<string, unknown>, spend_usd)

    if (spend_usd !== undefined && spend_usd >= WINNER_THRESHOLD_USD) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/analyze/synthesize-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggered_by: analysis_id }),
      }).catch(() => { /* fire and forget */ })
    }
  }

  return NextResponse.json({ comprehensive })
}
