import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadFont } from './core/load'
import { analyzeFeatures } from './core/introspect'
import { prepareSamples, type FeatureSample } from './samples'
import type { LoadedFont } from './core/types'
import { DropZone } from './ui/DropZone'
import { Header } from './ui/Header'
import { FeatureList } from './ui/FeatureList'
import { Controls } from './ui/Controls'

type Theme = 'light' | 'dark'

export function App() {
  const [loaded, setLoaded] = useState<LoadedFont | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const handleFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const result = await loadFont(file)
      setLoaded(result)
    } catch (err) {
      setError((err as Error).message)
      setLoaded(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-sm font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
            OpenType Features Proof
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            See what your font's OpenType features actually do — on real words.
          </p>
        </header>

        {!loaded && <DropZone onFile={handleFile} busy={busy} />}

        {error && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {loaded && (
          <Loaded
            loaded={loaded}
            onFile={handleFile}
            busy={busy}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
      </div>
    </div>
  )
}

function Loaded({
  loaded,
  onFile,
  busy,
  theme,
  onToggleTheme,
}: {
  loaded: LoadedFont
  onFile: (file: File) => void
  busy: boolean
  theme: Theme
  onToggleTheme: () => void
}) {
  const features = useMemo(() => analyzeFeatures(loaded.font), [loaded])
  const [samples, setSamples] = useState<Map<string, FeatureSample>>(new Map())
  const [size, setSize] = useState(30)

  useEffect(() => {
    let cancelled = false
    setSamples(new Map())
    prepareSamples(loaded.font, features).then((result) => {
      if (!cancelled) setSamples(result)
    })
    return () => {
      cancelled = true
    }
  }, [loaded, features])

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Header loaded={loaded} />
        </div>
        <div className="w-56 shrink-0">
          <DropZone onFile={onFile} busy={busy} compact />
        </div>
      </div>
      <Controls size={size} onSize={setSize} theme={theme} onToggleTheme={onToggleTheme} />
      <FeatureList features={features} samples={samples} cssFamily={loaded.cssFamily} size={size} />
    </div>
  )
}
