import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/users/me/data-export — full JSON export for GDPR/CCPA compliance
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profile, consents, analyses, connectedAccounts, adCreatives] = await Promise.all([
    supabaseServer.from('profiles').select('*').eq('id', user.id).single(),
    supabaseServer.from('user_consents').select('*').eq('user_id', user.id),
    supabaseServer.from('analyses').select('*').eq('user_id', user.id),
    supabaseServer.from('connected_accounts').select('id,platform,platform_account_name,connected_at,last_synced_at,is_active').eq('user_id', user.id),
    supabaseServer.from('ad_creatives').select('id,platform_creative_id,creative_type,platform_name,created_at').eq('user_id', user.id),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    profile: profile.data,
    consents: consents.data ?? [],
    analyses: (analyses.data ?? []).map(a => ({
      ...a,
      // Omit raw storage keys from export — provide count and status only
      input_storage_key: undefined,
      heatmap_storage_key: undefined,
    })),
    connected_accounts: connectedAccounts.data ?? [],
    ad_creatives: adCreatives.data ?? [],
    attribution: {
      note: 'Anonymized aggregate signals derived from your analyses are retained permanently with no user linkage.',
    },
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="adforge-data-export-${new Date().toISOString().slice(0,10)}.json"`,
    },
  })
}
