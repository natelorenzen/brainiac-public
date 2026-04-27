'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
        <div className="w-full max-w-sm text-center">
          <p className="text-2xl mb-3">📬</p>
          <h1 className="text-white text-xl font-semibold mb-2">Check your email</h1>
          <p className="text-gray-400 text-sm">
            We sent a confirmation link to <span className="text-white">{email}</span>.
            Click it to activate your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <section className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-white text-2xl font-bold mb-1">Create account</h1>
          <p className="text-gray-500 text-sm mb-6">Free. No credit card required.</p>

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
              placeholder="Password (min 8 characters)"
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
              {loading ? 'Creating account…' : 'Sign up'}
            </button>
          </form>

          <p className="mt-4 text-sm text-center text-gray-500">
            Already have an account?{' '}
            <a href="/auth/login" className="underline text-gray-300">Log in</a>
          </p>
        </div>
      </section>
    </div>
  )
}
