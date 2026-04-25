import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage } from '@/lib/usage'
import { dispatchThumbnailJob, ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Blocked IP ranges for SSRF prevention
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]

function isSafeUrl(raw: string): boolean {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname
  return !BLOCKED_PATTERNS.some(p => p.test(host))
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const url: string = body?.url?.trim() ?? ''
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
  if (!isSafeUrl(url)) return NextResponse.json({ error: 'Invalid or disallowed URL' }, { status: 400 })

  const [userLimit, budgetLimit] = await Promise.all([
    checkUserLimits(user.id),
    checkGlobalBudget(),
  ])
  if (!userLimit.allowed) return NextResponse.json(
    { reason: userLimit.reason, limit_type: userLimit.limit_type, resets_at: userLimit.resets_at },
    { status: 429 }
  )
  if (!budgetLimit.allowed) return NextResponse.json(
    { reason: budgetLimit.reason, limit_type: budgetLimit.limit_type, resets_at: budgetLimit.resets_at },
    { status: 429 }
  )

  // Take screenshot
  // chromium-min downloads the binary to /tmp at cold-start (~15s once per instance)
  // CHROMIUM_DOWNLOAD_URL can be overridden to a self-hosted binary for faster cold starts
  const CHROMIUM_URL =
    process.env.CHROMIUM_DOWNLOAD_URL ??
    'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'

  let screenshotBuffer: Buffer
  try {
    const chromium = (await import('@sparticuz/chromium-min')).default
    const puppeteer = (await import('puppeteer-core')).default

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(CHROMIUM_URL),
      headless: true,
    })

    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 })
    } catch {
      // Fallback: domcontentloaded is enough if networkidle2 times out
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
    }

    // Small settle delay for JS-rendered content
    await new Promise(r => setTimeout(r, 1500))

    const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 720 } })
    await browser.close()

    screenshotBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
  } catch (err) {
    return NextResponse.json({ error: `Screenshot failed: ${String(err)}` }, { status: 502 })
  }

  // Create analyses row
  const { data: analysis, error: insertError } = await supabaseServer
    .from('analyses')
    .insert({
      user_id: user.id,
      type: 'thumbnail',
      status: 'queued',
      source: 'manual_upload',
    })
    .select('id')
    .single()

  if (!analysis) {
    return NextResponse.json({ error: `DB insert failed: ${insertError?.message}` }, { status: 500 })
  }

  // Upload screenshot to creatives bucket
  const storagePath = `${analysis.id}.png`
  const { error: uploadError } = await supabaseServer.storage
    .from('creatives')
    .upload(storagePath, screenshotBuffer, { contentType: 'image/png', upsert: false })

  if (uploadError) {
    await supabaseServer.from('analyses').update({ status: 'failed', error_message: uploadError.message }).eq('id', analysis.id)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Signed URL for Modal to download (1 hour) and for client to display
  const { data: signedData } = await supabaseServer.storage
    .from('creatives')
    .createSignedUrl(storagePath, 3600)

  if (!signedData?.signedUrl) {
    return NextResponse.json({ error: 'Could not create signed URL' }, { status: 500 })
  }

  await supabaseServer.from('analyses').update({ status: 'processing' }).eq('id', analysis.id)

  try {
    await dispatchThumbnailJob({
      analysis_id: analysis.id,
      thumbnail_url: signedData.signedUrl,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    })
  } catch (err) {
    await supabaseServer.from('analyses').update({ status: 'failed', error_message: String(err) }).eq('id', analysis.id)
    return NextResponse.json({ error: `Modal dispatch failed: ${String(err)}` }, { status: 502 })
  }

  await incrementUsage(user.id, 1)

  return NextResponse.json({
    analysis_id: analysis.id,
    screenshot_url: signedData.signedUrl,
    attribution: ATTRIBUTION,
  })
}
