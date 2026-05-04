// Privacy Policy — content brief only. Replace with lawyer-drafted text before launch.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <a href="/" className="text-[#ff2a2b] font-bold tracking-tight">Adforge</a>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-12 prose prose-invert prose-sm">
        <h1>Privacy Policy</h1>
        <p className="text-gray-500 text-xs">Version 1.0.0 · Effective [DATE]</p>

        <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg px-4 py-3 text-amber-400 text-sm not-prose mb-8">
          This is a content brief for legal review. Have a lawyer draft the final version before launch.
        </div>

        <h2>What We Collect</h2>
        <ul>
          <li>Account information (email, hashed password via Supabase Auth)</li>
          <li>Uploaded creative files and analysis outputs</li>
          <li>OAuth tokens for connected ad accounts and the creative/performance data pulled via those tokens</li>
          <li>Usage data (analysis counts, timestamps)</li>
          <li>Consent records (timestamped, IP-logged, versioned)</li>
        </ul>

        <h2>What We Do Not Collect</h2>
        <ul>
          <li>Ad audience targeting data or customer lists</li>
          <li>Pixel events from your advertising platforms</li>
          <li>Payment or billing information from connected ad accounts</li>
          <li>Actual biometric data — TRIBE v2 outputs are model predictions, not brain scans</li>
        </ul>

        <h2>How We Use Your Data</h2>
        <p>
          We use your data to run brain activation analyses, store results for your review, and
          produce anonymized aggregate signals for research purposes. We do not sell your data
          or share individual creative assets with third parties.
        </p>

        <h2>Retention</h2>
        <p>
          Creative files and analysis results are retained until you delete them or close your
          account, then purged within 30 days. Anonymized aggregate signals are retained
          indefinitely — no user linkage exists at the time of writing.
        </p>

        <h2>Your Rights</h2>
        <ul>
          <li>
            <strong>Access:</strong> Download all stored data via{' '}
            <a href="/account" className="text-indigo-400">Account Settings → Download my data</a>.
          </li>
          <li>
            <strong>Deletion:</strong> Request full account deletion via Account Settings. All personal
            data is purged within 30 days.
          </li>
          <li>
            <strong>Opt-out of aggregation:</strong> Contact us to opt out of anonymized benchmarking
            while retaining platform access.
          </li>
        </ul>

        <h2>Third-Party Services</h2>
        <p>
          Adforge uses Supabase (database and authentication), Modal (GPU inference — image data
          is processed transiently and not retained by Modal), and Vercel (hosting).
        </p>

        <h2>Contact</h2>
        <p>Operator: [YOUR COMPANY NAME]. Data requests: [EMAIL]</p>
      </main>
    </div>
  )
}
