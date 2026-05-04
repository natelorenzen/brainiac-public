'use client'

import { useState } from 'react'
import type { ConsentType } from '@/types'

interface Props {
  onConsent: (types: ConsentType[]) => Promise<void>
}

export function ConsentGate({ onConsent }: Props) {
  const [checked, setChecked] = useState({
    terms_of_service: false,
    privacy_policy: false,
    data_aggregation: false,
  })
  const [loading, setLoading] = useState(false)

  const allChecked = Object.values(checked).every(Boolean)

  async function handleSubmit() {
    if (!allChecked) return
    setLoading(true)
    await onConsent(Object.keys(checked) as ConsentType[])
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-6 z-50">
      <div className="max-w-lg w-full bg-gray-900 rounded-xl p-8 border border-gray-800">
        <h2 className="text-white text-xl font-semibold mb-2">Before you continue</h2>
        <p className="text-gray-400 text-sm mb-6">
          This is an experimental research tool. Please read and agree to the following.
        </p>

        <label className="flex gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={checked.terms_of_service}
            onChange={e => setChecked(p => ({ ...p, terms_of_service: e.target.checked }))}
            className="mt-1 accent-indigo-500"
          />
          <span className="text-sm text-gray-300">
            I agree to the{' '}
            <a href="/legal/terms" className="underline text-indigo-400" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>
            , including the storage of uploaded creatives and analysis outputs.
          </span>
        </label>

        <label className="flex gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={checked.privacy_policy}
            onChange={e => setChecked(p => ({ ...p, privacy_policy: e.target.checked }))}
            className="mt-1 accent-indigo-500"
          />
          <span className="text-sm text-gray-300">
            I have read the{' '}
            <a href="/legal/privacy" className="underline text-indigo-400" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            , including how performance signals are collected and stored.
          </span>
        </label>

        <label className="flex gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={checked.data_aggregation}
            onChange={e => setChecked(p => ({ ...p, data_aggregation: e.target.checked }))}
            className="mt-1 accent-indigo-500"
          />
          <span className="text-sm text-gray-300">
            I agree that anonymized, aggregated derivatives of my analysis data may be used to
            improve the platform and train future models. My individual data and creatives remain
            private.
          </span>
        </label>

        <button
          disabled={!allChecked || loading}
          onClick={handleSubmit}
          className="w-full py-3 bg-indigo-600 text-[#fff] rounded-lg font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed
                     hover:bg-indigo-500 transition-colors shadow-sm"
        >
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
