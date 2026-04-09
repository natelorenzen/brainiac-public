import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { checkUserLimits, checkGlobalBudget, incrementUsage } from '@/lib/usage'
import { hasRequiredConsents } from '@/lib/consent'
import { uploadCreative } from '@/lib/storage'
import { dispatchInferenceJob, ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Consent gate
  const consented = await hasRequiredConsents(user.id)
  if (!consented) {
    return NextResponse.json(
      { error: 'Required consents not recorded. Complete the consent flow first.' },
      { status: 403 }
    )
  }

  // Usage caps
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

  // Parse body — accept multipart file upload or JSON with image_base64
  let imageBuffer: Buffer
  let mimeType: string

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('image')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }
    imageBuffer = Buffer.from(await file.arrayBuffer())
    mimeType = file.type || 'image/jpeg'
  } else {
    const body = await req.json().catch(() => null)
    if (!body?.image_base64) {
      return NextResponse.json({ error: 'Provide image as multipart file or image_base64' }, { status: 400 })
    }
    imageBuffer = Buffer.from(body.image_base64, 'base64')
    mimeType = body.mime_type ?? 'image/jpeg'
  }

  // Validate size (max 10MB)
  if (imageBuffer.length > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 })
  }

  // Create analysis record
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

  if (insertError || !analysis) {
    return NextResponse.json({ error: 'Failed to create analysis record' }, { status: 500 })
  }

  // Upload image to Supabase Storage
  let storageKey: string
  try {
    storageKey = await uploadCreative(imageBuffer, analysis.id, mimeType)
  } catch (err) {
    const msg = String(err)
    await supabaseServer.from('analyses').update({ status: 'failed', error_message: msg }).eq('id', analysis.id)
    return NextResponse.json({ error: `Image storage failed: ${msg}` }, { status: 500 })
  }

  // Save storage key
  await supabaseServer
    .from('analyses')
    .update({ input_storage_key: storageKey, status: 'processing' })
    .eq('id', analysis.id)

  // Dispatch Modal inference job (fire and forget — worker updates Supabase when done)
  try {
    await dispatchInferenceJob({
      analysis_id: analysis.id,
      storage_key: storageKey,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    })
  } catch (err) {
    await supabaseServer
      .from('analyses')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', analysis.id)
    return NextResponse.json({ error: `Inference dispatch failed: ${String(err)}` }, { status: 500 })
  }

  // Increment usage
  await incrementUsage(user.id)

  return NextResponse.json({
    analysis_id: analysis.id,
    status: 'processing',
    attribution: ATTRIBUTION,
  })
}
