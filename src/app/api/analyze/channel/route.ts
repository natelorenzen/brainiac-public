import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage, getRemainingDaily, DAILY_LIMIT } from '@/lib/usage'
import { hasRequiredConsents } from '@/lib/consent'
import { uploadCreative } from '@/lib/storage'
import { dispatchInferenceJob, ATTRIBUTION } from '@/lib/inference'
import { fetchChannelThumbnails } from '@/lib/youtube'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const consented = await hasRequiredConsents(user.id)
  if (!consented) {
    return NextResponse.json({ error: 'Required consents not recorded.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const channelHandle: string = body?.channel_handle ?? ''
  const requestedCount = 25

  if (!channelHandle) {
    return NextResponse.json({ error: 'channel_handle is required' }, { status: 400 })
  }

  // Check limits against batch size BEFORE accepting the job
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

  // Check that user has enough headroom for the full batch
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('daily_count, monthly_count')
    .eq('id', user.id)
    .single()

  const dailyRemaining = getRemainingDaily(profile?.daily_count ?? 0)
  const monthlyRemaining = Math.max(0, 50 - (profile?.monthly_count ?? 0))
  const canRun = Math.min(dailyRemaining, monthlyRemaining, requestedCount)

  if (canRun === 0) {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(0, 0, 0, 0)
    return NextResponse.json(
      {
        reason: `You have 0 analyses remaining. Daily limit: ${DAILY_LIMIT}.`,
        limit_type: 'daily',
        resets_at: tomorrow.toISOString(),
      },
      { status: 429 }
    )
  }

  // If batch is larger than headroom, cap it and inform caller
  const actualCount = canRun < requestedCount ? canRun : requestedCount

  // Fetch thumbnails
  let thumbnails: Awaited<ReturnType<typeof fetchChannelThumbnails>>
  try {
    thumbnails = await fetchChannelThumbnails(channelHandle, actualCount)
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch channel thumbnails: ${String(err)}` }, { status: 422 })
  }

  if (thumbnails.length === 0) {
    return NextResponse.json({ error: 'No thumbnails found for that channel.' }, { status: 404 })
  }

  const analysisIds: string[] = []
  const videoMap: Record<string, { video_id: string; title: string; view_count: number | null; thumbnail_url: string }> = {}
  let firstError: string | null = null

  for (const thumb of thumbnails) {
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
      firstError ??= `Database insert failed: ${insertError?.message ?? 'unknown'}`
      continue
    }

    let storageKey: string
    try {
      storageKey = await uploadCreative(thumb.thumbnail_bytes, analysis.id, 'image/jpeg')
    } catch (err) {
      firstError ??= `Storage upload failed: ${String(err)}`
      await supabaseServer.from('analyses').update({ status: 'failed' }).eq('id', analysis.id)
      continue
    }

    await supabaseServer
      .from('analyses')
      .update({ input_storage_key: storageKey, status: 'processing' })
      .eq('id', analysis.id)

    try {
      await dispatchInferenceJob({
        analysis_id: analysis.id,
        storage_key: storageKey,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      })
      analysisIds.push(analysis.id)
      videoMap[analysis.id] = {
        video_id: thumb.video_id,
        title: thumb.title,
        view_count: thumb.view_count,
        thumbnail_url: thumb.thumbnail_url,
      }
    } catch (err) {
      firstError ??= `Inference dispatch failed: ${String(err)}`
      await supabaseServer.from('analyses').update({ status: 'failed' }).eq('id', analysis.id)
    }
  }

  if (analysisIds.length === 0) {
    return NextResponse.json(
      { error: firstError ?? 'All jobs failed to queue.' },
      { status: 500 }
    )
  }

  if (analysisIds.length > 0) {
    await incrementUsage(user.id, analysisIds.length)
  }

  return NextResponse.json({
    analysis_ids: analysisIds,
    video_map: videoMap,
    queued: analysisIds.length,
    attribution: ATTRIBUTION,
  })
}
