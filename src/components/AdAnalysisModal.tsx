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
  isLoser?: boolean
}

interface Props {
  card: ModalCard
  comprehensive?: ComprehensiveAnalysis
  loading?: boolean
  error?: string
  isHistorical?: boolean
  token: string
  onClose: () => void
  onRetry?: () => void
}

export function AdAnalysisModal({ card, comprehensive, loading, error, isHistorical, onClose, onRetry }: Props) {
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
          {card.isLoser && (
            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-red-900 text-red-300 px-2 py-1 rounded border border-red-800">
              ✗ Loser
            </span>
          )}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-[#fff] transition-all backdrop-blur-sm"
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

          {/* Brain Activation — BERG (bars + heatmap legend + narrative) */}
          {card.result?.roi_data && (
            <Section title="Brain Activation — BERG">
              {card.result.heatmap_url && (
                <div className="space-y-1 pb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-24 rounded-full shrink-0"
                      style={{ background: 'linear-gradient(to right, #440154, #31688E, #35B779, #FDE725)' }}
                    />
                    <div className="flex justify-between w-24 shrink-0">
                      <span className="text-[9px] text-gray-600">low</span>
                      <span className="text-[9px] text-gray-600">high</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600">Heatmap overlay colors: purple = minimal neural activation, yellow = peak. Brighter regions indicate stronger brain processing of that visual area.</p>
                </div>
              )}
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
              {comprehensive?.berg_recommendations && comprehensive.berg_recommendations.length > 0 && (
                <div className="text-xs text-gray-300 leading-relaxed space-y-1.5 border-t border-gray-800 pt-3">
                  {comprehensive.berg_recommendations.map((line, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-indigo-400 shrink-0">—</span>
                      <span><RichLine text={line} /></span>
                    </div>
                  ))}
                </div>
              )}
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

          {comprehensive && <ComprehensiveSections data={comprehensive} isHistorical={isHistorical} isLoser={isHistorical && card.isWinner === false} />}
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

type RewriteLike = {
  proposed_text?: string | null
  proposed_action?: string | null
  proposed_change?: string | null
  proposed_pattern_interrupt?: string | null
  proposed_offer_text?: string | null
  proposed_benefits?: string[] | null
  proposed_signals?: string[] | null
  rationale: string
  expected_lift: string
  dna_changes?: Record<string, unknown> | null
} | null | undefined

function RewriteCard({ rewrite, label = 'Proposed Rewrite' }: { rewrite: RewriteLike; label?: string }) {
  if (!rewrite) return null
  const proposedDisplay =
    rewrite.proposed_text ||
    rewrite.proposed_change ||
    rewrite.proposed_pattern_interrupt ||
    rewrite.proposed_offer_text ||
    (rewrite.proposed_benefits ? rewrite.proposed_benefits.join(' • ') : null) ||
    (rewrite.proposed_signals ? rewrite.proposed_signals.join(' • ') : null) ||
    rewrite.proposed_action ||
    null
  return (
    <div className="bg-gray-950 border border-amber-900/50 rounded-lg px-3 py-2.5 space-y-1.5 mt-2">
      <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">{label}</p>
      {proposedDisplay && <p className="text-xs text-white font-medium leading-snug">{proposedDisplay}</p>}
      {rewrite.rationale && <p className="text-[11px] text-gray-300 leading-snug">{rewrite.rationale}</p>}
      {rewrite.expected_lift && (
        <p className="text-[11px] text-amber-300/90 leading-snug">Expected lift: {rewrite.expected_lift}</p>
      )}
    </div>
  )
}

type AlignmentLike = {
  winner_matches?: string[]
  loser_matches?: string[]
  verdict?: 'aligned_with_winners' | 'aligned_with_losers' | 'mixed' | 'no_analog'
  winning_dna_dimensions?: string[]
  losing_dna_dimensions?: string[]
} | null | undefined

function LibraryAlignmentChips({ alignment }: { alignment: AlignmentLike }) {
  if (!alignment) return null
  const winners = alignment.winner_matches ?? []
  const losers = alignment.loser_matches ?? []
  const winningDims = alignment.winning_dna_dimensions ?? []
  const losingDims = alignment.losing_dna_dimensions ?? []
  if (winners.length === 0 && losers.length === 0 && winningDims.length === 0 && losingDims.length === 0) return null
  const winningTooltip = winningDims.length > 0 ? `Winning DNA: ${winningDims.join(', ')}` : ''
  const losingTooltip = losingDims.length > 0 ? `Losing DNA: ${losingDims.join(', ')}` : ''
  return (
    <div className="flex items-center gap-1 flex-wrap text-[10px]">
      {winners.length > 0 && (
        <>
          <span className="text-gray-500">Winner matches:</span>
          {winners.map((w, i) => (
            <span
              key={`w-${i}`}
              title={winningTooltip}
              className="text-emerald-400 font-mono bg-gray-900 px-1.5 py-0.5 rounded border border-emerald-900/40 cursor-help"
            >{w}</span>
          ))}
        </>
      )}
      {losers.length > 0 && (
        <>
          <span className="text-gray-500 ml-2">Loser matches:</span>
          {losers.map((l, i) => (
            <span
              key={`l-${i}`}
              title={losingTooltip}
              className="text-[#ff2a2b] font-mono bg-gray-900 px-1.5 py-0.5 rounded border border-red-900/40 cursor-help"
            >{l}</span>
          ))}
        </>
      )}
    </div>
  )
}

function ComprehensiveSections({ data, isHistorical, isLoser }: { data: ComprehensiveAnalysis; isHistorical?: boolean; isLoser?: boolean }) {
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
          <LibraryAlignmentChips alignment={data.hook_analysis.library_alignment} />
          <RewriteCard rewrite={data.hook_analysis.rewrite} label="Proposed Hook Rewrite" />
        </Section>
      )}

      {/* Copy Analysis */}
      <Section title="Copy Analysis">
        <CopyRow
          label="Headline"
          text={data.copy?.headline?.text}
          feedback={data.copy?.headline?.feedback}
          dnaChips={headlineChips(data.copy?.headline?.dna)}
          alignment={data.copy?.headline?.library_alignment}
          rewrite={data.copy?.headline?.rewrite}
        >
          <ScoreBadge score={data.copy?.headline?.clarity ?? 0} />
        </CopyRow>
        <CopyRow
          label="Subheadline"
          text={data.copy?.subheadline?.text}
          feedback={data.copy?.subheadline?.feedback}
          dnaChips={subheadlineChips(data.copy?.subheadline?.dna)}
          alignment={data.copy?.subheadline?.library_alignment}
          rewrite={data.copy?.subheadline?.rewrite}
        >
          <ScoreBadge score={data.copy?.subheadline?.clarity ?? 0} />
        </CopyRow>
        <CopyList
          label="Benefits / Features"
          items={data.copy?.benefits_features?.identified ?? []}
          feedback={data.copy?.benefits_features?.feedback}
          score={data.copy?.benefits_features?.clarity ?? 0}
          dnaChips={benefitsChips(data.copy?.benefits_features?.dna)}
          alignment={data.copy?.benefits_features?.library_alignment}
          rewrite={data.copy?.benefits_features?.rewrite}
        />
        <CopyList
          label="Trust Signals"
          items={data.copy?.trust_signals?.identified ?? []}
          feedback={data.copy?.trust_signals?.feedback}
          score={data.copy?.trust_signals?.strength ?? 0}
          dnaChips={trustChips(data.copy?.trust_signals?.dna)}
          alignment={data.copy?.trust_signals?.library_alignment}
          rewrite={data.copy?.trust_signals?.rewrite}
        />
        <CopyList
          label="Safety Signals"
          items={data.copy?.safety_signals?.identified ?? []}
          feedback={data.copy?.safety_signals?.feedback}
          score={data.copy?.safety_signals?.strength ?? 0}
          alignment={data.copy?.safety_signals?.library_alignment}
          rewrite={data.copy?.safety_signals?.rewrite}
        />
        <CopyRow
          label="CTA"
          text={data.copy?.cta?.text}
          feedback={data.copy?.cta?.feedback}
          dnaChips={ctaChips(data.copy?.cta?.dna)}
          alignment={data.copy?.cta?.library_alignment}
          rewrite={data.copy?.cta?.rewrite}
        >
          <ScoreBadge score={data.copy?.cta?.clarity ?? 0} />
        </CopyRow>
      </Section>

      {/* Behavioral Economics */}
      <Section title="Behavioral Economics">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(BE_LABELS).map(([key, label]) => {
            const be = (data.behavioral_economics as unknown as Record<string, { present: boolean; strength: number; note: string; rewrite?: RewriteLike }>)?.[key]
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
                <RewriteCard rewrite={be.rewrite} label={`Strengthen ${label}`} />
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
          <LibraryAlignmentChips alignment={data.offer_architecture.library_alignment} />
          <RewriteCard rewrite={data.offer_architecture.rewrite} label="Proposed Offer Rewrite" />
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
          <RewriteCard rewrite={data.cognitive_load.rewrite} label="Proposed Subtraction" />
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
            ] as [string, { score: number; feedback: string; rewrite?: RewriteLike }][]
          ).map(([label, dim]) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300 font-medium">{label}</span>
                <ScoreBadge score={dim?.score ?? 0} />
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">{dim?.feedback}</p>
              <RewriteCard rewrite={dim?.rewrite} label={`Proposed ${label} Change`} />
            </div>
          ))}
        </Section>
      )}

      {/* Pattern Matches — winners satisfy rules (P-prefixed); losers embody anti-patterns (A-prefixed) */}
      {data.pattern_matches && data.pattern_matches.length > 0 && (
        <Section title={isLoser ? 'Anti-Pattern Matches' : 'Winning Pattern Matches'}>
          <ul className="space-y-1.5">
            {data.pattern_matches.map((p, i) => {
              const isAnti = p.trim().startsWith('[A')
              return (
                <li key={i} className="flex gap-2 text-[11px] text-gray-300">
                  <span className={`shrink-0 ${isAnti ? 'text-[#ff2a2b]' : 'text-yellow-500'}`}>{isAnti ? '✗' : '★'}</span>
                  <span>{p}</span>
                </li>
              )
            })}
          </ul>
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
              {isHistorical ? 'Insight' : 'Fix'}: {data.congruence.fix}
            </p>
          )}
          <LibraryAlignmentChips alignment={data.congruence.library_alignment} />
          <RewriteCard rewrite={data.congruence.rewrite} label="Proposed Congruence Fix" />
        </Section>
      )}

      {/* Combination Analysis — frames everything in the structural light of "should this ad have these elements together?" */}
      {data.combination_analysis && data.combination_analysis.current_combination && (
        <Section title="Combination Analysis">
          <div className="bg-gray-950 border border-indigo-900/40 rounded-lg px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-indigo-400 font-semibold">Current Combination</span>
              <span className="text-xs text-white font-mono bg-gray-900 border border-gray-800 rounded px-2 py-0.5">
                {data.combination_analysis.current_combination}
              </span>
            </div>
            {data.combination_analysis.combination_assessment && (
              <p className="text-xs text-gray-300 leading-snug">
                {data.combination_analysis.combination_assessment}
              </p>
            )}
          </div>

          {data.combination_analysis.historical_match && (
            <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Historical Match (this segment)</p>
              <div className="flex items-center gap-3 flex-wrap text-[11px]">
                <span className="text-emerald-400">
                  Winners: {data.combination_analysis.historical_match.winners_with_same_combo_in_segment}
                </span>
                <span className="text-[#ff2a2b]">
                  Losers: {data.combination_analysis.historical_match.losers_with_same_combo_in_segment}
                </span>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                  data.combination_analysis.historical_match.verdict === 'strong_winner_pattern'
                    ? 'text-emerald-400 border-emerald-800/60'
                    : data.combination_analysis.historical_match.verdict === 'mostly_loser_pattern'
                      ? 'text-[#ff2a2b] border-red-900/60'
                      : data.combination_analysis.historical_match.verdict === 'mixed_record'
                        ? 'text-amber-400 border-amber-800/60'
                        : 'text-gray-400 border-gray-700'
                }`}>
                  {data.combination_analysis.historical_match.verdict.replace(/_/g, ' ')}
                </span>
              </div>
              {data.combination_analysis.historical_match.winner_examples?.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-500">Winners:</span>
                  {data.combination_analysis.historical_match.winner_examples.map((w, i) => (
                    <span key={i} className="text-[10px] text-emerald-400 font-mono bg-gray-900 px-1.5 py-0.5 rounded border border-emerald-900/40">{w}</span>
                  ))}
                </div>
              )}
              {data.combination_analysis.historical_match.loser_examples?.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-500">Losers:</span>
                  {data.combination_analysis.historical_match.loser_examples.map((l, i) => (
                    <span key={i} className="text-[10px] text-[#ff2a2b] font-mono bg-gray-900 px-1.5 py-0.5 rounded border border-red-900/40">{l}</span>
                  ))}
                </div>
              )}
              {data.combination_analysis.historical_match.verdict_reasoning && (
                <p className="text-[11px] text-gray-400 leading-snug">{data.combination_analysis.historical_match.verdict_reasoning}</p>
              )}
            </div>
          )}

          {data.combination_analysis.alternative_combination && (
            <div className="bg-gray-950 border border-amber-900/50 rounded-lg px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                  {data.combination_analysis.alternative_combination.intent === 'replacement'
                    ? 'Recommended Replacement'
                    : data.combination_analysis.alternative_combination.intent === 'test_variant'
                      ? 'Recommended Test Variant'
                      : 'Alternative'}
                </span>
                {data.combination_analysis.alternative_combination.recommended && (
                  <span className="text-xs text-white font-mono bg-gray-900 border border-amber-900/40 rounded px-2 py-0.5">
                    {data.combination_analysis.alternative_combination.recommended}
                  </span>
                )}
              </div>
              {data.combination_analysis.alternative_combination.rationale && (
                <p className="text-xs text-gray-300 leading-snug">{data.combination_analysis.alternative_combination.rationale}</p>
              )}
              {data.combination_analysis.alternative_combination.element_changes && (
                <div className="space-y-1 pt-1 border-t border-gray-800">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Element Changes</p>
                  {Object.entries(data.combination_analysis.alternative_combination.element_changes).map(([key, value]) => {
                    const display = Array.isArray(value) ? value.join(' • ') : value
                    if (!display || display === 'unchanged') return null
                    const isRemove = display === 'remove' || display === 'remove_or_replace'
                    return (
                      <div key={key} className="flex items-start gap-2 text-[11px]">
                        <span className="text-gray-500 uppercase font-mono w-20 shrink-0">{key}:</span>
                        <span className={isRemove ? 'text-[#ff2a2b] font-semibold' : 'text-gray-200'}>
                          {display}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {data.combination_analysis.alternative_combination.predicted_impact && (
                <p className="text-[11px] text-amber-300/90 leading-snug pt-1 border-t border-gray-800">
                  Impact: {data.combination_analysis.alternative_combination.predicted_impact}
                </p>
              )}
            </div>
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
              <p className="text-[10px] uppercase tracking-wide text-[#ff2a2b] font-semibold mb-0.5">
                {isHistorical ? 'Structural Absence' : 'Critical Weakness'}
              </p>
              <p className="text-xs text-gray-200 leading-snug">{data.overall.critical_weakness}</p>
            </div>
          )}
          {data.overall.priority_fix && (
            <div className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
                {isHistorical ? 'Key Learning' : 'Priority Fix'}
              </p>
              <p className="text-xs text-gray-200 leading-snug">{data.overall.priority_fix}</p>
            </div>
          )}
        </Section>
      )}
    </>
  )
}

function CopyRow({
  label, text, feedback, children, dnaChips, alignment, rewrite,
}: {
  label: string
  text?: string
  feedback?: string
  children?: React.ReactNode
  dnaChips?: string[]
  alignment?: AlignmentLike
  rewrite?: RewriteLike
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        {children}
      </div>
      {text && <p className="text-xs text-gray-200 italic">&ldquo;{text}&rdquo;</p>}
      {dnaChips && dnaChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dnaChips.map((chip, i) => (
            <span key={i} className="text-[9px] text-gray-400 bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 font-mono">{chip}</span>
          ))}
        </div>
      )}
      {feedback && <p className="text-[11px] text-gray-400 leading-snug">{feedback}</p>}
      <LibraryAlignmentChips alignment={alignment} />
      <RewriteCard rewrite={rewrite} />
    </div>
  )
}

function CopyList({
  label, items, feedback, score, dnaChips, alignment, rewrite,
}: {
  label: string
  items: string[]
  feedback?: string
  score: number
  dnaChips?: string[]
  alignment?: AlignmentLike
  rewrite?: RewriteLike
}) {
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
      {dnaChips && dnaChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dnaChips.map((chip, i) => (
            <span key={i} className="text-[9px] text-gray-400 bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 font-mono">{chip}</span>
          ))}
        </div>
      )}
      {feedback && <p className="text-[11px] text-gray-400 leading-snug">{feedback}</p>}
      <LibraryAlignmentChips alignment={alignment} />
      <RewriteCard rewrite={rewrite} />
    </div>
  )
}

function headlineChips(dna: ComprehensiveAnalysis['copy']['headline']['dna']): string[] {
  if (!dna) return []
  const chips: string[] = []
  if (dna.word_count != null) chips.push(`${dna.word_count}w`)
  if (dna.char_count != null) chips.push(`${dna.char_count}c`)
  if (dna.structure_type) chips.push(`structure: ${dna.structure_type}`)
  if (dna.voice) chips.push(`voice: ${dna.voice}`)
  if (dna.emotional_register) chips.push(`reg: ${dna.emotional_register}`)
  if (dna.specificity_level) chips.push(`spec: ${dna.specificity_level}`)
  if (dna.time_bound) chips.push('time-bound')
  if (dna.uses_negation) chips.push('negation')
  if (dna.uses_contrast) chips.push('contrast')
  return chips
}

function subheadlineChips(dna: ComprehensiveAnalysis['copy']['subheadline']['dna']): string[] {
  if (!dna || dna.role === 'absent') return []
  const chips: string[] = []
  if (dna.role) chips.push(`role: ${dna.role}`)
  if (dna.length_relative_to_headline) chips.push(`length: ${dna.length_relative_to_headline}`)
  if (dna.tonal_shift && dna.tonal_shift !== 'absent') chips.push(`tonal: ${dna.tonal_shift}`)
  return chips
}

function benefitsChips(dna: ComprehensiveAnalysis['copy']['benefits_features']['dna']): string[] {
  if (!dna || !dna.count) return []
  const chips: string[] = [`count: ${dna.count}`]
  if (dna.pattern_uniformity) chips.push(dna.pattern_uniformity)
  if (dna.outcome_vs_feature_split) chips.push(dna.outcome_vs_feature_split.replace('mostly_', ''))
  if (dna.specificity) chips.push(`spec: ${dna.specificity}`)
  return chips
}

function trustChips(dna: ComprehensiveAnalysis['copy']['trust_signals']['dna']): string[] {
  if (!dna || !dna.count) return []
  const chips: string[] = [`count: ${dna.count}`]
  if (dna.types_present?.length) chips.push(`types: ${dna.types_present.join(', ')}`)
  if (dna.has_specific_quantifiers === true) chips.push('quantified')
  if (dna.source_attribution && dna.source_attribution !== 'absent') chips.push(dna.source_attribution)
  return chips
}

function ctaChips(dna: ComprehensiveAnalysis['copy']['cta']['dna']): string[] {
  if (!dna) return []
  const chips: string[] = []
  if (dna.verb) chips.push(`verb: ${dna.verb}`)
  if (dna.framing && dna.framing !== 'absent') chips.push(dna.framing)
  if (dna.friction_level && dna.friction_level !== 'absent') chips.push(`friction: ${dna.friction_level}`)
  if (dna.has_value_anchor) chips.push('value-anchor')
  if (dna.has_urgency_signal) chips.push('urgency')
  return chips
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
