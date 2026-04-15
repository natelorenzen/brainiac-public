'use client'

import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, type TooltipProps } from 'recharts'
import { HeatmapPanel } from '@/components/HeatmapPanel'
import { ROIBarChart } from '@/components/ROIBarChart'
import { AttributionFooter } from '@/components/AttributionFooter'
import type { AnalysisResult, ROIRegion } from '@/types'

interface ROIRegionWithTemporal extends ROIRegion {
  temporal_activations?: number[]
}

interface Props {
  analysisId: string
  token: string
  onReset: () => void
}

const ROI_COLORS: Record<string, string> = {
  FFA:      '#818cf8',
  V1_V2:    '#34d399',
  V4:       '#fb923c',
  LO:       '#f472b6',
  PPA:      '#38bdf8',
  STS:      '#a78bfa',
  DAN:      '#facc15',
  VWFA:     '#4ade80',
  DMN:      '#f87171',
  AV_ASSOC: '#67e8f9',
}

function TemporalChart({ roiData }: { roiData: ROIRegionWithTemporal[] }) {
  // Show top 5 ROIs by average activation that have temporal data
  const topRois = roiData
    .filter(r => r.temporal_activations && r.temporal_activations.length > 0)
    .slice(0, 5)

  if (topRois.length === 0) return null

  const n = topRois[0].temporal_activations!.length
  const chartData = Array.from({ length: n }, (_, i) => {
    const point: Record<string, number> = { t: i }
    for (const roi of topRois) {
      point[roi.region_key] = roi.temporal_activations![i] ?? 0
    }
    return point
  })

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-1">Brain Activation Over Time</h3>
      <p className="text-xs text-gray-600 mb-3">Top 5 regions · per model timestep</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="t"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'timestep', position: 'insideBottomRight', offset: -4, fill: '#4b5563', fontSize: 10 }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<TemporalTooltip rois={topRois} />} />
          {topRois.map(roi => (
            <Line
              key={roi.region_key}
              type="monotone"
              dataKey={roi.region_key}
              stroke={ROI_COLORS[roi.region_key] ?? '#6366f1'}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {topRois.map(roi => (
          <div key={roi.region_key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: ROI_COLORS[roi.region_key] ?? '#6366f1' }} />
            <span className="text-xs text-gray-500">{roi.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TemporalTooltip({ active, payload, label, rois }: TooltipProps<number, string> & { rois: ROIRegionWithTemporal[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 p-2.5 rounded-lg text-xs shadow-lg space-y-1">
      <p className="text-gray-500 mb-1.5">t = {label}</p>
      {payload.map(p => {
        const roi = rois.find(r => r.region_key === p.dataKey)
        return (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-gray-300">{roi?.label ?? p.dataKey}</span>
            <span className="text-white font-mono ml-auto pl-3">{(p.value as number)?.toFixed(3)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Editing guide ─────────────────────────────────────────────────────────────

const ROI_EDIT_TIPS: Record<string, { what: string; fix: string }> = {
  FFA:      { what: 'Face Detection', fix: 'add face cam, talking head, or a person in frame' },
  DAN:      { what: 'Spatial Attention', fix: 'add motion — cut, zoom, B-roll, or on-screen animation' },
  VWFA:     { what: 'Text Processing', fix: 'add captions, a title card, or a text callout' },
  V4:       { what: 'Color & Form', fix: 'grade up saturation or add a high-contrast graphic overlay' },
  LO:       { what: 'Object Recognition', fix: 'show the product or key object more clearly' },
  STS:      { what: 'Social & Motion Cues', fix: 'add gestures, cutaways, or reaction shots' },
  V1_V2:    { what: 'Low-Level Visual', fix: 'increase visual sharpness or contrast' },
  AV_ASSOC: { what: 'Audio-Visual Association', fix: 'sync cuts to audio beats or add sound effects on visual hits' },
  DMN:      { what: 'Default Mode Network', fix: 'reduce cognitive load — simplify the frame or slow the pace' },
  PPA:      { what: 'Scene Recognition', fix: 'establish location context with a wider shot' },
}

interface DipResult { start: number; end: number; minVal: number }

function findDips(temporal: number[], threshold = 0.35, minLen = 2): DipResult[] {
  const dips: DipResult[] = []
  let inDip = false, dipStart = 0, dipMin = 1
  for (let i = 0; i <= temporal.length; i++) {
    const val = temporal[i]
    if (val !== undefined && val < threshold) {
      if (!inDip) { inDip = true; dipStart = i; dipMin = val }
      else dipMin = Math.min(dipMin, val)
    } else {
      if (inDip && i - dipStart >= minLen) dips.push({ start: dipStart, end: i - 1, minVal: dipMin })
      inDip = false
    }
  }
  return dips
}

interface ChecklistItem { label: string; status: 'ok' | 'warn' | 'info'; detail: string }

function buildChecklist(roiData: ROIRegionWithTemporal[]): ChecklistItem[] {
  const byKey = Object.fromEntries(roiData.map(r => [r.region_key, r]))
  const items: ChecklistItem[] = []
  const n = roiData[0]?.temporal_activations?.length ?? 0

  // 1. Opening hook (first 20% of timesteps)
  const hookEnd = Math.max(2, Math.round(n * 0.2))
  const ffaOpening = byKey['FFA']?.temporal_activations?.slice(0, hookEnd) ?? []
  const v4Opening  = byKey['V4']?.temporal_activations?.slice(0, hookEnd) ?? []
  const ffaAvg = ffaOpening.length ? ffaOpening.reduce((a, b) => a + b, 0) / ffaOpening.length : null
  const v4Avg  = v4Opening.length  ? v4Opening.reduce((a, b) => a + b, 0)  / v4Opening.length  : null

  if (ffaAvg !== null && v4Avg !== null) {
    const hookWeak = ffaAvg < 0.4 || v4Avg < 0.4
    items.push({
      label: 'Opening hook (first 20% of video)',
      status: hookWeak ? 'warn' : 'ok',
      detail: hookWeak
        ? `Face Detection avg ${(ffaAvg * 100).toFixed(0)}%, Color & Form avg ${(v4Avg * 100).toFixed(0)}% — open with a face and vivid visual to spike both`
        : `Face Detection ${(ffaAvg * 100).toFixed(0)}% and Color & Form ${(v4Avg * 100).toFixed(0)}% — hook is strong`,
    })
  }

  // 2–4. Dip scan for FFA, DAN, VWFA
  for (const key of ['FFA', 'DAN', 'VWFA'] as const) {
    const roi = byKey[key]
    if (!roi?.temporal_activations?.length) continue
    const dips = findDips(roi.temporal_activations)
    const tip = ROI_EDIT_TIPS[key]
    if (dips.length === 0) {
      items.push({ label: `${tip.what} — no significant dips`, status: 'ok', detail: 'Engagement held throughout the video' })
    } else {
      const dipStr = dips.map(d => `t=${d.start}–${d.end}`).join(', ')
      items.push({
        label: `${tip.what} dips at ${dipStr}`,
        status: 'warn',
        detail: `At those timesteps, ${tip.fix}`,
      })
    }
  }

  // 5. Top overall ROI insight
  const sorted = [...roiData].sort((a, b) => b.activation - a.activation)
  const top = sorted[0]
  if (top) {
    const tip = ROI_EDIT_TIPS[top.region_key]
    items.push({
      label: `Highest overall: ${top.label} (${(top.activation * 100).toFixed(0)}%)`,
      status: 'info',
      detail: tip
        ? `Your audience responds most to ${tip.what.toLowerCase()} — lean into more of this content`
        : `This region dominated — structure more scenes around what triggers it`,
    })
  }

  return items
}

function EditingGuide({ roiData }: { roiData: ROIRegionWithTemporal[] }) {
  const hasTemporalData = roiData.some(r => (r.temporal_activations?.length ?? 0) > 1)
  const checklist = hasTemporalData ? buildChecklist(roiData) : []

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-1">How to re-edit using this report</h3>
        <p className="text-xs text-gray-500">
          Each region measures a different cognitive system. Dips below ~35% mean the brain is coasting — those are your cut points.
        </p>
      </div>

      {/* Region reference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(ROI_EDIT_TIPS).map(([key, { what, fix }]) => (
          <div key={key} className="flex gap-2.5 text-xs">
            <div className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: ROI_COLORS[key] ?? '#6b7280' }} />
            <div>
              <span className="text-gray-300 font-medium">{what}</span>
              <span className="text-gray-600"> — low? </span>
              <span className="text-gray-500">{fix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic checklist */}
      {checklist.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-gray-400">Your video — findings</p>
          {checklist.map((item, i) => (
            <div key={i} className="flex gap-2.5 text-xs">
              <span className={[
                'shrink-0 mt-0.5 w-3.5 text-center font-bold',
                item.status === 'ok'   ? 'text-emerald-500' :
                item.status === 'warn' ? 'text-amber-400' :
                                         'text-indigo-400',
              ].join(' ')}>
                {item.status === 'ok' ? '✓' : item.status === 'warn' ? '!' : '→'}
              </span>
              <div>
                <span className={[
                  'font-medium',
                  item.status === 'ok'   ? 'text-emerald-400' :
                  item.status === 'warn' ? 'text-amber-300' :
                                           'text-indigo-300',
                ].join(' ')}>{item.label}</span>
                <p className="text-gray-500 mt-0.5">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function VideoReport({ analysisId, token, onReset }: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [status, setStatus] = useState<'polling' | 'complete' | 'failed'>('polling')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/analyze/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data: AnalysisResult = await res.json()

      if (data.status === 'complete' || data.status === 'failed') {
        clearInterval(pollRef.current!)
        setResult(data)
        setStatus(data.status === 'complete' ? 'complete' : 'failed')
      }
    }, 10000) // 10s poll — video takes 3-5 min

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [analysisId, token])

  // Polling state
  if (status === 'polling') {
    return (
      <div className="space-y-4 py-6 text-center">
        <div className="flex justify-center">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <p className="text-sm text-gray-300">Analyzing your video…</p>
          <p className="text-xs text-gray-600 mt-1">TRIBE v2 inference takes 3–5 minutes. This page will update automatically.</p>
        </div>
      </div>
    )
  }

  // Failed state
  if (status === 'failed' || !result) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">Analysis failed.</p>
        {result?.error_message && (
          <p className="text-xs text-gray-500 font-mono">{result.error_message}</p>
        )}
        <button onClick={onReset} className="text-xs text-indigo-400 hover:text-indigo-300 underline">
          Try another video
        </button>
      </div>
    )
  }

  const roiData = (result.roi_data ?? []) as ROIRegionWithTemporal[]
  const hasTemporalData = roiData.some(r => (r.temporal_activations?.length ?? 0) > 1)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Video Brain Activation Report</h2>
        <button
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Analyze another video
        </button>
      </div>

      {/* Heatmap */}
      {result.heatmap_url && (
        <HeatmapPanel heatmapUrl={result.heatmap_url} originalAlt="Brain activation heatmap on representative frame" />
      )}

      {/* Temporal chart */}
      {hasTemporalData && <TemporalChart roiData={roiData} />}

      {/* ROI bar chart */}
      {roiData.length > 0 && <ROIBarChart roiData={roiData} />}

      {/* Editing guide + dynamic checklist */}
      {roiData.length > 0 && (
        <div className="border border-gray-800 rounded-xl px-5 py-5">
          <EditingGuide roiData={roiData} />
        </div>
      )}

      <AttributionFooter />
    </div>
  )
}
