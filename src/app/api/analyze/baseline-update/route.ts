import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { keepAliveStream } from '@/lib/streaming'
import { runBaselineEvolution } from '@/lib/baseline-evolution'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * Manual safety-net trigger for the feedback baseline evolution. The auto
 * path runs from synthesize-patterns after every historical ad — this
 * endpoint exists so the user can re-run the 4th pass if the auto attempt
 * silently failed (e.g. transient Claude error).
 *
 * The helper is idempotent: it re-checks the milestone gate server-side
 * and returns { evolved: false, reason: 'no_milestone_pending' } if the
 * baseline is already current. The UI gates the button anyway, but never
 * trust client state.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return keepAliveStream(async () => runBaselineEvolution())
}
