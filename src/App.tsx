import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadFont } from './core/load'
import { analyzeFeatures } from './core/introspect'
import { buildReverseCmap } from './core/glyphs'
import { buildSubstGraph } from './core/substitution'
import { findCombinations, type CombinationGroup } from './core/combinations'
import { findOrphanGlyphs } from './core/inspect'
import { OrphanGlyphs } from './ui/OrphanGlyphs'
import { loadShaper, type Shaper } from './core/shape'
import { prepareSamples, type FeatureSample } from './samples'
import type { LoadedFont } from './core/types'
import { defaultCoords } from './core/variations'
import { toVariationSettings } from './render/featureSettings'
import { VariationSettingsContext } from './render/variationContext'
import { DropZone } from './ui/DropZone'
import { Header } from './ui/Header'
import { FeatureList } from './ui/FeatureList'
import { CombinationExplorer } from './ui/CombinationExplorer'
import { Controls } from './ui/Controls'
import { rvrnSubstitutionGroups } from './core/featureVariations'
import { readAvarSegments, inConditionCoords } from './core/coords'
import { buildMarkInventory, hasMarkInventory } from './core/marks'
import { MarkExplorer } from './ui/MarkExplorer'
import type { FeatureInfo } from './core/types'
import { FeatureVariationsContext, type FeatureVariationsData } from './render/featureVariationsContext'

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
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
              OpenType Features Proof
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              See what your font's OpenType features actually do — on real words.
            </p>
          </div>
          <a
            href="https://github.com/typedev/fea-proof"
            target="_blank"
            rel="noreferrer noopener"
            title="View source on GitHub"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
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
  const orphans = useMemo(
    () => findOrphanGlyphs(loaded.font, buildReverseCmap(loaded.font), features).orphans,
    [loaded, features],
  )
  const [samples, setSamples] = useState<Map<string, FeatureSample>>(new Map())
  const [combinations, setCombinations] = useState<CombinationGroup[]>([])
  const [shaper, setShaper] = useState<Shaper | undefined>(undefined)
  const [size, setSize] = useState(30)

  const variations = loaded.variations
  const [coords, setCoords] = useState<Record<string, number>>(() =>
    variations ? defaultCoords(variations.axes) : {},
  )
  // Reset to the default instance whenever a new font loads.
  useEffect(() => {
    setCoords(variations ? defaultCoords(variations.axes) : {})
  }, [variations])
  const varSettings = useMemo(() => toVariationSettings(coords), [coords])

  // Mark·mkmk explorer: base/mark inventory (from GDEF), and which feature opened it.
  const markInventory = useMemo(
    () => buildMarkInventory(loaded.font, buildReverseCmap(loaded.font)),
    [loaded],
  )
  const [markExplorer, setMarkExplorer] = useState<FeatureInfo | null>(null)

  // GSUB FeatureVariations (rvrn): grouped substitutions, keyed by the feature
  // tag they substitute, so each renders inside that feature's (navigable) card.
  const featureVariations = useMemo<FeatureVariationsData | null>(() => {
    if (!variations) return null
    const groups = rvrnSubstitutionGroups(loaded.font, loaded.sfnt, variations.axes)
    if (groups.length === 0) return null
    const base = defaultCoords(variations.axes)
    const groupsByTag = new Map<string, typeof groups>()
    const applyByLookup = new Map<number, Record<string, number>>()
    for (const g of groups) {
      for (const tag of g.featureTags) {
        const list = groupsByTag.get(tag)
        if (list) list.push(g)
        else groupsByTag.set(tag, [g])
      }
      // Coordinates that make this group fire (first condition set), so the user
      // can jump there and see the substitution in the live proofs.
      if (g.conditionSets[0]) applyByLookup.set(g.lookupIndex, inConditionCoords(variations.axes, g.conditionSets[0], base))
    }
    return {
      font: loaded.font,
      axes: variations.axes,
      avar: readAvarSegments(loaded.font, variations.axes),
      groupsByTag,
      applyByLookup,
      onApply: setCoords,
    }
  }, [loaded, variations])
  // Keep the shared HarfBuzz font at the current coordinates so lazily-computed
  // shape diffs (e.g. expanding an affected-glyph grid) stay coordinate-accurate.
  useEffect(() => {
    shaper?.setVariations(coords)
  }, [shaper, coords])

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
    <VariationSettingsContext.Provider value={varSettings}>
      <FeatureVariationsContext.Provider value={featureVariations}>
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <Header loaded={loaded} />
          </div>
          <div className="w-56 shrink-0">
            <DropZone onFile={onFile} busy={busy} compact />
          </div>
        </div>
        <Controls
          size={size}
          onSize={setSize}
          theme={theme}
          onToggleTheme={onToggleTheme}
          features={features}
          hasCombinations={combinations.length > 0}
          hasOrphans={orphans.length > 0}
          axes={variations?.axes ?? []}
          instances={variations?.instances ?? []}
          coords={coords}
          onCoords={setCoords}
        />
        <FeatureList
          features={features}
          samples={samples}
          cssFamily={loaded.cssFamily}
          size={size}
          shaper={shaper}
          onOpenMarkExplorer={hasMarkInventory(markInventory) ? setMarkExplorer : undefined}
        />
        <CombinationExplorer
          groups={combinations}
          cssFamily={loaded.cssFamily}
          size={Math.max(size, 36)}
          shaper={shaper}
        />
        <OrphanGlyphs font={loaded.font} gids={orphans} size={size} />
      </div>
      {markExplorer && (
        <MarkExplorer font={loaded.font} sfnt={loaded.sfnt} onClose={() => setMarkExplorer(null)} />
      )}
      </FeatureVariationsContext.Provider>
    </VariationSettingsContext.Provider>
  )
}
