'use client'

import { Suspense, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { ConnectedAccounts } from '@/components/ConnectedAccounts'
import type { ConnectedAccount } from '@/types'

// useSearchParams must be inside a Suspense boundary
function AccountPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const metaStatus = searchParams.get('meta')

  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [hasAdConsent, setHasAdConsent] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setToken(session.access_token)
      setEmail(session.user.email ?? null)
      await loadAccounts(session.access_token)
    })
  }, [router])

  async function loadAccounts(tok: string) {
    const { data } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('is_active', true)

    setAccounts((data ?? []) as ConnectedAccount[])

    const consentRes = await fetch('/api/users/me/consent', {
      headers: { Authorization: `Bearer ${tok}` },
    })
    if (consentRes.ok) {
      const { data: consentData } = await supabase
        .from('user_consents')
        .select('consent_type')
        .eq('consent_type', 'ad_account_connection')
        .limit(1)
      setHasAdConsent((consentData?.length ?? 0) > 0)
    }
  }

  async function handleExport() {
    if (!token) return
    setExportLoading(true)
    const res = await fetch('/api/users/me/data-export', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `brainiac-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
    setExportLoading(false)
  }

  async function handleDeleteAccount() {
    if (!token) return
    setDeleting(true)
    const res = await fetch('/api/users/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      await supabase.auth.signOut()
      router.push('/?deleted=1')
    } else {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <a href="/dashboard" className="text-indigo-400 font-bold">Brainiac</a>
        <span className="text-sm text-gray-500">Account Settings</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-10">

        {/* Meta OAuth status banner */}
        {metaStatus === 'connected' && (
          <div className="bg-green-950/30 border border-green-800/50 rounded-xl px-5 py-3 text-sm text-green-400">
            Meta Ads account connected successfully.
          </div>
        )}
        {metaStatus === 'error' && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-xl px-5 py-3 text-sm text-red-400">
            Failed to connect Meta Ads account. Please try again.
          </div>
        )}
        {metaStatus === 'denied' && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-5 py-3 text-sm text-amber-400">
            Meta Ads connection was cancelled.
          </div>
        )}

        {/* Account info */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
            <p className="text-sm text-gray-400">Signed in as</p>
            <p className="text-white mt-0.5">{email ?? '—'}</p>
          </div>
        </section>

        {/* Connected accounts */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ad Accounts</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
            {token && (
              <ConnectedAccounts
                accounts={accounts}
                hasAdConsent={hasAdConsent}
                authToken={token}
                onUpdate={() => token && loadAccounts(token)}
              />
            )}
          </div>
        </section>

        {/* Data export */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Data</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 space-y-3">
            <p className="text-sm text-gray-400">
              Download a full JSON export of your account data — analyses, consents, connected accounts.
            </p>
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700
                         transition-colors disabled:opacity-50"
            >
              {exportLoading ? 'Preparing export…' : 'Download my data'}
            </button>
          </div>
        </section>

        {/* Delete account */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-red-900 uppercase tracking-wider">Danger Zone</h2>
          <div className="bg-gray-900 border border-red-900/40 rounded-xl px-5 py-4 space-y-3">
            <p className="text-sm text-gray-400">
              Deleting your account will schedule all personal data for permanent deletion within 30 days.
              Anonymized aggregate signals are retained with no user linkage.
            </p>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="px-4 py-2 text-sm text-red-400 border border-red-800/60 rounded-lg
                           hover:bg-red-950/40 transition-colors"
              >
                Delete account
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="px-4 py-2 text-sm bg-red-700 text-[#fff] rounded-lg
                             hover:bg-red-600 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {deleting ? 'Scheduling deletion…' : 'Yes, delete my account'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-sm text-gray-500 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>

        <div className="pt-4 border-t border-gray-800 text-xs text-gray-600 space-y-1">
          <p>
            <a href="/legal/terms" className="underline hover:text-gray-400">Terms of Service</a>
            {' · '}
            <a href="/legal/privacy" className="underline hover:text-gray-400">Privacy Policy</a>
          </p>
          <p>Operator: [YOUR COMPANY NAME] · Non-commercial use only (CC-BY-NC-4.0)</p>
        </div>
      </main>
    </div>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm animate-pulse">Loading…</p>
      </div>
    }>
      <AccountPageInner />
    </Suspense>
  )
}
