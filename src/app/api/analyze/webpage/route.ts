import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage } from '@/lib/usage'
import { dispatchThumbnailJob, ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

// CMP/consent script domains to block at the network level
const BLOCKED_DOMAINS = [
  'cdn.cookielaw.org',
  'consent.cookiebot.com',
  'cdn.consentmanager.net',
  'js.cookieconsent.com',
  'cdn.privacy-mgmt.com',
  'cookie-script.com',
  'cookiehub.com',
  'usercentrics.eu',
  'cookiepro.com',
]

// CSS injected after page load to hide remaining consent UIs and overlays
const POPUP_HIDE_CSS = `
  [id*="cookie"i], [class*="cookie"i],
  [id*="consent"i], [class*="consent"i],
  [id*="gdpr"i], [class*="gdpr"i],
  [id*="popup"i], [class*="popup"i],
  [id*="modal"i], [class*="modal"i],
  [id*="newsletter"i], [class*="newsletter"i],
  [id*="overlay"i], [class*="overlay"i],
  [id*="notice"i][class*="notice"i],
  [id*="banner"i][style*="position: fixed"i],
  [class*="banner"i][style*="position: fixed"i],
  [role="dialog"],
  #onetrust-banner-sdk,
  #onetrust-consent-sdk,
  .onetrust-pc-dark-filter,
  #CybotCookiebotDialog,
  .cc-window,
  .fc-dialog-container,
  .sp-message-container,
  .truste_overlay,
  .didomi-popup-container,
  #didomi-host,
  .qc-cmp2-container {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  html, body { overflow: hidden !important; }
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
  width: number,
  height: number,
  mobile: boolean,
  targetUrl: string,
): Promise<Buffer> {
  const page = await pageFactory()

  // Block CMP scripts at network level
  await page.setRequestInterception(true)
  page.on('request', req => {
    const hostname = (() => { try { return new URL(req.url()).hostname } catch { return '' } })()
    if (BLOCKED_DOMAINS.some(d => hostname.includes(d))) {
      req.abort()
    } else {
      req.continue()
    }
  })

  // Auto-dismiss browser dialogs (alert, confirm, beforeunload)
  page.on('dialog', d => d.dismiss())

  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile })
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
  if (mobile) await page.setUserAgent(MOBILE_UA)

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 25000 })
  } catch {
    // Page timed out waiting for network idle — it has still (partially) loaded.
    // Give it a moment to render what's there rather than re-navigating.
    await new Promise(r => setTimeout(r, 2000))
  }

  // Hide any consent UI that loaded after network settled
  await page.addStyleTag({ content: POPUP_HIDE_CSS }).catch(() => {})

  // Settle for JS-rendered content / animations
  await new Promise(r => setTimeout(r, 800))

  const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } })
  await page.close()
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
}

async function uploadAndDispatch(
  buf: Buffer,
  userId: string,
  thumbnailUrl: string,
  label: string,
): Promise<{ analysis_id: string; screenshot_url: string }> {
  const { data: analysis, error: insertError } = await supabaseServer
    .from('analyses')
    .insert({ user_id: userId, type: 'thumbnail', status: 'queued', source: 'manual_upload' })
    .select('id')
    .single()

  if (!analysis) throw new Error(`DB insert failed (${label}): ${insertError?.message}`)

  const path = `${analysis.id}.png`
  const { error: uploadError } = await supabaseServer.storage
    .from('creatives')
    .upload(path, buf, { contentType: 'image/png', upsert: false })
  if (uploadError) throw new Error(`Upload failed (${label}): ${uploadError.message}`)

  const { data: signed } = await supabaseServer.storage.from('creatives').createSignedUrl(path, 3600)
  if (!signed?.signedUrl) throw new Error(`Signed URL failed (${label})`)

  await supabaseServer.from('analyses').update({ status: 'processing' }).eq('id', analysis.id)

  await dispatchThumbnailJob({
    analysis_id: analysis.id,
    thumbnail_url: signed.signedUrl,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  })

  return { analysis_id: analysis.id, screenshot_url: signed.signedUrl }
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

  // Costs 2 analyses (desktop + mobile)
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

  let desktopBuf: Buffer, mobileBuf: Buffer
  try {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: null,
      executablePath: await chromium.executablePath(),
      headless: true,
    })

    const makeNewPage = () => browser.newPage();

    [desktopBuf, mobileBuf] = await Promise.all([
      captureViewport(makeNewPage, 1280, 720, false, url),
      captureViewport(makeNewPage, 390, 844, true, url),
    ])

    await browser.close()
  } catch (err) {
    return NextResponse.json({ error: `Screenshot failed: ${String(err)}` }, { status: 502 })
  }

  let desktop, mobile
  try {
    ;[desktop, mobile] = await Promise.all([
      uploadAndDispatch(desktopBuf, user.id, url, 'desktop'),
      uploadAndDispatch(mobileBuf, user.id, url, 'mobile'),
    ])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  await incrementUsage(user.id, 2)

  return NextResponse.json({ desktop, mobile, attribution: ATTRIBUTION })
}
