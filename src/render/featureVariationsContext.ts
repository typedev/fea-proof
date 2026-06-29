import { createContext, useContext } from 'react'
import type { Font } from 'opentype.js'
import type { VariationAxis } from '../core/variations'
import type { AvarSegments } from '../core/coords'
import type { RvrnGroup } from '../core/featureVariations'

/**
 * GSUB FeatureVariations data, provided once per loaded font and consumed by the
 * FeatureCard of whichever feature a group substitutes (usually `rvrn`) — so the
 * conditional substitutions live inside the navigable feature list instead of a
 * separate, unlinked card.
 */
export interface FeatureVariationsData {
  font: Font
  axes: VariationAxis[]
  avar: AvarSegments
  /** Substitution groups keyed by the substituted feature tag (e.g. "rvrn"). */
  groupsByTag: Map<string, RvrnGroup[]>
}

export const FeatureVariationsContext = createContext<FeatureVariationsData | null>(null)

export const useFeatureVariations = (): FeatureVariationsData | null =>
  useContext(FeatureVariationsContext)
