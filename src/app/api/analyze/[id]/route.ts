import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { ATTRIBUTION } from '@/lib/inference'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: analysis, error } = await supabaseServer
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id) // enforce ownership
    .single()

  if (error || !analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  // Return a signed screenshot URL if one was uploaded (webpage analyzer)
  let screenshot_url: string | null = null
  if (analysis.input_storage_key) {
    const { data: signed } = await supabaseServer.storage
      .from('creatives').createSignedUrl(analysis.input_storage_key, 3600)
    screenshot_url = signed?.signedUrl ?? null
  }

  return NextResponse.json({
    analysis_id: analysis.id,
    status: analysis.status,
    heatmap_url: analysis.heatmap_url ?? null,
    roi_data: analysis.roi_data ?? null,
    mean_top_roi_score: analysis.mean_top_roi_score ?? null,
    error_message: analysis.error_message ?? null,
    screenshot_url,
    spend_usd: analysis.spend_usd ?? null,
    is_winner: analysis.is_winner ?? null,
    comprehensive_analysis: analysis.comprehensive_analysis ?? null,
    attribution: ATTRIBUTION,
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Confirm ownership before any deletes — RLS would catch it but
  // explicit check gives a cleaner 404 instead of a silent no-op.
  const { data: analysis } = await supabaseServer
    .from('analyses')
    .select('id, user_id, heatmap_storage_key')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })

  // Best-effort cleanup of associated storage and queue entries before
  // deleting the row. None are critical — the row is the source of truth
  // for "does this analysis still exist".
  try {
    if (analysis.heatmap_storage_key) {
      await supabaseServer.storage.from('heatmaps').remove([analysis.heatmap_storage_key])
    }
  } catch { /* non-fatal */ }
  try {
    await supabaseServer.from('synthesis_queue').delete().eq('analysis_id', id)
  } catch { /* non-fatal */ }

  const { error: delErr } = await supabaseServer
    .from('analyses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ deleted: true, analysis_id: id })
}
