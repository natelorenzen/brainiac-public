import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, getRemainingDaily, getRemainingMonthly } from '@/lib/usage'
import { hasRequiredConsents } from '@/lib/consent'
import { fetchChannelThumbnails } from '@/lib/youtube'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Resolves a YouTube channel handle → returns video list with metadata.
// Does NOT create analysis rows or call Modal — just validates auth/caps and
// fetches the video list. Fast (<3s). The client dispatches thumbnails one at a time.

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const consented = await hasRequiredConsents(user.id)
  if (!consented) return NextResponse.json({ error: 'Required consents not recorded.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const channelHandle: string = body?.channel_handle ?? ''
  if (!channelHandle) return NextResponse.json({ error: 'channel_handle is required' }, { status: 400 })

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

  // Cap fetch count by remaining quota
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('daily_count, monthly_count')
    .eq('id', user.id)
    .single()

  const remaining = Math.min(
    getRemainingDaily(profile?.daily_count ?? 0),
    getRemainingMonthly(profile?.monthly_count ?? 0),
    15
  )

  if (remaining === 0) {
    return NextResponse.json(
      { reason: 'No analyses remaining in your quota.', limit_type: 'daily', resets_at: null },
      { status: 429 }
    )
  }

  let videos: Awaited<ReturnType<typeof fetchChannelThumbnails>>
  try {
    videos = await fetchChannelThumbnails(channelHandle, remaining)
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch channel: ${String(err)}` }, { status: 422 })
  }

  if (videos.length === 0) {
    return NextResponse.json({ error: 'No videos found for that channel.' }, { status: 404 })
  }

  return NextResponse.json({ videos })
}
