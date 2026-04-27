import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

interface ROIAverage {
  region_key: string
  label: string
  description: string
  activation: number
}

const anthropic = new Anthropic()

// ── Sonnet vision ad-dimension analysis ──────────────────────────────────────

export interface VisualAdAnalysis {
  cta_strength: { score: number; feedback: string }
  emotional_appeal: { score: number; feedback: string }
  brand_clarity: { score: number; feedback: string }
  visual_hierarchy: { score: number; feedback: string }
  overall_verdict: string
}

async function runSonnetAdAnalysis(image_base64: string, mime_type: string): Promise<VisualAdAnalysis | null> {
  const prompt = `You are an expert advertising creative director analyzing a static ad image for paid media performance potential.

Evaluate the ad on exactly these four dimensions and return a JSON object with this structure — no extra keys, no markdown fences:
{
  "cta_strength": {
    "score": <integer 1-10>,
    "feedback": "<one sentence: is the call-to-action clear, prominent, and compelling?>"
  },
  "emotional_appeal": {
    "score": <integer 1-10>,
    "feedback": "<one sentence: does the image evoke a clear emotional response relevant to the product or offer?>"
  },
  "brand_clarity": {
    "score": <integer 1-10>,
    "feedback": "<one sentence: is the brand identity — logo, colors, tone — immediately recognizable?>"
  },
  "visual_hierarchy": {
    "score": <integer 1-10>,
    "feedback": "<one sentence: does the layout guide the viewer's eye from headline to supporting content to CTA?>"
  },
  "overall_verdict": "<two to three sentences: name the single strongest element, the single biggest weakness, and the one highest-priority fix>"
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: image_base64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(cleaned) as VisualAdAnalysis
  } catch {
    return null
  }
}

// ── Claude BERG-based recommendation prompt ───────────────────────────────────

function buildBergPrompt(body: Record<string, unknown>): string {
  const context = body.context as string | undefined

  // ── Landing page — desktop & mobile ─────────────────────────────────────
  if (context === 'webpage_desktop' || context === 'webpage_mobile') {
    const page_url = body.page_url as string
    const roi_data = body.roi_data as ROIAverage[]
    const viewport = context === 'webpage_desktop' ? 'desktop (1280×720)' : 'mobile (390×844, iPhone UA)'
    const lines = roi_data
      .map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`)
      .join('\n')

    return `You are interpreting BERG fMRI brain activation predictions for an ad landing page screenshot captured on ${viewport}.

BERG predicts which visual cortex regions activate when a person views the page above the fold. Scores are normalized 0–1. Higher scores mean stronger predicted neural engagement with that type of visual processing.

Page: ${page_url}
Viewport: ${viewport}

Brain activation scores:
${lines}

Give 4–5 specific, actionable design suggestions to improve this landing page's ability to convert ad traffic. Ground each suggestion in the specific region scores (e.g. "FFA score of 0.12 is low — add a human face near the headline to drive trust and attention"). Consider layout differences appropriate for ${context === 'webpage_desktop' ? 'desktop (wide viewport, mouse interaction)' : 'mobile (narrow viewport, thumb reach, smaller text)'}.

Format as a markdown bulleted list. Each bullet is one to two sentences. Do not guarantee business outcomes.`
  }

  // ── Single static ad image ───────────────────────────────────────────────
  const roi_averages = body.roi_averages as ROIAverage[]
  const image_count = body.image_count as number
  const isSingle = image_count === 1

  const scoreLines = roi_averages
    .map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`)
    .join('\n')

  return isSingle
    ? `You are interpreting BERG fMRI brain activation predictions for a static ad image.

BERG predicts which visual cortex regions activate when a viewer looks at the ad. Scores are normalized 0–1.

Brain activation scores:
${scoreLines}

Give 3–4 specific, actionable suggestions to improve this ad's visual impact and attention capture for paid media performance. Reference specific region names and scores (e.g. "Your FFA score of 0.08 is low — the absence of a human face is likely reducing viewer attention; add a person or expressive face near the focal point"). Do not guarantee outcomes.

Format as a markdown bulleted list. Each bullet is one to two sentences.`
    : `You are interpreting BERG fMRI brain activation predictions for a batch of ${image_count} static ad images.

BERG predicts which visual cortex regions activate when a viewer looks at an ad. Scores are normalized 0–1.

Average activation across all ${image_count} ads:
${scoreLines}

Give 4–5 concise, actionable design suggestions for improving this creative set's performance in paid media. Reference specific region names and scores. Do not guarantee outcomes.

Format as a markdown bulleted list. Each bullet is one to two sentences.`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const image_base64: string | undefined = body.image_base64
  const mime_type: string = body.mime_type ?? 'image/jpeg'

  const bergPrompt = buildBergPrompt(body)

  // Run BERG text recommendations (Haiku) and Sonnet vision ad analysis in parallel
  const [claudeMessage, visual_analysis] = await Promise.all([
    anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: bergPrompt }],
    }),
    image_base64 ? runSonnetAdAnalysis(image_base64, mime_type) : Promise.resolve(null),
  ])

  const summary = claudeMessage.content[0].type === 'text' ? claudeMessage.content[0].text : ''

  return NextResponse.json({
    summary,
    ...(visual_analysis ? { visual_analysis } : {}),
  })
}
