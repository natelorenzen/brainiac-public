import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface ROIAverage {
  region_key: string
  label: string
  description: string
  activation: number
}

interface CorrelationEntry {
  region_key: string
  label: string
  description: string
  r: number
}

const anthropic = new Anthropic()

function buildPrompt(body: Record<string, unknown>): string {
  const context = body.context as string | undefined

  // ── YouTube channel correlation ──────────────────────────────────────────
  if (context === 'channel') {
    const handle = body.channel_handle as string
    const video_count = body.video_count as number
    const correlations = body.correlations as CorrelationEntry[]
    const lines = correlations
      .map(c => `- ${c.label}: r=${c.r.toFixed(3)} (${Math.abs(c.r) >= 0.5 ? 'strong' : Math.abs(c.r) >= 0.25 ? 'moderate' : 'weak'} ${c.r >= 0 ? 'positive' : 'negative'} correlation with view count)`)
      .join('\n')

    return `You are interpreting BERG fMRI brain activation data correlated against real view counts for the YouTube channel @${handle} (${video_count} videos analyzed).

Each score is a Pearson r between that brain region's predicted activation and log(view_count). Positive r means thumbnails that activated that region more tended to get more views on this channel.

Correlation results:
${lines}

Give 3–4 specific, actionable suggestions for how this creator should design future thumbnails based on which brain regions actually correlate with performance on their channel. Reference the specific region names and r values. Do not guarantee outcomes.

Format as a markdown bulleted list. Each bullet is one to two sentences.`
  }

  // ── Video TRIBE v2 analysis ──────────────────────────────────────────────
  if (context === 'video') {
    const roi_data = body.roi_data as ROIAverage[]
    const lines = roi_data
      .map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`)
      .join('\n')

    return `You are interpreting Meta FAIR TRIBE v2 fMRI brain activation predictions for an uploaded video.

TRIBE v2 predicts which cortical regions activate as someone watches the video, based on the Natural Scenes Dataset. Scores are normalized 0–1.

Average activation across the video:
${lines}

Give 3–4 specific, actionable suggestions to improve this video's visual impact based on what the activation pattern reveals about attention and cognitive load. Reference specific region names. Do not guarantee outcomes.

Format as a markdown bulleted list. Each bullet is one to two sentences.`
  }

  // ── Image batch (default) ────────────────────────────────────────────────
  const roi_averages = body.roi_averages as ROIAverage[]
  const image_count = body.image_count as number
  const isSingle = image_count === 1

  const scoreLines = roi_averages
    .map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`)
    .join('\n')

  return isSingle
    ? `You are interpreting BERG fMRI brain activation predictions for a single thumbnail image.

Brain activation scores:
${scoreLines}

Give 3–4 specific, actionable suggestions to improve this thumbnail's visual impact. Reference specific region names (e.g. "Your low FFA score suggests…"). Do not guarantee outcomes.

Format as a markdown bulleted list. Each bullet is one to two sentences.`
    : `You are interpreting BERG fMRI brain activation predictions for a set of ${image_count} thumbnail images.

Average activation across all ${image_count} images:
${scoreLines}

Give 4–5 concise, actionable design suggestions based on these activation patterns. Do not guarantee outcomes.

Format as a markdown bulleted list. Each bullet is one to two sentences.`
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const prompt = buildPrompt(body)

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const summary = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ summary })
}
