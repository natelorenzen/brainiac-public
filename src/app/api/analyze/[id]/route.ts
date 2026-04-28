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
