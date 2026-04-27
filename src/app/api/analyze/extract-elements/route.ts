import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export interface ExtractedElements {
  headline: string | null
  subheadline: string | null
  body_copy: string | null
  benefits: string[]
  trust_signals: string[]
  safety_signals: string[]
  proof_signals: string[]
  cta: string | null
  offer_details: string | null
  visual_description: string
  ad_format_guess: string
}

const anthropic = new Anthropic({ timeout: 60000 })

const EXTRACT_SCHEMA = `{
  "headline": "<exact headline text, or null if no headline present>",
  "subheadline": "<exact subheadline text, or null>",
  "body_copy": "<main body paragraph text verbatim, or null>",
  "benefits": ["<benefit 1 verbatim>", "..."],
  "trust_signals": ["<e.g. '50,000 reviews', '★★★★★', logo name>", "..."],
  "safety_signals": ["<e.g. 'Money-back guarantee', 'Free returns', security badge>", "..."],
  "proof_signals": ["<e.g. 'Clinically tested', 'Before/after shown', '3x faster in study'>", "..."],
  "cta": "<exact CTA button or link text, or null>",
  "offer_details": "<any price, discount %, free trial, or promo text visible, or null>",
  "visual_description": "<one sentence: dominant visual subject, style, dominant colors>",
  "ad_format_guess": "<one of: direct_response | native_ugc | advertorial | brand_awareness | product_demo | testimonial | hybrid>"
}`

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.image_base64) return NextResponse.json({ error: 'image_base64 required' }, { status: 400 })

  const { image_base64, mime_type = 'image/jpeg' } = body

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image_base64,
            },
          },
          {
            type: 'text',
            text: `Extract every text and visual element from this ad image. Quote exact text verbatim — do not paraphrase, interpret, or infer. If an element is not visually present, return null or [].

Return a JSON object with EXACTLY this structure — no markdown fences, no extra keys:
${EXTRACT_SCHEMA}`,
          },
        ],
      }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const extracted: ExtractedElements = JSON.parse(cleaned)
    return NextResponse.json({ extracted })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Extraction failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
