'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ConsentGate } from '@/components/ConsentGate'
import { UsageMeter } from '@/components/UsageMeter'
import { ChannelInput } from '@/components/ChannelInput'
import { CorrelationResults } from '@/components/CorrelationResults'
import { AttributionFooter } from '@/components/AttributionFooter'
import { VideoUploader } from '@/components/VideoUploader'
import { VideoReport } from '@/components/VideoReport'
import { LogOut, Square } from 'lucide-react'
import type { AnalysisResult, UsageInfo, ConsentType, LimitError, CorrelationEntry } from '@/types'
import { ROI_REGISTRY } from '@/lib/roi'

type Tab = 'channel' | 'video'

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

// ── Video card state ──────────────────────────────────────────────────────────

interface VideoCard {
  video_id: string
  title: string
  view_count: number | null
  thumbnail_url: string
  analysis_id: string | null
  status: 'pending' | 'processing' | 'complete' | 'failed'
  result: AnalysisResult | null
}

function computeCorrelations(cards: VideoCard[]): CorrelationEntry[] | null {
  const pairs = cards.filter(
    c => c.status === 'complete' && c.result?.roi_data && c.view_count != null
  )
  if (pairs.length < 5) return null

  return Object.keys(ROI_REGISTRY)
    .map(key => {
      const activations = pairs.map(c => c.result!.roi_data!.find(r => r.region_key === key)?.activation ?? 0)
      const logViews = pairs.map(c => Math.log((c.view_count ?? 0) + 1))
      return {
        region_key: key,
        label: ROI_REGISTRY[key].label,
        description: ROI_REGISTRY[key].description,
        r: pearson(activations, logViews),
        data_points: pairs.map((c, i) => ({
          activation: activations[i],
          log_views: logViews[i],
          title: c.title,
          thumbnail_url: c.thumbnail_url,
        })),
      }
    })
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [consentDone, setConsentDone] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('channel')
  const [analyzing, setAnalyzing] = useState(false)
  const [channelHandle, setChannelHandle] = useState<string | null>(null)
  const [cards, setCards] = useState<VideoCard[]>([])
  const [correlations, setCorrelations] = useState<CorrelationEntry[] | null>(null)
  const [limitError, setLimitError] = useState<LimitError | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [videoAnalysisId, setVideoAnalysisId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const stoppedRef = useRef(false)
  const currentPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cardsRef = useRef<VideoCard[]>([])
  cardsRef.current = cards

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setToken(session.access_token)
      setUserId(session.user.id)

      const [consentRes, usageRes] = await Promise.all([
        fetch('/api/users/me/consent', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/users/me/usage', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ])

      const consentData = await consentRes.json()
      setConsentDone(consentData.all_required_consents_given ?? false)
      if (usageRes.ok) setUsage(await usageRes.json())
    })
  }, [router])

  const refreshUsage = useCallback(async (tok: string) => {
    const res = await fetch('/api/users/me/usage', { headers: { Authorization: `Bearer ${tok}` } })
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

  function handleStop() {
    stoppedRef.current = true
    if (currentPollRef.current) clearInterval(currentPollRef.current)
    setAnalyzing(false)
    // Compute final correlations on whatever's done
    const corr = computeCorrelations(cardsRef.current)
    setCorrelations(corr)
    if (token) refreshUsage(token)
  }

  // Polls a single analysis_id until complete or failed. Resolves when done.
  function pollOne(analysisId: string, videoId: string, tok: string): Promise<void> {
    return new Promise(resolve => {
      if (currentPollRef.current) clearInterval(currentPollRef.current)

      currentPollRef.current = setInterval(async () => {
        const res = await fetch(`/api/analyze/${analysisId}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
        if (!res.ok) return

        const data: AnalysisResult = await res.json()
        if (data.status !== 'complete' && data.status !== 'failed') return

        clearInterval(currentPollRef.current!)
        currentPollRef.current = null

        setCards(prev => {
          const updated = prev.map(c =>
            c.video_id === videoId
              ? { ...c, status: data.status as VideoCard['status'], result: data }
              : c
          )
          const corr = computeCorrelations(updated)
          if (corr) setCorrelations(corr)
          return updated
        })

        resolve()
      }, 3000)
    })
  }

  async function handleChannel(handle: string) {
    if (!token) return
    setAnalyzing(true)
    setCards([])
    setCorrelations(null)
    setError(null)
    setLimitError(null)
    stoppedRef.current = false
    setChannelHandle(handle)

    // Step 1: resolve channel → get video list (fast, no Modal)
    const resolveRes = await fetch('/api/analyze/channel/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel_handle: handle }),
    })

    if (resolveRes.status === 429) { setLimitError(await resolveRes.json()); setAnalyzing(false); return }
    if (!resolveRes.ok) {
      const d = await resolveRes.json().catch(() => ({}))
      setError(d.error ?? 'Could not load channel.')
      setAnalyzing(false)
      return
    }

    const { videos } = await resolveRes.json()
    if (!videos?.length) { setError('No videos found.'); setAnalyzing(false); return }

    // Seed cards as pending
    const initialCards: VideoCard[] = videos.map((v: { video_id: string; title: string; view_count: number | null; thumbnail_url: string }) => ({
      video_id: v.video_id,
      title: v.title,
      view_count: v.view_count,
      thumbnail_url: v.thumbnail_url,
      analysis_id: null,
      status: 'pending',
      result: null,
    }))
    setCards(initialCards)

    // Step 2: dispatch + poll sequentially, one thumbnail at a time
    const tok = token
    for (const video of videos) {
      if (stoppedRef.current) break

      // Mark as processing
      setCards(prev => prev.map(c =>
        c.video_id === video.video_id ? { ...c, status: 'processing' } : c
      ))

      const dispatchRes = await fetch('/api/analyze/dispatch-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ thumbnail_url: video.thumbnail_url }),
      })

      if (dispatchRes.status === 429) {
        setLimitError(await dispatchRes.json())
        setCards(prev => prev.map(c =>
          c.video_id === video.video_id ? { ...c, status: 'failed' } : c
        ))
        break
      }

      if (!dispatchRes.ok) {
        setCards(prev => prev.map(c =>
          c.video_id === video.video_id ? { ...c, status: 'failed' } : c
        ))
        continue
      }

      const { analysis_id } = await dispatchRes.json()

      setCards(prev => prev.map(c =>
        c.video_id === video.video_id ? { ...c, analysis_id } : c
      ))

      await pollOne(analysis_id, video.video_id, tok)
    }

    if (!stoppedRef.current) {
      setAnalyzing(false)
      refreshUsage(tok)
      const corr = computeCorrelations(cardsRef.current)
      setCorrelations(corr)
    }
  }

  async function handleSignOut() {
    stoppedRef.current = true
    if (currentPollRef.current) clearInterval(currentPollRef.current)
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const doneCount = cards.filter(c => c.status === 'complete' || c.status === 'failed').length
  const processingCard = cards.find(c => c.status === 'processing')

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
          <span className="text-xs text-gray-600 hidden sm:block">Brain activation model for creative analysis</span>
        </div>
        <div className="flex items-center gap-6">
          {usage && <UsageMeter usage={usage} />}
          <a href="/account" className="text-xs text-gray-500 hover:text-white transition-colors">Settings</a>
          <button onClick={handleSignOut} className="text-gray-500 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(['channel', 'video'] as Tab[]).map(tab => (
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
              {tab === 'channel' ? 'YouTube Channel' : 'Video Upload'}
            </button>
          ))}
        </div>

        {/* ── Channel tab ───────────────────────────────────────────────────── */}
        {activeTab === 'channel' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <ChannelInput onSubmit={handleChannel} disabled={analyzing} />
          </div>
        )}

        {/* ── Video tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'video' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            {!videoAnalysisId ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Video Brain Activation Analysis</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Upload a video (≤60s) to run TRIBE v2 and see how brain activation evolves over time.
                    Takes 3–5 minutes. Counts as 1 analysis toward your usage.
                  </p>
                </div>
                {token && userId && (
                  <VideoUploader
                    token={token}
                    userId={userId}
                    onAnalysisStarted={(id) => setVideoAnalysisId(id)}
                  />
                )}
                {/* Dev shortcut: load last completed video analysis */}
                {userId && (
                  <div className="pt-2 border-t border-gray-800">
                    <button
                      onClick={async () => {
                        const { data } = await supabase
                          .from('analyses')
                          .select('id')
                          .eq('user_id', userId)
                          .eq('type', 'ad_creative')
                          .eq('status', 'complete')
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .single()
                        if (data?.id) setVideoAnalysisId(data.id)
                      }}
                      className="text-xs text-gray-600 hover:text-gray-400 underline transition-colors"
                    >
                      Load last result
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <VideoReport
                analysisId={videoAnalysisId}
                token={token!}
                onReset={() => setVideoAnalysisId(null)}
              />
            )}
          </div>
        )}

        {/* Errors (channel tab only) */}
        {activeTab === 'channel' && limitError && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-5 py-4 text-sm">
            <p className="text-amber-400 font-medium mb-1">Limit reached</p>
            <p className="text-amber-200/70">{limitError.reason}</p>
            {limitError.resets_at && (
              <p className="text-amber-200/50 text-xs mt-1">Resets: {new Date(limitError.resets_at).toLocaleString()}</p>
            )}
          </div>
        )}
        {activeTab === 'channel' && error && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-xl px-5 py-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Progress bar + stop button */}
        {activeTab === 'channel' && cards.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400">
                  {analyzing
                    ? processingCard
                      ? `Analyzing: ${processingCard.title.slice(0, 50)}${processingCard.title.length > 50 ? '…' : ''}`
                      : 'Dispatching…'
                    : `Done — ${doneCount} of ${cards.length} analyzed`}
                </span>
                <span className="text-xs text-gray-600">{doneCount} / {cards.length}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1">
                <div
                  className="bg-indigo-500 h-1 rounded-full transition-all duration-700"
                  style={{ width: `${(doneCount / cards.length) * 100}%` }}
                />
              </div>
            </div>
            {analyzing && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 hover:text-white border border-gray-700 transition-colors"
              >
                <Square className="w-3 h-3" />
                Stop
              </button>
            )}
          </div>
        )}

        {/* Video card grid */}
        {activeTab === 'channel' && cards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {cards.map(card => (
              <VideoResultCard key={card.video_id} card={card} />
            ))}
          </div>
        )}

        {/* Correlation report */}
        {activeTab === 'channel' && correlations && channelHandle && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <CorrelationResults
              correlations={correlations}
              channelHandle={channelHandle}
              videoCount={cards.filter(c => c.status === 'complete').length}
            />
          </div>
        )}

        {/* Not enough data yet */}
        {activeTab === 'channel' && !correlations && !analyzing && cards.length > 0 && doneCount > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-4 text-sm text-gray-400">
            {doneCount} {doneCount === 1 ? 'video' : 'videos'} analyzed — need at least 5 with view counts to compute correlations.
          </div>
        )}
      </main>
    </div>
  )
}

// ── Video result card ─────────────────────────────────────────────────────────

function VideoResultCard({ card }: { card: VideoCard }) {
  const topRoi = card.result?.roi_data?.slice(0, 3) ?? []

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.thumbnail_url}
          alt={card.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Heatmap overlay when complete */}
        {card.result?.heatmap_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.result.heatmap_url}
            alt="Brain activation heatmap"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
        )}
        {/* Status badge */}
        <div className="absolute top-1.5 right-1.5">
          {card.status === 'pending' && (
            <span className="text-[10px] bg-gray-900/80 text-gray-500 px-1.5 py-0.5 rounded">pending</span>
          )}
          {card.status === 'processing' && (
            <span className="text-[10px] bg-indigo-900/80 text-indigo-300 px-1.5 py-0.5 rounded animate-pulse">analyzing…</span>
          )}
          {card.status === 'failed' && (
            <span className="text-[10px] bg-red-900/80 text-red-300 px-1.5 py-0.5 rounded">failed</span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 flex-1 flex flex-col gap-2">
        <p className="text-xs text-gray-300 leading-snug line-clamp-2">{card.title}</p>
        {card.view_count != null && (
          <p className="text-[10px] text-gray-600">{card.view_count.toLocaleString()} views</p>
        )}

        {/* Top 3 ROI scores */}
        {topRoi.length > 0 && (
          <div className="space-y-1 mt-auto">
            {topRoi.map(roi => (
              <div key={roi.region_key} className="flex items-center gap-1.5">
                <div className="flex-1 bg-gray-800 rounded-full h-1">
                  <div
                    className="bg-indigo-500 h-1 rounded-full"
                    style={{ width: `${roi.activation * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-500 w-16 truncate">{roi.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
