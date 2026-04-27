'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import type { ExtractedElements } from '@/app/api/analyze/extract-elements/route'

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

export function ExtractionConfirmPanel({ fileName, previewUrl, extracted, onConfirm, onSkip, onClose }: Props) {
  const [fields, setFields] = useState<ExtractedElements>({ ...extracted })

  function set<K extends keyof ExtractedElements>(key: K, value: ExtractedElements[K]) {
    setFields(prev => ({ ...prev, [key]: value }))
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
          <p className="text-xs text-gray-400 leading-relaxed">
            Claude extracted these elements from the ad. Correct anything it got wrong — especially the headline and CTA, which are used as ground truth in the full analysis. Leave a field blank if the element is not present.
          </p>
        </div>

        {/* Editable fields */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
          <Field label="Headline" value={fields.headline ?? ''} onChange={v => set('headline', v || null)} />
          <Field label="Subheadline" value={fields.subheadline ?? ''} onChange={v => set('subheadline', v || null)} />
          <Field label="Body copy" value={fields.body_copy ?? ''} onChange={v => set('body_copy', v || null)} multiline />
          <Field label="CTA" value={fields.cta ?? ''} onChange={v => set('cta', v || null)} />
          <Field label="Offer / price" value={fields.offer_details ?? ''} onChange={v => set('offer_details', v || null)} />
          <ListField label="Benefits" items={fields.benefits} onChange={v => set('benefits', v)} />
          <ListField label="Trust signals" items={fields.trust_signals} onChange={v => set('trust_signals', v)} />
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[#ff2a2b] hover:bg-red-500 text-white transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Confirm &amp; analyze
          </button>
        </div>
      </div>
    </div>
  )
}
