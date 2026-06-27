import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadFont } from './core/load'
import { analyzeFeatures } from './core/introspect'
import { buildReverseCmap } from './core/glyphs'
import { buildSubstGraph } from './core/substitution'
import { findCombinations, type CombinationGroup } from './core/combinations'
import { loadShaper, type Shaper } from './core/shape'
import { prepareSamples, type FeatureSample } from './samples'
import type { LoadedFont } from './core/types'
import { DropZone } from './ui/DropZone'
import { Header } from './ui/Header'
import { FeatureList } from './ui/FeatureList'
import { CombinationExplorer } from './ui/CombinationExplorer'
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
  const [combinations, setCombinations] = useState<CombinationGroup[]>([])
  const [shaper, setShaper] = useState<Shaper | undefined>(undefined)
  const [size, setSize] = useState(30)

  useEffect(() => {
    let cancelled = false
    setSamples(new Map())
    setShaper(undefined)
    setCombinations([])
    // HarfBuzz powers precise highlight diffs, interaction detection, and the
    // shaping-based combination grouping; degrade gracefully if it fails.
    loadShaper(loaded.sfnt)
      .catch(() => undefined)
      .then((sh) => {
        if (cancelled) return undefined
        setShaper(sh)
        const reverse = buildReverseCmap(loaded.font)
        const graph = buildSubstGraph(loaded.font, features)
        setCombinations(findCombinations(loaded.font, features, reverse, graph, sh))
        return prepareSamples(loaded.font, features, sh)
      })
      .then((result) => {
        if (!cancelled && result) setSamples(result)
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
      <CombinationExplorer
        groups={combinations}
        cssFamily={loaded.cssFamily}
        size={Math.max(size, 36)}
        shaper={shaper}
      />
    </div>
  )
}
