import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface ROIAverage {
  region_key: string
  label: string
  description: string
  activation: number
}

const anthropic = new Anthropic({ timeout: 120000 })

// Set to true to enable extended thinking on both Sonnet calls.
// Produces more thorough output at the cost of ~5–10s extra latency.
const EXTENDED_THINKING = false
const THINKING_BUDGET = 10000

export interface VisualAdAnalysis {
  cta_strength: { score: number; feedback: string }
  emotional_appeal: { score: number; feedback: string }
  brand_clarity: { score: number; feedback: string }
  visual_hierarchy: { score: number; feedback: string }
  overall_verdict: string
}

// ── Call 1: BERG-based ad recommendations (text only) ────────────────────────

function buildBergPrompt(body: Record<string, unknown>): string {
  const context = body.context as string | undefined

  if (context === 'webpage_desktop' || context === 'webpage_mobile') {
    const page_url = body.page_url as string
    const roi_data = body.roi_data as ROIAverage[]
    const viewport = context === 'webpage_desktop' ? 'desktop (1280×720)' : 'mobile (390×844, iPhone UA)'
    const lines = roi_data.map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`).join('\n')

    return `You are interpreting BERG fMRI brain activation predictions for an ad landing page screenshot captured on ${viewport}.

BERG predicts which visual cortex regions activate when a person views the page above the fold. Scores are normalized 0–1. Higher scores mean stronger predicted neural engagement with that type of visual processing.

Page: ${page_url}
Viewport: ${viewport}

Brain activation scores:
${lines}

Give 4–5 specific, actionable design suggestions to improve this landing page's ability to convert ad traffic. Ground every suggestion in a specific region score — name the region, quote the score, and explain the implication. Consider layout differences appropriate for ${context === 'webpage_desktop' ? 'desktop (wide viewport, mouse interaction)' : 'mobile (narrow viewport, thumb reach, smaller text)'}.

Do not skip any region with a notably high or low score. Format as a markdown bulleted list. Each bullet is two to three sentences. Do not guarantee business outcomes.`
  }

  const roi_averages = body.roi_averages as ROIAverage[]
  const image_count = body.image_count as number
  const scoreLines = roi_averages.map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`).join('\n')

  return image_count === 1
    ? `You are interpreting BERG fMRI brain activation predictions for a static ad image.

BERG predicts which visual cortex regions activate when a viewer sees this ad. Scores are normalized 0–1.

Brain activation scores:
${scoreLines}

Give 4–5 specific, actionable suggestions to improve this ad's visual impact for paid media performance. For each suggestion, name the region, quote the score, explain what it means about the creative, and state the specific change to make. Do not skip any region with a notably high or low score.

Format as a markdown bulleted list. Each bullet is two to three sentences. Do not guarantee outcomes.`
    : `You are interpreting BERG fMRI brain activation predictions for a batch of ${image_count} static ad images.

Average activation across all ${image_count} ads:
${scoreLines}

Give 5–6 concise, actionable design suggestions for improving this creative set's performance in paid media. Cover every region — name it, quote the score, and give a concrete recommendation. Do not skip or combine regions to save space.

Format as a markdown bulleted list. Each bullet is two to three sentences. Do not guarantee outcomes.`
}

async function runBergAnalysis(body: Record<string, unknown>): Promise<string> {
  const prompt = buildBergPrompt(body)

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  }

  if (EXTENDED_THINKING) {
    params.thinking = { type: 'enabled', budget_tokens: THINKING_BUDGET }
    params.max_tokens = THINKING_BUDGET + 8192
  }

  const message = await anthropic.messages.create(params)
  const textBlock = message.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

// ── Call 2: Sonnet vision ad-dimension scoring ────────────────────────────────

async function runAdDimensionAnalysis(image_base64: string, mime_type: string): Promise<VisualAdAnalysis | null> {
  const prompt = `You are an expert advertising creative director analyzing a static ad image for paid media performance potential.

Score the ad on these four dimensions. Be specific — reference what you actually see in the image (colors, layout, copy, imagery) to justify each score. Do not give generic feedback.

Return a JSON object with exactly this structure — no extra keys, no markdown fences:
{
  "cta_strength": {
    "score": <integer 1-10>,
    "feedback": "<two sentences: what specifically makes the CTA strong or weak, and what exact change would improve it>"
  },
  "emotional_appeal": {
    "score": <integer 1-10>,
    "feedback": "<two sentences: what emotion does the image evoke or fail to evoke, and why>"
  },
  "brand_clarity": {
    "score": <integer 1-10>,
    "feedback": "<two sentences: what brand signals are present or missing, and what would make the brand more immediately recognizable>"
  },
  "visual_hierarchy": {
    "score": <integer 1-10>,
    "feedback": "<two sentences: describe the actual eye path the layout creates and whether it serves the ad's goal>"
  },
  "overall_verdict": "<three to four sentences: name the single strongest element with a reason, name the single biggest weakness with a reason, and give the one highest-priority fix>"
}`

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
            media_type: mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: image_base64,
          },
        },
        { type: 'text', text: prompt },
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
    return JSON.parse(cleaned) as VisualAdAnalysis
  } catch {
    return null
  }
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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try { controller.enqueue(encoder.encode('\n')) } catch {}
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode('\n')) } catch {}
      }, 10000)
      try {
        const [summary, visual_analysis] = await Promise.all([
          runBergAnalysis(body),
          image_base64 ? runAdDimensionAnalysis(image_base64, mime_type) : Promise.resolve(null),
        ])
        controller.enqueue(encoder.encode(JSON.stringify({
          summary,
          ...(visual_analysis ? { visual_analysis } : {}),
        }) + '\n'))
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: e instanceof Error ? e.message : 'Image-summary failed' }) + '\n'))
      } finally {
        clearInterval(ping)
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/json' } })
}
