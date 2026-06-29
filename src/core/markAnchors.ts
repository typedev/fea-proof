import { findTable } from './variations'
import { ivsDelta, parseItemVariationStore, type VarStore } from './itemVariationStore'

// Raw GPOS parse of mark (MarkBasePos, type 4) and mkmk (MarkMarkPos, type 6)
// attachment, straight from the sfnt bytes — opentype.js returns {error} for
// these subtables. We only need anchor X/Y (default instance; fmt3 variation
// deltas + fmt2 contour points are ignored). The math is verified against
// HarfBuzz: mark-to-base markPos = baseAnchor − markAnchor; mkmk markPos =
// mark2Pos + mark2Anchor − mark1Anchor.

export interface Anchor {
  x: number
  y: number
  /** Variable fonts: GDEF ItemVariationStore index for the X coord (fmt3 device). */
  xVar?: { outer: number; inner: number }
  yVar?: { outer: number; inner: number }
}

/** A concrete anchor point (variation deltas already resolved). */
export interface Point {
  x: number
  y: number
}

/** mark gid → its class + anchor, within one subtable. */
type MarkMap = Map<number, { cls: number; anchor: Anchor }>
/** base / mark2 gid → (class → anchor), for the classes it defines. */
type AttachMap = Map<number, Map<number, Anchor>>

interface MarkBaseSubtable {
  marks: MarkMap
  bases: AttachMap
}
interface MarkMarkSubtable {
  marks: MarkMap // mark1 (the attaching mark)
  mark2s: AttachMap // mark2 (the mark being attached to)
}

export interface MarkAnchors {
  base: MarkBaseSubtable[]
  mkmk: MarkMarkSubtable[]
  hasMark: boolean
  hasMkmk: boolean
  /** GDEF ItemVariationStore for variable anchor deltas (null if static/absent). */
  store: VarStore | null
}

/** {baseAnchor, markAnchor} — for mkmk, baseAnchor is the mark2 anchor. */
export interface AttachPair {
  baseAnchor: Anchor
  markAnchor: Anchor
}

export interface Placed {
  gid: number
  x: number
  y: number
}

const EMPTY: MarkAnchors = { base: [], mkmk: [], hasMark: false, hasMkmk: false, store: null }

/** A fmt3 anchor device offset → VariationIndex {outer,inner}, or undefined. */
function readVarIndex(dv: DataView, off: number): { outer: number; inner: number } | undefined {
  // VariationIndex: u16 outer (StartSize), u16 inner (EndSize), u16 deltaFormat.
  // deltaFormat 0x8000 = variation index; 0x0001..0x0003 = a real (static) Device.
  if (dv.getUint16(off + 4) === 0x8000) return { outer: dv.getUint16(off), inner: dv.getUint16(off + 2) }
  return undefined
}

function readAnchor(dv: DataView, off: number): Anchor {
  // formats 1/2/3 all share: u16 format, i16 x, i16 y.
  const a: Anchor = { x: dv.getInt16(off + 2), y: dv.getInt16(off + 4) }
  if (dv.getUint16(off) === 3) {
    // fmt3: Offset16 xDevice @+6, Offset16 yDevice @+8 (rel to anchor start).
    const xDev = dv.getUint16(off + 6)
    const yDev = dv.getUint16(off + 8)
    if (xDev) a.xVar = readVarIndex(dv, off + xDev)
    if (yDev) a.yVar = readVarIndex(dv, off + yDev)
  }
  return a
}

/** Coverage table → array indexed by coverage index (arr[i] = glyph id). */
function readCoverage(dv: DataView, off: number): number[] {
  const out: number[] = []
  const format = dv.getUint16(off)
  if (format === 1) {
    const count = dv.getUint16(off + 2)
    for (let i = 0; i < count; i++) out[i] = dv.getUint16(off + 4 + i * 2)
  } else if (format === 2) {
    const rangeCount = dv.getUint16(off + 2)
    for (let r = 0; r < rangeCount; r++) {
      const rec = off + 4 + r * 6
      const start = dv.getUint16(rec)
      const end = dv.getUint16(rec + 2)
      const startCov = dv.getUint16(rec + 4)
      for (let g = start; g <= end; g++) out[startCov + (g - start)] = g
    }
  }
  return out
}

/** MarkArray → mark gid → {class, anchor}, paired with its coverage. */
function readMarkArray(dv: DataView, off: number, coverage: number[]): MarkMap {
  const map: MarkMap = new Map()
  const count = dv.getUint16(off)
  if (count !== coverage.length) return map // misaligned → drop (anchors would mis-pair)
  for (let i = 0; i < count; i++) {
    const rec = off + 2 + i * 4
    const cls = dv.getUint16(rec)
    const anchorOff = dv.getUint16(rec + 2)
    if (anchorOff !== 0) map.set(coverage[i], { cls, anchor: readAnchor(dv, off + anchorOff) })
  }
  return map
}

/** A "base array" (BaseArray / Mark2Array): per glyph, an anchor per class. */
function readAttachArray(dv: DataView, off: number, coverage: number[], classCount: number): AttachMap {
  const map: AttachMap = new Map()
  const count = dv.getUint16(off)
  if (count !== coverage.length) return map
  for (let i = 0; i < count; i++) {
    const recBase = off + 2 + i * classCount * 2
    const byClass = new Map<number, Anchor>()
    for (let c = 0; c < classCount; c++) {
      const anchorOff = dv.getUint16(recBase + c * 2)
      if (anchorOff !== 0) byClass.set(c, readAnchor(dv, off + anchorOff))
    }
    if (byClass.size > 0) map.set(coverage[i], byClass)
  }
  return map
}

function parseMarkBase(dv: DataView, st: number): MarkBaseSubtable {
  const markCov = readCoverage(dv, st + dv.getUint16(st + 2))
  const baseCov = readCoverage(dv, st + dv.getUint16(st + 4))
  const classCount = dv.getUint16(st + 6)
  const marks = readMarkArray(dv, st + dv.getUint16(st + 8), markCov)
  const bases = readAttachArray(dv, st + dv.getUint16(st + 10), baseCov, classCount)
  return { marks, bases }
}

function parseMarkMark(dv: DataView, st: number): MarkMarkSubtable {
  const mark1Cov = readCoverage(dv, st + dv.getUint16(st + 2))
  const mark2Cov = readCoverage(dv, st + dv.getUint16(st + 4))
  const classCount = dv.getUint16(st + 6)
  const marks = readMarkArray(dv, st + dv.getUint16(st + 8), mark1Cov)
  const mark2s = readAttachArray(dv, st + dv.getUint16(st + 10), mark2Cov, classCount)
  return { marks, mark2s }
}

/** Parse all mark/mkmk attachment from a font's GPOS. Never throws. */
export function parseMarkAnchors(sfnt: ArrayBuffer): MarkAnchors {
  const base: MarkBaseSubtable[] = []
  const mkmk: MarkMarkSubtable[] = []
  try {
    const gpos = findTable(sfnt, 'GPOS')
    if (gpos == null) return EMPTY
    const dv = new DataView(sfnt)
    const ll = gpos + dv.getUint16(gpos + 8) // lookupList offset
    const lookupCount = dv.getUint16(ll)
    for (let i = 0; i < lookupCount; i++) {
      const lk = ll + dv.getUint16(ll + 2 + i * 2)
      const type = dv.getUint16(lk)
      const subCount = dv.getUint16(lk + 4)
      for (let s = 0; s < subCount; s++) {
        let st = lk + dv.getUint16(lk + 6 + s * 2)
        let eff = type
        if (type === 9) {
          // Extension: u16 format, u16 extLookupType, Offset32 extOffset (rel st).
          eff = dv.getUint16(st + 2)
          st = st + dv.getUint32(st + 4)
        }
        if (dv.getUint16(st) !== 1) continue // only format 1 exists for types 4/6
        if (eff === 4) base.push(parseMarkBase(dv, st))
        else if (eff === 6) mkmk.push(parseMarkMark(dv, st))
      }
    }
  } catch {
    /* malformed — return whatever parsed */
  }
  return { base, mkmk, hasMark: base.length > 0, hasMkmk: mkmk.length > 0, store: parseGdefVarStore(sfnt) }
}

/** GDEF ItemVariationStore (v1.3+), for variable anchor deltas. Null if absent. */
function parseGdefVarStore(sfnt: ArrayBuffer): VarStore | null {
  try {
    const gdef = findTable(sfnt, 'GDEF')
    if (gdef == null) return null
    const dv = new DataView(sfnt)
    if (dv.getUint16(gdef + 2) < 3) return null // itemVarStore only in GDEF 1.3+
    const off = dv.getUint32(gdef + 14) // Offset32, rel GDEF
    if (off === 0) return null
    return parseItemVariationStore(dv, gdef + off, sfnt.byteLength)
  } catch {
    return null
  }
}

/** Resolve an anchor to a concrete point, applying variation deltas at `normCoords`. */
export function resolveAnchor(a: Anchor, store: VarStore | null, normCoords: number[] | null): Point {
  if (!store || !normCoords) return { x: a.x, y: a.y }
  return {
    x: a.xVar ? a.x + Math.round(ivsDelta(store, a.xVar.outer, a.xVar.inner, normCoords)) : a.x,
    y: a.yVar ? a.y + Math.round(ivsDelta(store, a.yVar.outer, a.yVar.inner, normCoords)) : a.y,
  }
}

/** Can mark attach to base? Returns the anchor pair (first matching subtable). */
export function attachToBase(ma: MarkAnchors, baseGid: number, markGid: number): AttachPair | null {
  for (const t of ma.base) {
    const m = t.marks.get(markGid)
    if (!m) continue
    const a = t.bases.get(baseGid)?.get(m.cls)
    if (a) return { baseAnchor: a, markAnchor: m.anchor }
  }
  return null
}

/** Can mark1 (newer) stack onto mark2 (existing) via mkmk? */
export function attachToMark(ma: MarkAnchors, mark2Gid: number, mark1Gid: number): AttachPair | null {
  for (const t of ma.mkmk) {
    const m = t.marks.get(mark1Gid)
    if (!m) continue
    const a = t.mark2s.get(mark2Gid)?.get(m.cls)
    if (a) return { baseAnchor: a, markAnchor: m.anchor }
  }
  return null
}

/**
 * Position a base + ordered marks in font units (base at origin). Each mark
 * stacks onto the previously-placed mark (mkmk) if a rule exists, else attaches
 * to the base. Marks with no rule are returned in `unplaceable`.
 */
export function placeMarks(
  ma: MarkAnchors,
  baseGid: number,
  markGids: number[],
  resolve: (a: Anchor) => Point = (a) => ({ x: a.x, y: a.y }),
): { placed: Placed[]; unplaceable: number[]; anchorsUsed: Point[] } {
  const placed: Placed[] = [{ gid: baseGid, x: 0, y: 0 }]
  const unplaceable: number[] = []
  const anchorsUsed: Point[] = []
  let prev: Placed | null = null
  for (const g of markGids) {
    let pair = prev ? attachToMark(ma, prev.gid, g) : null
    let host = prev
    if (!pair) {
      pair = attachToBase(ma, baseGid, g)
      host = placed[0]
    }
    if (!pair || !host) {
      unplaceable.push(g)
      continue
    }
    // Both base and mark anchors can carry variation deltas — resolve each.
    const ba = resolve(pair.baseAnchor)
    const ka = resolve(pair.markAnchor)
    const p: Placed = { gid: g, x: host.x + ba.x - ka.x, y: host.y + ba.y - ka.y }
    anchorsUsed.push({ x: host.x + ba.x, y: host.y + ba.y })
    placed.push(p)
    prev = p
  }
  return { placed, unplaceable, anchorsUsed }
}
