'use client'

import { useState } from 'react'
import { Video } from 'lucide-react'

interface Props {
  onSubmit: (handle: string) => void
  disabled?: boolean
}

export function ChannelInput({ onSubmit, disabled }: Props) {
  const [handle, setHandle] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = handle.trim().replace(/^@/, '')
    if (!cleaned) return
    onSubmit(cleaned)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg
                      focus-within:border-indigo-500 transition-colors">
        <Video className="w-4 h-4 text-gray-500 shrink-0" />
        <input
          type="text"
          placeholder="@channelhandle or channel ID"
          value={handle}
          onChange={e => setHandle(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
        />
      </div>

      <p className="text-xs text-gray-600">
        Analyzes the most recent 15 videos (YouTube RSS limit). Counts as 15 analyses toward your limits.
      </p>

      <button
        type="submit"
        disabled={disabled || !handle.trim()}
        className="py-2 px-4 bg-indigo-600 text-white text-sm rounded-lg font-medium
                   disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors"
      >
        Analyze Channel
      </button>
    </form>
  )
}
