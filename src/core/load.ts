import { parse, type Font } from 'opentype.js'
import { decompressWoff2 } from './woff2'
import type { LoadedFont } from './types'
import { readVariations, findTable } from './variations'
import { buildSupportedCodepoints } from './glyphs'

const WOFF2_SIGNATURE = 0x774f4632 // 'wOF2'

let familyCounter = 0

/**
 * True if the font carries an `avar` table of version 2+ (avar2). avar2 remaps
 * coordinates across axes via a VarStore, typically driving dozens of parametric
 * axes from a few designer axes. Detected from raw sfnt bytes — the first uint16
 * of the `avar` table is its majorVersion.
 *
 * TODO(avar2): support is DEFERRED. HarfBuzz (our shaper/outline engine) handles
 * avar2 fine, but (a) browser FontFace rendering — which every CSS preview relies
 * on — is unreliable for avar2 (wrong design instance on engines without avar2,
 * and a renderer crash observed in testing), and (b) our coordinate math
 * (`coords.ts`) reads only avar1 segment maps, ignoring the avar2 VarStore. Rather
 * than the large change of rendering every preview via HarfBuzz outlines, the plan
 * is: build a SEPARATE throwaway app to experiment with avar2 fonts (HB-rendered
 * previews, avar2 coordinate resolution via the existing `parseItemVariationStore`,
 * a many-axes UI driven by STAT), and once it works, port that code back here. For
 * now we refuse such fonts up front so the app never crashes on one.
 */
function usesAvar2(sfnt: ArrayBuffer): boolean {
  const off = findTable(sfnt, 'avar')
  if (off == null) return false
  try {
    return new DataView(sfnt).getUint16(off) >= 2
  } catch {
    return false
  }
}

/**
 * opentype.js v2 exposes names under platform sub-objects (windows/macintosh/unicode),
 * each a record of { langTag: string }. Older shapes put the record at the top level.
 * Pick the most reasonable string for a given name key.
 */
function pickName(names: unknown, key: string): string {
  if (!names || typeof names !== 'object') return ''
  const n = names as Record<string, unknown>

  const firstString = (v: unknown): string => {
    if (!v || typeof v !== 'object') return typeof v === 'string' ? v : ''
    const rec = v as Record<string, unknown>
    if (typeof rec.en === 'string') return rec.en
    const vals = Object.values(rec).filter((x): x is string => typeof x === 'string')
    return vals[0] ?? ''
  }

  for (const platform of ['windows', 'macintosh', 'unicode']) {
    const platformNames = n[platform]
    if (platformNames && typeof platformNames === 'object') {
      const s = firstString((platformNames as Record<string, unknown>)[key])
      if (s) return s
    }
  }
  return firstString(n[key])
}

function collectScripts(font: Font): string[] {
  const tags = new Set<string>()
  const tables = font.tables as Record<string, { scripts?: Array<{ tag: string }> }>
  for (const tableName of ['gsub', 'gpos']) {
    const scripts = tables[tableName]?.scripts
    if (Array.isArray(scripts)) {
      for (const s of scripts) if (s?.tag) tags.add(s.tag.trim() || s.tag)
    }
  }
  return [...tags].sort()
}

/** Convert a Uint8Array view to a standalone ArrayBuffer. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/**
 * Load a font file: decompress woff2 if needed (opentype.js can't read woff2 natively),
 * parse it for introspection, and register it as a FontFace for CSS-based previews.
 * Everything stays in the browser — nothing is uploaded.
 */
export async function loadFont(file: File): Promise<LoadedFont> {
  const original = await file.arrayBuffer()
  if (original.byteLength < 4) throw new Error('File is too small to be a font.')

  const signature = new DataView(original).getUint32(0)
  const isWoff2 = signature === WOFF2_SIGNATURE

  // sfnt buffer for opentype.js (decompressed if woff2)
  const sfnt = isWoff2 ? toArrayBuffer(await decompressWoff2(new Uint8Array(original))) : original

  // avar2 fonts are refused BEFORE opentype.parse / FontFace (both can choke on
  // them) — see usesAvar2's TODO. Detection is a cheap raw-byte read, so it's safe.
  if (usesAvar2(sfnt)) {
    throw new Error(
      "This font uses avar2 — a complex variable-font model (many axes driven by an " +
        "axis-to-axis mapping). Browser preview rendering is unreliable for avar2 and " +
        "could destabilize the page, so the font wasn't loaded. avar2 support is " +
        "planned separately.",
    )
  }

  let font: Font
  try {
    font = parse(sfnt)
  } catch (err) {
    throw new Error(`Could not parse font: ${(err as Error).message}`)
  }

  // The browser's FontFace can decode all four formats directly, so register the
  // ORIGINAL bytes (woff2 included) for rendering.
  const cssFamily = `feaproof-${++familyCounter}`
  const face = new FontFace(cssFamily, original)
  await face.load()
  document.fonts.add(face)

  return {
    font,
    fileName: file.name,
    familyName: pickName(font.names, 'fontFamily') || 'Unknown',
    subfamilyName: pickName(font.names, 'fontSubfamily') || '',
    version: pickName(font.names, 'version') || '',
    cssFamily,
    scripts: collectScripts(font),
    hasGsub: !!(font.tables as Record<string, unknown>).gsub,
    sfnt,
    supportedCodepoints: buildSupportedCodepoints(font),
    variations: readVariations(font, sfnt),
  }
}
