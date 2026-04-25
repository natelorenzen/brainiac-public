import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { dispatchThumbnailJob } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

async function uploadAndDispatch(buf: Buffer, analysisId: string): Promise<void> {
  const path = `${analysisId}.png`
  const { error: uploadErr } = await supabaseServer.storage
    .from('creatives').upload(path, buf, { contentType: 'image/png', upsert: false })
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

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

// Internal route — called fire-and-forget from /api/analyze/webpage
// Secured by SUPABASE_SERVICE_ROLE_KEY header so it can't be called externally
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { url, desktop_id, mobile_id } = await req.json()
  if (!url || !desktop_id || !mobile_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  try {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: null,
      executablePath: await chromium.executablePath(),
      headless: true,
    })

    const [desktopBuf, mobileBuf] = await Promise.all([
      captureViewport(() => browser.newPage(), 1280, 720, false, url),
      captureViewport(() => browser.newPage(), 390, 844, true, url),
    ])
    await browser.close()

    await Promise.all([
      uploadAndDispatch(desktopBuf, desktop_id),
      uploadAndDispatch(mobileBuf, mobile_id),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    await Promise.all([
      supabaseServer.from('analyses').update({ status: 'failed', error_message: String(err) }).eq('id', desktop_id),
      supabaseServer.from('analyses').update({ status: 'failed', error_message: String(err) }).eq('id', mobile_id),
    ])
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
