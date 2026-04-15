'use client'

import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, type TooltipProps } from 'recharts'
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

const ROI_EDIT_TIPS: Record<string, { what: string; fix: string }> = {
  FFA:      { what: 'Face Detection',           fix: 'add face cam, talking head, or a person in frame' },
  DAN:      { what: 'Spatial Attention',        fix: 'add motion — cut, zoom, B-roll, or on-screen animation' },
  VWFA:     { what: 'Text Processing',          fix: 'add captions, a title card, or a text callout' },
  V4:       { what: 'Color & Form',             fix: 'grade up saturation or add a high-contrast graphic overlay' },
  LO:       { what: 'Object Recognition',       fix: 'show the product or key object more clearly' },
  STS:      { what: 'Social & Motion Cues',     fix: 'add gestures, cutaways, or reaction shots' },
  V1_V2:    { what: 'Low-Level Visual',         fix: 'increase visual sharpness or contrast' },
  AV_ASSOC: { what: 'Audio-Visual Association', fix: 'sync cuts to audio beats or add sound effects on visual hits' },
  DMN:      { what: 'Default Mode Network',     fix: 'reduce cognitive load — simplify the frame or slow the pace' },
  PPA:      { what: 'Scene Recognition',        fix: 'establish location context with a wider shot' },
}

// ── Dip detection ─────────────────────────────────────────────────────────────

interface DipResult { start: number; end: number; minVal: number }
interface DipZone   { start: number; end: number; roiKey: string; color: string }

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

function computeDipZones(roiData: ROIRegionWithTemporal[]): DipZone[] {
  const zones: DipZone[] = []
  for (const key of ['FFA', 'DAN', 'VWFA']) {
    const roi = roiData.find(r => r.region_key === key)
    if (!roi?.temporal_activations?.length) continue
    for (const dip of findDips(roi.temporal_activations)) {
      zones.push({ start: dip.start, end: dip.end, roiKey: key, color: ROI_COLORS[key] ?? '#6b7280' })
    }
  }
  return zones
}

// ── Temporal chart ────────────────────────────────────────────────────────────

function TemporalChart({ roiData, dipZones }: { roiData: ROIRegionWithTemporal[]; dipZones: DipZone[] }) {
  const topRois = roiData
    .filter(r => r.temporal_activations && r.temporal_activations.length > 0)
    .slice(0, 5)

  if (topRois.length === 0) return null

  const n = topRois[0].temporal_activations!.length
  const chartData = Array.from({ length: n }, (_, i) => {
    const point: Record<string, number> = { t: i }
    for (const roi of topRois) point[roi.region_key] = roi.temporal_activations![i] ?? 0
    return point
  })

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-gray-300">Brain Activation Over Time</h3>
          <p className="text-xs text-gray-600 mt-0.5">Top 5 regions · shaded zones = engagement dips</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="t"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<TemporalTooltip rois={topRois} />} />
          {/* Dip zone shading — drawn before lines so lines sit on top */}
          {dipZones.map((zone, i) => (
            <ReferenceArea
              key={i}
              x1={zone.start}
              x2={zone.end}
              fill={zone.color}
              fillOpacity={0.08}
              stroke={zone.color}
              strokeOpacity={0.25}
              strokeDasharray="3 3"
            />
          ))}
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

// ── Findings panel ────────────────────────────────────────────────────────────

interface Finding {
  roiKey?: string
  status: 'ok' | 'warn' | 'info'
  headline: string
  detail: string
  dips?: DipResult[]
}

function buildFindings(roiData: ROIRegionWithTemporal[]): Finding[] {
  const byKey = Object.fromEntries(roiData.map(r => [r.region_key, r]))
  const findings: Finding[] = []
  const n = roiData[0]?.temporal_activations?.length ?? 0

  // Opening hook
  const hookEnd = Math.max(2, Math.round(n * 0.2))
  const ffaOpen = byKey['FFA']?.temporal_activations?.slice(0, hookEnd) ?? []
  const v4Open  = byKey['V4']?.temporal_activations?.slice(0, hookEnd) ?? []
  const ffaAvg  = ffaOpen.length ? ffaOpen.reduce((a, b) => a + b, 0) / ffaOpen.length : null
  const v4Avg   = v4Open.length  ? v4Open.reduce((a, b) => a + b, 0)  / v4Open.length  : null
  if (ffaAvg !== null && v4Avg !== null) {
    const weak = ffaAvg < 0.4 || v4Avg < 0.4
    findings.push({
      status: weak ? 'warn' : 'ok',
      headline: weak
        ? `Weak opening hook — Face Detection ${(ffaAvg * 100).toFixed(0)}%, Color & Form ${(v4Avg * 100).toFixed(0)}%`
        : `Strong opening hook — Face Detection ${(ffaAvg * 100).toFixed(0)}%, Color & Form ${(v4Avg * 100).toFixed(0)}%`,
      detail: weak
        ? 'Open with a face on-camera and a vivid visual to engage both systems immediately'
        : 'Both face presence and visual interest are strong at the start — keep this pattern',
    })
  }

  // Dip scan
  for (const key of ['FFA', 'DAN', 'VWFA'] as const) {
    const roi = byKey[key]
    if (!roi?.temporal_activations?.length) continue
    const dips = findDips(roi.temporal_activations)
    const tip = ROI_EDIT_TIPS[key]
    if (dips.length === 0) {
      findings.push({ roiKey: key, status: 'ok', headline: `${tip.what} held steady`, detail: 'No significant engagement drops detected for this region', dips: [] })
    } else {
      findings.push({
        roiKey: key,
        status: 'warn',
        headline: `${tip.what} drops at ${dips.map(d => `t=${d.start}–${d.end}`).join(', ')}`,
        detail: `Scrub to those moments and ${tip.fix}`,
        dips,
      })
    }
  }

  // Top overall insight
  const sorted = [...roiData].sort((a, b) => b.activation - a.activation)
  const top = sorted[0]
  if (top) {
    const tip = ROI_EDIT_TIPS[top.region_key]
    findings.push({
      roiKey: top.region_key,
      status: 'info',
      headline: `Strongest system: ${top.label} (${(top.activation * 100).toFixed(0)}% avg)`,
      detail: tip
        ? `Your audience responds most to ${tip.what.toLowerCase()} — structure more scenes around what triggers it`
        : 'This region dominated throughout — lean into content that reinforces it',
    })
  }

  return findings
}

function FindingsPanel({ roiData }: { roiData: ROIRegionWithTemporal[] }) {
  const findings = buildFindings(roiData)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium text-gray-300">Editing Findings</h3>
        <span className="text-xs text-gray-600">Shaded zones on chart above match the dip warnings below</span>
      </div>
      {findings.map((f, i) => {
        const color = f.roiKey ? (ROI_COLORS[f.roiKey] ?? '#6b7280') : undefined
        return (
          <div
            key={i}
            className={[
              'flex gap-3 rounded-lg px-4 py-3 border text-xs',
              f.status === 'ok'   ? 'border-emerald-900/50 bg-emerald-950/20' :
              f.status === 'warn' ? 'border-amber-900/50  bg-amber-950/20'  :
                                    'border-indigo-900/50 bg-indigo-950/20',
            ].join(' ')}
          >
            {/* ROI color dot — matches the chart line */}
            {color ? (
              <div className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: color }} />
            ) : (
              <div className={[
                'w-2 h-2 rounded-full mt-0.5 shrink-0',
                f.status === 'ok' ? 'bg-emerald-500' : f.status === 'warn' ? 'bg-amber-400' : 'bg-indigo-400',
              ].join(' ')} />
            )}
            <div className="flex-1 space-y-0.5">
              <p className={[
                'font-medium leading-snug',
                f.status === 'ok'   ? 'text-emerald-300' :
                f.status === 'warn' ? 'text-amber-300'   :
                                      'text-indigo-300',
              ].join(' ')}>{f.headline}</p>
              <p className="text-gray-400 leading-snug">{f.detail}</p>
            </div>
            {/* Status icon */}
            <span className={[
              'shrink-0 font-bold text-base leading-none',
              f.status === 'ok'   ? 'text-emerald-500' :
              f.status === 'warn' ? 'text-amber-400'   :
                                    'text-indigo-400',
            ].join(' ')}>
              {f.status === 'ok' ? '✓' : f.status === 'warn' ? '!' : '→'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Region reference ──────────────────────────────────────────────────────────

function RegionReference() {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <span>What each brain region measures</span>
        <span className="text-gray-700">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-gray-800 pt-3">
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
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
    }, 10000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [analysisId, token])

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

  if (status === 'failed' || !result) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">Analysis failed.</p>
        {result?.error_message && <p className="text-xs text-gray-500 font-mono">{result.error_message}</p>}
        <button onClick={onReset} className="text-xs text-indigo-400 hover:text-indigo-300 underline">Try another video</button>
      </div>
    )
  }

  const roiData = (result.roi_data ?? []) as ROIRegionWithTemporal[]
  const hasTemporalData = roiData.some(r => (r.temporal_activations?.length ?? 0) > 1)
  const dipZones = hasTemporalData ? computeDipZones(roiData) : []

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Video Brain Activation Report</h2>
        <button onClick={onReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Analyze another video
        </button>
      </div>

      {/* 1. Heatmap */}
      {result.heatmap_url && (
        <HeatmapPanel heatmapUrl={result.heatmap_url} originalAlt="Brain activation heatmap on representative frame" />
      )}

      {/* 2. Temporal chart — dip zones shaded */}
      {hasTemporalData && <TemporalChart roiData={roiData} dipZones={dipZones} />}

      {/* 3. Findings — immediately under chart, colors match chart lines */}
      {hasTemporalData && roiData.length > 0 && <FindingsPanel roiData={roiData} />}

      {/* 4. Overall average bar chart */}
      {roiData.length > 0 && <ROIBarChart roiData={roiData} />}

      {/* 5. Region reference (collapsed by default) */}
      <RegionReference />

      <AttributionFooter />
    </div>
  )
}
