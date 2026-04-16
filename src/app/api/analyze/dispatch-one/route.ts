import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage } from '@/lib/usage'
import { dispatchThumbnailJob, ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Dispatches a single thumbnail to Modal for inference.
// Creates one analyses row, fires one Modal POST, increments usage by 1.
// Returns immediately with the analysis_id. Client polls /api/analyze/[id].

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const thumbnailUrl: string = body?.thumbnail_url ?? ''
  if (!thumbnailUrl) return NextResponse.json({ error: 'thumbnail_url is required' }, { status: 400 })

  // Re-check caps on each dispatch (user may have hit limits mid-batch)
  const [userLimit, budgetLimit] = await Promise.all([
    checkUserLimits(user.id),
    checkGlobalBudget(),
  ])

  if (!userLimit.allowed) {
    return NextResponse.json(
      { reason: userLimit.reason, limit_type: userLimit.limit_type, resets_at: userLimit.resets_at },
      { status: 429 }
    )
  }
  if (!budgetLimit.allowed) {
    return NextResponse.json(
      { reason: budgetLimit.reason, limit_type: budgetLimit.limit_type, resets_at: budgetLimit.resets_at },
      { status: 429 }
    )
  }

  const { data: analysis, error: insertError } = await supabaseServer
    .from('analyses')
    .insert({
      user_id: user.id,
      type: 'channel_batch',
      status: 'queued',
      source: 'youtube_channel',
    })
    .select('id')
    .single()

  if (!analysis) {
    return NextResponse.json({ error: `DB insert failed: ${insertError?.message}` }, { status: 500 })
  }

  await supabaseServer
    .from('analyses')
    .update({ status: 'processing' })
    .eq('id', analysis.id)

  try {
    await dispatchThumbnailJob({
      analysis_id: analysis.id,
      thumbnail_url: thumbnailUrl,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    })
  } catch (err) {
    await supabaseServer
      .from('analyses')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', analysis.id)
    return NextResponse.json({ error: `Modal dispatch failed: ${String(err)}` }, { status: 502 })
  }

  await incrementUsage(user.id, 1)

  return NextResponse.json({ analysis_id: analysis.id, attribution: ATTRIBUTION })
}
