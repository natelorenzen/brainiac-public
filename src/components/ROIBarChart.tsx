'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts'
import type { ROIRegion } from '@/types'

interface Props {
  roiData: ROIRegion[]
}

function XTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  if (!payload) return null
  return (
    <text x={x} y={y} dy={12} textAnchor="middle" style={{ fill: 'var(--graphite-4)', fontSize: 11 }}>
      {payload.value}
    </text>
  )
}

function YTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (!payload) return null
  return (
    <text x={x} y={y} dy={4} textAnchor="end" style={{ fill: 'var(--paper)', fontSize: 12 }}>
      {payload.value}
    </text>
  )
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ROIRegion
  return (
    <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg text-xs max-w-xs shadow-lg">
      <p className="text-white font-medium mb-1">{d.label}</p>
      <p className="text-gray-300 leading-relaxed">{d.description}</p>
      <p className="text-white mt-2">
        Activation:{' '}
        <span className="text-white font-mono">{d.activation.toFixed(3)}</span>
      </p>
    </div>
  )
}

export function ROIBarChart({ roiData }: Props) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white mb-3">Brain Region Activation</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={roiData}
          layout="vertical"
          margin={{ top: 0, right: 20, bottom: 0, left: 140 }}
        >
          <XAxis
            type="number"
            domain={[0, 1]}
            tick={<XTick />}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={135}
            tick={<YTick />}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="activation" fill="var(--accent)" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2">
        Values are raw model outputs. Higher means stronger predicted neural response in that
        region. No value is inherently better or worse.
      </p>
    </div>
  )
}
