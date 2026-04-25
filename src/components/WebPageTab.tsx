'use client'

import { useEffect, useRef, useState } from 'react'
import { ROIBarChart } from '@/components/ROIBarChart'
import { AttributionFooter } from '@/components/AttributionFooter'
import type { AnalysisResult, ROIRegion } from '@/types'

function RichLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

interface ViewState {
  analysisId: string
  screenshotUrl: string
  result: AnalysisResult | null
  status: 'analyzing' | 'complete' | 'failed'
  showHeatmap: boolean
  suggestions: string | null
  suggestionsLoading: boolean
}

interface Props { token: string }

type PageStatus = 'idle' | 'capturing' | 'analyzing' | 'complete' | 'failed'

function SuggestionsList({ suggestions, loading }: { suggestions: string | null; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center gap-3 t-meta">
      <div className="w-3 h-3 border border-indigo-500 border-t-transparent animate-spin" />
      Generating recommendations…
    </div>
  )
  if (!suggestions) return null
  return (
    <div className="space-y-3">
      {suggestions.split('\n').map((line, i) => {
        const bullet = line.match(/^[-*]\s+(.+)/)
        if (bullet) return (
          <div key={i} className="flex gap-3 py-1 border-b border-gray-800 last:border-0">
            <span className="text-indigo-500 shrink-0 t-meta mt-0.5">—</span>
            <span className="text-sm text-gray-200 leading-relaxed"><RichLine text={bullet[1]} /></span>
          </div>
        )
        if (line.startsWith('#')) return null
        return line.trim() ? <p key={i} className="t-meta pb-1">{line}</p> : null
      })}
    </div>
  )
}

function ViewPanel({ view, label, context, pageUrl, token }: {
  view: ViewState
  label: string
  context: 'webpage_desktop' | 'webpage_mobile'
  pageUrl: string
  token: string
  onToggleHeatmap: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="t-label">{label}</span>
        {view.result?.heatmap_url && (
          <button
            onClick={() => {/* handled by parent */}}
            className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 px-3 py-1"
          >
            {view.showHeatmap ? 'Hide heatmap' : 'Show heatmap'}
          </button>
        )}
      </div>

      {/* Screenshot */}
      <div className="relative border border-gray-800 overflow-hidden bg-gray-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.screenshotUrl} alt={`${label} screenshot`} className="w-full block" />
        {view.result?.heatmap_url && view.showHeatmap && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.result.heatmap_url}
            alt="Brain activation heatmap"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.65 }}
          />
        )}
        {view.status === 'analyzing' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-white">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              Analyzing…
            </div>
          </div>
        )}
        {view.status === 'failed' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-xs text-red-400">Analysis failed</span>
          </div>
        )}
      </div>

      {/* ROI bars */}
      {view.result?.roi_data && view.result.roi_data.length > 0 && (
        <ROIBarChart roiData={view.result.roi_data as ROIRegion[]} />
      )}

      {/* Suggestions */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-label">{label} Recommendations</span>
          <span className="panel-meta">BERG · brain activation</span>
        </div>
        <div className="p-5">
          <SuggestionsList suggestions={view.suggestions} loading={view.suggestionsLoading} />
        </div>
      </div>
    </div>
  )
}

export function WebPageTab({ token }: Props) {
  const [url, setUrl] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState('')
  const [pageStatus, setPageStatus] = useState<PageStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [desktop, setDesktop] = useState<ViewState | null>(null)
  const [mobile, setMobile] = useState<ViewState | null>(null)
  const pollDesktopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollMobileRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (pollDesktopRef.current) clearInterval(pollDesktopRef.current)
    if (pollMobileRef.current) clearInterval(pollMobileRef.current)
  }, [])

  function reset() {
    if (pollDesktopRef.current) clearInterval(pollDesktopRef.current)
    if (pollMobileRef.current) clearInterval(pollMobileRef.current)
    setUrl('')
    setSubmittedUrl('')
    setPageStatus('idle')
    setError(null)
    setDesktop(null)
    setMobile(null)
  }

  function startPolling(
    analysisId: string,
    context: 'webpage_desktop' | 'webpage_mobile',
    pollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
    setter: React.Dispatch<React.SetStateAction<ViewState | null>>,
    pageUrl: string,
  ) {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/analyze/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data: AnalysisResult = await res.json()
      if (data.status !== 'complete' && data.status !== 'failed') return

      clearInterval(pollRef.current!)
      pollRef.current = null

      if (data.status === 'failed') {
        setter(prev => prev ? { ...prev, status: 'failed', result: data } : null)
        return
      }

      setter(prev => prev ? { ...prev, status: 'complete', result: data } : null)

      // Both done? Update page status
      setDesktop(d => {
        setMobile(m => {
          const otherDone = context === 'webpage_desktop'
            ? (m?.status === 'complete' || m?.status === 'failed')
            : (d?.status === 'complete' || d?.status === 'failed')
          if (otherDone) setPageStatus('complete')
          return m
        })
        return d
      })
      setPageStatus(s => s === 'analyzing' ? 'complete' : s)

      // Fetch AI suggestions
      if (data.roi_data?.length) {
        setter(prev => prev ? { ...prev, suggestionsLoading: true } : null)
        fetch('/api/analyze/image-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ context, page_url: pageUrl, roi_data: data.roi_data }),
        })
          .then(r => r.json())
          .then(d => setter(prev => prev ? { ...prev, suggestions: d.summary ?? null, suggestionsLoading: false } : null))
          .catch(() => setter(prev => prev ? { ...prev, suggestionsLoading: false } : null))
      }
    }, 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`

    setSubmittedUrl(withProtocol)
    setPageStatus('capturing')
    setError(null)
    setDesktop(null)
    setMobile(null)

    const res = await fetch('/api/analyze/webpage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: withProtocol }),
    })

    if (res.status === 429) {
      const d = await res.json()
      setError(d.reason ?? 'Usage limit reached.')
      setPageStatus('failed')
      return
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Screenshot or dispatch failed.')
      setPageStatus('failed')
      return
    }

    const { desktop: d, mobile: m } = await res.json()

    const makeView = (v: { analysis_id: string; screenshot_url: string }): ViewState => ({
      analysisId: v.analysis_id,
      screenshotUrl: v.screenshot_url,
      result: null,
      status: 'analyzing',
      showHeatmap: true,
      suggestions: null,
      suggestionsLoading: false,
    })

    const dv = makeView(d)
    const mv = makeView(m)
    setDesktop(dv)
    setMobile(mv)
    setPageStatus('analyzing')

    startPolling(d.analysis_id, 'webpage_desktop', pollDesktopRef, setDesktop, withProtocol)
    startPolling(m.analysis_id, 'webpage_mobile', pollMobileRef, setMobile, withProtocol)
  }

  const bothDone = desktop && mobile &&
    (desktop.status === 'complete' || desktop.status === 'failed') &&
    (mobile.status === 'complete' || mobile.status === 'failed')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-white">Landing Page Analyzer</h2>
        <p className="text-xs text-gray-500 mt-1">
          Enter any public URL. Screenshots both desktop (1280×720) and mobile (390×844) above the fold,
          runs each through BERG, and gives separate brain activation scores and design recommendations for each viewport.
          Counts as 2 analyses.
        </p>
      </div>

      {/* URL form */}
      {(pageStatus === 'idle' || pageStatus === 'failed') && (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!url.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            Analyze
          </button>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/30 border border-red-800/50 px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-white mt-2 underline">Try again</button>
        </div>
      )}

      {/* Capturing */}
      {pageStatus === 'capturing' && (
        <div className="flex items-center gap-3 py-4">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm text-white">Capturing desktop and mobile screenshots…</p>
            <p className="text-xs text-gray-500 mt-0.5">{submittedUrl}</p>
            <p className="text-xs text-gray-600 mt-0.5">First run downloads Chromium (~15s). Warm runs are faster.</p>
          </div>
        </div>
      )}

      {/* Dual viewport results */}
      {(desktop || mobile) && pageStatus !== 'capturing' && (
        <div className="space-y-6">
          {/* URL + reset */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-mono truncate max-w-lg">{submittedUrl}</p>
            {bothDone && (
              <button onClick={reset} className="text-xs text-gray-400 hover:text-white transition-colors shrink-0 ml-4">
                Analyze another page
              </button>
            )}
          </div>

          {/* Side-by-side panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {desktop && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="t-label">Desktop — 1280×720</span>
                  {desktop.result?.heatmap_url && (
                    <button
                      onClick={() => setDesktop(d => d ? { ...d, showHeatmap: !d.showHeatmap } : null)}
                      className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 px-3 py-1"
                    >
                      {desktop.showHeatmap ? 'Hide heatmap' : 'Show heatmap'}
                    </button>
                  )}
                </div>
                <div className="relative border border-gray-800 overflow-hidden bg-gray-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={desktop.screenshotUrl} alt="Desktop screenshot" className="w-full block" />
                  {desktop.result?.heatmap_url && desktop.showHeatmap && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={desktop.result.heatmap_url} alt="Heatmap" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.65 }} />
                  )}
                  {desktop.status === 'analyzing' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-xs text-white">
                        <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        Analyzing…
                      </div>
                    </div>
                  )}
                </div>
                {desktop.result?.roi_data && <ROIBarChart roiData={desktop.result.roi_data as ROIRegion[]} />}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-label">Desktop Recommendations</span>
                    <span className="panel-meta">BERG · brain activation</span>
                  </div>
                  <div className="p-5">
                    <SuggestionsList suggestions={desktop.suggestions} loading={desktop.suggestionsLoading} />
                  </div>
                </div>
              </div>
            )}

            {mobile && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="t-label">Mobile — 390×844</span>
                  {mobile.result?.heatmap_url && (
                    <button
                      onClick={() => setMobile(m => m ? { ...m, showHeatmap: !m.showHeatmap } : null)}
                      className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 px-3 py-1"
                    >
                      {mobile.showHeatmap ? 'Hide heatmap' : 'Show heatmap'}
                    </button>
                  )}
                </div>
                <div className="relative border border-gray-800 overflow-hidden bg-gray-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mobile.screenshotUrl} alt="Mobile screenshot" className="w-full block" />
                  {mobile.result?.heatmap_url && mobile.showHeatmap && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mobile.result.heatmap_url} alt="Heatmap" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.65 }} />
                  )}
                  {mobile.status === 'analyzing' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-xs text-white">
                        <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        Analyzing…
                      </div>
                    </div>
                  )}
                </div>
                {mobile.result?.roi_data && <ROIBarChart roiData={mobile.result.roi_data as ROIRegion[]} />}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-label">Mobile Recommendations</span>
                    <span className="panel-meta">BERG · brain activation</span>
                  </div>
                  <div className="p-5">
                    <SuggestionsList suggestions={mobile.suggestions} loading={mobile.suggestionsLoading} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {bothDone && <AttributionFooter />}
        </div>
      )}
    </div>
  )
}
