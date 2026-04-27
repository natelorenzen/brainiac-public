'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ConsentGate } from '@/components/ConsentGate'
import { UsageMeter } from '@/components/UsageMeter'
import { AttributionFooter } from '@/components/AttributionFooter'
import { ImageBatchTab } from '@/components/ImageBatchTab'
import { LogOut } from 'lucide-react'
import type { UsageInfo, ConsentType } from '@/types'

interface Stats {
  count: number
  totalSpend: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [consentDone, setConsentDone] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  const fetchStats = useCallback(async () => {
    const { data } = await supabase
      .from('analyses')
      .select('spend_usd')
      .eq('type', 'thumbnail')
      .eq('status', 'complete')
    const rows = data ?? []
    const count = rows.length
    const totalSpend = rows.reduce((sum, r) => sum + (Number(r.spend_usd) || 0), 0)
    setStats({ count, totalSpend })
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
        {/* Stats strip — total ads and total spend tracked */}
        {stats && (
          <div className="flex flex-wrap items-end gap-x-12 gap-y-4 animate-fade-up">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Ads analyzed</p>
              <p className="text-3xl font-semibold text-white tabular-nums mt-0.5">
                {stats.count.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Total spend tracked</p>
              <p className="text-3xl font-semibold text-white tabular-nums mt-0.5">
                ${stats.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
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
            <ImageBatchTab token={token} onStatsUpdate={setStats} />
          </div>
        )}

        <AttributionFooter />
      </main>
    </div>
  )
}
