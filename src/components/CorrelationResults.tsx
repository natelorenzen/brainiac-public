'use client'

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

export function CorrelationResults({ correlations, channelHandle, videoCount }: Props) {
  const top = correlations[0]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">
          Brain activation vs. view count — @{channelHandle}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {videoCount} videos analyzed · Pearson r against log(views)
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

      {/* Scatter chart for strongest correlation */}
      {top && top.data_points.length >= 3 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-white">{top.label} vs. views</p>
            <p className="text-xs text-gray-500">
              r = {top.r >= 0 ? '+' : ''}{top.r.toFixed(3)} · each point is one video
            </p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="activation"
                type="number"
                domain={[0, 1]}
                name="Activation"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                label={{ value: 'Activation score', position: 'insideBottomRight', offset: -4, fill: '#4b5563', fontSize: 11 }}
              />
              <YAxis
                dataKey="log_views"
                type="number"
                name="log(views)"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                label={{ value: 'log(views)', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  const d = payload?.[0]?.payload as { title: string; activation: number; log_views: number } | undefined
                  if (!d) return null
                  return (
                    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs max-w-[200px]">
                      <p className="text-white truncate">{d.title}</p>
                      <p className="text-gray-400">activation: {d.activation.toFixed(3)}</p>
                      <p className="text-gray-400">views: {Math.round(Math.exp(d.log_views) - 1).toLocaleString()}</p>
                    </div>
                  )
                }}
              />
              <Scatter data={top.data_points} fill="#6366f1" opacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

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

      <AttributionFooter />
    </div>
  )
}
