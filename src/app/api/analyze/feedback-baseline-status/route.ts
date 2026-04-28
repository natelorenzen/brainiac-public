import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { getHistoricalAdCount } from '@/lib/pattern-library'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error } = await supabaseServer.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [latest, ads_analyzed] = await Promise.all([
    supabaseServer
      .from('feedback_baseline_evolution')
      .select('version, ads_analyzed, created_at')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(r => r.data),
    getHistoricalAdCount(),
  ])

  return NextResponse.json({
    has_evolution: !!latest,
    version: latest?.version ?? 0,
    ads_analyzed,
    last_updated_at: latest?.created_at ?? null,
  })
}
