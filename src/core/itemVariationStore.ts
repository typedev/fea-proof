// GDEF ItemVariationStore — the delta store referenced by variable GPOS anchors
// (Anchor format 3 device tables with deltaFormat 0x8000 = VariationIndex). Used
// to move mark/base anchors as the design coordinate changes. Pure DataView math,
// no font object. Bounds-checked; returns null / 0 on anything malformed so the
// caller degrades to the default instance.

export interface VarRegion {
  /** One entry per fvar axis, in fvar order. F2Dot14 → float. */
  axes: { start: number; peak: number; end: number }[]
}
export interface VarData {
  regionIndexes: number[]
  /** deltaSets[item][i] aligns with regionIndexes[i]. */
  deltaSets: number[][]
}
export interface VarStore {
  regions: VarRegion[]
  data: VarData[]
}

const f2dot14 = (dv: DataView, off: number): number => dv.getInt16(off) / 16384

/** Parse an ItemVariationStore at absolute byte offset `base`. */
export function parseItemVariationStore(dv: DataView, base: number, bufLen: number): VarStore | null {
  try {
    if (base + 8 > bufLen) return null
    if (dv.getUint16(base) !== 1) return null
    const regionListOff = dv.getUint32(base + 2)
    const dataCount = dv.getUint16(base + 6)

    // VariationRegionList
    const rl = base + regionListOff
    const axisCount = dv.getUint16(rl)
    const regionCount = dv.getUint16(rl + 2)
    const regions: VarRegion[] = []
    for (let r = 0; r < regionCount; r++) {
      const rec = rl + 4 + r * axisCount * 6
      const axes: VarRegion['axes'] = []
      for (let a = 0; a < axisCount; a++) {
        const o = rec + a * 6
        axes.push({ start: f2dot14(dv, o), peak: f2dot14(dv, o + 2), end: f2dot14(dv, o + 4) })
      }
      regions.push({ axes })
    }

    const data: VarData[] = []
    for (let d = 0; d < dataCount; d++) {
      const vd = base + dv.getUint32(base + 8 + d * 4)
      const itemCount = dv.getUint16(vd)
      const wordDeltaCount = dv.getUint16(vd + 2)
      const regionIndexCount = dv.getUint16(vd + 4)
      const regionIndexes: number[] = []
      for (let i = 0; i < regionIndexCount; i++) regionIndexes.push(dv.getUint16(vd + 6 + i * 2))

      const longWords = (wordDeltaCount & 0x8000) !== 0
      const wordCount = Math.min(wordDeltaCount & 0x7fff, regionIndexCount)
      const wordSize = longWords ? 4 : 2
      const restSize = longWords ? 2 : 1
      const rowSize = wordCount * wordSize + (regionIndexCount - wordCount) * restSize

      let cursor = vd + 6 + regionIndexCount * 2
      const deltaSets: number[][] = []
      for (let it = 0; it < itemCount; it++) {
        if (cursor + rowSize > bufLen) break
        const row: number[] = []
        let p = cursor
        for (let i = 0; i < regionIndexCount; i++) {
          if (i < wordCount) {
            row.push(longWords ? dv.getInt32(p) : dv.getInt16(p))
            p += wordSize
          } else {
            row.push(longWords ? dv.getInt16(p) : dv.getInt8(p))
            p += restSize
          }
        }
        deltaSets.push(row)
        cursor += rowSize
      }
      data.push({ regionIndexes, deltaSets })
    }
    return { regions, data }
  } catch {
    return null
  }
}

/** OpenType region scalar for a normalized coordinate vector (fvar axis order). */
export function regionScalar(region: VarRegion, normCoords: number[]): number {
  let scalar = 1
  for (let a = 0; a < region.axes.length; a++) {
    const { start, peak, end } = region.axes[a]
    const c = normCoords[a] ?? 0
    if (peak === 0) continue
    if (c === peak) continue
    if (c < start || c > end) return 0
    if (c < peak) scalar *= (c - start) / (peak - start)
    else scalar *= (end - c) / (end - peak)
  }
  return scalar
}

/** Interpolated delta for one (outer, inner) variation index at the given coords. */
export function ivsDelta(store: VarStore, outer: number, inner: number, normCoords: number[]): number {
  const vd = store.data[outer]
  if (!vd) return 0
  const set = vd.deltaSets[inner]
  if (!set) return 0
  let sum = 0
  for (let i = 0; i < vd.regionIndexes.length; i++) {
    const region = store.regions[vd.regionIndexes[i]]
    if (!region) continue
    const s = regionScalar(region, normCoords)
    if (s !== 0) sum += set[i] * s
  }
  return sum
}
