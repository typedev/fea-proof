import { createContext, useContext } from 'react'

/**
 * The loaded font's renderable code points (its cmap set). Carried through the
 * tree so the inline demo-word pickers (`inlineSamples`) can reject words the
 * font can't fully render — otherwise a missing glyph falls back to a system
 * font and the word reads as broken. Undefined means "unknown, don't filter".
 */
export const SupportedCodepointsContext = createContext<Set<number> | undefined>(undefined)

export const useSupportedCodepoints = () => useContext(SupportedCodepointsContext)
