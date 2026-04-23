'use client'

import { useEffect, useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AttributionFooter } from '@/components/AttributionFooter'
import type { CorrelationEntry } from '@/types'

interface Props {
  correlations: CorrelationEntry[]
  channelHandle: string
  videoCount: number
  token: string
}

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

function rColor(r: number): string {
  if (Math.abs(r) >= 0.5) return r > 0 ? 'text-emerald-400' : 'text-rose-400'
  if (Math.abs(r) >= 0.25) return r > 0 ? 'text-emerald-600' : 'text-rose-600'
  return 'text-gray-500'
}

function rLabel(r: number): string {
  const dir = r > 0 ? 'positive' : 'negative'
  const strength = Math.abs(r) >= 0.5 ? 'strong' : Math.abs(r) >= 0.25 ? 'moderate' : 'weak'
  return `${strength} ${dir}`
}

export function CorrelationResults({ correlations, channelHandle, videoCount, token }: Props) {
  const top = correlations[0]
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!correlations.length || !token) return
    setLoading(true)
    fetch('/api/analyze/image-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        context: 'channel',
        channel_handle: channelHandle,
        video_count: videoCount,
        correlations: correlations.map(c => ({
          region_key: c.region_key,
          label: c.label,
          description: c.description,
          r: c.r,
        })),
      }),
    })
      .then(r => r.json())
      .then(d => setSummary(d.summary ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">
          Brain activation vs. view count — @{channelHandle}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {videoCount} videos analyzed · Pearson r · rank scatter
        </p>
      </div>

      {/* Ranked table */}
      <div className="overflow-hidden rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50">
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">#</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Brain Region</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">r</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium hidden sm:table-cell">Correlation</th>
            </tr>
          </thead>
          <tbody>
            {correlations.map((entry, i) => (
              <tr key={entry.region_key} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="text-white text-sm">{entry.label}</div>
                  <div className="text-gray-600 text-xs hidden sm:block">{entry.description}</div>
                </td>
                <td className={`px-4 py-2.5 text-right font-mono font-medium ${rColor(entry.r)}`}>
                  {entry.r >= 0 ? '+' : ''}{entry.r.toFixed(3)}
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    {/* Bar centered at 0 */}
                    <div className="w-24 h-1.5 bg-gray-800 rounded-full relative">
                      {entry.r >= 0 ? (
                        <div
                          className="absolute left-1/2 top-0 h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.abs(entry.r) * 50}%` }}
                        />
                      ) : (
                        <div
                          className="absolute top-0 h-full bg-rose-500 rounded-full"
                          style={{ right: '50%', width: `${Math.abs(entry.r) * 50}%` }}
                        />
                      )}
                    </div>
                    <span className={`text-xs ${rColor(entry.r)}`}>{rLabel(entry.r)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rank-based scatter for strongest correlation */}
      {top && top.data_points.length >= 3 && (() => {
        const n = top.data_points.length
        // Convert rank to percentile: rank 1 (best) → 100, rank N (worst) → 0
        const byViews = [...top.data_points].sort((a, b) => b.log_views - a.log_views)
        const viewRankMap = new Map(byViews.map((d, i) => [d, i + 1]))
        const byAct = [...top.data_points].sort((a, b) => b.activation - a.activation)
        const actRankMap = new Map(byAct.map((d, i) => [d, i + 1]))

        const toPercent = (rank: number) => Math.round(((n - rank) / Math.max(n - 1, 1)) * 100)

        const ranked = top.data_points.map(d => ({
          ...d,
          view_pct: toPercent(viewRankMap.get(d)!),
          act_pct: toPercent(actRankMap.get(d)!),
          view_rank: viewRankMap.get(d)!,
          act_rank: actRankMap.get(d)!,
        }))

        return (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-white">{top.label} — rank correlation</p>
              <p className="text-xs text-gray-500">
                r = {top.r >= 0 ? '+' : ''}{top.r.toFixed(3)} · positive r = bottom-left to top-right · each point is one video
              </p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 4, right: 16, bottom: 20, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="view_pct"
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  name="Views percentile"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickFormatter={v => `${v}%`}
                  label={{ value: 'Views percentile (100% = most views)', position: 'insideBottom', offset: -12, fill: '#4b5563', fontSize: 11 }}
                />
                <YAxis
                  dataKey="act_pct"
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  name="Activation percentile"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickFormatter={v => `${v}%`}
                  label={{ value: 'Activation %', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    const d = payload?.[0]?.payload as { title: string; activation: number; log_views: number; view_rank: number; act_rank: number; view_pct: number; act_pct: number } | undefined
                    if (!d) return null
                    return (
                      <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs max-w-[200px]">
                        <p className="text-white truncate">{d.title}</p>
                        <p className="text-gray-400">views: {Math.round(Math.exp(d.log_views) - 1).toLocaleString()} (#{d.view_rank})</p>
                        <p className="text-gray-400">activation: {d.activation.toFixed(3)} (#{d.act_rank})</p>
                      </div>
                    )
                  }}
                />
                <Scatter data={ranked} fill="#6366f1" opacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Interpretation callout */}
      {top && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-400">
          On this channel, higher <span className="text-white">{top.label.toLowerCase()}</span> activation
          is associated with{' '}
          <span className={top.r > 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {top.r > 0 ? 'more' : 'fewer'} views
          </span>{' '}
          (r = {top.r >= 0 ? '+' : ''}{top.r.toFixed(3)}).
          {Math.abs(top.r) < 0.25 && (
            <span className="text-gray-600"> No strong signal detected — more data may be needed.</span>
          )}
        </div>
      )}

      {/* Thumbnail suggestions */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-label">Thumbnail Recommendations</span>
          <span className="panel-meta">BERG · @{channelHandle} · {videoCount} videos</span>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-3 t-meta">
              <div className="w-3 h-3 border border-indigo-500 border-t-transparent animate-spin" />
              Generating recommendations…
            </div>
          ) : summary ? (
            <div className="space-y-3">
              {summary.split('\n').map((line, i) => {
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
          ) : (
            <p className="t-meta">No suggestions available.</p>
          )}
        </div>
      </div>

      <AttributionFooter />
    </div>
  )
}
