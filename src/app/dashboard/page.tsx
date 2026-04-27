'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ConsentGate } from '@/components/ConsentGate'
import { UsageMeter } from '@/components/UsageMeter'
import { AttributionFooter } from '@/components/AttributionFooter'
import { ImageBatchTab } from '@/components/ImageBatchTab'
import { WebPageTab } from '@/components/WebPageTab'
import { LogOut } from 'lucide-react'
import type { UsageInfo, ConsentType } from '@/types'

type Tab = 'images' | 'webpage'

export default function DashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [consentDone, setConsentDone] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('images')
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = (localStorage.getItem('theme') ?? 'light') as 'dark' | 'light'
    setTheme(saved)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setToken(session.access_token)

      const [consentRes, usageRes] = await Promise.all([
        fetch('/api/users/me/consent', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/users/me/usage', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ])

      const consentData = await consentRes.json()
      setConsentDone(consentData.all_required_consents_given ?? false)
      if (usageRes.ok) setUsage(await usageRes.json())
    })
  }, [router])

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

  if (!mounted) return null

  if (consentDone === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm animate-pulse">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {!consentDone && <ConsentGate onConsent={handleConsent} />}

      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-indigo-400">Brainiac</span>
          <span className="text-xs text-gray-600 hidden sm:block">Brain activation model for static ad analysis</span>
        </div>
        <div className="flex items-center gap-6">
          {usage && <UsageMeter usage={usage} />}
          <button onClick={toggleTheme} className="theme-toggle">
            {theme === 'dark' ? '◑ LIGHT' : '◐ DARK'}
          </button>
          <a href="/account" className="text-xs text-gray-500 hover:text-white transition-colors">Settings</a>
          <button onClick={handleSignOut} className="text-gray-500 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {([
            ['images', 'Ad Creative'],
            ['webpage', 'Landing Page'],
          ] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Ad Creative tab ───────────────────────────────────────────────── */}
        {activeTab === 'images' && token && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white">Static Ad Analyzer</h2>
              <p className="text-xs text-gray-500 mt-1">
                Upload up to 25 static ad images. Each is analyzed with BERG for brain activation scores,
                then assessed by Claude Sonnet for ad-specific dimensions: CTA strength, emotional appeal,
                brand clarity, and visual hierarchy.
              </p>
            </div>
            <ImageBatchTab token={token} />
          </div>
        )}

        {/* ── Landing Page tab ──────────────────────────────────────────────── */}
        {activeTab === 'webpage' && token && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <WebPageTab token={token} />
          </div>
        )}

        <AttributionFooter />
      </main>
    </div>
  )
}
