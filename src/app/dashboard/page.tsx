'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ConsentGate } from '@/components/ConsentGate'
import { UsageMeter } from '@/components/UsageMeter'
import { AttributionFooter } from '@/components/AttributionFooter'
import { ImageBatchTab } from '@/components/ImageBatchTab'
import { SessionHistory } from '@/components/SessionHistory'
import { AdAnalysisModal } from '@/components/AdAnalysisModal'
import { LogOut, BarChart3 } from 'lucide-react'
import type { UsageInfo, ConsentType, AnalysisResult } from '@/types'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'

interface Stats {
  count: number
  totalSpend: number
  winners: number
  losers: number
  winRate: number
  avgGrade: string | null
  spendEfficiency: number
}

interface ReopenedAnalysis {
  id: string
  result: AnalysisResult
  comprehensive: ComprehensiveAnalysis | null
  spend?: number
  isWinner?: boolean
  isLoser?: boolean
}

export default function DashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [consentDone, setConsentDone] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [reopened, setReopened] = useState<ReopenedAnalysis | null>(null)
  const [reopenLoading, setReopenLoading] = useState(false)

  const handleReopen = useCallback(async (analysisId: string) => {
    if (!token) return
    setReopenLoading(true)
    try {
      const res = await fetch(`/api/analyze/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const isWinner = data.spend_usd != null && data.spend_usd >= 1000
        const isLoser = data.spend_usd != null && data.spend_usd < 1000
        setReopened({
          id: data.analysis_id,
          result: {
            analysis_id: data.analysis_id,
            status: data.status,
            heatmap_url: data.heatmap_url,
            roi_data: data.roi_data,
            mean_top_roi_score: data.mean_top_roi_score,
            error_message: data.error_message,
            attribution: data.attribution,
          },
          comprehensive: data.comprehensive_analysis,
          spend: data.spend_usd ?? undefined,
          isWinner,
          isLoser,
        })
      }
    } catch { /* ignore */ }
    setReopenLoading(false)
  }, [token])

  const fetchStats = useCallback(async () => {
    // Historical-mode only: feedback mode never sets spend_usd, so this filter
    // separates the two cleanly without needing a dedicated mode column.
    const { data } = await supabase
      .from('analyses')
      .select('spend_usd, is_winner, comprehensive_analysis')
      .eq('type', 'thumbnail')
      .eq('status', 'complete')
      .not('spend_usd', 'is', null)
    const rows = data ?? []
    const count = rows.length
    const totalSpend = rows.reduce((sum, r) => sum + (Number(r.spend_usd) || 0), 0)
    const winners = rows.filter(r => r.is_winner === true)
    const losers = rows.filter(r => r.is_winner !== true)
    const winnerSpend = winners.reduce((sum, r) => sum + (Number(r.spend_usd) || 0), 0)

    const gradeMap: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 }
    const reverseMap: Record<number, string> = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' }
    const grades = rows
      .map(r => {
        const ca = r.comprehensive_analysis as Record<string, unknown> | null
        const g = ((ca?.framework_score as Record<string, unknown>)?.overall_framework_grade as string) ?? null
        return g != null && gradeMap[g] != null ? gradeMap[g] : null
      })
      .filter((n): n is number => n != null)
    const avgGradeNum = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null
    const avgGrade = avgGradeNum != null ? reverseMap[avgGradeNum] : null

    setStats({
      count,
      totalSpend,
      winners: winners.length,
      losers: losers.length,
      winRate: count > 0 ? winners.length / count : 0,
      avgGrade,
      spendEfficiency: winners.length > 0 ? winnerSpend / winners.length : 0,
    })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setToken(session.access_token)

      const [consentRes, usageRes] = await Promise.all([
        fetch('/api/users/me/consent', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/users/me/usage', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetchStats(),
      ])

      const consentData = await consentRes.json()
      setConsentDone(consentData.all_required_consents_given ?? false)
      if (usageRes.ok) setUsage(await usageRes.json())
    })
  }, [router, fetchStats])

  async function handleConsent(types: ConsentType[]) {
    if (!token) return
    const res = await fetch('/api/users/me/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consent_types: types }),
    })
    if (res.ok) setConsentDone(true)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (consentDone === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm animate-pulse-soft">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {!consentDone && <ConsentGate onConsent={handleConsent} />}

      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30 bg-gray-950/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-[#ff2a2b]">Adforge</span>
          <span className="text-xs text-gray-500 hidden sm:block">Static ad intelligence</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard/historical-analysis" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            <BarChart3 className="w-3.5 h-3.5" />
            Historical analysis
          </Link>
          {usage && <UsageMeter usage={usage} />}
          <a href="/account" className="text-xs text-gray-400 hover:text-white transition-colors">Settings</a>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Stats strip — historical-only metrics with one-liner captions explaining
            what each number is for. */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 animate-fade-up">
            <DashStat
              label="Historical ads"
              value={stats.count.toLocaleString()}
              caption="Every past ad you've analyzed in historical mode."
            />
            <DashStat
              label="Win / loss"
              value={`${stats.winners}W / ${stats.losers}L`}
              caption="Above $1K spend = winner. Higher winner share = more consistent creative."
            />
            <DashStat
              label="Win rate"
              value={`${(stats.winRate * 100).toFixed(0)}%`}
              caption="Share of historical ads that crossed $1K. The headline number to track."
            />
            <DashStat
              label="Avg grade"
              value={stats.avgGrade ?? '—'}
              caption="Average copywriting framework grade. Whether you're shipping structurally sound creative."
            />
            <DashStat
              label="Total spend"
              value={`$${stats.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              caption="Cumulative spend feeding the pattern library."
            />
            <DashStat
              label="Spend efficiency"
              value={`$${Math.round(stats.spendEfficiency).toLocaleString()}`}
              caption="Average spend per winner. Higher = winners scale further."
            />
          </div>
        )}

        {token && (
          <SessionHistory token={token} onSelect={handleReopen} onReanalyze={handleReopen} />
        )}

        {token && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-sm animate-fade-up">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white">Static Ad Intelligence</h2>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed max-w-3xl">
                Two modes. <span className="text-gray-200">Historical</span> — upload past ads with spend; ads above $1,000 spend feed
                the winning-pattern library, ads below feed the anti-pattern library. <span className="text-gray-200">Feedback</span> —
                upload new ads and receive comprehensive analysis (BERG brain activation, copy, behavioral economics, neuroscience,
                visual dimensions) with the learned patterns injected as reference.
              </p>
            </div>
            <ImageBatchTab token={token} onStatsUpdate={fetchStats} />
          </div>
        )}

        <AttributionFooter />
      </main>

      {reopened && token && (
        <AdAnalysisModal
          card={{
            id: reopened.id,
            fileName: reopened.id.slice(0, 8),
            previewUrl: reopened.result.heatmap_url ?? '',
            result: reopened.result,
            spend: reopened.spend,
            isWinner: reopened.isWinner,
            isLoser: reopened.isLoser,
          }}
          comprehensive={reopened.comprehensive ?? undefined}
          loading={reopenLoading}
          isHistorical={reopened.spend != null}
          token={token}
          onClose={() => setReopened(null)}
        />
      )}
    </div>
  )
}

function DashStat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-600 leading-snug">{caption}</p>
    </div>
  )
}
