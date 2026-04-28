'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import type {
  ExtractedElements,
  HeadlineDNA,
  SubheadlineDNA,
  BodyDNA,
  BenefitsDNA,
  TrustDNA,
  CtaDNA,
} from '@/app/api/analyze/extract-elements/route'

const HEADLINE_STRUCTURE = ['pain_agitation','curiosity_gap','question','desire_statement','identity','mechanism_reveal','social_proof_lead','direct_offer','contrast','story_lead','command','negation_lead'] as const
const VOICE = ['direct','indirect'] as const
const PERSON = ['first','second','third','none'] as const
const TENSE = ['present','past','future','mixed'] as const
const SENTENCE_TYPE = ['declarative','imperative','interrogative','fragmentary'] as const
const SPECIFICITY = ['high','medium','low'] as const
const EMOTIONAL_REGISTER_HEADLINE = ['pain','fear','desire','curiosity','empowerment','social_belonging','anger','hope','neutral'] as const
const EMOTIONAL_REGISTER_SUB = ['pain','fear','desire','curiosity','empowerment','social_belonging','reassurance','neutral','absent'] as const
const TONE_REGISTER = ['formal','casual','raw','clinical','conversational','authoritative','intimate'] as const
const READING_LEVEL = ['simple','moderate','complex'] as const
const SUB_ROLE = ['bridge_to_benefits','bridge_to_solution','standalone_claim','clarification','amplification','absent'] as const
const LENGTH_RELATIVE = ['shorter','same','longer'] as const
const PERSON_CONTINUITY = ['maintains','shifts_to_product','shifts_to_audience','absent'] as const
const TONAL_SHIFT = ['maintains','softens','sharpens','absent'] as const
const SUB_TENSE = ['present','past','future','mixed','absent'] as const
const BODY_FRAME = ['story','list','comparison','instruction','testimonial','claim_proof','absent'] as const
const PRONOUN_DENSITY = ['high','medium','low','absent'] as const
const PATTERN_UNIFORMITY = ['parallel','mixed','absent'] as const
const OUTCOME_FEATURE = ['mostly_outcomes','mostly_features','balanced','absent'] as const
const BENEFITS_SPEC = ['high','medium','low','absent'] as const
const SOURCE_ATTRIBUTION = ['named','anonymous','mixed','absent'] as const
const CTA_FRAMING = ['first_person','second_person','imperative','absent'] as const
const FRICTION = ['low','medium','high','absent'] as const

interface Props {
  fileName: string
  previewUrl: string
  extracted: ExtractedElements
  onConfirm: (confirmed: ExtractedElements) => void
  onSkip: () => void
  onClose: () => void
}

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? 'None'}
          rows={2}
          className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-200 focus:border-[#ff2a2b] focus:outline-none resize-none placeholder:text-gray-700"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? 'None'}
          className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-200 focus:border-[#ff2a2b] focus:outline-none placeholder:text-gray-700"
        />
      )}
    </div>
  )
}

function DnaCollapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="bg-gray-950 border border-gray-800 rounded px-2 py-1.5 group">
      <summary className="text-[10px] uppercase tracking-wide text-gray-500 cursor-pointer select-none hover:text-gray-300 list-none flex items-center justify-between">
        <span>{title}</span>
        <span className="text-gray-600 group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 pt-2 border-t border-gray-800">
        {children}
      </div>
    </details>
  )
}

function EnumSelect<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T | null; options: readonly T[]; onChange: (v: T | null) => void }) {
  return (
    <div className="space-y-0.5">
      <label className="text-[9px] uppercase tracking-wide text-gray-500 block">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange((e.target.value || null) as T | null)}
        className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:border-[#ff2a2b] focus:outline-none"
      >
        <option value="">—</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  )
}

function BoolToggle({
  label, value, onChange,
}: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  const display = value === true ? 'true' : value === false ? 'false' : '?'
  return (
    <div className="space-y-0.5">
      <label className="text-[9px] uppercase tracking-wide text-gray-500 block">{label}</label>
      <select
        value={display}
        onChange={e => {
          const v = e.target.value
          onChange(v === 'true' ? true : v === 'false' ? false : null)
        }}
        className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:border-[#ff2a2b] focus:outline-none"
      >
        <option value="?">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </div>
  )
}

function NumberField({
  label, value, onChange,
}: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="space-y-0.5">
      <label className="text-[9px] uppercase tracking-wide text-gray-500 block">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:border-[#ff2a2b] focus:outline-none"
      />
    </div>
  )
}

function TagInput({
  label, value, onChange,
}: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-0.5 col-span-2">
      <label className="text-[9px] uppercase tracking-wide text-gray-500 block">{label} <span className="text-gray-600 normal-case">(comma-separated)</span></label>
      <input
        type="text"
        value={value.join(', ')}
        onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:border-[#ff2a2b] focus:outline-none"
      />
    </div>
  )
}

function HeadlineDnaEditor({ dna, onChange }: { dna: HeadlineDNA; onChange: (d: HeadlineDNA) => void }) {
  const set = <K extends keyof HeadlineDNA>(k: K, v: HeadlineDNA[K]) => onChange({ ...dna, [k]: v })
  return (
    <DnaCollapsible title="Headline DNA — 22 dimensions">
      <NumberField label="word_count" value={dna.word_count} onChange={v => set('word_count', v)} />
      <NumberField label="char_count" value={dna.char_count} onChange={v => set('char_count', v)} />
      <EnumSelect label="reading_level" value={dna.reading_level} options={READING_LEVEL} onChange={v => set('reading_level', v)} />
      <EnumSelect label="voice" value={dna.voice} options={VOICE} onChange={v => set('voice', v)} />
      <EnumSelect label="person" value={dna.person} options={PERSON} onChange={v => set('person', v)} />
      <EnumSelect label="tense" value={dna.tense} options={TENSE} onChange={v => set('tense', v)} />
      <EnumSelect label="sentence_type" value={dna.sentence_type} options={SENTENCE_TYPE} onChange={v => set('sentence_type', v)} />
      <EnumSelect label="structure_type" value={dna.structure_type} options={HEADLINE_STRUCTURE} onChange={v => set('structure_type', v)} />
      <EnumSelect label="specificity_level" value={dna.specificity_level} options={SPECIFICITY} onChange={v => set('specificity_level', v)} />
      <EnumSelect label="emotional_register" value={dna.emotional_register} options={EMOTIONAL_REGISTER_HEADLINE} onChange={v => set('emotional_register', v)} />
      <EnumSelect label="tone_register" value={dna.tone_register} options={TONE_REGISTER} onChange={v => set('tone_register', v)} />
      <BoolToggle label="mechanism_present" value={dna.mechanism_present} onChange={v => set('mechanism_present', v)} />
      <BoolToggle label="audience_explicit" value={dna.audience_explicit} onChange={v => set('audience_explicit', v)} />
      <BoolToggle label="outcome_explicit" value={dna.outcome_explicit} onChange={v => set('outcome_explicit', v)} />
      <BoolToggle label="time_bound" value={dna.time_bound} onChange={v => set('time_bound', v)} />
      <BoolToggle label="number_present" value={dna.number_present} onChange={v => set('number_present', v)} />
      <BoolToggle label="uses_metaphor" value={dna.uses_metaphor} onChange={v => set('uses_metaphor', v)} />
      <BoolToggle label="uses_negation" value={dna.uses_negation} onChange={v => set('uses_negation', v)} />
      <BoolToggle label="uses_contrast" value={dna.uses_contrast} onChange={v => set('uses_contrast', v)} />
      <TagInput label="power_words" value={dna.power_words} onChange={v => set('power_words', v)} />
      <TagInput label="punctuation_signals" value={dna.punctuation_signals} onChange={v => set('punctuation_signals', v)} />
    </DnaCollapsible>
  )
}

function SubheadlineDnaEditor({ dna, onChange }: { dna: SubheadlineDNA; onChange: (d: SubheadlineDNA) => void }) {
  const set = <K extends keyof SubheadlineDNA>(k: K, v: SubheadlineDNA[K]) => onChange({ ...dna, [k]: v })
  return (
    <DnaCollapsible title="Subheadline DNA — 12 dimensions">
      <NumberField label="word_count" value={dna.word_count} onChange={v => set('word_count', v)} />
      <NumberField label="char_count" value={dna.char_count} onChange={v => set('char_count', v)} />
      <EnumSelect label="length_relative_to_headline" value={dna.length_relative_to_headline} options={LENGTH_RELATIVE} onChange={v => set('length_relative_to_headline', v)} />
      <EnumSelect label="role" value={dna.role} options={SUB_ROLE} onChange={v => set('role', v)} />
      <EnumSelect label="person_continuity" value={dna.person_continuity} options={PERSON_CONTINUITY} onChange={v => set('person_continuity', v)} />
      <EnumSelect label="tonal_shift" value={dna.tonal_shift} options={TONAL_SHIFT} onChange={v => set('tonal_shift', v)} />
      <EnumSelect label="emotional_register" value={dna.emotional_register} options={EMOTIONAL_REGISTER_SUB} onChange={v => set('emotional_register', v)} />
      <EnumSelect label="tense" value={dna.tense} options={SUB_TENSE} onChange={v => set('tense', v)} />
      <BoolToggle label="introduces_mechanism" value={dna.introduces_mechanism} onChange={v => set('introduces_mechanism', v)} />
      <BoolToggle label="introduces_proof" value={dna.introduces_proof} onChange={v => set('introduces_proof', v)} />
      <BoolToggle label="introduces_specificity" value={dna.introduces_specificity} onChange={v => set('introduces_specificity', v)} />
      <BoolToggle label="introduces_audience" value={dna.introduces_audience} onChange={v => set('introduces_audience', v)} />
    </DnaCollapsible>
  )
}

function BodyDnaEditor({ dna, onChange }: { dna: BodyDNA; onChange: (d: BodyDNA) => void }) {
  const set = <K extends keyof BodyDNA>(k: K, v: BodyDNA[K]) => onChange({ ...dna, [k]: v })
  return (
    <DnaCollapsible title="Body DNA — 6 dimensions">
      <NumberField label="word_count" value={dna.word_count} onChange={v => set('word_count', v)} />
      <NumberField label="paragraph_count" value={dna.paragraph_count} onChange={v => set('paragraph_count', v)} />
      <NumberField label="sentence_count" value={dna.sentence_count} onChange={v => set('sentence_count', v)} />
      <NumberField label="avg_sentence_length" value={dna.avg_sentence_length} onChange={v => set('avg_sentence_length', v)} />
      <EnumSelect label="frame" value={dna.frame} options={BODY_FRAME} onChange={v => set('frame', v)} />
      <EnumSelect label="personal_pronoun_density" value={dna.personal_pronoun_density} options={PRONOUN_DENSITY} onChange={v => set('personal_pronoun_density', v)} />
    </DnaCollapsible>
  )
}

function BenefitsDnaEditor({ dna, onChange }: { dna: BenefitsDNA; onChange: (d: BenefitsDNA) => void }) {
  const set = <K extends keyof BenefitsDNA>(k: K, v: BenefitsDNA[K]) => onChange({ ...dna, [k]: v })
  return (
    <DnaCollapsible title="Benefits DNA — 5 dimensions">
      <NumberField label="count" value={dna.count} onChange={v => set('count', v ?? 0)} />
      <NumberField label="avg_word_count" value={dna.avg_word_count} onChange={v => set('avg_word_count', v)} />
      <EnumSelect label="pattern_uniformity" value={dna.pattern_uniformity} options={PATTERN_UNIFORMITY} onChange={v => set('pattern_uniformity', v)} />
      <EnumSelect label="outcome_vs_feature_split" value={dna.outcome_vs_feature_split} options={OUTCOME_FEATURE} onChange={v => set('outcome_vs_feature_split', v)} />
      <EnumSelect label="specificity" value={dna.specificity} options={BENEFITS_SPEC} onChange={v => set('specificity', v)} />
    </DnaCollapsible>
  )
}

function TrustDnaEditor({ dna, onChange }: { dna: TrustDNA; onChange: (d: TrustDNA) => void }) {
  const set = <K extends keyof TrustDNA>(k: K, v: TrustDNA[K]) => onChange({ ...dna, [k]: v })
  return (
    <DnaCollapsible title="Trust DNA — 4 dimensions">
      <NumberField label="count" value={dna.count} onChange={v => set('count', v ?? 0)} />
      <BoolToggle label="has_specific_quantifiers" value={dna.has_specific_quantifiers} onChange={v => set('has_specific_quantifiers', v)} />
      <EnumSelect label="source_attribution" value={dna.source_attribution} options={SOURCE_ATTRIBUTION} onChange={v => set('source_attribution', v)} />
      <TagInput label="types_present" value={dna.types_present} onChange={v => set('types_present', v)} />
    </DnaCollapsible>
  )
}

function CtaDnaEditor({ dna, onChange }: { dna: CtaDNA; onChange: (d: CtaDNA) => void }) {
  const set = <K extends keyof CtaDNA>(k: K, v: CtaDNA[K]) => onChange({ ...dna, [k]: v })
  return (
    <DnaCollapsible title="CTA DNA — 6 dimensions">
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wide text-gray-500 block">verb</label>
        <input
          type="text"
          value={dna.verb ?? ''}
          onChange={e => set('verb', e.target.value || null)}
          className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:border-[#ff2a2b] focus:outline-none"
        />
      </div>
      <NumberField label="word_count" value={dna.word_count} onChange={v => set('word_count', v)} />
      <EnumSelect label="framing" value={dna.framing} options={CTA_FRAMING} onChange={v => set('framing', v)} />
      <EnumSelect label="friction_level" value={dna.friction_level} options={FRICTION} onChange={v => set('friction_level', v)} />
      <BoolToggle label="has_value_anchor" value={dna.has_value_anchor} onChange={v => set('has_value_anchor', v)} />
      <BoolToggle label="has_urgency_signal" value={dna.has_urgency_signal} onChange={v => set('has_urgency_signal', v)} />
    </DnaCollapsible>
  )
}

function ListField({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const value = items.join('\n')
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label} <span className="text-gray-700 normal-case font-normal">(one per line)</span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value.split('\n').filter(Boolean))}
        placeholder="None"
        rows={2}
        className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-200 focus:border-[#ff2a2b] focus:outline-none resize-none placeholder:text-gray-700"
      />
    </div>
  )
}

function deriveCompositionTag(f: ExtractedElements): string {
  const slots: string[] = []
  if (f.headline?.trim()) slots.push('headline')
  if (f.subheadline?.trim()) slots.push('sub')
  if (f.body_copy?.trim()) slots.push('body')
  if (f.benefits.length > 0) slots.push('benefits')
  if (f.trust_signals.length > 0) slots.push('trust')
  if (f.safety_signals.length > 0) slots.push('safety')
  if (f.cta?.trim()) slots.push('cta')
  if (f.offer_details?.trim()) slots.push('offer')
  if (slots.length === 0) return 'visual_only'
  if (slots.length === 1 && slots[0] === 'headline') return 'headline_only'
  if (slots.length >= 6 && slots.includes('headline') && slots.includes('sub') && slots.includes('benefits') && slots.includes('trust') && slots.includes('cta') && slots.includes('offer')) return 'full_stack'
  return slots.join('+')
}

export function ExtractionConfirmPanel({ fileName, previewUrl, extracted, onConfirm, onSkip, onClose }: Props) {
  const [fields, setFields] = useState<ExtractedElements>(() => ({
    ...extracted,
    composition_tag: deriveCompositionTag(extracted),
  }))

  function set<K extends keyof ExtractedElements>(key: K, value: ExtractedElements[K]) {
    setFields(prev => {
      const next = { ...prev, [key]: value }
      // Recompute composition_tag whenever a slot-affecting field changes.
      if (key !== 'composition_tag') {
        next.composition_tag = deriveCompositionTag(next)
      }
      return next
    })
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">Confirm extraction</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-sm">{fileName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview + explanation */}
        <div className="px-5 py-3 border-b border-gray-800 shrink-0 flex gap-4 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={fileName} className="w-20 h-20 object-cover rounded-lg shrink-0 border border-gray-800" />
          <div className="flex-1 space-y-2 min-w-0">
            <p className="text-xs text-gray-400 leading-relaxed">
              Claude extracted these elements from the ad. Correct anything it got wrong — especially the headline and CTA, which are used as ground truth in the full analysis. Leave a field blank if the element is not present.
            </p>
            {fields.composition_tag && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Composition</span>
                <span className="text-[10px] text-white font-mono bg-gray-950 border border-gray-700 rounded px-2 py-0.5">
                  {fields.composition_tag}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
          <Field label="Headline" value={fields.headline ?? ''} onChange={v => set('headline', v || null)} />
          {fields.headline_dna && (
            <HeadlineDnaEditor dna={fields.headline_dna} onChange={d => set('headline_dna', d)} />
          )}
          <Field label="Subheadline" value={fields.subheadline ?? ''} onChange={v => set('subheadline', v || null)} />
          {fields.subheadline_dna && (
            <SubheadlineDnaEditor dna={fields.subheadline_dna} onChange={d => set('subheadline_dna', d)} />
          )}
          <Field label="Body copy" value={fields.body_copy ?? ''} onChange={v => set('body_copy', v || null)} multiline />
          {fields.body_dna && (
            <BodyDnaEditor dna={fields.body_dna} onChange={d => set('body_dna', d)} />
          )}
          <Field label="CTA" value={fields.cta ?? ''} onChange={v => set('cta', v || null)} />
          {fields.cta_dna && (
            <CtaDnaEditor dna={fields.cta_dna} onChange={d => set('cta_dna', d)} />
          )}
          <Field label="Offer / price" value={fields.offer_details ?? ''} onChange={v => set('offer_details', v || null)} />
          <ListField label="Benefits" items={fields.benefits} onChange={v => set('benefits', v)} />
          {fields.benefits_dna && (
            <BenefitsDnaEditor dna={fields.benefits_dna} onChange={d => set('benefits_dna', d)} />
          )}
          <ListField label="Trust signals" items={fields.trust_signals} onChange={v => set('trust_signals', v)} />
          {fields.trust_dna && (
            <TrustDnaEditor dna={fields.trust_dna} onChange={d => set('trust_dna', d)} />
          )}
          <ListField label="Safety signals" items={fields.safety_signals} onChange={v => set('safety_signals', v)} />
          <ListField label="Proof signals" items={fields.proof_signals} onChange={v => set('proof_signals', v)} />
          <Field label="Visual description" value={fields.visual_description} onChange={v => set('visual_description', v)} />
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Ad format type</label>
            <select
              value={fields.ad_format_guess}
              onChange={e => set('ad_format_guess', e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-200 focus:border-[#ff2a2b] focus:outline-none"
            >
              {['direct_response', 'native_ugc', 'advertorial', 'brand_awareness', 'product_demo', 'testimonial', 'hybrid'].map(f => (
                <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-800 shrink-0 flex gap-3 justify-end">
          <button
            onClick={onSkip}
            className="px-4 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-200 border border-gray-800 hover:border-gray-600 transition-colors"
          >
            Skip confirmation
          </button>
          <button
            onClick={() => onConfirm(fields)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[#ff2a2b] hover:bg-[#ff4445] text-[#fff] transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            Confirm &amp; analyze
          </button>
        </div>
      </div>
    </div>
  )
}
