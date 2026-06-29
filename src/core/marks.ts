import type { Font } from 'opentype.js'

// Base/mark inventory for the mark·mkmk explorer. opentype.js does NOT parse GPOS
// mark subtables (they come back as {error}), but it DOES parse the GDEF
// GlyphClassDef (`font.tables.gdef.classDef`), which classifies every glyph:
// classId 1 = base, 2 = ligature, 3 = mark, 4 = component. That's enough to list
// the bases (left column) and combining marks (right column); the actual anchor
// geometry is a later phase (manual GPOS parse).

/** A base glyph the user can attach marks to (GDEF class 1, cmap-reachable). */
export interface BaseGlyph {
  gid: number
  cp: number
  char: string
}

/**
 * A mark glyph (GDEF class 3). `cp`/`char` are undefined for non-cmapped marks —
 * excluded from the v1 columns, but kept in `allMarks` so a later anchor-based
 * phase can place them directly.
 */
export interface MarkGlyph {
  gid: number
  cp?: number
  char?: string
  /** cp exists AND is a Unicode combining mark (\p{M}). */
  combining: boolean
}

export interface MarkInventory {
  bases: BaseGlyph[]
  /** Combining + cmapped marks — the v1 right column. */
  marks: MarkGlyph[]
  /** Every GDEF class-3 glyph (foundation for the anchor phase). */
  allMarks: MarkGlyph[]
  source: 'gdef' | 'heuristic' | 'none'
}

interface ClassDef {
  format?: number
  startGlyph?: number
  classes?: number[]
  ranges?: { start: number; end: number; classId: number }[]
}

/** Glyph id → GDEF class id (1 base, 2 ligature, 3 mark, 4 component), or null. */
function readGlyphClasses(font: Font): Map<number, number> | null {
  const gdef = (font.tables as Record<string, { classDef?: ClassDef } | undefined>).gdef
  const cd = gdef?.classDef
  if (!cd) return null
  const map = new Map<number, number>()
  if (cd.format === 1 && cd.classes) {
    const start = cd.startGlyph ?? 0
    cd.classes.forEach((cls, i) => {
      if (cls > 0) map.set(start + i, cls)
    })
  } else if (cd.ranges) {
    for (const r of cd.ranges) {
      for (let g = r.start; g <= r.end; g++) if (r.classId > 0) map.set(g, r.classId)
    }
  }
  return map.size > 0 ? map : null
}

const isMark = /\p{M}/u
const isLetter = /\p{L}/u

/** Lowest cmap codepoint for a glyph id, or undefined. */
function primaryCp(reverse: Map<number, number[]>, gid: number): number | undefined {
  const cps = reverse.get(gid)
  if (!cps || cps.length === 0) return undefined
  return Math.min(...cps)
}

/**
 * Build the base/mark inventory. Prefers GDEF GlyphClassDef; falls back to a cmap
 * heuristic (letters → bases, combining marks → marks) when GDEF lacks it. Never
 * throws — returns an empty inventory (`source: 'none'`) if nothing is usable.
 */
export function buildMarkInventory(font: Font, reverse: Map<number, number[]>): MarkInventory {
  const classes = readGlyphClasses(font)
  const bases: BaseGlyph[] = []
  const allMarks: MarkGlyph[] = []

  if (classes) {
    for (const [gid, cls] of classes) {
      if (cls === 1) {
        const cp = primaryCp(reverse, gid)
        if (cp !== undefined) bases.push({ gid, cp, char: String.fromCodePoint(cp) })
      } else if (cls === 3) {
        const cp = primaryCp(reverse, gid)
        const char = cp !== undefined ? String.fromCodePoint(cp) : undefined
        allMarks.push({ gid, cp, char, combining: char !== undefined && isMark.test(char) })
      }
    }
    return finish(bases, allMarks, 'gdef')
  }

  // Fallback: classify by Unicode category via the cmap.
  let any = false
  for (const [gid, cps] of reverse) {
    const cp = Math.min(...cps)
    const char = String.fromCodePoint(cp)
    if (isMark.test(char)) {
      allMarks.push({ gid, cp, char, combining: true })
      any = true
    } else if (isLetter.test(char)) {
      bases.push({ gid, cp, char })
      any = true
    }
  }
  return finish(bases, allMarks, any ? 'heuristic' : 'none')
}

function finish(bases: BaseGlyph[], allMarks: MarkGlyph[], source: MarkInventory['source']): MarkInventory {
  const byCp = <T extends { cp?: number; gid: number }>(a: T, b: T) =>
    (a.cp ?? Infinity) - (b.cp ?? Infinity) || a.gid - b.gid
  bases.sort(byCp)
  allMarks.sort(byCp)
  return { bases, marks: allMarks.filter((m) => m.combining), allMarks, source }
}

/** Whether the mark explorer is worth offering (has both bases and combining marks). */
export function hasMarkInventory(inv: MarkInventory): boolean {
  return inv.bases.length > 0 && inv.marks.length > 0
}
