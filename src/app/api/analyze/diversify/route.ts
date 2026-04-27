import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getWinningPatterns,
  getAllWinningAnalyses,
  getLosingPatterns,
  WINNER_THRESHOLD_USD,
} from '@/lib/pattern-library'
import { fetchRedditPosts } from '@/lib/reddit'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'
import type { ExtractedElements } from '@/app/api/analyze/extract-elements/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const anthropic = new Anthropic({ timeout: 120000 })

export interface CreativeVariant {
  id: string
  angle_name: string
  awareness_target: 'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'most_aware'
  emotional_register: 'urgent' | 'calm' | 'playful' | 'aspirational' | 'authoritative' | 'empathetic' | 'provocative'
  visual_style: 'lifestyle' | 'product_hero' | 'before_after' | 'ugc_style' | 'editorial' | 'infographic' | 'minimalist' | 'documentary'
  format_type: 'testimonial' | 'demonstration' | 'statement' | 'question' | 'comparison' | 'transformation' | 'list' | 'pattern_interrupt'
  copy: {
    headline: string
    subheadline: string | null
    body: string | null
    cta: string
  }
  visual_concept: string
  gem_prompt: string
  why_distinct: string
  hypothesis: string
}

function buildSourceAdContext(comprehensive: ComprehensiveAnalysis, confirmed?: ExtractedElements): string {
  const lines: string[] = ['--- Source ad context ---']

  if (confirmed) {
    if (confirmed.headline) lines.push(`Headline: "${confirmed.headline}"`)
    if (confirmed.subheadline) lines.push(`Subheadline: "${confirmed.subheadline}"`)
    if (confirmed.body_copy) lines.push(`Body copy: "${confirmed.body_copy}"`)
    if (confirmed.benefits.length) lines.push(`Benefits: ${confirmed.benefits.map(b => `"${b}"`).join(', ')}`)
    if (confirmed.cta) lines.push(`CTA: "${confirmed.cta}"`)
    if (confirmed.offer_details) lines.push(`Offer: "${confirmed.offer_details}"`)
    if (confirmed.visual_description) lines.push(`Visual: ${confirmed.visual_description}`)
  } else {
    if (comprehensive.copy?.headline?.text) lines.push(`Headline: "${comprehensive.copy.headline.text}"`)
    if (comprehensive.copy?.subheadline?.text) lines.push(`Subheadline: "${comprehensive.copy.subheadline.text}"`)
    if (comprehensive.copy?.benefits_features?.identified?.length) {
      lines.push(`Benefits: ${comprehensive.copy.benefits_features.identified.map(b => `"${b}"`).join(', ')}`)
    }
    if (comprehensive.copy?.cta?.text) lines.push(`CTA: "${comprehensive.copy.cta.text}"`)
    if (comprehensive.offer_architecture?.offer_text) lines.push(`Offer: "${comprehensive.offer_architecture.offer_text}"`)
  }

  lines.push(`Awareness level: ${comprehensive.market_context?.awareness_level ?? 'unknown'}`)
  lines.push(`Sophistication: ${comprehensive.market_context?.sophistication_level ?? 'unknown'}/5`)
  lines.push(`Framework grade: ${comprehensive.framework_score?.overall_framework_grade ?? '?'}`)
  lines.push(`Congruence score: ${comprehensive.congruence?.overall_score ?? 'n/a'}/10`)
  lines.push(`Hook/scroll-stop: ${comprehensive.hook_analysis?.scroll_stop_score ?? 'n/a'}/10`)
  lines.push(`Ad format type: ${comprehensive.ad_format?.type ?? 'unknown'}`)
  lines.push(`Overall verdict: ${comprehensive.overall?.verdict ?? 'n/a'}`)
  lines.push(`Critical weakness: ${comprehensive.overall?.critical_weakness ?? 'n/a'}`)

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const comprehensive: ComprehensiveAnalysis = body.comprehensive
  const confirmed_elements: ExtractedElements | undefined = body.confirmed_elements
  const concept_topic: string | undefined = body.concept_topic
  const variant_count: number = Math.min(Math.max(Number(body.variant_count ?? 6), 4), 10)

  if (!comprehensive) return NextResponse.json({ error: 'comprehensive is required' }, { status: 400 })

  const [winningPatterns, winningAnalyses, losingPatterns, redditPosts] = await Promise.all([
    getWinningPatterns(),
    getAllWinningAnalyses(),
    getLosingPatterns(),
    concept_topic ? fetchRedditPosts(concept_topic) : Promise.resolve(null),
  ])

  const sourceContext = buildSourceAdContext(comprehensive, confirmed_elements)

  const patternBlock = (() => {
    const lines: string[] = []
    if (winningPatterns.length > 0) {
      lines.push(`--- Winning patterns (from ads with $${WINNER_THRESHOLD_USD}+ spend) ---`)
      winningPatterns.forEach((p, i) => lines.push(`${i + 1}. [${p.category}] ${p.rule_text}`))
    }
    if (losingPatterns.length > 0) {
      lines.push('')
      lines.push(`--- Anti-patterns (from failing ads — avoid these in variants) ---`)
      losingPatterns.forEach((p, i) => lines.push(`${i + 1}. [${p.category}] ${p.rule_text}`))
    }
    if (winningAnalyses.length > 0) {
      lines.push('')
      lines.push('--- Winning ad examples ---')
      winningAnalyses.slice(0, 10).forEach((ex, i) => {
        const ca = ex.comprehensive_analysis as unknown as ComprehensiveAnalysis | null
        if (!ca) return
        const headline = ca.copy?.headline?.text ?? 'n/a'
        lines.push(`Example ${i + 1} ($${ex.spend_usd}): headline="${headline}" | awareness=${ca.market_context?.awareness_level ?? '?'} | grade=${ca.framework_score?.overall_framework_grade ?? '?'}`)
      })
    }
    return lines.join('\n')
  })()

  const redditBlock = (redditPosts && redditPosts.length > 0 && concept_topic)
    ? `--- Reddit insights: real people describing "${concept_topic}" ---
${redditPosts.map((p, i) => `Post ${i + 1}: "${p.title}"\nURL: ${p.url}\nSnippet: "${p.snippet}"`).join('\n\n')}

Use the language and situations from these posts to ground at least 2 variants in real audience experience.
In gem_prompt and visual_concept for those variants, reference the scenes and emotions described above.`
    : ''

  const prompt = `You are a senior creative strategist and Meta media buyer generating ${variant_count} deliberately diversified ad variants.

${sourceContext}
${patternBlock ? `\n${patternBlock}\n` : ''}${redditBlock ? `\n${redditBlock}\n` : ''}
Generate ${variant_count} creative variants of this concept. Each variant must:

1. Test the same product/hypothesis as the source ad — do NOT change what is being sold.
2. Differ from EVERY other variant on at least 2 of these 4 axes:
   - awareness_target: unaware | problem_aware | solution_aware | product_aware | most_aware
   - emotional_register: urgent | calm | playful | aspirational | authoritative | empathetic | provocative
   - visual_style: lifestyle | product_hero | before_after | ugc_style | editorial | infographic | minimalist | documentary
   - format_type: testimonial | demonstration | statement | question | comparison | transformation | list | pattern_interrupt
3. Respect winning patterns above — do not violate proven rules. Avoid anti-patterns unless there is a strong structural reason.
4. Have a Gem-style image generation prompt that includes in this order: primary subject, setting, composition/framing, lighting, color palette, mood, 1–2 specific visual details, aspect ratio recommendation.
5. State explicitly in why_distinct which 2+ axes differ from the source ad AND from the closest other variant.

Brand consistency: keep the product, tone-of-voice, and core proposition consistent. Vary the EXPRESSION of the proposition, not the proposition itself.

Return ONLY a JSON object with no markdown fences:
{
  "source_summary": "<one sentence: what concept/product these variants are for>",
  "variants": [
    {
      "id": "variant-1",
      "angle_name": "<short label, e.g. 'Problem-aware: 3pm crash'>",
      "awareness_target": "<one of the 5 levels>",
      "emotional_register": "<one of the 7 registers>",
      "visual_style": "<one of the 8 styles>",
      "format_type": "<one of the 8 types>",
      "copy": {
        "headline": "<specific headline for this variant>",
        "subheadline": "<subheadline or null>",
        "body": "<body copy or null>",
        "cta": "<CTA text>"
      },
      "visual_concept": "<one sentence: who is shown, where, what are they doing, what is the emotional state>",
      "gem_prompt": "<ready-to-paste image generation prompt: subject, setting, composition, lighting, palette, mood, 2 specific details, aspect ratio>",
      "why_distinct": "<one sentence: which 2+ axes differ from source ad and from nearest other variant>",
      "hypothesis": "<one sentence: what specific creative hypothesis this variant tests>"
    }
  ]
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { source_summary: string; variants: CreativeVariant[] }

    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
