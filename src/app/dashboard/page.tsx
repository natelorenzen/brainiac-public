'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ConsentGate } from '@/components/ConsentGate'
import { UsageMeter } from '@/components/UsageMeter'
import { ChannelInput } from '@/components/ChannelInput'
import { LoadingBrain } from '@/components/LoadingBrain'
import { CorrelationResults } from '@/components/CorrelationResults'
import { AttributionFooter } from '@/components/AttributionFooter'
import { LogOut } from 'lucide-react'
import type { AnalysisResult, UsageInfo, ConsentType, LimitError, VideoMeta, CorrelationEntry } from '@/types'
import { ROI_REGISTRY } from '@/lib/roi'

// ── Pearson correlation ───────────────────────────────────────────────────────

function pearson(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  const num = x.reduce((sum, xi, i) => sum + (xi - mx) * (y[i] - my), 0)
  const den = Math.sqrt(
    x.reduce((sum, xi) => sum + (xi - mx) ** 2, 0) *
    y.reduce((sum, yi) => sum + (yi - my) ** 2, 0)
  )
  return den === 0 ? 0 : num / den
}

function computeCorrelations(
  results: Record<string, AnalysisResult>,
  videoMap: Record<string, VideoMeta>
): CorrelationEntry[] {
  const pairs = Object.entries(results)
    .filter(([id, r]) =>
      r.status === 'complete' &&
      r.roi_data &&
      videoMap[id]?.view_count != null
    )
    .map(([id, r]) => ({
      roi_data: r.roi_data!,
      log_views: Math.log((videoMap[id].view_count ?? 0) + 1),
      title: videoMap[id].title,
      thumbnail_url: videoMap[id].thumbnail_url,
    }))

  if (pairs.length < 5) return null

  const roiKeys = Object.keys(ROI_REGISTRY)

  return roiKeys
    .map(key => {
      const activations = pairs.map(p => p.roi_data.find(r => r.region_key === key)?.activation ?? 0)
      const logViews = pairs.map(p => p.log_views)
      const r = pearson(activations, logViews)
      return {
        region_key: key,
        label: ROI_REGISTRY[key].label,
        description: ROI_REGISTRY[key].description,
        r,
        data_points: pairs.map((p, i) => ({
          activation: activations[i],
          log_views: logViews[i],
          title: p.title,
          thumbnail_url: p.thumbnail_url,
        })),
      }
    })
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
}

// ─────────────────────────────────────────────────────────────────────────────

interface BatchState {
  channelHandle: string
  videoMap: Record<string, VideoMeta>
  results: Record<string, AnalysisResult>
  total: number
  complete: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [consentDone, setConsentDone] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [batch, setBatch] = useState<BatchState | null>(null)
  const [correlations, setCorrelations] = useState<CorrelationEntry[] | null | 'insufficient'>(null)
  const [batchDiag, setBatchDiag] = useState<{ completed: number; failed: number; noViewCount: number } | null>(null)
  const [limitError, setLimitError] = useState<LimitError | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRef = useRef<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  // ── Auth + consent check ──────────────────────────────────────────────────

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setToken(session.access_token)

      const [consentRes, usageRes] = await Promise.all([
        fetch('/api/users/me/consent', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/users/me/usage', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ])

      const consentData = await consentRes.json()
      setConsentDone(consentData.all_required_consents_given ?? false)
      if (usageRes.ok) setUsage(await usageRes.json())
    })
  }, [router])

  const refreshUsage = useCallback(async (tok: string) => {
    const res = await fetch('/api/users/me/usage', {
      headers: { Authorization: `Bearer ${tok}` },
    })
    if (res.ok) setUsage(await res.json())
  }, [])

  async function handleConsent(types: ConsentType[]) {
    if (!token) return
    const res = await fetch('/api/users/me/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consent_types: types }),
    })
    if (res.ok) setConsentDone(true)
  }

  // ── Batch polling ─────────────────────────────────────────────────────────

  function startBatchPoll(
    allIds: string[],
    videoMap: Record<string, VideoMeta>,
    channelHandle: string,
    tok: string
  ) {
    if (pollRef.current) clearInterval(pollRef.current)
    pendingRef.current = new Set(allIds)

    setBatch({
      channelHandle,
      videoMap,
      results: {},
      total: allIds.length,
      complete: 0,
    })

    pollRef.current = setInterval(async () => {
      if (pendingRef.current.size === 0) {
        clearInterval(pollRef.current!)
        return
      }

      const toCheck = [...pendingRef.current]
      const settled: Record<string, AnalysisResult> = {}

      await Promise.all(
        toCheck.map(async id => {
          const res = await fetch(`/api/analyze/${id}`, {
            headers: { Authorization: `Bearer ${tok}` },
          })
          if (!res.ok) return
          const data: AnalysisResult = await res.json()
          if (data.status === 'complete' || data.status === 'failed') {
            settled[id] = data
            pendingRef.current.delete(id)
          }
        })
      )

      if (Object.keys(settled).length === 0) return

      setBatch(prev => {
        if (!prev) return prev
        const newResults = { ...prev.results, ...settled }
        const newComplete = prev.complete + Object.keys(settled).length

        if (pendingRef.current.size === 0) {
          clearInterval(pollRef.current!)
          const completed = Object.values(newResults).filter(r => r.status === 'complete' && r.roi_data).length
          const failed = Object.values(newResults).filter(r => r.status === 'failed').length
          const noViewCount = Object.entries(newResults).filter(
            ([id, r]) => r.status === 'complete' && r.roi_data && videoMap[id]?.view_count == null
          ).length
          setBatchDiag({ completed, failed, noViewCount })
          const corr = computeCorrelations(newResults, videoMap)
          setCorrelations(corr ?? 'insufficient')
          setAnalyzing(false)
          refreshUsage(tok)
        }

        return { ...prev, results: newResults, complete: newComplete }
      })
    }, 3000)
  }

  // ── Channel submit ────────────────────────────────────────────────────────

  async function handleChannel(handle: string) {
    if (!token) return
    setAnalyzing(true)
    setBatch(null)
    setCorrelations(null)
    setError(null)
    setLimitError(null)

    const res = await fetch('/api/analyze/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel_handle: handle }),
    })

    if (res.status === 429) {
      setLimitError(await res.json())
      setAnalyzing(false)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Channel analysis failed.')
      setAnalyzing(false)
      return
    }

    const { analysis_ids, video_map } = await res.json()
    if (!analysis_ids?.length) {
      setError('No videos could be queued for analysis.')
      setAnalyzing(false)
      return
    }

    startBatchPoll(analysis_ids, video_map, handle, token)
  }

  async function handleSignOut() {
    if (pollRef.current) clearInterval(pollRef.current)
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Render nothing on the server — this page is client-only (auth-gated).
  // Prevents hydration mismatches from browser extensions or locale differences.
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
          <span className="text-xs text-gray-600 hidden sm:block">
            Brain activation model for creative analysis
          </span>
        </div>
        <div className="flex items-center gap-6">
          {usage && <UsageMeter usage={usage} />}
          <a href="/account" className="text-xs text-gray-500 hover:text-white transition-colors">
            Settings
          </a>
          <button onClick={handleSignOut} className="text-gray-500 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <ChannelInput onSubmit={handleChannel} disabled={analyzing} />
        </div>

        {limitError && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-5 py-4 text-sm">
            <p className="text-amber-400 font-medium mb-1">Limit reached</p>
            <p className="text-amber-200/70">{limitError.reason}</p>
            {limitError.resets_at && (
              <p className="text-amber-200/50 text-xs mt-1">
                Resets: {new Date(limitError.resets_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-xl px-5 py-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {analyzing && batch && (
          <div className="space-y-4">
            <LoadingBrain />
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-400">
                Analyzing thumbnails — {batch.complete} / {batch.total} complete
              </p>
              <div className="w-full bg-gray-800 rounded-full h-1.5 max-w-xs mx-auto">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(batch.complete / batch.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {analyzing && !batch && <LoadingBrain />}

        {correlations !== null && batch && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            {correlations === 'insufficient' ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-white">Not enough data for correlations</p>
                {batchDiag && (
                  <ul className="text-sm text-gray-400 space-y-1">
                    <li>Analyses completed: <span className="text-white">{batchDiag.completed}</span></li>
                    <li>Analyses failed: <span className={batchDiag.failed > 0 ? 'text-rose-400' : 'text-white'}>{batchDiag.failed}</span>
                      {batchDiag.failed > 0 && <span className="text-gray-600"> — check Modal logs for errors</span>}
                    </li>
                    <li>Missing view count: <span className={batchDiag.noViewCount > 0 ? 'text-amber-400' : 'text-white'}>{batchDiag.noViewCount}</span>
                      {batchDiag.noViewCount > 0 && <span className="text-gray-600"> — add <code className="text-xs bg-gray-800 px-1 rounded">YOUTUBE_DATA_API_KEY</code> to Vercel env vars</span>}
                    </li>
                  </ul>
                )}
                <p className="text-xs text-gray-600">At least 5 videos need both a successful analysis and a view count.</p>
                <AttributionFooter />
              </div>
            ) : (
              <CorrelationResults
                correlations={correlations}
                channelHandle={batch.channelHandle}
                videoCount={batch.complete}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
