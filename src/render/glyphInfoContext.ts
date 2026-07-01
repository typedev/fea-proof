import { createContext, useContext } from 'react'
import type { Font } from 'opentype.js'

/**
 * Font handle + inverted cmap, provided once at the app root so any glyph cell
 * can resolve a glyph id to its name and Unicode code point(s) without
 * prop-drilling the `Font` through the whole preview tree. Powers the click-to-open
 * glyph-info popover (gid + U+ + name for the default/affected glyphs of a pair).
 */
export interface GlyphInfo {
  font: Font
  /** glyph id → Unicode code point(s) mapping to it (from `buildReverseCmap`). */
  reverseCmap: Map<number, number[]>
}

export const GlyphInfoContext = createContext<GlyphInfo | null>(null)

export function useGlyphInfo(): GlyphInfo | null {
  return useContext(GlyphInfoContext)
}
