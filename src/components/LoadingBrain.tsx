'use client'

interface Props {
  message?: string
}

export function LoadingBrain({ message = 'Running brain encoding model…' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      {/* Animated brain pulse rings */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-16 h-16 rounded-full border border-indigo-500/30 animate-ping" />
        <div className="absolute w-12 h-12 rounded-full border border-indigo-500/50 animate-ping [animation-delay:200ms]" />
        <div className="w-8 h-8 rounded-full bg-indigo-600/80 flex items-center justify-center">
          <span className="text-base">🧠</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 animate-pulse">{message}</p>
      <p className="text-xs text-gray-600">This may take up to 30 seconds.</p>
    </div>
  )
}
