import { parse, type Font } from 'opentype.js'
import { decompressWoff2 } from './woff2'
import type { LoadedFont } from './types'

const WOFF2_SIGNATURE = 0x774f4632 // 'wOF2'

let familyCounter = 0

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
  }
}
