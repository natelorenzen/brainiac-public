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

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const roi_averages: ROIAverage[] = body?.roi_averages ?? []
  const image_count: number = body?.image_count ?? 0

  if (!roi_averages.length || image_count === 0) {
    return NextResponse.json({ error: 'roi_averages and image_count are required' }, { status: 400 })
  }

  const scoreLines = roi_averages
    .map(r => `- ${r.label}: ${r.activation.toFixed(3)} — ${r.description}`)
    .join('\n')

  const isSingle = image_count === 1

  const prompt = isSingle
    ? `You are interpreting BERG (Brain Encoding Response Generator) fMRI brain activation predictions for a single thumbnail image.

BERG predicts which visual cortex regions activate when a person views an image, based on models trained on the Natural Scenes Dataset (NSD). Scores are normalized 0–1; higher means stronger predicted activation.

Brain activation scores for this image:
${scoreLines}

The highest-scoring regions reveal what this image is driving visually. The lowest-scoring regions reveal what is underutilized.

Give 3–4 specific, actionable suggestions to improve this thumbnail's visual impact based on these exact scores. Reference the specific regions by name (e.g. "Your low FFA score suggests…"). Do not guarantee outcomes or claim direct causation with engagement.

Format as a markdown bulleted list. Each bullet should be one to two sentences.`
    : `You are interpreting BERG (Brain Encoding Response Generator) fMRI brain activation predictions for a set of ${image_count} thumbnail images.

BERG predicts which visual cortex regions activate when a person views an image, based on models trained on the Natural Scenes Dataset (NSD). Scores are normalized 0–1; higher means stronger predicted activation.

Average activation across all ${image_count} images:
${scoreLines}

Based on these brain activation patterns, give 4–5 concise, specific, actionable design suggestions for improving these thumbnails. Focus on what the scores reveal about visual attention and cognitive processing. Do not guarantee performance outcomes or claim direct causation with viewer engagement.

Format as a markdown bulleted list. Each bullet should be one to two sentences.`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const summary = message.content[0].type === 'text' ? message.content[0].text : ''

  return NextResponse.json({ summary })
}
