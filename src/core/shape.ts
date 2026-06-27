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

export interface Shaper {
  /** Shape text → glyphs with their source cluster (char index). */
  shape(text: string, variant?: ShapeVariant, script?: string): { g: number; cl: number }[]
}

/** Whether HarfBuzz is available (wasm loaded). Used to gracefully degrade. */
export async function loadShaper(sfnt: ArrayBuffer): Promise<Shaper> {
  const hb = await getHb()
  const blob = new hb.Blob(sfnt)
  const face = new hb.Face(blob, 0)
  const font = new hb.Font(face)

  return {
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
      return buffer.getGlyphInfosAndPositions().map((i) => ({ g: i.codepoint, cl: i.cluster }))
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
  const sig = (run: { g: number; cl: number }[]): Map<number, string> => {
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
