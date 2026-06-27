import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { coverageGlyphs, resolveLookup } from './glyphs'

interface Lookup {
  lookupType: number
  subtables?: unknown[]
}
interface GsubGposTable {
  lookups?: Lookup[]
}

// Positioning-only features don't make a glyph reachable/known in any meaningful
// sense; per the user's request these don't count as "participation".
const POSITIONING_ONLY = new Set(['kern', 'mark', 'mkmk'])

type Cov = Parameters<typeof coverageGlyphs>[0]
interface ClassDef {
  format?: number
  startGlyph?: number
  classes?: number[]
  ranges?: { start: number; end: number; classId: number }[]
}

function addClassDef(cd: ClassDef | undefined, out: Set<number>) {
  if (!cd) return
  if (cd.format === 1 && cd.classes) {
    for (let i = 0; i < cd.classes.length; i++) if (cd.classes[i] > 0) out.add((cd.startGlyph ?? 0) + i)
  }
  if (cd.format === 2 && cd.ranges) {
    for (const r of cd.ranges) for (let g = r.start; g <= r.end; g++) out.add(g)
  }
}

/** Collect every glyph id a single lookup references — inputs, context, outputs. */
function collectLookupGlyphs(lookup: Lookup, out: Set<number>) {
  const { subtables } = resolveLookup(lookup)
  for (const st of subtables as Record<string, unknown>[]) {
    const cov = (c: unknown) => {
      for (const g of coverageGlyphs(c as Cov)) out.add(g)
    }
    // Coverages (inputs, context, GPOS attachment) across all formats/tables.
    for (const key of [
      'coverage',
      'markCoverage',
      'baseCoverage',
      'ligatureCoverage',
      'mark1Coverage',
      'mark2Coverage',
    ]) {
      if (st[key]) cov(st[key])
    }
    for (const key of ['coverages', 'inputCoverage', 'backtrackCoverage', 'lookaheadCoverage']) {
      for (const c of (st[key] as unknown[]) ?? []) cov(c)
    }
    // Class definitions assign glyphs to classes — those glyphs participate.
    addClassDef(st.classDef as ClassDef, out)
    addClassDef(st.inputClassDef as ClassDef, out)
    addClassDef(st.backtrackClassDef as ClassDef, out)
    addClassDef(st.lookaheadClassDef as ClassDef, out)
    // Substitution outputs.
    if (typeof st.deltaGlyphId === 'number') {
      for (const g of coverageGlyphs(st.coverage as Cov)) out.add(g + (st.deltaGlyphId as number))
    }
    for (const g of (st.substitute as number[]) ?? []) out.add(g)
    for (const g of (st.substitutes as number[]) ?? []) out.add(g)
    for (const seq of (st.sequences as number[][]) ?? []) for (const g of seq) out.add(g)
    for (const alt of (st.alternateSets as number[][]) ?? []) for (const g of alt) out.add(g)
    for (const sets of (st.ligatureSets as { ligGlyph: number; components: number[] }[][]) ?? []) {
      for (const lig of sets ?? []) {
        out.add(lig.ligGlyph)
        for (const g of lig.components ?? []) out.add(g)
      }
    }
  }
}

export interface OrphanReport {
  /** Glyph ids with no Unicode that no feature (besides kern/mark/mkmk) touches. */
  orphans: number[]
  total: number
}

/**
 * Find "lost" glyphs: present in the font but unreachable by normal means — no
 * cmap entry AND not referenced by any GSUB feature or non-positioning GPOS
 * feature. Such glyphs can't be typed or produced by any feature toggle, so the
 * user would otherwise never know they exist.
 */
export function findOrphanGlyphs(
  font: Font,
  reverse: Map<number, number[]>,
  features: FeatureInfo[],
): OrphanReport {
  const tables = font.tables as Record<string, GsubGposTable | undefined>
  const referenced = new Set<number>()

  // All GSUB lookups participate (substitution = reachable/known).
  for (const lookup of tables.gsub?.lookups ?? []) collectLookupGlyphs(lookup, referenced)

  // GPOS lookups, except those owned only by kern/mark/mkmk.
  const excludedGpos = new Set<number>()
  for (const f of features) {
    if (!POSITIONING_ONLY.has(f.tag)) continue
    if (f.tables.includes('GSUB')) continue
    for (const occ of f.occurrences) for (const li of occ.lookupIndexes) excludedGpos.add(li)
  }
  const gposLookups = tables.gpos?.lookups ?? []
  gposLookups.forEach((lookup, i) => {
    if (!excludedGpos.has(i)) collectLookupGlyphs(lookup, referenced)
  })

  const total = font.glyphs.length
  const orphans: number[] = []
  for (let gid = 1; gid < total; gid++) {
    // gid 0 = .notdef, always present by spec.
    if (reverse.has(gid) || referenced.has(gid)) continue
    orphans.push(gid)
  }
  return { orphans, total }
}
