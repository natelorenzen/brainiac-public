'use client'

import { useEffect, useState, useCallback } from 'react'
import { History, ChevronDown, ChevronUp, Trash2, RefreshCw } from 'lucide-react'
import type { RecentAnalysis } from '@/app/api/analyses/recent/route'

interface Props {
  token: string | null
  onSelect: (analysisId: string) => void
  onReanalyze?: (analysisId: string) => void
}

export function SessionHistory({ token, onSelect, onReanalyze }: Props) {
  const [analyses, setAnalyses] = useState<RecentAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)
  const [reanalyzeError, setReanalyzeError] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/analyses/recent?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAnalyses(data.analyses ?? [])
      }
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [token])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!token) return
    setAnalyses(prev => prev.filter(a => a.id !== id))
    try {
      await fetch(`/api/analyze/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* non-fatal */ }
  }, [token])

  const handleReanalyze = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!token || reanalyzingId) return
    setReanalyzingId(id)
    setReanalyzeError(prev => { const n = { ...prev }; delete n[id]; return n })
    try {
      const res = await fetch('/api/analyze/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ analysis_id: id }),
      })
      if (!res.ok) {
        setReanalyzeError(prev => ({ ...prev, [id]: `Re-analysis failed (${res.status})` }))
      } else {
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let text = ''
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            text += decoder.decode(value, { stream: !done })
          }
        }
        const last = text.split('\n').filter(l => l.trim()).pop() ?? '{}'
        const data = JSON.parse(last) as Record<string, unknown>
        if (data.error) {
          setReanalyzeError(prev => ({ ...prev, [id]: data.error as string }))
        } else if (data.comprehensive) {
          const ca = data.comprehensive as Record<string, unknown>
          const fwk = ca?.framework_score as Record<string, unknown> | undefined
          const copy = ca?.copy as Record<string, unknown> | undefined
          const headline = copy?.headline as Record<string, unknown> | undefined
          setAnalyses(prev => prev.map(a => a.id !== id ? a : {
            ...a,
            framework_grade: (fwk?.overall_framework_grade as string) ?? a.framework_grade,
            composition_tag: (ca?.composition_tag as string) ?? a.composition_tag,
            headline_text: (headline?.text as string) ?? a.headline_text,
          }))
          onReanalyze?.(id)
        } else {
          setReanalyzeError(prev => ({ ...prev, [id]: 'Re-analysis returned no data' }))
        }
      }
    } catch (err) {
      setReanalyzeError(prev => ({ ...prev, [id]: err instanceof Error ? err.message : 'Network error' }))
    }
    setReanalyzingId(null)
  }, [token, reanalyzingId, onReanalyze])

  useEffect(() => {
    if (expanded) load()
  }, [expanded, load])

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-sm">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-white">Recent analyses</span>
          <span className="text-[10px] text-gray-500">— click any past analysis to reopen its full breakdown</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-800 px-6 py-4">
          {loading && <p className="text-xs text-gray-500 animate-pulse-soft">Loading…</p>}
          {!loading && analyses.length === 0 && (
            <p className="text-xs text-gray-500">No prior analyses yet.</p>
          )}
          {!loading && analyses.length > 0 && (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {analyses.map(a => (
                <div
                  key={a.id}
                  className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <button
                    onClick={() => onSelect(a.id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                  {a.heatmap_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.heatmap_url} alt="" className="w-10 h-10 object-cover rounded shrink-0 border border-gray-800" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-800 rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 truncate">
                      {a.headline_text ?? 'Untitled ad'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[9px] text-gray-500">
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                      {a.composition_tag && (
                        <span className="text-[9px] text-white font-mono bg-gray-950 border border-gray-800 rounded px-1.5 py-0.5">
                          {a.composition_tag}
                        </span>
                      )}
                      {a.framework_grade && (
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border bg-gray-900 ${
                          a.framework_grade === 'A' ? 'text-emerald-400 border-emerald-800/60' :
                          a.framework_grade === 'B' ? 'text-amber-400 border-amber-800/60' :
                          a.framework_grade === 'C' ? 'text-orange-400 border-orange-800/60' :
                          'text-[#ff2a2b] border-red-900/60'
                        }`}>{a.framework_grade}</span>
                      )}
                      {a.mean_top_roi_score != null && (
                        <span className="text-[9px] font-mono text-indigo-300 border border-indigo-800/60 bg-gray-900 rounded px-1.5 py-0.5">
                          N {a.mean_top_roi_score.toFixed(2)}
                        </span>
                      )}
                      {a.spend_usd != null && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          a.is_winner ? 'text-yellow-400 border-yellow-800/60 bg-gray-900' : 'text-[#ff2a2b] border-red-900/60 bg-gray-900'
                        }`}>${a.spend_usd.toLocaleString()}</span>
                      )}
                      {reanalyzingId === a.id && (
                        <span className="text-[9px] text-indigo-300 animate-pulse">re-analyzing…</span>
                      )}
                      {reanalyzeError[a.id] && (
                        <span className="text-[9px] text-red-400" title={reanalyzeError[a.id]}>
                          re-analysis failed: {reanalyzeError[a.id].slice(0, 60)}
                        </span>
                      )}
                    </div>
                  </div>
                  </button>

                  {/* Re-analyze button */}
                  <button
                    onClick={(e) => handleReanalyze(a.id, e)}
                    aria-label="Re-analyze with latest patterns"
                    title="Re-analyze with latest patterns"
                    disabled={reanalyzingId === a.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-500 hover:text-indigo-400 hover:bg-gray-900 transition-all shrink-0 disabled:opacity-30"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reanalyzingId === a.id ? 'animate-spin' : ''}`} />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(a.id, e)}
                    aria-label="Delete analysis"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-500 hover:text-[#ff2a2b] hover:bg-gray-900 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
