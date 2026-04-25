import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage } from '@/lib/usage'
import { dispatchThumbnailJob, ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // for the after() background work

const BLOCKED_PATTERNS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./,
  /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^fc00:/i, /^fe80:/i,
]

const BLOCKED_DOMAINS = [
  'cdn.cookielaw.org', 'consent.cookiebot.com', 'cdn.consentmanager.net',
  'js.cookieconsent.com', 'cdn.privacy-mgmt.com', 'cookie-script.com',
  'cookiehub.com', 'usercentrics.eu', 'cookiepro.com',
]

const POPUP_HIDE_CSS = `
  [id*="cookie"i],[class*="cookie"i],[id*="consent"i],[class*="consent"i],
  [id*="gdpr"i],[class*="gdpr"i],[id*="popup"i],[class*="popup"i],
  [id*="modal"i],[class*="modal"i],[id*="newsletter"i],[class*="newsletter"i],
  [id*="overlay"i],[class*="overlay"i],[role="dialog"],
  #onetrust-banner-sdk,#onetrust-consent-sdk,.onetrust-pc-dark-filter,
  #CybotCookiebotDialog,.cc-window,.fc-dialog-container,
  .sp-message-container,.didomi-popup-container,#didomi-host,.qc-cmp2-container {
    display:none!important;visibility:hidden!important;pointer-events:none!important;
  }
  html,body{overflow:hidden!important;}
`

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function isSafeUrl(raw: string): boolean {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !BLOCKED_PATTERNS.some(p => p.test(parsed.hostname))
}

async function captureViewport(
  pageFactory: () => Promise<import('puppeteer-core').Page>,
  width: number, height: number, mobile: boolean, targetUrl: string,
): Promise<Buffer> {
  const page = await pageFactory()
  await page.setRequestInterception(true)
  page.on('request', req => {
    const host = (() => { try { return new URL(req.url()).hostname } catch { return '' } })()
    BLOCKED_DOMAINS.some(d => host.includes(d)) ? req.abort() : req.continue()
  })
  page.on('dialog', d => d.dismiss())
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile })
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
  if (mobile) await page.setUserAgent(MOBILE_UA)
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 25000 })
  } catch {
    await new Promise(r => setTimeout(r, 2000))
  }
  await page.addStyleTag({ content: POPUP_HIDE_CSS }).catch(() => {})
  await new Promise(r => setTimeout(r, 800))
  const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } })
  await page.close()
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
}

async function uploadDispatchOne(
  buf: Buffer, analysisId: string, userId: string,
): Promise<void> {
  const path = `${analysisId}.png`

  const { error: uploadErr } = await supabaseServer.storage
    .from('creatives').upload(path, buf, { contentType: 'image/png', upsert: false })
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

  // Store the key so the poll endpoint can generate a signed URL for display
  await supabaseServer.from('analyses')
    .update({ status: 'processing', input_storage_key: path })
    .eq('id', analysisId)

  const { data: signed } = await supabaseServer.storage
    .from('creatives').createSignedUrl(path, 3600)
  if (!signed?.signedUrl) throw new Error('Could not create signed URL')

  await dispatchThumbnailJob({
    analysis_id: analysisId,
    thumbnail_url: signed.signedUrl,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  })
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

  // Create both analysis records immediately (fast DB inserts)
  const [dRes, mRes] = await Promise.all([
    supabaseServer.from('analyses').insert({ user_id: user.id, type: 'thumbnail', status: 'queued', source: 'manual_upload' }).select('id').single(),
    supabaseServer.from('analyses').insert({ user_id: user.id, type: 'thumbnail', status: 'queued', source: 'manual_upload' }).select('id').single(),
  ])

  if (!dRes.data || !mRes.data) {
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  }

  const desktopId = dRes.data.id
  const mobileId = mRes.data.id

  await incrementUsage(user.id, 2)

  // Return immediately — screenshot work runs after the response is sent
  after(async () => {
    try {
      const chromium = (await import('@sparticuz/chromium')).default
      const puppeteer = (await import('puppeteer-core')).default

      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: null,
        executablePath: await chromium.executablePath(),
        headless: true,
      })

      const makeNewPage = () => browser.newPage()
      const [desktopBuf, mobileBuf] = await Promise.all([
        captureViewport(makeNewPage, 1280, 720, false, url),
        captureViewport(makeNewPage, 390, 844, true, url),
      ])
      await browser.close()

      await Promise.all([
        uploadDispatchOne(desktopBuf, desktopId, user.id),
        uploadDispatchOne(mobileBuf, mobileId, user.id),
      ])
    } catch (err) {
      // Mark both failed if screenshot work throws
      await Promise.all([
        supabaseServer.from('analyses').update({ status: 'failed', error_message: String(err) }).eq('id', desktopId),
        supabaseServer.from('analyses').update({ status: 'failed', error_message: String(err) }).eq('id', mobileId),
      ])
    }
  })

  return NextResponse.json({
    desktop: { analysis_id: desktopId },
    mobile:  { analysis_id: mobileId },
    attribution: ATTRIBUTION,
  })
}
