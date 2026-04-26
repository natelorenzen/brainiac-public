// Terms of Service — content brief only. Replace with lawyer-drafted text before launch.
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <a href="/" className="text-indigo-400 font-bold">Brainiac</a>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-12 prose prose-invert prose-sm">
        <h1>Terms of Service</h1>
        <p className="text-gray-500 text-xs">Version 1.0.0 · Effective [DATE]</p>

        <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg px-4 py-3 text-amber-400 text-sm not-prose mb-8">
          This is a content brief for legal review. Have a lawyer draft the final version before launch.
        </div>

        <h2>1. Non-Commercial Research Tool</h2>
        <p>
          Brainiac operates under the CC-BY-NC-4.0 license for the Meta FAIR TRIBE v2 brain
          encoding model. This platform does not charge for analysis features. No paid
          subscriptions, pay-per-analysis, or advertising tied to analysis outputs exist
          while operating under CC-BY-NC-4.0.
        </p>

        <h2>2. Data Collection and Use</h2>
        <p>By using Brainiac, you grant [YOUR COMPANY NAME] a license to:</p>
        <ul>
          <li>Store uploaded creative assets and run inference on those assets</li>
          <li>Store analysis outputs, metadata (filename, dimensions, timestamp)</li>
          <li>Aggregate anonymized performance signals across users</li>
          <li>Use anonymized aggregated data to improve the platform and train future models</li>
        </ul>

        <h2>3. Ad Account Connection</h2>
        <p>
          If you connect an advertising platform account via OAuth, Brainiac stores creative
          assets and performance metrics (CTR, impressions, spend, ROAS) linked to those
          creatives. We do not store, access, or transmit audience targeting data, customer
          lists, pixel data, or payment information. You can revoke OAuth access at any time.
        </p>

        <h2>4. Aggregated Data Rights</h2>
        <p>
          You grant a perpetual, worldwide, royalty-free license to use anonymized and
          aggregated derivatives of your analysis data — including brain activation patterns,
          regional scores, and associated performance signals — for improving the platform,
          training machine learning models, and publishing aggregate research insights. This
          license does not include the right to identify users individually or share raw
          creative assets with third parties.
        </p>

        <h2>5. TRIBE v2 License</h2>
        <p>
          Brain analysis features operate under the Creative Commons Attribution-NonCommercial
          4.0 International License (CC-BY-NC-4.0). If the platform transitions to commercial
          operation, users will be notified in advance.
        </p>

        <h2>6. No Performance Guarantees</h2>
        <p>
          Results reflect predicted neural activation patterns, not guaranteed content
          performance. Brainiac makes no claims about the correlation between brain activation
          scores and content engagement, CTR, views, or revenue.
        </p>

        <h2>7. Contact</h2>
        <p>Operator: [YOUR COMPANY NAME]. Contact information: [EMAIL]</p>
      </main>
    </div>
  )
}
