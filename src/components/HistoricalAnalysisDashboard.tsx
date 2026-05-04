'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import type {
  PatternLibraryRow, LosingPatternRow, FrameworkPrincipleRow, BaselineEvolutionEntry,
  DimensionStat, BergDnaCorrelation, AwarenessBreakdown, TrendPoint,
} from '@/lib/pattern-library'

export interface PatternThreshold {
  threshold: number
  current: number
  remaining: number
  unlocked: boolean
  requires: string
}

export interface HistoricalPayload {
  stats: {
    total: number
    winners: number
    losers: number
    win_rate: number
    total_spend: number
    spend_efficiency: number
    avg_framework_grade: string | null
  }
  awareness_breakdown: AwarenessBreakdown[]
  winning_patterns: PatternLibraryRow[]
  losing_patterns: LosingPatternRow[]
  framework_principles: FrameworkPrincipleRow[]
  pattern_thresholds: {
    winning_patterns: PatternThreshold
    anti_patterns: PatternThreshold
    framework_guard_rails: PatternThreshold
  }
  baseline_evolutions: BaselineEvolutionEntry[]
  next_milestone: {
    ads_at_last_evolution: number
    next_milestone_at: number
    ads_until_next_milestone: number
  }
  dimension_stats: DimensionStat[]
  berg_dna_correlations: BergDnaCorrelation[]
  trends: TrendPoint[]
}

interface Props {
  data: HistoricalPayload
  token: string
}

const GRADE_TO_NUM: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 }

export function HistoricalAnalysisDashboard({ data }: Props) {
  return (
    <div className="space-y-8">
      <StatsStrip stats={data.stats} />
      <AwarenessSection rows={data.awareness_breakdown} />
      <PatternsSection
        winning={data.winning_patterns}
        losing={data.losing_patterns}
        framework={data.framework_principles}
        thresholds={data.pattern_thresholds}
      />
      <BaselineEvolutionSection
        evolutions={data.baseline_evolutions}
        nextMilestone={data.next_milestone}
      />
      <DimensionStatsSection rows={data.dimension_stats} />
      <BergDnaCorrelationSection rows={data.berg_dna_correlations} />
      <TrendsSection rows={data.trends} />
    </div>
  )
}

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {caption && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{caption}</p>}
      </div>
      {children}
    </section>
  )
}

function StatsStrip({ stats }: { stats: HistoricalPayload['stats'] }) {
  return (
    <Section title="Aggregate stats" caption="Snapshot of every historical ad you've analyzed.">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Total ads" value={stats.total.toLocaleString()} caption="Every historical ad with spend recorded." />
        <Stat label="Winners" value={stats.winners.toLocaleString()} caption="Ads that crossed $1,000 spend." accent="emerald" />
        <Stat label="Losers" value={stats.losers.toLocaleString()} caption="Ads that stayed below $1,000." accent="red" />
        <Stat label="Win rate" value={`${(stats.win_rate * 100).toFixed(0)}%`} caption="Higher = more consistent creative output." />
        <Stat label="Total spend" value={`$${stats.total_spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} caption="Cumulative spend across all historical ads." />
        <Stat label="Avg grade" value={stats.avg_framework_grade ?? '—'} caption="Average copywriting framework grade. Tracks structural quality of what you ship." />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-gray-800">
        <Stat
          label="Spend efficiency"
          value={`$${Math.round(stats.spend_efficiency).toLocaleString()}`}
          caption="Average spend per winning ad. Higher = winners scale better at the same creative effort."
        />
      </div>
    </Section>
  )
}

function Stat({ label, value, caption, accent }: { label: string; value: string; caption: string; accent?: 'emerald' | 'red' }) {
  const valueColor = accent === 'emerald' ? 'text-emerald-400' : accent === 'red' ? 'text-[#ff2a2b]' : 'text-white'
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-gray-600 leading-snug">{caption}</p>
    </div>
  )
}

function AwarenessSection({ rows }: { rows: AwarenessBreakdown[] }) {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => b.total - a.total)
  return (
    <Section title="Per-awareness-level breakdown" caption="Which audience awareness levels you ship to most, and which produce winners. Use to spot under-served segments.">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="py-2 text-left font-medium">Awareness level</th>
            <th className="py-2 text-right font-medium">Total</th>
            <th className="py-2 text-right font-medium">Winners</th>
            <th className="py-2 text-right font-medium">Losers</th>
            <th className="py-2 text-right font-medium">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.awareness_level} className="border-b border-gray-800/60">
              <td className="py-2 text-gray-300">{r.awareness_level.replace(/_/g, ' ')}</td>
              <td className="py-2 text-right text-gray-400 tabular-nums">{r.total}</td>
              <td className="py-2 text-right text-emerald-400 tabular-nums">{r.winners}</td>
              <td className="py-2 text-right text-[#ff2a2b] tabular-nums">{r.losers}</td>
              <td className="py-2 text-right text-gray-200 tabular-nums">{(r.win_rate * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function PatternsSection({
  winning, losing, framework, thresholds,
}: {
  winning: PatternLibraryRow[]
  losing: LosingPatternRow[]
  framework: FrameworkPrincipleRow[]
  thresholds: HistoricalPayload['pattern_thresholds']
}) {
  const [tab, setTab] = useState<'winning' | 'losing' | 'framework'>('winning')

  const activeThreshold =
    tab === 'winning' ? thresholds.winning_patterns :
    tab === 'losing' ? thresholds.anti_patterns :
    thresholds.framework_guard_rails

  const activeCount =
    tab === 'winning' ? winning.length :
    tab === 'losing' ? losing.length :
    framework.length

  return (
    <Section
      title="Pattern library"
      caption="Every rule the tool has learned from your historical data. These are silently injected into feedback-mode prompts; here they're inspectable."
    >
      <div className="flex gap-1.5 border-b border-gray-800 pb-3">
        <TabButton active={tab === 'winning'} onClick={() => setTab('winning')}>
          Winning patterns ({winning.length})
        </TabButton>
        <TabButton active={tab === 'losing'} onClick={() => setTab('losing')}>
          Anti-patterns ({losing.length})
        </TabButton>
        <TabButton active={tab === 'framework'} onClick={() => setTab('framework')}>
          Framework guard rails ({framework.length})
        </TabButton>
      </div>

      {!activeThreshold.unlocked && activeCount === 0 && (
        <UnlockProgress threshold={activeThreshold} />
      )}

      {tab === 'winning' && (
        <PatternList
          rows={winning.map(p => ({
            id: p.id,
            category: p.category,
            rule_text: p.rule_text,
            confidence: p.confidence,
            count: p.winner_count,
            countLabel: 'wins',
          }))}
          accent="emerald"
        />
      )}
      {tab === 'losing' && (
        <PatternList
          rows={losing.map(p => ({
            id: p.id,
            category: p.category,
            rule_text: p.rule_text,
            confidence: p.confidence,
            count: p.loser_count,
            countLabel: 'losses',
          }))}
          accent="red"
        />
      )}
      {tab === 'framework' && (
        <PatternList
          rows={framework.map(p => ({
            id: p.id,
            category: p.category,
            rule_text: p.rule_text,
            confidence: p.confidence,
            count: p.winner_count,
            countLabel: 'examples',
            scope: [
              p.scope_awareness ? `awareness=${p.scope_awareness}` : null,
              p.scope_sophistication != null ? `soph=${p.scope_sophistication}` : null,
            ].filter(Boolean).join(' · ') || 'global',
          }))}
          accent="indigo"
        />
      )}
    </Section>
  )
}

function UnlockProgress({ threshold }: { threshold: PatternThreshold }) {
  const pct = Math.min(100, (threshold.current / threshold.threshold) * 100)
  return (
    <div className="bg-gray-950 border border-amber-900/40 rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-amber-400">
          Need <span className="text-white font-mono tabular-nums">{threshold.remaining}</span> more {threshold.requires} before this synthesis pass runs.
        </p>
        <p className="text-[11px] text-gray-500 tabular-nums">
          {threshold.current} / {threshold.threshold}
        </p>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
        <div className="h-1 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-600 leading-snug">
        Synthesis runs automatically when the threshold is crossed; no action needed beyond uploading more historical ads.
      </p>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
        active
          ? 'bg-gray-800 text-white'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

function PatternList({
  rows, accent,
}: {
  rows: { id: string; category: string; rule_text: string; confidence: number; count: number; countLabel: string; scope?: string }[]
  accent: 'emerald' | 'red' | 'indigo'
}) {
  if (rows.length === 0) return <p className="text-xs text-gray-500 py-2">No patterns yet — analyze more historical ads.</p>
  const accentBorder = accent === 'emerald' ? 'border-emerald-800/40' : accent === 'red' ? 'border-red-900/40' : 'border-indigo-800/40'
  const accentText = accent === 'emerald' ? 'text-emerald-400' : accent === 'red' ? 'text-[#ff2a2b]' : 'text-indigo-300'
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.id} className={`bg-gray-950 border ${accentBorder} rounded-lg px-3 py-2 space-y-1`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-mono font-bold ${accentText}`}>
              [{accent === 'emerald' ? 'P' : accent === 'red' ? 'A' : 'G'}{i + 1}]
            </span>
            <span className="text-[10px] uppercase text-gray-600 font-mono">{r.category}</span>
            {r.scope && (
              <span className="text-[10px] text-gray-500 font-mono">{r.scope}</span>
            )}
            <span className="text-[10px] text-gray-500 ml-auto tabular-nums">
              conf {r.confidence.toFixed(2)} · {r.count} {r.countLabel}
            </span>
          </div>
          <p className="text-xs text-gray-200 leading-snug">{r.rule_text}</p>
        </div>
      ))}
    </div>
  )
}

function BaselineEvolutionSection({
  evolutions, nextMilestone,
}: {
  evolutions: BaselineEvolutionEntry[]
  nextMilestone: HistoricalPayload['next_milestone']
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const current = evolutions[0]

  return (
    <Section
      title="Evolved baseline principles"
      caption="Every 50 historical ads, the tool re-derives its core analytical framework from the cumulative winner+loser dataset. This is what distinguishes 'derived from data' from 'static framework'."
    >
      <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 space-y-1">
        <p className="text-xs text-gray-300">
          <span className="text-gray-500">Status:</span> {current ? `v${current.version} at ${current.ads_analyzed} ads` : 'No evolution yet'}.
          {' '}
          <span className="text-gray-500">Next update at</span>{' '}
          <span className="text-white tabular-nums">{nextMilestone.next_milestone_at} ads</span>
          {' — '}
          <span className="text-white tabular-nums">{nextMilestone.ads_until_next_milestone}</span>{' '}
          <span className="text-gray-500">to go.</span>
        </p>
      </div>

      {current && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Current principles (v{current.version})</p>
          {current.change_summary && (
            <p className="text-[11px] text-gray-400 italic leading-snug">{current.change_summary}</p>
          )}
          <div className="space-y-1.5">
            {current.principles.map((p, i) => (
              <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-amber-400">[E{i + 1}]</span>
                  <span className="text-[10px] uppercase text-gray-600 font-mono">{p.category}</span>
                  <span className={`text-[10px] font-mono ${
                    p.type === 'new' ? 'text-emerald-400' :
                    p.type === 'reinforced' ? 'text-indigo-300' :
                    p.type === 'contradiction' ? 'text-amber-400' :
                    'text-gray-500'
                  }`}>{p.type}</span>
                  <span className="text-[10px] text-gray-500 ml-auto">
                    {p.supporting_winner_count}W / {p.supporting_loser_count}L
                  </span>
                </div>
                <p className="text-xs text-gray-200 leading-snug">{p.principle_text}</p>
                {p.evidence_summary && (
                  <p className="text-[10px] text-gray-600 italic">Evidence: {p.evidence_summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {evolutions.length > 1 && (
        <div className="space-y-2 pt-3 border-t border-gray-800">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Previous versions</p>
          {evolutions.slice(1).map(ev => (
            <div key={ev.id} className="bg-gray-950 border border-gray-800 rounded-lg">
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [ev.id]: !prev[ev.id] }))}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2">
                  {expanded[ev.id] ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                  <span className="text-xs text-gray-300">v{ev.version} at {ev.ads_analyzed} ads</span>
                  <span className="text-[10px] text-gray-600">{new Date(ev.created_at).toLocaleDateString()}</span>
                </div>
                {ev.change_summary && (
                  <span className="text-[10px] text-gray-500 truncate max-w-md">{ev.change_summary}</span>
                )}
              </button>
              {expanded[ev.id] && (
                <div className="px-3 pb-3 space-y-1.5 border-t border-gray-800">
                  {ev.principles.map((p, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5">
                      <p className="text-[11px] text-gray-300 leading-snug">
                        <span className="text-amber-500 font-mono">[E{i + 1}]</span> {p.principle_text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function DimensionStatsSection({ rows }: { rows: DimensionStat[] }) {
  if (rows.length === 0) return null
  // Group by dimension
  const byDim = new Map<string, DimensionStat[]>()
  for (const r of rows) {
    const list = byDim.get(r.dimension) ?? []
    list.push(r)
    byDim.set(r.dimension, list)
  }
  return (
    <Section
      title="Dimension-level win rates"
      caption="Which DNA dimensions appear most in your winners. Use this to design new ads — pick dimension values that historically convert."
    >
      <div className="space-y-4">
        {Array.from(byDim.entries()).map(([dim, list]) => {
          const sorted = [...list].sort((a, b) => b.total - a.total)
          return (
            <div key={dim} className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium font-mono">{dim}</p>
              <div className="space-y-1">
                {sorted.map(r => {
                  const winnerPct = r.win_rate * 100
                  return (
                    <div key={r.value} className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-200 font-mono truncate">{r.value}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                          {r.winner_count}W / {r.loser_count}L · {winnerPct.toFixed(0)}% win
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1 mt-1.5 overflow-hidden">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${winnerPct}%`,
                            background: winnerPct >= 60 ? '#34d399' : winnerPct >= 40 ? '#fbbf24' : '#ff2a2b',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function BergDnaCorrelationSection({ rows }: { rows: BergDnaCorrelation[] }) {
  if (rows.length === 0) return null
  return (
    <Section
      title="BERG × DNA correlations"
      caption="Where brain-activation patterns correlate with creative scores. Use this to predict which DNA choices will land neurologically. |r| ≥ 0.3, n ≥ 5."
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="py-2 text-left font-medium">ROI region</th>
            <th className="py-2 text-left font-medium">Metric</th>
            <th className="py-2 text-right font-medium">r</th>
            <th className="py-2 text-right font-medium">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-800/60">
              <td className="py-1.5 text-gray-300 font-mono">{r.roi_region}</td>
              <td className="py-1.5 text-gray-400 font-mono">{r.metric_path}</td>
              <td className={`py-1.5 text-right tabular-nums font-mono ${r.r > 0 ? 'text-emerald-400' : 'text-[#ff2a2b]'}`}>
                {r.r > 0 ? '+' : ''}{r.r.toFixed(2)}
              </td>
              <td className="py-1.5 text-right text-gray-500 tabular-nums">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function TrendsSection({ rows }: { rows: TrendPoint[] }) {
  if (rows.length < 3) return null
  const series = rows.map((r, i) => ({
    idx: i + 1,
    framework_grade_num: r.framework_grade ? GRADE_TO_NUM[r.framework_grade] ?? null : null,
    scroll_stop: r.scroll_stop_score,
    congruence: r.congruence_score,
    cognitive_load: r.cognitive_load,
  }))

  return (
    <Section
      title="Longitudinal trends"
      caption="Are your ads getting structurally better over time? X-axis is ad order, oldest to newest."
    >
      <div className="space-y-6">
        <TrendChart
          title="Framework grade (A=4, B=3, C=2, D=1)"
          data={series}
          dataKey="framework_grade_num"
          color="#a78bfa"
          domain={[1, 4]}
        />
        <TrendChart
          title="Scroll-stop score"
          data={series}
          dataKey="scroll_stop"
          color="#34d399"
          domain={[0, 10]}
        />
        <TrendChart
          title="Congruence score"
          data={series}
          dataKey="congruence"
          color="#fbbf24"
          domain={[0, 10]}
        />
        <TrendChart
          title="Cognitive load (lower is better)"
          data={series}
          dataKey="cognitive_load"
          color="#ff2a2b"
          domain={[0, 10]}
        />
      </div>
    </Section>
  )
}

function TrendChart({ title, data, dataKey, color, domain }: {
  title: string
  data: Array<{ idx: number } & Record<string, number | null>>
  dataKey: string
  color: string
  domain: [number, number]
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{title}</p>
      <div className="h-32 bg-gray-950 border border-gray-800 rounded-lg p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="idx" tick={{ fontSize: 9, fill: '#6b7280' }} />
            <YAxis domain={domain} tick={{ fontSize: 9, fill: '#6b7280' }} width={20} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <ReferenceLine y={domain[0] + (domain[1] - domain[0]) / 2} stroke="#374151" strokeDasharray="2 2" />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
