'use client'

import { useRef, useState, useEffect } from 'react'
import { Upload, Square } from 'lucide-react'
import type { AnalysisResult, ROIRegion } from '@/types'
import { AttributionFooter } from '@/components/AttributionFooter'
import { AdAnalysisModal } from '@/components/AdAnalysisModal'
import { ExtractionConfirmPanel } from '@/components/ExtractionConfirmPanel'
import { supabase } from '@/lib/supabase'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'
import type { ExtractedElements } from '@/app/api/analyze/extract-elements/route'

const WINNER_THRESHOLD_USD = 1000

type Mode = 'historical' | 'feedback'

interface ImageCard {
  id: string
  file: File
  previewUrl: string
  analysisId: string | null
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'failed'
  result: AnalysisResult | null
  error?: string
  spend?: number
}

interface ROIAverage extends ROIRegion { /* activation is already the average */ }

interface Props {
  token: string
  onStatsUpdate?: (stats: { count: number; totalSpend: number }) => void
}

async function fileToBase64(file: File): Promise<{ base64: string; mime_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, base64] = result.split(',')
      const mime_type = header.replace('data:', '').replace(';base64', '')
      resolve({ base64, mime_type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ImageBatchTab({ token, onStatsUpdate }: Props) {
  const [mode, setMode] = useState<Mode>('feedback')
  const [cards, setCards] = useState<ImageCard[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedCard, setSelectedCard] = useState<ImageCard | null>(null)
  const [roiAverages, setRoiAverages] = useState<ROIAverage[] | null>(null)
  const [cardComprehensive, setCardComprehensive] = useState<Record<string, ComprehensiveAnalysis>>({})
  const [cardLoading, setCardLoading] = useState<Record<string, boolean>>({})
  const [cardError, setCardError] = useState<Record<string, string>>({})
  const [extractedElements, setExtractedElements] = useState<Record<string, ExtractedElements>>({})
  const [extractionLoading, setExtractionLoading] = useState<Record<string, boolean>>({})
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<Record<string, boolean>>({})
  const [confirmedElements, setConfirmedElements] = useState<Record<string, ExtractedElements>>({})
  const [showExtractionPanel, setShowExtractionPanel] = useState(false)
  const [conceptTopic, setConceptTopic] = useState('')
  const [userAdCount, setUserAdCount] = useState<number | null>(null)

  const cardsRef = useRef<ImageCard[]>([])
  cardsRef.current = cards
  const stoppedRef = useRef(false)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  async function fetchAdCount() {
    // Historical-mode only — the feedback-mode lock and the dashboard
    // counters both need to reflect only ads with confirmed spend.
    const { data } = await supabase
      .from('analyses')
      .select('spend_usd')
      .eq('type', 'thumbnail')
      .eq('status', 'complete')
      .not('spend_usd', 'is', null)
    const rows = data ?? []
    const count = rows.length
    const totalSpend = rows.reduce((sum, r) => sum + (Number(r.spend_usd) || 0), 0)
    setUserAdCount(count)
    onStatsUpdate?.({ count, totalSpend })
  }

  useEffect(() => { fetchAdCount() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const feedbackLocked = userAdCount !== null && userAdCount < 10

  useEffect(() => {
    if (feedbackLocked && mode === 'feedback') setMode('historical')
  }, [feedbackLocked])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 25)
    const next: ImageCard[] = files.map(file => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      previewUrl: URL.createObjectURL(file),
      analysisId: null,
      status: 'pending',
      result: null,
      spend: undefined,
    }))
    setCards(next)
    setRoiAverages(null)
    setCardComprehensive({})
    setCardLoading({})
    setCardError({})
    setExtractedElements({})
    setExtractionLoading({})
    setAwaitingConfirmation({})
    setConfirmedElements({})
    setConceptTopic('')
    e.target.value = ''
  }

  function handleClear() {
    stoppedRef.current = true
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current.clear()
    cards.forEach(c => URL.revokeObjectURL(c.previewUrl))
    setCards([])
    setRoiAverages(null)
    setAnalyzing(false)
    setCardComprehensive({})
    setCardLoading({})
    setCardError({})
    setExtractedElements({})
    setExtractionLoading({})
    setAwaitingConfirmation({})
    setConfirmedElements({})
    setConceptTopic('')
  }

  function handleStop() {
    stoppedRef.current = true
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current.clear()
    setAnalyzing(false)
  }

  function updateSpend(cardId: string, value: string) {
    const num = value === '' ? undefined : Number(value)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, spend: num } : c))
  }

  function pollOne(analysisId: string, cardId: string, tok: string): Promise<void> {
    return new Promise(resolve => {
      const iv = setInterval(async () => {
        if (stoppedRef.current) { clearInterval(iv); resolve(); return }

        const res = await fetch(`/api/analyze/${analysisId}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })

        if (!res.ok) {
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

  async function runExtraction(card: ImageCard, freshToken: string) {
    if (!card.result?.roi_data) return
    setExtractionLoading(prev => ({ ...prev, [card.id]: true }))
    try {
      const { base64, mime_type } = await fileToBase64(card.file)
      const res = await fetch('/api/analyze/extract-elements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ image_base64: base64, mime_type }),
      })
      const data = await res.json()
      if (res.ok && data.extracted) {
        setExtractedElements(prev => ({ ...prev, [card.id]: data.extracted }))
        setAwaitingConfirmation(prev => ({ ...prev, [card.id]: true }))
      }
    } catch { /* non-fatal — user can still click to manually open */ }
    setExtractionLoading(prev => ({ ...prev, [card.id]: false }))
  }

  async function runComprehensive(card: ImageCard, freshToken: string, confirmed?: ExtractedElements, topic?: string) {
    if (!card.result?.roi_data) return
    setCardLoading(prev => ({ ...prev, [card.id]: true }))
    setCardError(prev => { const next = { ...prev }; delete next[card.id]; return next })
    try {
      const { base64, mime_type } = await fileToBase64(card.file)
      const res = await fetch('/api/analyze/comprehensive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({
          roi_averages: card.result.roi_data,
          image_count: 1,
          image_base64: base64,
          mime_type,
          spend_usd: mode === 'historical' ? card.spend : undefined,
          analysis_id: card.analysisId,
          confirmed_elements: confirmed,
          concept_topic: topic && topic.trim() ? topic.trim() : undefined,
          mode,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCardError(prev => ({ ...prev, [card.id]: data.error ?? `Analysis failed (${res.status})` }))
      } else if (data.comprehensive) {
        setCardComprehensive(prev => ({ ...prev, [card.id]: data.comprehensive }))
      } else {
        setCardError(prev => ({ ...prev, [card.id]: 'No analysis data returned' }))
      }
    } catch (e) {
      setCardError(prev => ({ ...prev, [card.id]: e instanceof Error ? e.message : 'Network error' }))
    }
    setCardLoading(prev => ({ ...prev, [card.id]: false }))
  }

  async function handleAnalyze() {
    if (!cards.length || analyzing) return
    if (mode === 'historical') {
      const missing = cards.some(c => c.spend === undefined || isNaN(c.spend) || c.spend < 0)
      if (missing) {
        alert('Enter spend for every ad in historical mode (use 0 if unknown).')
        return
      }
    }

    stoppedRef.current = false
    setAnalyzing(true)
    setRoiAverages(null)
    setCardComprehensive({})
    setExtractedElements({})
    setExtractionLoading({})
    setAwaitingConfirmation({})
    setConfirmedElements({})

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

    // Compute averages for the batch summary
    const completed = cardsRef.current.filter(c => c.status === 'complete' && c.result?.roi_data)
    if (completed.length) {
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
    }

    const completedCards = cardsRef.current.filter(c => c.status === 'complete')
    // Both modes now run extraction first and gate on user confirmation before
    // the comprehensive analysis. Feedback mode's concept topic is applied at
    // confirm-time, not before, so the user can correct extraction first.
    await Promise.all(completedCards.map(c => runExtraction(c, freshToken)))

    setAnalyzing(false)
    fetchAdCount()
  }

  async function handleCardClick(card: ImageCard) {
    // Both modes use the same flow: extraction → confirm → comprehensive.
    if (awaitingConfirmation[card.id] && extractedElements[card.id]) {
      setSelectedCard(card)
      setShowExtractionPanel(true)
      return
    }
    if (extractionLoading[card.id]) return
    if (confirmedElements[card.id] || cardComprehensive[card.id] || cardLoading[card.id]) {
      setSelectedCard(card)
      setShowExtractionPanel(false)
      return
    }
    if (card.status === 'complete' && card.result?.roi_data) {
      setSelectedCard(card)
      setShowExtractionPanel(false)
      const freshToken = (await supabase.auth.getSession()).data.session?.access_token ?? token
      runExtraction(card, freshToken)
    }
  }

  async function handleExtractionConfirm(confirmed: ExtractedElements) {
    if (!selectedCard) return
    const card = selectedCard
    setConfirmedElements(prev => ({ ...prev, [card.id]: confirmed }))
    setAwaitingConfirmation(prev => ({ ...prev, [card.id]: false }))
    setShowExtractionPanel(false)
    const freshToken = (await supabase.auth.getSession()).data.session?.access_token ?? token
    const topic = mode === 'feedback' ? (conceptTopic.trim() || undefined) : undefined
    runComprehensive(card, freshToken, confirmed, topic)
  }

  function handleExtractionSkip() {
    if (!selectedCard) return
    const card = selectedCard
    setAwaitingConfirmation(prev => ({ ...prev, [card.id]: false }))
    setShowExtractionPanel(false)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const freshToken = session?.access_token ?? token
      const topic = mode === 'feedback' ? (conceptTopic.trim() || undefined) : undefined
      runComprehensive(card, freshToken, undefined, topic)
    })
  }

  const doneCount = cards.filter(c => c.status === 'complete' || c.status === 'failed').length
  const processingCard = cards.find(c => c.status === 'processing' || c.status === 'uploading')

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
          {([
            ['feedback', 'Feedback Mode'],
            ['historical', 'Historical Mode'],
          ] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={analyzing || (m === 'feedback' && feedbackLocked)}
              title={m === 'feedback' && feedbackLocked ? `Unlocks after ${10 - (userAdCount ?? 0)} more historical ads` : undefined}
              className={[
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                mode === m ? 'bg-indigo-600 text-[#fff] shadow-sm' : 'text-gray-400 hover:text-gray-200',
                m === 'feedback' && feedbackLocked ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        {feedbackLocked ? (
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <div className="w-20 bg-gray-800 rounded-full h-1">
              <div
                className="bg-indigo-500 h-1 rounded-full transition-all"
                style={{ width: `${Math.min(((userAdCount ?? 0) / 10) * 100, 100)}%` }}
              />
            </div>
            <span>{userAdCount ?? 0}/10 ads — Feedback mode unlocks at 10</span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 max-w-md leading-relaxed">
            {mode === 'historical'
              ? `Upload past ads with spend data. Ads with $${WINNER_THRESHOLD_USD}+ spend feed the shared winning-pattern library.`
              : 'Upload new ads for review. Results include winning patterns from the shared library as reference.'}
          </p>
        )}
      </div>

      {/* Concept topic input (feedback mode only) */}
      {mode === 'feedback' && (
        <input
          type="text"
          placeholder="Concept topic for Reddit research — e.g. afternoon energy slump, meal prep anxiety (optional)"
          value={conceptTopic}
          onChange={e => setConceptTopic(e.target.value)}
          disabled={analyzing}
          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:border-[#ff2a2b] focus:outline-none placeholder:text-gray-600 disabled:opacity-50"
        />
      )}

      {/* Upload zone */}
      {cards.length === 0 ? (
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-700 rounded-xl p-12 cursor-pointer hover:border-indigo-600 transition-colors">
          <Upload className="w-8 h-8 text-gray-500" />
          <div className="text-center">
            <p className="text-sm text-gray-300">Upload up to 25 static ad images</p>
            <p className="text-xs text-gray-600 mt-1">JPEG, PNG, WebP · max 10 MB each</p>
          </div>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
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
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium transition-all shadow-sm hover:shadow-md"
        >
          Analyze {cards.length} ad{cards.length > 1 ? 's' : ''}
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
                    : 'Running comprehensive analysis…'
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
              mode={mode}
              disabled={analyzing}
              extractionLoading={extractionLoading[card.id]}
              awaitingConfirmation={awaitingConfirmation[card.id]}
              confirmed={!!confirmedElements[card.id]}
              comprehensive={cardComprehensive[card.id]}
              onSpendChange={(v) => updateSpend(card.id, v)}
              onClick={card.status === 'complete' ? () => handleCardClick(card) : undefined}
            />
          ))}
        </div>
      )}

      {/* Batch summary */}
      {roiAverages && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Average Brain Activation</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              BERG · averaged across {cards.filter(c => c.status === 'complete').length} ad images
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
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${roi.activation * 100}%` }} />
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 pl-6">{roi.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {roiAverages && <AttributionFooter />}

      {/* Extraction confirmation panel (historical mode) */}
      {selectedCard && showExtractionPanel && extractedElements[selectedCard.id] && (
        <ExtractionConfirmPanel
          fileName={selectedCard.file.name}
          previewUrl={selectedCard.previewUrl}
          extracted={extractedElements[selectedCard.id]}
          onConfirm={handleExtractionConfirm}
          onSkip={handleExtractionSkip}
          onClose={() => { setSelectedCard(null); setShowExtractionPanel(false) }}
        />
      )}

      {/* Detail modal */}
      {selectedCard && !showExtractionPanel && (
        <AdAnalysisModal
          card={{
            id: selectedCard.id,
            fileName: selectedCard.file.name,
            previewUrl: selectedCard.previewUrl,
            result: selectedCard.result,
            spend: selectedCard.spend,
            isWinner: mode === 'historical' && (selectedCard.spend ?? 0) >= WINNER_THRESHOLD_USD,
            isLoser: mode === 'historical' && selectedCard.spend !== undefined && selectedCard.spend < WINNER_THRESHOLD_USD,
          }}
          comprehensive={cardComprehensive[selectedCard.id]}
          loading={cardLoading[selectedCard.id]}
          error={cardError[selectedCard.id]}
          isHistorical={mode === 'historical'}
          token={token}
          onClose={() => setSelectedCard(null)}
          onRetry={async () => {
            const card = selectedCard
            const confirmed = confirmedElements[card.id]
            const freshToken = (await supabase.auth.getSession()).data.session?.access_token ?? token
            runComprehensive(card, freshToken, confirmed, conceptTopic.trim() || undefined)
          }}
        />
      )}
    </div>
  )
}

function ImageResultCard({
  card, mode, disabled, extractionLoading, awaitingConfirmation, confirmed, comprehensive, onSpendChange, onClick,
}: {
  card: ImageCard
  mode: Mode
  disabled: boolean
  extractionLoading?: boolean
  awaitingConfirmation?: boolean
  confirmed?: boolean
  comprehensive?: ComprehensiveAnalysis
  onSpendChange: (value: string) => void
  onClick?: () => void
}) {
  const composition = comprehensive?.composition_tag
  const grade = comprehensive?.framework_score?.overall_framework_grade
  const comboVerdict = comprehensive?.combination_analysis?.historical_match?.verdict
  const topRoi = card.result?.roi_data?.slice(0, 3) ?? []
  const isWinner = mode === 'historical' && (card.spend ?? 0) >= WINNER_THRESHOLD_USD
  const isLoser = mode === 'historical' && card.spend !== undefined && card.spend < WINNER_THRESHOLD_USD

  return (
    <div
      className={[
        'bg-gray-900 border rounded-xl overflow-hidden flex flex-col',
        isWinner ? 'border-yellow-600/60' : 'border-gray-800',
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
        {isWinner && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wider bg-yellow-500 text-yellow-950 px-1.5 py-0.5 rounded">
            ★ Winner
          </span>
        )}
        {isLoser && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wider bg-red-900 text-red-300 px-1.5 py-0.5 rounded border border-red-800">
            ✗ Loser
          </span>
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
          {card.status === 'complete' && extractionLoading && (
            <span className="text-[10px] bg-gray-900/80 text-gray-400 px-1.5 py-0.5 rounded animate-pulse">extracting…</span>
          )}
          {card.status === 'complete' && awaitingConfirmation && !extractionLoading && (
            <span className="text-[10px] bg-yellow-900/80 text-yellow-300 px-1.5 py-0.5 rounded">confirm →</span>
          )}
          {card.status === 'complete' && confirmed && !awaitingConfirmation && !extractionLoading && (
            <span className="text-[10px] bg-emerald-900/80 text-emerald-300 px-1.5 py-0.5 rounded">confirmed</span>
          )}
          {card.status === 'failed' && (
            <span className="text-[10px] bg-red-900/80 text-red-300 px-1.5 py-0.5 rounded">failed</span>
          )}
        </div>
      </div>

      <div className="p-2.5 flex-1 flex flex-col gap-2">
        <p className="text-xs text-gray-300 leading-snug line-clamp-2">{card.file.name}</p>

        {(composition || grade || comboVerdict) && (
          <div className="flex items-center flex-wrap gap-1">
            {composition && (
              <span className="text-[9px] text-white font-mono bg-gray-950 border border-gray-800 rounded px-1.5 py-0.5 truncate max-w-full" title={composition}>
                {composition}
              </span>
            )}
            {grade && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-gray-900 ${
                grade === 'A' ? 'text-emerald-400 border-emerald-800/60' :
                grade === 'B' ? 'text-amber-400 border-amber-800/60' :
                grade === 'C' ? 'text-orange-400 border-orange-800/60' :
                                'text-[#ff2a2b] border-red-900/60'
              }`}>{grade}</span>
            )}
            {comboVerdict && comboVerdict !== 'no_segment_data' && (
              <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                comboVerdict === 'strong_winner_pattern' ? 'text-emerald-400 border-emerald-800/60' :
                comboVerdict === 'mostly_loser_pattern' ? 'text-[#ff2a2b] border-red-900/60' :
                'text-amber-400 border-amber-800/60'
              }`}>{comboVerdict.split('_')[0]}</span>
            )}
          </div>
        )}

        {mode === 'historical' && (
          <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">$</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Spend"
              disabled={disabled}
              value={card.spend ?? ''}
              onChange={e => onSpendChange(e.target.value)}
              className="flex-1 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-indigo-600 focus:outline-none disabled:opacity-50"
            />
          </div>
        )}

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
