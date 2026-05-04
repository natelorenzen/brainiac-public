'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { LogOut, ArrowLeft, RefreshCw } from 'lucide-react'
import { AttributionFooter } from '@/components/AttributionFooter'
import { HistoricalAnalysisDashboard, type HistoricalPayload } from '@/components/HistoricalAnalysisDashboard'

export default function HistoricalAnalysisPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<HistoricalPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setToken(session.access_token)
      try {
        const res = await fetch('/api/historical', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) {
          setError('Failed to load historical analysis')
          setLoading(false)
          return
        }
        setData(await res.json())
      } catch {
        setError('Network error')
      }
      setLoading(false)
    })
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30 bg-gray-950/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-[#ff2a2b]">Adforge</span>
          <span className="text-xs text-gray-500 hidden sm:block">Historical analysis</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Analyze ads
          </Link>
          <button
            onClick={() => window.location.reload()}
            aria-label="Refresh page"
            title="Refresh page"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleSignOut} aria-label="Sign out" className="text-gray-400 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Historical analysis</h1>
          <p className="text-sm text-gray-400 mt-1.5 leading-relaxed max-w-3xl">
            Everything the tool has learned from your historical ads — winning patterns, anti-patterns, framework guard rails,
            evolved baseline principles, dimension-level win rates, brain-activation-to-DNA correlations, and longitudinal trends.
            This is what gets fed silently into feedback mode prompts; here it&apos;s visible and reviewable.
          </p>
        </div>

        {loading && <p className="text-sm text-gray-500 animate-pulse-soft">Loading…</p>}
        {error && <p className="text-sm text-[#ff2a2b]">{error}</p>}
        {data && token && <HistoricalAnalysisDashboard data={data} token={token} />}

        <AttributionFooter />
      </main>
    </div>
  )
}
