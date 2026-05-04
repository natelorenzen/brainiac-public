import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export interface RecentAnalysis {
  id: string
  created_at: string
  spend_usd: number | null
  is_winner: boolean | null
  mean_top_roi_score: number | null
  heatmap_url: string | null
  framework_grade: string | null
  composition_tag: string | null
  headline_text: string | null
  status: string
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? '20'), 1), 50)

  const { data, error } = await supabaseServer
    .from('analyses')
    .select('id, created_at, spend_usd, is_winner, mean_top_roi_score, heatmap_url, comprehensive_analysis, status')
    .eq('user_id', user.id)
    .eq('type', 'thumbnail')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: RecentAnalysis[] = (data ?? []).map(r => {
    const ca = r.comprehensive_analysis as Record<string, unknown> | null
    const copy = ca?.copy as Record<string, unknown> | undefined
    const headline = copy?.headline as Record<string, unknown> | undefined
    const fwk = ca?.framework_score as Record<string, unknown> | undefined
    return {
      id: r.id,
      created_at: r.created_at,
      spend_usd: r.spend_usd,
      is_winner: r.is_winner,
      mean_top_roi_score: r.mean_top_roi_score,
      heatmap_url: r.heatmap_url,
      framework_grade: (fwk?.overall_framework_grade as string) ?? null,
      composition_tag: (ca?.composition_tag as string) ?? null,
      headline_text: (headline?.text as string) ?? null,
      status: r.status,
    }
  })

  return NextResponse.json({ analyses: rows })
}
