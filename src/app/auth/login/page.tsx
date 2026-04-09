'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
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
          <h1 className="text-white text-2xl font-bold mb-1">Log in</h1>
          <p className="text-gray-500 text-sm mb-6">Welcome back.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white
                         placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white
                         placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium
                         disabled:opacity-50 hover:bg-indigo-500 transition-colors"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <p className="mt-4 text-sm text-center text-gray-500">
            No account?{' '}
            <a href="/auth/signup" className="underline text-gray-300">Sign up</a>
          </p>
          <p className="mt-2 text-sm text-center">
            <a href="/auth/reset-password" className="underline text-gray-600 hover:text-gray-400">Forgot password?</a>
          </p>
        </div>
      </section>
    </div>
  )
}
