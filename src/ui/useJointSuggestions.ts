import { useCallback, useMemo, useState } from 'react'
import type { ComponentId, Component, Joint, PartId, Part } from '../scene/types'
import {
  suggestJointsFor,
  suggestJointsForScene,
  synthHit,
  pairIdsOf,
} from '../scene/suggestJoints'
import type { JointSuggestion } from '../scene/suggestJoints'
import { suggestionOutlines } from '../scene/suggestionOutline'
import type { UseSceneResult } from '../scene/useScene'

type JointAdders = Pick<
  UseSceneResult,
  'onAddHalfLap' | 'onAddJoint' | 'onAddMortiseTenon' | 'onAddTongueGroove' | 'onAddFingerJoint'
>

// Everything the joint checklist and the viewport's hover preview share: the suggestions, which one
// (or which pair) is hovered, and applying one through the scene's own joint handlers.
export function useJointSuggestions(
  selectedId: PartId | null,
  parts: Part[],
  joints: Joint[],
  componentMap: Map<ComponentId, Component>,
  { onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddTongueGroove, onAddFingerJoint }: JointAdders,
) {
  const suggestions = useMemo(
    () => suggestJointsFor(selectedId, parts, joints, componentMap),
    [selectedId, parts, joints, componentMap],
  )

  const sceneSuggestions = useMemo(
    () => suggestJointsForScene(parts, joints, componentMap),
    [parts, joints, componentMap],
  )

  const [hoveredSuggestion, setHoveredSuggestion] = useState<JointSuggestion | null>(null)
  // Both boards tint, not just the "neighbour": scene rows have no selection to be relative to.
  // In the per-part panel this changes nothing visible, because the selected board's own cyan
  // takes precedence over the tint in the viewport.
  // A done checklist row has no suggestion to preview, so it tints both boards without drawing face
  // outlines. That is the complete answer for a jointed pair, not a degraded one: there is no
  // candidate geometry an outline could depict.
  const [hoveredPair, setHoveredPair] = useState<[PartId, PartId] | null>(null)
  const highlightedIds = useMemo(
    () => (hoveredSuggestion ? pairIdsOf(hoveredSuggestion) : hoveredPair),
    [hoveredSuggestion, hoveredPair],
  )
  const hoveredOutlines = useMemo(
    () => (hoveredSuggestion ? suggestionOutlines(hoveredSuggestion, parts, componentMap) : null),
    [hoveredSuggestion, parts, componentMap],
  )
  const applySuggestion = useCallback(
    (s: JointSuggestion) => {
      setHoveredSuggestion(null)
      switch (s.kind) {
        case 'halflap':
          return onAddHalfLap(s.partAId, s.partBId)
        case 'dado':
          return onAddJoint(
            synthHit(s.housingPartId, s.housingFace),
            synthHit(s.housedPartId, s.housedEnd),
          )
        case 'mortise-tenon':
          return onAddMortiseTenon(
            synthHit(s.mortisePartId, s.mortiseFace),
            synthHit(s.tenonPartId, s.tenonEnd),
          )
        case 'tongue-groove':
          return onAddTongueGroove(
            synthHit(s.groovePartId, s.grooveEdge),
            synthHit(s.tonguePartId, s.tongueEdge),
          )
        case 'finger':
          return onAddFingerJoint(synthHit(s.partAId, s.endA), synthHit(s.partBId, s.endB))
      }
    },
    [onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddTongueGroove, onAddFingerJoint],
  )

  return {
    suggestions,
    sceneSuggestions,
    setHoveredSuggestion,
    setHoveredPair,
    highlightedIds,
    hoveredOutlines,
    applySuggestion,
  }
}
