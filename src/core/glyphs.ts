import type { Font } from 'opentype.js'

interface Coverage {
  format: number
  glyphs?: number[]
  ranges?: { start: number; end: number }[]
}

interface Lookup {
  lookupType: number
  subtables?: unknown[]
}

/** Map glyph id → list of Unicode code points that map to it (inverted cmap). */
export function buildReverseCmap(font: Font): Map<number, number[]> {
  const cmap = (font.tables as Record<string, { glyphIndexMap?: Record<string, number> }>).cmap
  const glyphIndexMap = cmap?.glyphIndexMap ?? {}
  const reverse = new Map<number, number[]>()
  for (const codePoint in glyphIndexMap) {
    const gid = glyphIndexMap[codePoint]
    const existing = reverse.get(gid)
    if (existing) existing.push(Number(codePoint))
    else reverse.set(gid, [Number(codePoint)])
  }
  return reverse
}

/**
 * The set of Unicode code points the font can render directly (has a cmap entry
 * for). Used to reject word samples that contain a glyph the font lacks — those
 * would otherwise fall back to a system font and read as broken (e.g. Vietnamese
 * đ/ư on a font that only happens to carry a currency sign, or Greek words on a
 * font whose only "Greek" is the µ/π/Ω math symbols).
 */
export function buildSupportedCodepoints(font: Font): Set<number> {
  const cmap = (font.tables as Record<string, { glyphIndexMap?: Record<string, number> }>).cmap
  const glyphIndexMap = cmap?.glyphIndexMap ?? {}
  const set = new Set<number>()
  for (const codePoint in glyphIndexMap) set.add(Number(codePoint))
  return set
}

/** Expand a Coverage table into a flat list of glyph ids. */
export function coverageGlyphs(coverage: Coverage | undefined): number[] {
  if (!coverage) return []
  if (coverage.format === 1) return coverage.glyphs ?? []
  if (coverage.format === 2) {
    const glyphs: number[] = []
    for (const range of coverage.ranges ?? []) {
      for (let g = range.start; g <= range.end; g++) glyphs.push(g)
    }
    return glyphs
  }
  return []
}

/**
 * Resolve a lookup to its effective type and subtables, unwrapping
 * Extension Substitution (GSUB lookupType 7).
 */
export function resolveLookup(lookup: Lookup): { type: number; subtables: Record<string, unknown>[] } {
  const subtables = (lookup.subtables ?? []) as Record<string, unknown>[]
  if (lookup.lookupType === 7) {
    const first = subtables[0]
    const type = (first?.extensionLookupType as number) ?? (first?.lookupType as number) ?? 7
    const unwrapped = subtables.map((s) => (s.extension as Record<string, unknown>) ?? s)
    return { type, subtables: unwrapped }
  }
  return { type: lookup.lookupType, subtables }
}
