'use client'

import { X } from 'lucide-react'
import type { AnalysisResult } from '@/types'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'

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

function ScoreBadge({ score, max = 10 }: { score: number; max?: number }) {
  const pct = score / max
  const color =
    pct >= 0.75 ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50' :
    pct >= 0.45 ? 'bg-amber-900/40 text-amber-300 border-amber-800/50' :
                  'bg-red-900/40 text-red-300 border-red-800/50'
  return (
    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {score}/{max}
    </span>
  )
}

const BE_LABELS: Record<string, string> = {
  scarcity: 'Scarcity',
  urgency: 'Urgency',
  social_proof: 'Social Proof',
  anchoring: 'Anchoring',
  loss_aversion: 'Loss Aversion',
  authority: 'Authority',
  reciprocity: 'Reciprocity',
}

interface ModalCard {
  id: string
  fileName: string
  previewUrl: string
  result: AnalysisResult | null
  spend?: number
  isWinner?: boolean
}

interface Props {
  card: ModalCard
  comprehensive?: ComprehensiveAnalysis
  loading?: boolean
  error?: string
  onClose: () => void
  onRetry?: () => void
}

export function AdAnalysisModal({ card, comprehensive, loading, error, onClose, onRetry }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative aspect-video bg-gray-800 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.previewUrl} alt={card.fileName} className="w-full h-full object-cover" />
          {card.result?.heatmap_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.result.heatmap_url}
              alt="Brain activation heatmap"
              className="absolute inset-0 w-full h-full object-cover opacity-70"
            />
          )}
          {card.isWinner && (
            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-yellow-500 text-yellow-950 px-2 py-1 rounded">
              ★ Winner
            </span>
          )}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          <div>
            <p className="text-sm font-medium text-white truncate">{card.fileName}</p>
            {card.spend !== undefined && card.spend > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">Spend: ${card.spend.toLocaleString()}</p>
            )}
          </div>

          {/* BERG ROI scores */}
          {card.result?.roi_data && (
            <Section title="Brain Activation — BERG">
              <div className="space-y-2">
                {card.result.roi_data.map(roi => (
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
            </Section>
          )}

          {loading && !comprehensive && (
            <div className="flex items-center gap-2 text-xs text-gray-500 border-t border-gray-800 pt-4">
              <div className="w-3 h-3 rounded-full border border-indigo-500 border-t-transparent animate-spin" />
              Running comprehensive ad analysis…
            </div>
          )}

          {!loading && error && !comprehensive && (
            <div className="border-t border-gray-800 pt-4 space-y-2">
              <p className="text-xs text-red-400">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors"
                >
                  Retry analysis
                </button>
              )}
            </div>
          )}

          {comprehensive && <ComprehensiveSections data={comprehensive} />}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-800 pt-4 space-y-3 first:border-0 first:pt-0">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function ComprehensiveSections({ data }: { data: ComprehensiveAnalysis }) {
  return (
    <>
      {/* Copy Analysis */}
      <Section title="Copy Analysis">
        <CopyRow label="Headline" text={data.copy?.headline?.text} feedback={data.copy?.headline?.feedback}>
          <ScoreBadge score={data.copy?.headline?.clarity ?? 0} />
        </CopyRow>
        <CopyRow label="Subheadline" text={data.copy?.subheadline?.text} feedback={data.copy?.subheadline?.feedback}>
          <ScoreBadge score={data.copy?.subheadline?.clarity ?? 0} />
        </CopyRow>
        <CopyList
          label="Benefits / Features"
          items={data.copy?.benefits_features?.identified ?? []}
          feedback={data.copy?.benefits_features?.feedback}
          score={data.copy?.benefits_features?.clarity ?? 0}
        />
        <CopyList
          label="Trust Signals"
          items={data.copy?.trust_signals?.identified ?? []}
          feedback={data.copy?.trust_signals?.feedback}
          score={data.copy?.trust_signals?.strength ?? 0}
        />
        <CopyList
          label="Safety Signals"
          items={data.copy?.safety_signals?.identified ?? []}
          feedback={data.copy?.safety_signals?.feedback}
          score={data.copy?.safety_signals?.strength ?? 0}
        />
        <CopyRow label="CTA" text={data.copy?.cta?.text} feedback={data.copy?.cta?.feedback}>
          <ScoreBadge score={data.copy?.cta?.clarity ?? 0} />
        </CopyRow>
      </Section>

      {/* Behavioral Economics */}
      <Section title="Behavioral Economics">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(BE_LABELS).map(([key, label]) => {
            const be = (data.behavioral_economics as unknown as Record<string, { present: boolean; strength: number; note: string }>)?.[key]
            if (!be) return null
            return (
              <div
                key={key}
                className={`rounded-lg px-2.5 py-2 border ${
                  be.present
                    ? 'bg-violet-950/30 border-violet-900/50'
                    : 'bg-gray-900 border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-medium ${be.present ? 'text-violet-300' : 'text-gray-500'}`}>
                    {label}
                  </span>
                  {be.present && <ScoreBadge score={be.strength} />}
                </div>
                <p className="text-[10px] text-gray-500 leading-snug">{be.note || (be.present ? '' : 'Not present')}</p>
              </div>
            )
          })}
        </div>
        {data.behavioral_economics?.overall_feedback && (
          <p className="text-[11px] text-gray-400 leading-snug mt-2">{data.behavioral_economics.overall_feedback}</p>
        )}
      </Section>

      {/* Neuroscience */}
      {data.neuroscience && (
        <Section title="Neuroscience Interpretation">
          <NeuroRow label="Attention" text={data.neuroscience.attention_prediction} />
          <NeuroRow label="Emotional Encoding" text={data.neuroscience.emotional_encoding} />
          <NeuroRow label="Memory Encoding" text={data.neuroscience.memory_encoding} />
          {data.neuroscience.feedback && (
            <p className="text-[11px] text-gray-400 leading-snug pt-1">{data.neuroscience.feedback}</p>
          )}
        </Section>
      )}

      {/* Visual Dimensions */}
      {data.visual_dimensions && (
        <Section title="Ad Dimensions — Sonnet">
          {(
            [
              ['CTA Strength', data.visual_dimensions.cta_strength],
              ['Emotional Appeal', data.visual_dimensions.emotional_appeal],
              ['Brand Clarity', data.visual_dimensions.brand_clarity],
              ['Visual Hierarchy', data.visual_dimensions.visual_hierarchy],
            ] as [string, { score: number; feedback: string }][]
          ).map(([label, dim]) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300 font-medium">{label}</span>
                <ScoreBadge score={dim?.score ?? 0} />
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">{dim?.feedback}</p>
            </div>
          ))}
        </Section>
      )}

      {/* Pattern Matches */}
      {data.pattern_matches && data.pattern_matches.length > 0 && (
        <Section title="Winning Pattern Matches">
          <ul className="space-y-1.5">
            {data.pattern_matches.map((p, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-yellow-200">
                <span className="text-yellow-500 shrink-0">★</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* BERG Recommendations */}
      {data.berg_recommendations && data.berg_recommendations.length > 0 && (
        <Section title="BERG Recommendations">
          <div className="text-xs text-gray-300 leading-relaxed space-y-1.5">
            {data.berg_recommendations.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-indigo-400 shrink-0">—</span>
                <span><RichLine text={line} /></span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Overall Verdict */}
      {data.overall && (
        <Section title="Overall Verdict">
          {data.overall.verdict && (
            <p className="text-xs text-gray-300 leading-relaxed">{data.overall.verdict}</p>
          )}
          {data.overall.top_strength && (
            <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold mb-0.5">Top Strength</p>
              <p className="text-xs text-emerald-100 leading-snug">{data.overall.top_strength}</p>
            </div>
          )}
          {data.overall.critical_weakness && (
            <div className="bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-red-400 font-semibold mb-0.5">Critical Weakness</p>
              <p className="text-xs text-red-100 leading-snug">{data.overall.critical_weakness}</p>
            </div>
          )}
          {data.overall.priority_fix && (
            <div className="bg-indigo-950/40 border border-indigo-900/50 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-indigo-400 font-semibold mb-0.5">Priority Fix</p>
              <p className="text-xs text-indigo-100 leading-snug">{data.overall.priority_fix}</p>
            </div>
          )}
        </Section>
      )}
    </>
  )
}

function CopyRow({
  label, text, feedback, children,
}: { label: string; text?: string; feedback?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        {children}
      </div>
      {text && <p className="text-xs text-gray-200 italic">&ldquo;{text}&rdquo;</p>}
      {feedback && <p className="text-[11px] text-gray-400 leading-snug">{feedback}</p>}
    </div>
  )
}

function CopyList({
  label, items, feedback, score,
}: { label: string; items: string[]; feedback?: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        <ScoreBadge score={score} />
      </div>
      {items.length > 0 ? (
        <p className="text-xs text-gray-300">{items.join(' · ')}</p>
      ) : (
        <p className="text-xs text-gray-600 italic">None identified</p>
      )}
      {feedback && <p className="text-[11px] text-gray-400 leading-snug">{feedback}</p>}
    </div>
  )
}

function NeuroRow({ label, text }: { label: string; text?: string }) {
  if (!text) return null
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-violet-400 font-semibold">{label}</p>
      <p className="text-[11px] text-gray-300 leading-snug">{text}</p>
    </div>
  )
}
