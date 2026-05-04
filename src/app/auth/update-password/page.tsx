'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <section className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-white text-2xl font-bold mb-1">Set new password</h1>
          <p className="text-gray-500 text-sm mb-6">Choose a new password for your account.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white
                         placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 text-[#fff] rounded-lg text-sm font-medium
                         disabled:opacity-50 hover:bg-indigo-500 transition-colors shadow-sm"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
