import type { Font } from 'opentype.js'
import { findTable, type VariationAxis } from './variations'
import { coverageGlyphs, resolveLookup } from './glyphs'

// Manual parse of the GSUB FeatureVariations table (rvrn et al.). opentype.js
// does not expose it, so we read the raw sfnt bytes. All values big-endian;
// ConditionSet ranges are NORMALIZED axis coordinates (F2Dot14, -1..1), NOT
// user-space — converting back to user values needs avar and is left to the
// full rvrn proof; this first step surfaces the raw structure.

/** One axis range in a condition (normalized F2Dot14 coordinates). */
export interface AxisRange {
  axisIndex: number
  /** Axis tag (mapped from fvar axis order), or "" if out of range. */
  tag: string
  /** Normalized min (-1..1). */
  min: number
  /** Normalized max (-1..1). */
  max: number
}

/** One feature whose table is swapped for an alternate when conditions hold. */
export interface FeatureSubstitution {
  /** FeatureList index of the substituted feature. */
  featureIndex: number
  /** Lookup indexes of the ALTERNATE feature table (the rvrn-active lookups). */
  lookupIndexes: number[]
}

export interface FeatureVariationRecord {
  conditions: AxisRange[]
  substitutions: FeatureSubstitution[]
}

const f2dot14 = (dv: DataView, off: number): number => dv.getInt16(off) / 16384

/**
 * Read GSUB FeatureVariations into a flat record list, or null if the font has
 * none (GSUB < 1.1 or no FeatureVariations offset). Never throws — returns null
 * on any malformed read so callers can treat it as "no variations".
 */
export function readFeatureVariations(
  sfnt: ArrayBuffer,
  axes: VariationAxis[],
): FeatureVariationRecord[] | null {
  try {
    const gsub = findTable(sfnt, 'GSUB')
    if (gsub == null) return null
    const dv = new DataView(sfnt)

    const minorVersion = dv.getUint16(gsub + 2)
    if (minorVersion < 1) return null
    const fvOffset = dv.getUint32(gsub + 10) // Offset32, present only in GSUB 1.1+
    if (fvOffset === 0) return null
    const fv = gsub + fvOffset

    const count = dv.getUint32(fv + 4)
    const out: FeatureVariationRecord[] = []
    for (let i = 0; i < count; i++) {
      const rec = fv + 8 + i * 8
      const conditionSetOffset = dv.getUint32(rec)
      const substOffset = dv.getUint32(rec + 4)

      const conditions: AxisRange[] = []
      if (conditionSetOffset !== 0) {
        const cs = fv + conditionSetOffset
        const condCount = dv.getUint16(cs)
        for (let c = 0; c < condCount; c++) {
          const cond = cs + dv.getUint32(cs + 2 + c * 4)
          // Only format 1 (axis range) is read; other formats are skipped.
          if (dv.getUint16(cond) !== 1) continue
          const axisIndex = dv.getUint16(cond + 2)
          conditions.push({
            axisIndex,
            tag: axes[axisIndex]?.tag ?? '',
            min: f2dot14(dv, cond + 4),
            max: f2dot14(dv, cond + 6),
          })
        }
      }

      const substitutions: FeatureSubstitution[] = []
      if (substOffset !== 0) {
        const sub = fv + substOffset
        const subCount = dv.getUint16(sub + 4)
        for (let s = 0; s < subCount; s++) {
          const featureIndex = dv.getUint16(sub + 6 + s * 6)
          const altFeatureOffset = dv.getUint32(sub + 8 + s * 6) // relative to FeatureTableSubstitution
          const lookupIndexes: number[] = []
          if (altFeatureOffset !== 0) {
            const feat = sub + altFeatureOffset
            const lookupCount = dv.getUint16(feat + 2) // after featureParamsOffset (u16)
            for (let l = 0; l < lookupCount; l++) lookupIndexes.push(dv.getUint16(feat + 4 + l * 2))
          }
          substitutions.push({ featureIndex, lookupIndexes })
        }
      }

      out.push({ conditions, substitutions })
    }
    return out
  } catch {
    return null
  }
}

interface GsubLookups {
  gsub?: { lookups?: { lookupType: number; subtables?: unknown[] }[]; features?: { tag: string }[] }
}

/** Input→output glyph pairs of a Single Substitution (type 1) lookup. */
function singleSubPairs(font: Font, lookupIndex: number): { inGid: number; outGid: number }[] {
  const lookups = (font.tables as GsubLookups).gsub?.lookups ?? []
  const lookup = lookups[lookupIndex]
  if (!lookup) return []
  const { type, subtables } = resolveLookup(lookup)
  if (type !== 1) return []
  const pairs: { inGid: number; outGid: number }[] = []
  for (const st of subtables) {
    const coverage = st.coverage as Parameters<typeof coverageGlyphs>[0]
    const ins = coverageGlyphs(coverage)
    const substitute = st.substitute as number[] | undefined
    const delta = st.deltaGlyphId as number | undefined
    if (Array.isArray(substitute)) {
      // Format 2: substitute[] parallel to coverage index order.
      ins.forEach((g, i) => substitute[i] != null && pairs.push({ inGid: g, outGid: substitute[i] }))
    } else if (typeof delta === 'number') {
      // Format 1: output = input + delta.
      for (const g of ins) pairs.push({ inGid: g, outGid: g + delta })
    }
  }
  return pairs
}

/** A coherent set of glyph substitutions one alternate lookup activates. */
export interface RvrnGroup {
  lookupIndex: number
  /** Human label from the common output glyph-name suffix (e.g. "italic"), or "". */
  label: string
  /** Feature tags whose table this lookup belongs to (usually just "rvrn"). */
  featureTags: string[]
  /** Condition sets (normalized axis ranges) that activate this lookup. */
  conditionSets: AxisRange[][]
  pairs: { inGid: number; outGid: number }[]
}

/** Most common `.suffix` among the output glyph names (drops the leading dot). */
function commonSuffix(font: Font, pairs: { outGid: number }[]): string {
  const counts = new Map<string, number>()
  for (const p of pairs) {
    const name = font.glyphs.get(p.outGid)?.name ?? ''
    const dot = name.indexOf('.')
    const suffix = dot >= 0 ? name.slice(dot + 1) : ''
    if (suffix) counts.set(suffix, (counts.get(suffix) ?? 0) + 1)
  }
  let best = ''
  let bestN = 0
  for (const [s, n] of counts) if (n > bestN) [best, bestN] = [s, n]
  return best
}

/**
 * Group GSUB FeatureVariations substitutions by alternate lookup — each group is
 * a coherent "these glyphs become this variant under these conditions" set. This
 * is what answers "which glyphs does rvrn affect": the input→output glyph pairs,
 * rendered from their outlines (the outputs are non-cmapped variant glyphs).
 */
export function rvrnSubstitutionGroups(
  font: Font,
  sfnt: ArrayBuffer,
  axes: VariationAxis[],
): RvrnGroup[] {
  const records = readFeatureVariations(sfnt, axes)
  if (!records) return []
  const featureList = (font.tables as GsubLookups).gsub?.features ?? []

  // lookupIndex → { conditionSets, featureIndexes }
  const byLookup = new Map<number, { conditionSets: AxisRange[][]; featureIndexes: Set<number> }>()
  for (const rec of records) {
    for (const sub of rec.substitutions) {
      for (const li of sub.lookupIndexes) {
        let entry = byLookup.get(li)
        if (!entry) byLookup.set(li, (entry = { conditionSets: [], featureIndexes: new Set() }))
        entry.conditionSets.push(rec.conditions)
        entry.featureIndexes.add(sub.featureIndex)
      }
    }
  }

  const groups: RvrnGroup[] = []
  for (const [lookupIndex, entry] of byLookup) {
    const pairs = singleSubPairs(font, lookupIndex)
    if (pairs.length === 0) continue
    groups.push({
      lookupIndex,
      label: commonSuffix(font, pairs),
      featureTags: [...new Set([...entry.featureIndexes].map((i) => featureList[i]?.tag ?? `#${i}`))],
      conditionSets: entry.conditionSets,
      pairs,
    })
  }
  return groups.sort((a, b) => a.lookupIndex - b.lookupIndex)
}
