'use client'

import { useState } from 'react'
import { Unlink, ExternalLink } from 'lucide-react'
import type { ConnectedAccount, ConsentType } from '@/types'

interface Props {
  accounts: ConnectedAccount[]
  hasAdConsent: boolean
  authToken: string
  onUpdate: () => void
}

export function ConnectedAccounts({ accounts, hasAdConsent, authToken, onUpdate }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [consentingToAds, setConsentingToAds] = useState(false)

  async function handleConnect() {
    // Record ad_account_connection consent first if not already given
    if (!hasAdConsent) {
      setConsentingToAds(true)
      const res = await fetch('/api/users/me/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ consent_types: ['ad_account_connection'] as ConsentType[] }),
      })
      setConsentingToAds(false)
      if (!res.ok) return
    }

    const res = await fetch('/api/oauth/meta/connect', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!res.ok) return
    const { auth_url } = await res.json()
    window.location.href = auth_url
  }

  async function handleDisconnect(accountId: string) {
    setLoading(accountId)
    await fetch('/api/oauth/meta/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ account_id: accountId }),
    })
    setLoading(null)
    onUpdate()
  }

  const activeAccounts = accounts.filter(a => a.is_active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Connected Ad Accounts</h3>
        <button
          onClick={handleConnect}
          disabled={consentingToAds}
          className="flex items-center gap-2 text-xs px-3 py-1.5 bg-indigo-600 text-[#fff] rounded-lg
                     hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          <ExternalLink className="w-3 h-3" />
          Connect Meta Ads
        </button>
      </div>

      {!hasAdConsent && (
        <p className="text-xs text-amber-500/80 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
          Connecting grants read access to your ad creatives and performance data. Audience
          targeting data, customer lists, and payment info are never accessed.
        </p>
      )}

      {activeAccounts.length === 0 ? (
        <p className="text-sm text-gray-600">No accounts connected.</p>
      ) : (
        <ul className="space-y-2">
          {activeAccounts.map(account => (
            <li
              key={account.id}
              className="flex items-center justify-between px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg"
            >
              <div>
                <p className="text-sm text-white">{account.platform_account_name ?? account.platform}</p>
                <p className="text-xs text-gray-500">
                  Connected {new Date(account.connected_at).toLocaleDateString()}
                  {account.last_synced_at && ` · Synced ${new Date(account.last_synced_at).toLocaleDateString()}`}
                </p>
              </div>
              <button
                onClick={() => handleDisconnect(account.id)}
                disabled={loading === account.id}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" />
                {loading === account.id ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
