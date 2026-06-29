import type { Font } from 'opentype.js'

// Variable-font axis model. opentype.js exposes `font.tables.fvar` with axes and
// named instances, but DROPS the per-axis `flags` field (its parseFvarAxis does
// `p.skip("uShort", 1)`), so the HIDDEN-axis flag is invisible from the parsed
// object. We recover it with a tiny manual read of the raw fvar bytes.

export interface VariationAxis {
  /** Axis tag, e.g. "wght". */
  tag: string
  /** Human-readable axis name (from the name table), falls back to the tag. */
  name: string
  min: number
  default: number
  max: number
  /** fvar axis flags bit 0x0001 — hidden axes get no slider but still render. */
  hidden: boolean
}

export interface NamedInstance {
  name: string
  /** Axis tag → user-space value. */
  coords: Record<string, number>
  postScriptName?: string
}

export interface FontVariations {
  axes: VariationAxis[]
  instances: NamedInstance[]
}

/** Read a 4-byte tag at a byte offset as Latin-1. */
function readTag(dv: DataView, off: number): string {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3))
}

/**
 * Locate an sfnt table by tag, returning its absolute byte offset (or null).
 * Walks the table directory: numTables u16 @4, then 16-byte records from offset
 * 12 (tag, checksum, offset u32 @+8, length). Shared with the FeatureVariations
 * parser. Never throws — returns null on any malformed read.
 */
export function findTable(sfnt: ArrayBuffer, tag: string): number | null {
  try {
    const dv = new DataView(sfnt)
    const numTables = dv.getUint16(4)
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16
      if (readTag(dv, rec) === tag) return dv.getUint32(rec + 8)
    }
  } catch {
    /* malformed */
  }
  return null
}

/**
 * Recover per-axis flags from the raw fvar table (opentype.js drops them).
 * Returns a tag → flags map; empty on any malformed read.
 */
export function parseAxisFlags(sfnt: ArrayBuffer): Record<string, number> {
  const out: Record<string, number> = {}
  try {
    const fvar = findTable(sfnt, 'fvar')
    if (fvar == null) return out
    const dv = new DataView(sfnt)
    const axesArrayOffset = dv.getUint16(fvar + 4)
    const axisCount = dv.getUint16(fvar + 8)
    const axisSize = dv.getUint16(fvar + 10)
    for (let i = 0; i < axisCount; i++) {
      const rec = fvar + axesArrayOffset + i * axisSize
      out[readTag(dv, rec)] = dv.getUint16(rec + 16)
    }
  } catch {
    /* malformed */
  }
  return out
}

interface OtAxis {
  tag: string
  minValue: number
  defaultValue: number
  maxValue: number
  name?: { en?: string }
}
interface OtInstance {
  name?: { en?: string }
  coordinates: Record<string, number>
  postScriptName?: { en?: string }
}

/** Parse fvar into a clean axis/instance model, or null if not a variable font. */
export function readVariations(font: Font, sfnt: ArrayBuffer): FontVariations | null {
  const fvar = (font.tables as Record<string, unknown>).fvar as
    | { axes?: OtAxis[]; instances?: OtInstance[] }
    | undefined
  if (!fvar?.axes?.length) return null

  const flags = parseAxisFlags(sfnt)
  const axes: VariationAxis[] = fvar.axes.map((a) => ({
    tag: a.tag,
    name: a.name?.en ?? a.tag,
    min: a.minValue,
    default: a.defaultValue,
    max: a.maxValue,
    hidden: ((flags[a.tag] ?? 0) & 0x0001) !== 0,
  }))
  const instances: NamedInstance[] = (fvar.instances ?? []).map((inst) => ({
    name: inst.name?.en ?? '',
    coords: inst.coordinates,
    postScriptName: inst.postScriptName?.en,
  }))
  return { axes, instances }
}

/** Default coordinate map (every axis at its default, hidden axes included). */
export function defaultCoords(axes: VariationAxis[]): Record<string, number> {
  return Object.fromEntries(axes.map((a) => [a.tag, a.default]))
}
