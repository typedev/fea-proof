import { createContext, useContext } from 'react'

/**
 * Current `font-variation-settings` string for every preview ('normal' when the
 * font has no axes or none are set). Provided once at the top of a loaded font's
 * subtree (App) and read by each render site, so axis coordinates don't have to
 * be prop-drilled through FeatureList → FeatureCard → every preview component.
 */
export const VariationSettingsContext = createContext<string>('normal')

export const useVariationSettings = (): string => useContext(VariationSettingsContext)
