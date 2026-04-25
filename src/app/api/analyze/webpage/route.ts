import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage } from '@/lib/usage'
import { ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BLOCKED_PATTERNS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./,
  /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^fc00:/i, /^fe80:/i,
]

function isSafeUrl(raw: string): boolean {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !BLOCKED_PATTERNS.some(p => p.test(parsed.hostname))
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const url: string = body?.url?.trim() ?? ''
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
  if (!isSafeUrl(url)) return NextResponse.json({ error: 'Invalid or disallowed URL' }, { status: 400 })

  const [userLimit, budgetLimit] = await Promise.all([
    checkUserLimits(user.id), checkGlobalBudget(),
  ])
  if (!userLimit.allowed) return NextResponse.json(
    { reason: userLimit.reason, limit_type: userLimit.limit_type, resets_at: userLimit.resets_at },
    { status: 429 }
  )
  if (!budgetLimit.allowed) return NextResponse.json(
    { reason: budgetLimit.reason, limit_type: budgetLimit.limit_type, resets_at: budgetLimit.resets_at },
    { status: 429 }
  )

  // Create both analysis records immediately
  const [dRes, mRes] = await Promise.all([
    supabaseServer.from('analyses').insert({ user_id: user.id, type: 'thumbnail', status: 'queued', source: 'manual_upload' }).select('id').single(),
    supabaseServer.from('analyses').insert({ user_id: user.id, type: 'thumbnail', status: 'queued', source: 'manual_upload' }).select('id').single(),
  ])

  if (!dRes.data || !mRes.data) {
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  }

  await incrementUsage(user.id, 2)

  // Fire-and-forget to the capture route — runs as its own independent Vercel function
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brainiac-ivory.vercel.app'
  fetch(`${appUrl}/api/analyze/webpage/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
    body: JSON.stringify({ url, desktop_id: dRes.data.id, mobile_id: mRes.data.id }),
  }).catch(() => {}) // intentionally not awaited

  return NextResponse.json({
    desktop: { analysis_id: dRes.data.id },
    mobile:  { analysis_id: mRes.data.id },
    attribution: ATTRIBUTION,
  })
}
