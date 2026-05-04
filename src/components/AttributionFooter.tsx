// Required on every page that shows BERG output. Must not be conditionally hidden.
export function AttributionFooter() {
  return (
    <footer className="mt-8 pt-4 border-t border-gray-800 text-xs text-gray-500 space-y-2">
      <p>
        Brain activation analysis powered by{' '}
        <a
          href="https://github.com/gifale95/BERG"
          className="underline hover:text-gray-300 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          BERG fmri-nsd-fwrf
        </a>{' '}
        (Gifale et al., Natural Scenes Dataset) — Licensed under{' '}
        <a
          href="https://creativecommons.org/licenses/by-nc/4.0/"
          className="underline hover:text-gray-300 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC-BY-NC-4.0
        </a>
        .
      </p>
      <p className="italic">
        This is an experimental brain response model. Results reflect predicted neural activation
        patterns, not guaranteed ad performance. This tool operates under CC-BY-NC-4.0 license
        for non-commercial research use only.
      </p>
    </footer>
  )
}
