'use client'

import { useRef, useState } from 'react'
import { Upload, X, Square } from 'lucide-react'
import type { AnalysisResult, ROIRegion } from '@/types'
import { AttributionFooter } from '@/components/AttributionFooter'
import { supabase } from '@/lib/supabase'

interface ImageCard {
  id: string
  file: File
  previewUrl: string
  analysisId: string | null
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'failed'
  result: AnalysisResult | null
  error?: string
}

interface ROIAverage extends ROIRegion { /* activation is already the average */ }

interface Props { token: string }

export function ImageBatchTab({ token }: Props) {
  const [cards, setCards] = useState<ImageCard[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedCard, setSelectedCard] = useState<ImageCard | null>(null)
  const [roiAverages, setRoiAverages] = useState<ROIAverage[] | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [cardSuggestions, setCardSuggestions] = useState<Record<string, string>>({})
  const [cardSuggestionsLoading, setCardSuggestionsLoading] = useState<Record<string, boolean>>({})

  const cardsRef = useRef<ImageCard[]>([])
  cardsRef.current = cards
  const stoppedRef = useRef(false)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 15)
    const next: ImageCard[] = files.map(file => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      previewUrl: URL.createObjectURL(file),
      analysisId: null,
      status: 'pending',
      result: null,
    }))
    setCards(next)
    setRoiAverages(null)
    setAiSummary(null)
    e.target.value = ''
  }

  function handleClear() {
    stoppedRef.current = true
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current.clear()
    cards.forEach(c => URL.revokeObjectURL(c.previewUrl))
    setCards([])
    setRoiAverages(null)
    setAiSummary(null)
    setAnalyzing(false)
  }

  function handleStop() {
    stoppedRef.current = true
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current.clear()
    setAnalyzing(false)
  }

  function pollOne(analysisId: string, cardId: string, tok: string): Promise<void> {
    return new Promise(resolve => {
      const iv = setInterval(async () => {
        if (stoppedRef.current) { clearInterval(iv); resolve(); return }

        const res = await fetch(`/api/analyze/${analysisId}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })

        if (!res.ok) {
          // Non-retryable — don't loop forever
          if (res.status === 401 || res.status === 403 || res.status === 404) {
            clearInterval(iv)
            intervalsRef.current.delete(cardId)
            setCards(prev => prev.map(c =>
              c.id === cardId ? { ...c, status: 'failed', error: `Poll error: ${res.status}` } : c
            ))
            resolve()
          }
          return
        }

        const data: AnalysisResult = await res.json()
        if (data.status !== 'complete' && data.status !== 'failed') return

        clearInterval(iv)
        intervalsRef.current.delete(cardId)

        setCards(prev => prev.map(c =>
          c.id === cardId
            ? { ...c, status: data.status as ImageCard['status'], result: data, error: data.error_message ?? undefined }
            : c
        ))
        resolve()
      }, 3000)

      intervalsRef.current.set(cardId, iv)
    })
  }

  async function handleAnalyze() {
    if (!cards.length || analyzing) return
    stoppedRef.current = false
    setAnalyzing(true)
    setRoiAverages(null)
    setAiSummary(null)

    // Refresh the session token before starting — stored token may have expired
    const { data: { session } } = await supabase.auth.getSession()
    const freshToken = session?.access_token ?? token

    const dispatched = await Promise.all(
      cardsRef.current.map(async card => {
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'uploading' } : c))

        const form = new FormData()
        form.append('image', card.file)

        try {
          const res = await fetch('/api/analyze/thumbnail', {
            method: 'POST',
            headers: { Authorization: `Bearer ${freshToken}` },
            body: form,
          })
          const data = await res.json()
          if (!res.ok || !data.analysis_id) {
            setCards(prev => prev.map(c =>
              c.id === card.id ? { ...c, status: 'failed', error: data.error ?? 'Upload failed' } : c
            ))
            return null
          }
          setCards(prev => prev.map(c =>
            c.id === card.id ? { ...c, analysisId: data.analysis_id, status: 'processing' } : c
          ))
          return { cardId: card.id, analysisId: data.analysis_id as string }
        } catch {
          setCards(prev => prev.map(c =>
            c.id === card.id ? { ...c, status: 'failed', error: 'Network error' } : c
          ))
          return null
        }
      })
    )

    const valid = dispatched.filter((d): d is { cardId: string; analysisId: string } => d !== null)
    await Promise.all(valid.map(({ analysisId, cardId }) => pollOne(analysisId, cardId, freshToken)))

    if (stoppedRef.current) return
    setAnalyzing(false)

    // Compute ROI averages from completed cards
    const completed = cardsRef.current.filter(c => c.status === 'complete' && c.result?.roi_data)
    if (!completed.length) return

    const roiMap = new Map<string, { label: string; description: string; total: number; count: number }>()
    for (const c of completed) {
      for (const roi of c.result!.roi_data!) {
        const existing = roiMap.get(roi.region_key)
        if (existing) { existing.total += roi.activation; existing.count++ }
        else roiMap.set(roi.region_key, { label: roi.label, description: roi.description, total: roi.activation, count: 1 })
      }
    }

    const averages: ROIAverage[] = Array.from(roiMap.entries())
      .map(([region_key, v]) => ({
        region_key,
        label: v.label,
        description: v.description,
        activation: v.total / v.count,
      }))
      .sort((a, b) => b.activation - a.activation)

    setRoiAverages(averages)

    // Fetch AI suggestions
    setAiLoading(true)
    try {
      const res = await fetch('/api/analyze/image-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ roi_averages: averages, image_count: completed.length }),
      })
      const data = await res.json()
      setAiSummary(data.summary ?? null)
    } catch { /* non-fatal */ }
    setAiLoading(false)
  }

  async function handleCardClick(card: ImageCard) {
    setSelectedCard(card)
    if (!card.result?.roi_data || cardSuggestions[card.id] || cardSuggestionsLoading[card.id]) return
    setCardSuggestionsLoading(prev => ({ ...prev, [card.id]: true }))
    try {
      const freshToken = (await supabase.auth.getSession()).data.session?.access_token ?? token
      const res = await fetch('/api/analyze/image-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ roi_averages: card.result.roi_data, image_count: 1 }),
      })
      const data = await res.json()
      if (data.summary) setCardSuggestions(prev => ({ ...prev, [card.id]: data.summary }))
    } catch { /* non-fatal */ }
    setCardSuggestionsLoading(prev => ({ ...prev, [card.id]: false }))
  }

  const doneCount = cards.filter(c => c.status === 'complete' || c.status === 'failed').length
  const processingCard = cards.find(c => c.status === 'processing' || c.status === 'uploading')

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      {cards.length === 0 ? (
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-700 rounded-xl p-12 cursor-pointer hover:border-indigo-600 transition-colors">
          <Upload className="w-8 h-8 text-gray-500" />
          <div className="text-center">
            <p className="text-sm text-gray-300">Upload up to 15 thumbnail images</p>
            <p className="text-xs text-gray-600 mt-1">JPEG, PNG, WebP · max 10 MB each</p>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{cards.length} image{cards.length > 1 ? 's' : ''} selected</p>
          <div className="flex gap-2">
            {!analyzing && (
              <label className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 hover:text-white border border-gray-700 cursor-pointer transition-colors">
                Change
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
              </label>
            )}
            <button
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 hover:text-white border border-gray-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Analyze button */}
      {cards.length > 0 && !analyzing && doneCount === 0 && (
        <button
          onClick={handleAnalyze}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Analyze {cards.length} image{cards.length > 1 ? 's' : ''}
        </button>
      )}

      {/* Progress bar */}
      {cards.length > 0 && (analyzing || doneCount > 0) && (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">
                {analyzing
                  ? processingCard
                    ? `Analyzing: ${processingCard.file.name}`
                    : 'Uploading…'
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

      {/* Image card grid */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {cards.map(card => (
            <ImageResultCard
              key={card.id}
              card={card}
              onClick={card.status === 'complete' ? () => handleCardClick(card) : undefined}
            />
          ))}
        </div>
      )}

      {/* Summary stats */}
      {roiAverages && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Average Brain Activation</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Averaged across {cards.filter(c => c.status === 'complete').length} analyzed images
            </p>
          </div>
          <div className="space-y-3">
            {roiAverages.map((roi, i) => (
              <div key={roi.region_key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 font-mono w-4">{i + 1}</span>
                    <span className="text-sm text-white">{roi.label}</span>
                  </div>
                  <span className="text-xs font-mono text-gray-400">{roi.activation.toFixed(3)}</span>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${roi.activation * 100}%` }}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 pl-6">{roi.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI suggestions */}
      {(aiLoading || aiSummary) && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
          <h3 className="text-sm font-semibold text-white">Design Suggestions</h3>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-full border border-indigo-500 border-t-transparent animate-spin" />
              Generating suggestions…
            </div>
          ) : aiSummary ? (
            <div className="text-sm text-gray-300 leading-relaxed prose prose-invert prose-sm max-w-none">
              {aiSummary.split('\n').map((line, i) => {
                const bullet = line.match(/^[-*]\s+(.+)/)
                if (bullet) {
                  return (
                    <div key={i} className="flex gap-2 py-1">
                      <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                      <span>{bullet[1]}</span>
                    </div>
                  )
                }
                return line.trim() ? <p key={i} className="py-0.5">{line}</p> : null
              })}
            </div>
          ) : null}
        </div>
      )}

      {roiAverages && <AttributionFooter />}

      {/* Detail modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative aspect-video bg-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedCard.previewUrl} alt={selectedCard.file.name} className="w-full h-full object-cover" />
              {selectedCard.result?.heatmap_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedCard.result.heatmap_url}
                  alt="Brain activation heatmap"
                  className="absolute inset-0 w-full h-full object-cover opacity-70"
                />
              )}
              <button
                onClick={() => setSelectedCard(null)}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <p className="text-sm font-medium text-white truncate">{selectedCard.file.name}</p>
              {selectedCard.result?.roi_data && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Brain Activation Scores</p>
                  {selectedCard.result.roi_data.map(roi => (
                    <div key={roi.region_key} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-300">{roi.label}</span>
                        <span className="text-xs font-mono text-gray-400">{roi.activation.toFixed(3)}</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${roi.activation * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-600">{roi.description}</p>
                    </div>
                  ))}
                </div>
              )}
              {(cardSuggestionsLoading[selectedCard.id] || cardSuggestions[selectedCard.id]) && (
                <div className="space-y-2 border-t border-gray-800 pt-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Improvement Suggestions</p>
                  {cardSuggestionsLoading[selectedCard.id] ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 rounded-full border border-indigo-500 border-t-transparent animate-spin" />
                      Analyzing…
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 leading-relaxed space-y-1.5">
                      {cardSuggestions[selectedCard.id].split('\n').map((line, i) => {
                        const bullet = line.match(/^[-*]\s+(.+)/)
                        if (bullet) return (
                          <div key={i} className="flex gap-2">
                            <span className="text-indigo-400 shrink-0">•</span>
                            <span>{bullet[1]}</span>
                          </div>
                        )
                        return line.trim() ? <p key={i}>{line}</p> : null
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImageResultCard({ card, onClick }: { card: ImageCard; onClick?: () => void }) {
  const topRoi = card.result?.roi_data?.slice(0, 3) ?? []

  return (
    <div
      className={[
        'bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col',
        onClick ? 'cursor-pointer hover:border-indigo-700 transition-colors' : '',
      ].join(' ')}
      onClick={onClick}
    >
      <div className="relative aspect-video bg-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.previewUrl} alt={card.file.name} className="w-full h-full object-cover" loading="lazy" />
        {card.result?.heatmap_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.result.heatmap_url}
            alt="Brain activation heatmap"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
        )}
        <div className="absolute top-1.5 right-1.5">
          {card.status === 'pending' && (
            <span className="text-[10px] bg-gray-900/80 text-gray-500 px-1.5 py-0.5 rounded">pending</span>
          )}
          {(card.status === 'uploading' || card.status === 'processing') && (
            <span className="text-[10px] bg-indigo-900/80 text-indigo-300 px-1.5 py-0.5 rounded animate-pulse">
              {card.status === 'uploading' ? 'uploading…' : 'analyzing…'}
            </span>
          )}
          {card.status === 'failed' && (
            <span className="text-[10px] bg-red-900/80 text-red-300 px-1.5 py-0.5 rounded">failed</span>
          )}
        </div>
      </div>

      <div className="p-2.5 flex-1 flex flex-col gap-2">
        <p className="text-xs text-gray-300 leading-snug line-clamp-2">{card.file.name}</p>

        {topRoi.length > 0 && (
          <div className="space-y-1 mt-auto">
            {topRoi.map(roi => (
              <div key={roi.region_key} className="flex items-center gap-1.5">
                <div className="flex-1 bg-gray-800 rounded-full h-1">
                  <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${roi.activation * 100}%` }} />
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
