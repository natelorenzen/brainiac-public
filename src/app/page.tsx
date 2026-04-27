export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-indigo-400">Brain</span>iac
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/legal/terms" className="text-gray-500 hover:text-gray-300 transition-colors hidden sm:block">
              Terms
            </a>
            <a href="/auth/login" className="text-gray-400 hover:text-white transition-colors">
              Log in
            </a>
            <a
              href="/auth/signup"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Get started free
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="w-[700px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Experimental · Non-commercial · CC-BY-NC-4.0
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
              See your ad{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                through the brain
              </span>
            </h1>

            <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
              Upload a static ad image. Brainiac runs BERG fMRI brain activation analysis
              and Claude&nbsp;Sonnet to tell you exactly how the brain processes your creative
              — and how to make it work harder.
            </p>

            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href="/auth/signup"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-900/40"
              >
                Analyze an ad →
              </a>
              <a
                href="/auth/login"
                className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium rounded-xl transition-colors"
              >
                Log in
              </a>
            </div>

            {/* Quick stats */}
            <div className="mt-16 flex flex-wrap justify-center gap-x-10 gap-y-4 text-sm text-gray-500">
              {[
                { value: '6', label: 'neural ROIs analyzed' },
                { value: '4', label: 'ad dimensions scored' },
                { value: 'Free', label: 'no credit card' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-white font-semibold">{s.value}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-600 mb-12">
            What you get
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                icon: '🧠',
                title: 'BERG brain activation',
                body: 'Powered by BERG fmri-nsd-fwrf — trained on the Natural Scenes Dataset fMRI data to predict which visual cortex regions activate when someone sees your ad.',
              },
              {
                icon: '📊',
                title: 'Ad dimension scoring',
                body: 'Claude Sonnet analyzes the image directly and scores CTA strength, emotional appeal, brand clarity, and visual hierarchy — each with actionable feedback.',
              },
              {
                icon: '🔥',
                title: 'Viridis heatmap overlay',
                body: 'Every analysis produces a spatial heatmap showing which areas of your ad drive the strongest predicted neural activation.',
              },
            ].map(card => (
              <div
                key={card.title}
                className="group relative bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-6 transition-colors"
              >
                <div className="text-3xl mb-4">{card.icon}</div>
                <h3 className="font-semibold text-white mb-2">{card.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────── */}
        <section className="border-t border-gray-800/50 bg-gray-900/30">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-600 mb-12">
              How it works
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                {
                  step: '01',
                  title: 'Upload your ad',
                  body: 'Drag-and-drop one or more static ad images — JPEG, PNG, or WebP. Up to 25 images per batch.',
                },
                {
                  step: '02',
                  title: 'Dual-model analysis',
                  body: 'BERG encodes the image against fMRI responses across 6 visual cortex ROIs. Claude Sonnet scores the same image for ad-specific creative dimensions.',
                },
                {
                  step: '03',
                  title: 'Read the results',
                  body: 'View the spatial heatmap, ROI activation breakdown, and dimension scores with specific feedback. No performance guarantees — just signal.',
                },
              ].map(item => (
                <div key={item.step} className="flex flex-col gap-3">
                  <span className="text-4xl font-bold text-gray-800">{item.step}</span>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Brain regions + ad dimensions ───────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-20 space-y-14">
          <div>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
              Neural regions — BERG
            </p>
            <p className="text-center text-gray-500 text-sm mb-10 max-w-xl mx-auto">
              Each score reflects predicted activation in that visual cortex region when viewing your ad.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { key: 'FFA',   label: 'Face Detection' },
                { key: 'V1/V2', label: 'Low-Level Visual' },
                { key: 'V4',    label: 'Color & Form' },
                { key: 'LO',    label: 'Object Recognition' },
                { key: 'PPA',   label: 'Scene Context' },
                { key: 'VWFA',  label: 'Text Processing' },
              ].map(r => (
                <div
                  key={r.key}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 text-center"
                >
                  <p className="text-indigo-400 text-xs font-mono font-semibold">{r.key}</p>
                  <p className="text-gray-500 text-xs mt-1 leading-tight">{r.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
              Ad dimensions — Claude Sonnet
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'CTA', label: 'CTA Strength' },
                { key: 'EQ',  label: 'Emotional Appeal' },
                { key: 'BQ',  label: 'Brand Clarity' },
                { key: 'VH',  label: 'Visual Hierarchy' },
              ].map(r => (
                <div
                  key={r.key}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 text-center"
                >
                  <p className="text-violet-400 text-xs font-mono font-semibold">{r.key}</p>
                  <p className="text-gray-500 text-xs mt-1 leading-tight">{r.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────── */}
        <section className="border-t border-gray-800/50">
          <div className="max-w-2xl mx-auto px-6 py-24 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to see what your ad activates?
            </h2>
            <p className="text-gray-500 mb-8">
              Free. No credit card. 10 analyses per day.
            </p>
            <a
              href="/auth/signup"
              className="inline-block px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-900/40"
            >
              Start analyzing →
            </a>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800/50">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap gap-6 items-center justify-between text-xs text-gray-600">
          <p>
            Powered by{' '}
            <a
              href="https://github.com/gifale95/BERG"
              className="underline hover:text-gray-400 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              BERG fmri-nsd-fwrf
            </a>{' '}
            &mdash; Licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by-nc/4.0/"
              className="underline hover:text-gray-400 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC-BY-NC-4.0
            </a>
            . Experimental. No performance guarantees.
          </p>
          <div className="flex gap-5">
            <a href="/legal/terms" className="hover:text-gray-400 transition-colors">Terms</a>
            <a href="/legal/privacy" className="hover:text-gray-400 transition-colors">Privacy</a>
            <span>[YOUR COMPANY NAME]</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
