'use client'

import { useState } from 'react'
import { X, Copy, Check, RefreshCw, Sparkles } from 'lucide-react'
import type { AnalysisResult } from '@/types'
import type { ComprehensiveAnalysis } from '@/app/api/analyze/comprehensive/route'
import type { CreativeVariant } from '@/app/api/analyze/diversify/route'
import type { ExtractedElements } from '@/app/api/analyze/extract-elements/route'

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
    pct >= 0.7 ? 'bg-gray-900 text-emerald-400 border-emerald-800/60' :
    pct >= 0.4 ? 'bg-gray-900 text-amber-400 border-amber-800/60' :
                 'bg-gray-900 text-[#ff2a2b] border-red-900/60'
  return (
    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {score}/{max}
    </span>
  )
}

function GradeBadge({ grade }: { grade: 'A' | 'B' | 'C' | 'D' }) {
  const color =
    grade === 'A' ? 'text-emerald-400 border-emerald-800/60' :
    grade === 'B' ? 'text-amber-400 border-amber-800/60' :
    grade === 'C' ? 'text-orange-400 border-orange-800/60' :
                    'text-[#ff2a2b] border-red-900/60'
  return (
    <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded border bg-gray-900 ${color}`}>
      {grade}
    </span>
  )
}

function PassFail({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-bold uppercase ${pass ? 'text-emerald-400' : 'text-[#ff2a2b]'}`}>
        {pass ? '✓' : '✗'}
      </span>
      <span className="text-xs text-gray-300">{label}</span>
    </div>
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

const AWARENESS_LABELS: Record<string, string> = {
  unaware: 'Unaware',
  problem_aware: 'Problem-aware',
  solution_aware: 'Solution-aware',
  product_aware: 'Product-aware',
  most_aware: 'Most-aware',
}

const AWARENESS_DESCRIPTIONS: Record<string, string> = {
  unaware: "Doesn't know they have a problem",
  problem_aware: 'Knows the problem, not the solution type',
  solution_aware: 'Knows solutions exist, not this product',
  product_aware: 'Knows this product, not yet committed',
  most_aware: 'Ready — just needs an offer or trigger',
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
  confirmedElements?: ExtractedElements
  conceptTopic?: string
  token: string
  onClose: () => void
  onRetry?: () => void
}

export function AdAnalysisModal({ card, comprehensive, loading, error, confirmedElements, conceptTopic, token, onClose, onRetry }: Props) {
  const [variants, setVariants] = useState<CreativeVariant[] | null>(null)
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [variantsError, setVariantsError] = useState<string | null>(null)

  async function generateVariants() {
    if (!comprehensive) return
    setVariantsLoading(true)
    setVariantsError(null)
    try {
      const res = await fetch('/api/analyze/diversify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          comprehensive,
          confirmed_elements: confirmedElements,
          concept_topic: conceptTopic,
          variant_count: 6,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setVariants(data.variants)
    } catch (e) {
      setVariantsError(e instanceof Error ? e.message : 'Network error')
    }
    setVariantsLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative bg-gray-800 shrink-0 max-h-[35vh] overflow-hidden rounded-t-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.previewUrl} alt={card.fileName} className="w-full h-full max-h-[35vh] object-contain" />
          {card.result?.heatmap_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.result.heatmap_url}
              alt="Brain activation heatmap"
              className="absolute inset-0 w-full h-full max-h-[35vh] object-contain opacity-70"
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

        <div className="p-5 space-y-6 overflow-y-auto flex-1 min-h-0">
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
              <p className="text-xs text-[#ff2a2b]">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-xs text-gray-400 hover:text-gray-200 underline transition-colors"
                >
                  Retry analysis
                </button>
              )}
            </div>
          )}

          {comprehensive && <ComprehensiveSections data={comprehensive} />}

          {/* Creative Variants */}
          {comprehensive && (
            <div className="border-t border-gray-800 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Creative Variants</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">Diversified concepts for an Andromeda-friendly ad set</p>
                </div>
                {variants && !variantsLoading && (
                  <button
                    onClick={generateVariants}
                    className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
              </div>

              {!variants && !variantsLoading && !variantsError && (
                <button
                  onClick={generateVariants}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600/20 border border-indigo-700/50 rounded-lg text-xs text-indigo-300 hover:bg-indigo-600/30 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate creative variants
                </button>
              )}

              {variantsLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-3 h-3 rounded-full border border-indigo-500 border-t-transparent animate-spin" />
                  Generating diversified variants…
                </div>
              )}

              {variantsError && !variantsLoading && (
                <div className="space-y-1.5">
                  <p className="text-xs text-[#ff2a2b]">{variantsError}</p>
                  <button
                    onClick={generateVariants}
                    className="text-xs text-gray-400 hover:text-gray-200 underline transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}

              {variants && !variantsLoading && (
                <div className="space-y-3">
                  {variants.map(v => <VariantCard key={v.id} variant={v} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-800 pt-4 space-y-3">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">{title}</p>
      {children}
    </div>
  )
}

function ComprehensiveSections({ data }: { data: ComprehensiveAnalysis }) {
  return (
    <>
      {/* Market Context */}
      {data.market_context && (
        <Section title="Market Context">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-0.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Awareness</p>
              <p className="text-xs font-semibold text-white">
                {AWARENESS_LABELS[data.market_context.awareness_level] ?? data.market_context.awareness_level}
              </p>
              <p className="text-[10px] text-gray-500">
                {AWARENESS_DESCRIPTIONS[data.market_context.awareness_level]}
              </p>
              {data.market_context.awareness_reasoning && (
                <p className="text-[11px] text-gray-400 leading-snug pt-0.5">{data.market_context.awareness_reasoning}</p>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Sophistication</p>
              <p className="text-xs font-semibold text-white">Level {data.market_context.sophistication_level} / 5</p>
              {data.market_context.sophistication_reasoning && (
                <p className="text-[11px] text-gray-400 leading-snug pt-0.5">{data.market_context.sophistication_reasoning}</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Ad Format */}
      {data.ad_format && (
        <Section title="Ad Format">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-gray-950 border border-gray-800 px-2 py-0.5 rounded text-gray-300">
              {data.ad_format.type?.replace(/_/g, ' ')}
            </span>
            {data.ad_format.composition && Object.entries(data.ad_format.composition)
              .filter(([, v]) => v === true)
              .map(([k]) => (
                <span key={k} className="text-[10px] text-emerald-400 border border-emerald-900/50 px-1.5 py-0.5 rounded">
                  {k.replace(/has_|is_/g, '').replace(/_/g, ' ')}
                </span>
              ))}
          </div>
          {data.ad_format.format_assessment && (
            <p className="text-[11px] text-gray-400 leading-snug">{data.ad_format.format_assessment}</p>
          )}
        </Section>
      )}

      {/* Hook Analysis */}
      {data.hook_analysis && (
        <Section title="Hook Analysis">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Scroll-stop</p>
              <ScoreBadge score={data.hook_analysis.scroll_stop_score} />
            </div>
          </div>
          {data.hook_analysis.pattern_interrupt && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Pattern interrupt</p>
              <p className="text-xs text-gray-300">{data.hook_analysis.pattern_interrupt}</p>
            </div>
          )}
          {data.hook_analysis.first_half_second && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">First 0.5 seconds</p>
              <p className="text-xs text-gray-300">{data.hook_analysis.first_half_second}</p>
            </div>
          )}
          {data.hook_analysis.hook_feedback && (
            <p className="text-[11px] text-gray-400 leading-snug border-t border-gray-800 pt-2">
              {data.hook_analysis.hook_feedback}
            </p>
          )}
        </Section>
      )}

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
                  be.present ? 'bg-gray-900 border-emerald-800/50' : 'bg-gray-900 border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-medium ${be.present ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {label}
                  </span>
                  {be.present && <ScoreBadge score={be.strength} />}
                </div>
                <p className="text-[10px] text-gray-400 leading-snug">{be.note || (be.present ? '' : 'Not present')}</p>
              </div>
            )
          })}
        </div>
        {data.behavioral_economics?.overall_feedback && (
          <p className="text-[11px] text-gray-400 leading-snug mt-1">{data.behavioral_economics.overall_feedback}</p>
        )}
      </Section>

      {/* Offer Architecture */}
      {data.offer_architecture && (
        <Section title="Offer Architecture">
          {data.offer_architecture.offer_present ? (
            <>
              {data.offer_architecture.offer_text && (
                <p className="text-xs text-gray-200 italic">&ldquo;{data.offer_architecture.offer_text}&rdquo;</p>
              )}
              <div className="flex flex-wrap gap-2">
                {[
                  ['Price anchor', data.offer_architecture.has_price_anchor],
                  ['Guarantee', data.offer_architecture.has_guarantee],
                  ['Urgency', data.offer_architecture.has_urgency_mechanism],
                  ['Trial / free', data.offer_architecture.has_trial_or_free],
                ].map(([label, present]) => (
                  <span
                    key={label as string}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      present
                        ? 'text-emerald-400 border-emerald-900/50'
                        : 'text-gray-600 border-gray-800'
                    }`}
                  >
                    {label as string}
                  </span>
                ))}
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Perceived value</p>
                  <ScoreBadge score={data.offer_architecture.perceived_value_score} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Offer clarity</p>
                  <ScoreBadge score={data.offer_architecture.offer_clarity_score} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500 italic">No offer present in this ad.</p>
          )}
          {data.offer_architecture.offer_feedback && (
            <p className="text-[11px] text-gray-400 leading-snug border-t border-gray-800 pt-2">
              {data.offer_architecture.offer_feedback}
            </p>
          )}
        </Section>
      )}

      {/* Cognitive Load */}
      {data.cognitive_load && (
        <Section title="Cognitive Load">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Load score</p>
              <ScoreBadge score={data.cognitive_load.score} />
              <p className="text-[10px] text-gray-600 mt-0.5">lower = easier to process</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Density</p>
              <span className={`text-xs font-medium ${
                data.cognitive_load.density === 'minimal' ? 'text-emerald-400' :
                data.cognitive_load.density === 'moderate' ? 'text-amber-400' : 'text-[#ff2a2b]'
              }`}>
                {data.cognitive_load.density}
              </span>
            </div>
          </div>
          {data.cognitive_load.overload_risk && data.cognitive_load.overload_risk !== 'none' && (
            <p className="text-[11px] text-gray-400 leading-snug">{data.cognitive_load.overload_risk}</p>
          )}
          {data.cognitive_load.simplification && (
            <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">Simplification</p>
              <p className="text-xs text-gray-300 leading-snug">{data.cognitive_load.simplification}</p>
            </div>
          )}
        </Section>
      )}

      {/* Neuroscience */}
      {data.neuroscience && (
        <Section title="Neuroscience">
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

      {/* Platform Fit */}
      {data.platform_fit && (
        <Section title="Platform Fit">
          {data.platform_fit.optimised_for?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Optimised for</p>
              <div className="flex flex-wrap gap-1.5">
                {data.platform_fit.optimised_for.map(p => (
                  <span key={p} className="text-[10px] text-emerald-400 border border-emerald-900/50 px-1.5 py-0.5 rounded">{p}</span>
                ))}
              </div>
            </div>
          )}
          {data.platform_fit.weak_for?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Weak for</p>
              <div className="flex flex-wrap gap-1.5">
                {data.platform_fit.weak_for.map(p => (
                  <span key={p} className="text-[10px] text-[#ff2a2b] border border-red-900/50 px-1.5 py-0.5 rounded">{p}</span>
                ))}
              </div>
            </div>
          )}
          {data.platform_fit.reasoning && (
            <p className="text-[11px] text-gray-400 leading-snug">{data.platform_fit.reasoning}</p>
          )}
          {data.platform_fit.adaptation_notes && (
            <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">Adaptation</p>
              <p className="text-xs text-gray-300 leading-snug">{data.platform_fit.adaptation_notes}</p>
            </div>
          )}
        </Section>
      )}

      {/* Pattern Matches */}
      {data.pattern_matches && data.pattern_matches.length > 0 && (
        <Section title="Winning Pattern Matches">
          <ul className="space-y-1.5">
            {data.pattern_matches.map((p, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-gray-300">
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

      {/* Framework Score */}
      {data.framework_score && (
        <Section title="Framework Score">
          <div className="flex items-center gap-3">
            <GradeBadge grade={data.framework_score.overall_framework_grade} />
            <span className={`text-xs font-medium ${
              data.framework_score.minimum_viable_test === 'pass' ? 'text-emerald-400' : 'text-[#ff2a2b]'
            }`}>
              Minimum viable test: {data.framework_score.minimum_viable_test}
            </span>
          </div>
          <div className="space-y-1.5 pt-1">
            <PassFail pass={!data.framework_score.headline_leaves_gap} label="Headline is complete (no unresolved gap)" />
            <PassFail pass={data.framework_score.subheadline_justified} label="Subheadline is justified" />
            <PassFail pass={data.framework_score.benefits_justified} label="Benefits are justified" />
            <PassFail pass={data.framework_score.trust_signal_justified} label="Trust signal is justified" />
            <PassFail pass={data.framework_score.cta_justified} label="CTA is justified" />
          </div>
          {data.framework_score.framework_feedback && (
            <p className="text-[11px] text-gray-400 leading-snug border-t border-gray-800 pt-2">
              {data.framework_score.framework_feedback}
            </p>
          )}
        </Section>
      )}

      {/* Element Congruence */}
      {data.congruence && (
        <Section title="Element Congruence">
          <div className="flex items-center gap-2">
            <ScoreBadge score={data.congruence.overall_score} />
            <span className="text-[11px] text-gray-500">overall congruence</span>
          </div>
          <div className="space-y-2 pt-1">
            {([
              ['headline_to_visual', 'Headline ↔ Visual'],
              ['headline_to_subheadline', 'Headline ↔ Subheadline'],
              ['body_to_headline', 'Body ↔ Headline'],
              ['benefits_to_headline', 'Benefits ↔ Headline'],
              ['cta_to_offer', 'CTA ↔ Offer'],
              ['trust_signals_to_claim', 'Trust signals ↔ Claim'],
            ] as [keyof typeof data.congruence, string][]).map(([key, label]) => {
              const entry = data.congruence![key] as { aligned: boolean; note: string }
              return (
                <div key={key} className="space-y-0.5">
                  <PassFail pass={entry.aligned} label={label} />
                  {entry.note && <p className="text-[10px] text-gray-500 pl-5 leading-snug">{entry.note}</p>}
                </div>
              )
            })}
          </div>
          {data.congruence.incoherence_summary && data.congruence.incoherence_summary !== 'No incoherence detected' && (
            <p className={`text-[11px] leading-snug border-t border-gray-800 pt-2 ${data.congruence.overall_score < 7 ? 'text-amber-300' : 'text-gray-400'}`}>
              {data.congruence.incoherence_summary}
            </p>
          )}
          {data.congruence.fix && (
            <p className={`text-[11px] leading-snug ${data.congruence.overall_score < 7 ? 'text-[#ff2a2b]' : 'text-gray-400'}`}>
              Fix: {data.congruence.fix}
            </p>
          )}
        </Section>
      )}

      {/* Reddit Visual Research */}
      {data.reddit_research && (
        <Section title="Reddit Visual Research">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] bg-gray-800 text-gray-300 rounded px-2 py-0.5 font-mono">
              {data.reddit_research.topic}
            </span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
              data.reddit_research.congruence_with_reddit.verdict === 'aligned'
                ? 'text-emerald-400 border-emerald-800/60 bg-gray-900'
                : data.reddit_research.congruence_with_reddit.verdict === 'partial'
                  ? 'text-amber-400 border-amber-800/60 bg-gray-900'
                  : 'text-[#ff2a2b] border-red-900/60 bg-gray-900'
            }`}>
              {data.reddit_research.congruence_with_reddit.verdict}
            </span>
          </div>
          {data.reddit_research.congruence_with_reddit.note && (
            <p className="text-[11px] text-gray-400 leading-snug">
              {data.reddit_research.congruence_with_reddit.note}
            </p>
          )}
          {data.reddit_research.situation_patterns.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Situation Patterns</p>
              <div className="flex flex-wrap gap-1.5">
                {data.reddit_research.situation_patterns.map((p, i) => (
                  <span key={i} className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-0.5">{p}</span>
                ))}
              </div>
            </div>
          )}
          {data.reddit_research.visual_ideation && (
            <div className="bg-gray-950 border border-indigo-900/40 rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-indigo-400 font-semibold">Visual Ideation</p>
              <p className="text-xs text-white font-medium leading-snug">{data.reddit_research.visual_ideation.concept}</p>
              {data.reddit_research.visual_ideation.rationale && (
                <p className="text-[11px] text-gray-400 leading-snug">{data.reddit_research.visual_ideation.rationale}</p>
              )}
              {data.reddit_research.visual_ideation.source_urls.length > 0 && (
                <div className="pt-1 space-y-0.5">
                  {data.reddit_research.visual_ideation.source_urls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[10px] text-indigo-400 hover:underline truncate"
                    >
                      View Reddit post →
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Overall Verdict */}
      {data.overall && (
        <Section title="Overall Verdict">
          {data.overall.verdict && (
            <p className="text-xs text-gray-300 leading-relaxed">{data.overall.verdict}</p>
          )}
          {data.overall.top_strength && (
            <div className="bg-gray-950 border border-emerald-900/40 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold mb-0.5">Top Strength</p>
              <p className="text-xs text-gray-200 leading-snug">{data.overall.top_strength}</p>
            </div>
          )}
          {data.overall.critical_weakness && (
            <div className="bg-gray-950 border border-red-900/40 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[#ff2a2b] font-semibold mb-0.5">Critical Weakness</p>
              <p className="text-xs text-gray-200 leading-snug">{data.overall.critical_weakness}</p>
            </div>
          )}
          {data.overall.priority_fix && (
            <div className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Priority Fix</p>
              <p className="text-xs text-gray-200 leading-snug">{data.overall.priority_fix}</p>
            </div>
          )}
        </Section>
      )}
    </>
  )
}

const AXIS_COLORS: Record<string, string> = {
  unaware: 'border-purple-800/60 text-purple-400',
  problem_aware: 'border-orange-800/60 text-orange-400',
  solution_aware: 'border-amber-800/60 text-amber-400',
  product_aware: 'border-sky-800/60 text-sky-400',
  most_aware: 'border-emerald-800/60 text-emerald-400',
  urgent: 'border-red-800/60 text-red-400',
  calm: 'border-sky-800/60 text-sky-400',
  playful: 'border-pink-800/60 text-pink-400',
  aspirational: 'border-indigo-800/60 text-indigo-400',
  authoritative: 'border-gray-600/60 text-gray-300',
  empathetic: 'border-rose-800/60 text-rose-400',
  provocative: 'border-yellow-800/60 text-yellow-400',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function VariantCard({ variant }: { variant: CreativeVariant }) {
  const [copyOpen, setCopyOpen] = useState(true)

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-white">{variant.angle_name}</span>
        <div className="flex flex-wrap gap-1">
          {[variant.awareness_target, variant.emotional_register, variant.visual_style, variant.format_type].map(badge => (
            <span
              key={badge}
              className={`text-[9px] font-medium uppercase px-1.5 py-0.5 rounded border bg-gray-900 ${AXIS_COLORS[badge] ?? 'border-gray-700 text-gray-400'}`}
            >
              {badge.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Hypothesis */}
      <p className="text-[11px] text-gray-500 italic leading-snug">Tests: {variant.hypothesis}</p>

      {/* Copy block */}
      <div className="space-y-1.5">
        <button
          onClick={() => setCopyOpen(v => !v)}
          className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-gray-300 font-semibold transition-colors"
        >
          Copy {copyOpen ? '▲' : '▼'}
        </button>
        {copyOpen && (
          <div className="space-y-1.5 pl-1">
            <div className="flex items-start gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">Headline</p>
                <p className="text-xs text-gray-200 font-medium">{variant.copy.headline}</p>
              </div>
              <CopyButton text={variant.copy.headline} />
            </div>
            {variant.copy.subheadline && (
              <div className="flex items-start gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wide">Subheadline</p>
                  <p className="text-xs text-gray-300">{variant.copy.subheadline}</p>
                </div>
                <CopyButton text={variant.copy.subheadline} />
              </div>
            )}
            {variant.copy.body && (
              <div className="flex items-start gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wide">Body</p>
                  <p className="text-xs text-gray-300 leading-snug">{variant.copy.body}</p>
                </div>
                <CopyButton text={variant.copy.body} />
              </div>
            )}
            <div className="flex items-start gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">CTA</p>
                <p className="text-xs text-gray-200">{variant.copy.cta}</p>
              </div>
              <CopyButton text={variant.copy.cta} />
            </div>
          </div>
        )}
      </div>

      {/* Visual concept */}
      {variant.visual_concept && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-600 font-semibold mb-0.5">Visual Concept</p>
          <p className="text-[11px] text-gray-400 leading-snug">{variant.visual_concept}</p>
        </div>
      )}

      {/* Gem prompt */}
      {variant.gem_prompt && (
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wide text-indigo-400 font-semibold mb-1">Image Prompt</p>
          <pre className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-wrap break-words bg-gray-900 border border-gray-800 rounded-lg p-2.5 pr-8 font-mono">
            {variant.gem_prompt}
          </pre>
          <div className="absolute top-6 right-1">
            <CopyButton text={variant.gem_prompt} />
          </div>
        </div>
      )}

      {/* Why distinct */}
      {variant.why_distinct && (
        <p className="text-[10px] text-gray-600 leading-snug">Distinct because: {variant.why_distinct}</p>
      )}
    </div>
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
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      <p className="text-[11px] text-gray-300 leading-snug">{text}</p>
    </div>
  )
}
