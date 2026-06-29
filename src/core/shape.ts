// Thin wrapper over harfbuzzjs (wasm), used as an ANALYSIS engine — not a
// renderer. Previews still render via CSS; HarfBuzz tells us exactly which
// characters a feature changes (cluster diff) and lets us confirm contextual
// triggers. Loaded lazily so the wasm stays out of the initial bundle.

type HB = typeof import('harfbuzzjs')

let hbPromise: Promise<HB> | null = null
const getHb = (): Promise<HB> => (hbPromise ??= import('harfbuzzjs'))

export interface ShapeVariant {
  /** Feature settings as HarfBuzz strings, e.g. "liga", "calt=0", "ss01". */
  features?: string[]
  /** BCP-47 / OT language (drives locl), e.g. "sr-Cyrl". */
  language?: string
}

export interface ShapedGlyph {
  /** Glyph id. */
  g: number
  /** Source cluster (char index). */
  cl: number
  /** X advance (for detecting spacing-only changes like tnum/pnum). */
  ax: number
}

export interface Shaper {
  shape(text: string, variant?: ShapeVariant, script?: string): ShapedGlyph[]
  /**
   * Apply variation coordinates to the shared font. Pass the COMPLETE coord set
   * (every axis, including hidden ones) — HarfBuzz's setVariations resets any
   * omitted axis back to its default.
   */
  setVariations(coords: Record<string, number>): void
}

/** Whether HarfBuzz is available (wasm loaded). Used to gracefully degrade. */
export async function loadShaper(sfnt: ArrayBuffer): Promise<Shaper> {
  const hb = await getHb()
  const blob = new hb.Blob(sfnt)
  const face = new hb.Face(blob, 0)
  const font = new hb.Font(face)

  // Variation state lives on this single shared hb.Font. That is safe because
  // shaping is fully synchronous and there is one global coordinate set: every
  // before/after diff is taken at the same current coords, which is exactly what
  // we want. setVariations is the sole writer (called from one React effect).

  return {
    setVariations(coords) {
      font.setVariations(Object.entries(coords).map(([tag, v]) => new hb.Variation(tag, v)))
    },
    shape(text, variant = {}, script) {
      const buffer = new hb.Buffer()
      buffer.addText(text)
      buffer.guessSegmentProperties()
      if (script) buffer.setScript(script)
      if (variant.language) buffer.setLanguage(variant.language)
      const features = (variant.features ?? [])
        .map((s) => hb.Feature.fromString(s))
        .filter((f): f is NonNullable<typeof f> => !!f)
      hb.shape(font, buffer, features)
      return buffer
        .getGlyphInfosAndPositions()
        .map((i) => ({ g: i.codepoint, cl: i.cluster, ax: i.xAdvance ?? 0 }))
    },
  }
}

/**
 * Character-index ranges [start, end) whose shaping differs between two variants.
 * Glyphs are grouped by cluster (source char); a cluster whose glyph-id sequence
 * changes is marked, and its range spans to the next cluster boundary.
 */
export function changedRanges(
  shaper: Shaper,
  text: string,
  before: ShapeVariant,
  after: ShapeVariant,
  script?: string,
): [number, number][] {
  const sig = (run: ShapedGlyph[]): Map<number, string> => {
    const byCluster = new Map<number, number[]>()
    for (const { g, cl } of run) {
      const arr = byCluster.get(cl) ?? byCluster.set(cl, []).get(cl)!
      arr.push(g)
    }
    return new Map([...byCluster].map(([cl, gs]) => [cl, gs.join(',')]))
  }

  const a = sig(shaper.shape(text, before, script))
  const b = sig(shaper.shape(text, after, script))
  const starts = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y)

  const ranges: [number, number][] = []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]
    if (a.get(start) === b.get(start)) continue
    const end = i + 1 < starts.length ? starts[i + 1] : text.length
    const last = ranges[ranges.length - 1]
    if (last && last[1] === start) last[1] = end
    else ranges.push([start, end])
  }
  return ranges
}
