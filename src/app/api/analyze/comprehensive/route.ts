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
}

const anthropic = new Anthropic({ timeout: 120000 })

const EXTENDED_THINKING = false
const THINKING_BUDGET = 10000

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

function buildBergPrompt(
  roiAverages: ROIAverage[],
  patternContext: string,
): string {
  const scoreLines = roiAverages
    .map(r => `- ${r.label} (${r.region_key}): ${r.activation.toFixed(3)} — ${r.description}`)
    .join('\n')

  return `You are interpreting BERG fMRI brain activation predictions for a static ad image.

BERG predicts which visual cortex regions activate when a viewer sees this ad. Scores are normalized 0–1. Higher scores mean stronger predicted neural engagement.

Brain activation scores:
${scoreLines}
${patternContext ? `\n${patternContext}\n` : ''}
Give 5–6 specific, actionable suggestions to improve this ad's visual impact for paid media performance. For each suggestion, name the region, quote the score, explain what it means about the creative, and state the specific change to make. Do not skip any region with a notably high or low score. Where relevant, reference the winning patterns above.

Format as a markdown bulleted list. Each bullet is two to three sentences. Do not guarantee outcomes.`
}

const COMPREHENSIVE_JSON_SCHEMA = `{
  "copy": {
    "headline": { "text": "<exact text visible or null if none>", "clarity": <1-10>, "urgency": <1-10>, "relevance": <1-10>, "feedback": "<two sentences>" },
    "subheadline": { "text": "<exact text or null>", "supports_headline": <true/false>, "clarity": <1-10>, "feedback": "<one sentence>" },
    "benefits_features": { "identified": ["<benefit 1>", "..."], "clarity": <1-10>, "prominence": <1-10>, "feedback": "<two sentences>" },
    "trust_signals": { "identified": ["<signal 1>", "..."], "strength": <1-10>, "feedback": "<two sentences>" },
    "safety_signals": { "identified": ["<signal 1>", "..."], "strength": <1-10>, "feedback": "<two sentences>" },
    "cta": { "text": "<exact CTA text or null>", "clarity": <1-10>, "placement": "<describe location>", "contrast": <1-10>, "feedback": "<two sentences>" }
  },
  "behavioral_economics": {
    "scarcity":      { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "urgency":       { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "social_proof":  { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "anchoring":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "loss_aversion": { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "authority":     { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "reciprocity":   { "present": <true/false>, "strength": <0-10>, "note": "<one sentence>" },
    "overall_feedback": "<two sentences on the behavioral economics strategy>"
  },
  "neuroscience": {
    "attention_prediction": "<one to two sentences: what visual elements will capture attention first and why>",
    "emotional_encoding":   "<one to two sentences: what emotional response this ad is likely to trigger and why>",
    "memory_encoding":      "<one to two sentences: how memorable this ad is likely to be and what aids or hinders recall>",
    "feedback":             "<two sentences: overall neuroscience assessment and top recommendation>"
  },
  "visual_dimensions": {
    "cta_strength":     { "score": <1-10>, "feedback": "<two sentences>" },
    "emotional_appeal": { "score": <1-10>, "feedback": "<two sentences>" },
    "brand_clarity":    { "score": <1-10>, "feedback": "<two sentences>" },
    "visual_hierarchy": { "score": <1-10>, "feedback": "<two sentences>" }
  },
  "pattern_matches": ["<winning rule this ad satisfies or violates, verbatim from the patterns above>"],
  "overall": {
    "verdict":            "<three to four sentences: overall assessment>",
    "top_strength":       "<one sentence: the single strongest element with specific reason>",
    "critical_weakness":  "<one sentence: the single biggest weakness with specific reason>",
    "priority_fix":       "<one sentence: the single highest-priority change to make>"
  }
}`

function buildComprehensiveVisionPrompt(
  roiAverages: ROIAverage[],
  patternContext: string,
): string {
  const scoreLines = roiAverages
    .map(r => `- ${r.label} (${r.region_key}): ${r.activation.toFixed(3)}`)
    .join('\n')

  return `You are a senior advertising strategist and neuroscience analyst reviewing a static ad image for paid media performance.
${patternContext ? `\n${patternContext}\n` : ''}
BERG brain activation scores for this ad:
${scoreLines}

Analyze this ad image comprehensively. Be specific — quote actual text you can read in the image, describe actual colors, layout, and visual elements. Do not give generic feedback. Do not skip any section.

Return a JSON object with EXACTLY this structure — no markdown fences, no extra keys:
${COMPREHENSIVE_JSON_SCHEMA}

If pattern_matches is empty because no patterns are available, return an empty array [].`
}

async function runBergAnalysis(roiAverages: ROIAverage[], patternContext: string): Promise<string> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: buildBergPrompt(roiAverages, patternContext) }],
  }

  if (EXTENDED_THINKING) {
    params.thinking = { type: 'enabled', budget_tokens: THINKING_BUDGET }
    params.max_tokens = THINKING_BUDGET + 8192
  }

  const message = await anthropic.messages.create(params)
  const textBlock = message.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

async function runComprehensiveVisionAnalysis(
  imageBase64: string,
  mimeType: string,
  roiAverages: ROIAverage[],
  patternContext: string,
): Promise<Omit<ComprehensiveAnalysis, 'berg_recommendations'> | null> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
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
        { type: 'text', text: buildComprehensiveVisionPrompt(roiAverages, patternContext) },
      ],
    }],
  }

  if (EXTENDED_THINKING) {
    params.thinking = { type: 'enabled', budget_tokens: THINKING_BUDGET }
    params.max_tokens = THINKING_BUDGET + 8192
  }

  try {
    const message = await anthropic.messages.create(params)
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

  // Fetch winning patterns and recent winners for RAG context
  const [patterns, winningExamples] = await Promise.all([
    getWinningPatterns(8),
    getRecentWinningAnalyses(3),
  ])

  const patternContext = buildPatternContext(patterns, winningExamples)

  // Run both Sonnet calls in parallel
  let bergText: string
  let visionResult: Omit<ComprehensiveAnalysis, 'berg_recommendations'> | null
  try {
    ;[bergText, visionResult] = await Promise.all([
      runBergAnalysis(roi_averages, patternContext),
      image_base64
        ? runComprehensiveVisionAnalysis(image_base64, mime_type, roi_averages, patternContext)
        : Promise.resolve(null),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Anthropic API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const bergBullets = parseBergBullets(bergText)

  const comprehensive: ComprehensiveAnalysis = visionResult
    ? { ...visionResult, berg_recommendations: bergBullets }
    : {
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
      }

  // Store back to DB if analysis_id provided
  if (analysis_id) {
    await storeComprehensiveAnalysis(analysis_id, comprehensive as unknown as Record<string, unknown>, spend_usd)

    // Fire-and-forget pattern synthesis if this is a winner
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
