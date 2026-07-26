import { useCallback } from 'react'
import type { FaceHit, Part, PartId, CutId } from './types'
import { useSnap } from './useSnap'
import { useAddCut } from './useAddCut'
import type { DowelCutTool } from './useAddCut'
import { useAddJoint } from './useAddJoint'
import { useAddHalfLap } from './useAddHalfLap'
import { useAddMortiseTenon } from './useAddMortiseTenon'
import { useAddFingerJoint } from './useAddFingerJoint'

export type InteractionMode =
  | 'none'
  | 'snap'
  | 'cut'
  | 'dado'
  | 'halflap'
  | 'mortiseTenon'
  | 'finger'

export interface UseInteractionModeParams {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onSelect: (id: PartId | null) => void
  onRotationSnap: (id: PartId) => void
  onAddJoint: (housingHit: FaceHit, housedHit: FaceHit) => void
  onAddHalfLap: (aId: PartId, bId: PartId) => void
  onAddMortiseTenon: (mortiseHit: FaceHit, tenonHit: FaceHit) => void
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
}

export interface UseInteractionModeResult {
  activeMode: InteractionMode
  setMode: (mode: InteractionMode) => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  interactionActive: boolean
  snapPhase: 'idle' | 'source-picked'
  statuses: {
    dado: string | null
    halflap: string | null
    mortiseTenon: string | null
    finger: string | null
  }
  lastPlacedCutId: CutId | null
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
}

export function useInteractionMode(params: UseInteractionModeParams): UseInteractionModeResult {
  const { parts, onUpdate, onSelect, onRotationSnap } = params
  const snap = useSnap({ parts, onUpdate, onRotationSnap })
  const cut = useAddCut({ parts, onUpdate, onSelect })
  const joint = useAddJoint({ parts, onAddJoint: params.onAddJoint })
  const halfLap = useAddHalfLap({ parts, onAddHalfLap: params.onAddHalfLap })
  const mortiseTenon = useAddMortiseTenon({ parts, onAddMortiseTenon: params.onAddMortiseTenon })
  const finger = useAddFingerJoint({ parts, onAddFingerJoint: params.onAddFingerJoint })

  const activeMode: InteractionMode = snap.snapActive
    ? 'snap'
    : cut.cutActive
      ? 'cut'
      : joint.jointActive
        ? 'dado'
        : halfLap.halfLapActive
          ? 'halflap'
          : mortiseTenon.mortiseTenonActive
            ? 'mortiseTenon'
            : finger.fingerJointActive
              ? 'finger'
              : 'none'

  const { cancelSnap, activateSnap } = snap
  const { cancelCut, activateCut } = cut
  const { cancelJoint, activateJoint } = joint
  const { cancelHalfLap, activateHalfLap } = halfLap
  const { cancelMortiseTenon, activateMortiseTenon } = mortiseTenon
  const { cancelFingerJoint, activateFingerJoint } = finger

  const { onFaceClick: snapClick, onFaceHover: snapHover } = snap
  const { onFaceClick: cutClick, onFaceHover: cutHover } = cut
  const { onFaceClick: jointClick, onFaceHover: jointHover } = joint
  const { onFaceClick: halfLapClick, onFaceHover: halfLapHover } = halfLap
  const { onFaceClick: mtClick, onFaceHover: mtHover } = mortiseTenon
  const { onFaceClick: fingerClick, onFaceHover: fingerHover } = finger

  const setMode = useCallback(
    (mode: InteractionMode) => {
      // Cancel every mode except the target, then toggle the target (no target for 'none').
      // Behaviour-exact vs the old handleActivate<X> (cancel the other five, then toggle X).
      if (mode !== 'snap') cancelSnap()
      if (mode !== 'cut') cancelCut()
      if (mode !== 'dado') cancelJoint()
      if (mode !== 'halflap') cancelHalfLap()
      if (mode !== 'mortiseTenon') cancelMortiseTenon()
      if (mode !== 'finger') cancelFingerJoint()
      if (mode === 'snap') activateSnap()
      else if (mode === 'cut') activateCut()
      else if (mode === 'dado') activateJoint()
      else if (mode === 'halflap') activateHalfLap()
      else if (mode === 'mortiseTenon') activateMortiseTenon()
      else if (mode === 'finger') activateFingerJoint()
    },
    [
      cancelSnap,
      cancelCut,
      cancelJoint,
      cancelHalfLap,
      cancelMortiseTenon,
      cancelFingerJoint,
      activateSnap,
      activateCut,
      activateJoint,
      activateHalfLap,
      activateMortiseTenon,
      activateFingerJoint,
    ],
  )

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      switch (activeMode) {
        case 'snap':
          snapClick(hit)
          break
        case 'cut':
          cutClick(hit)
          break
        case 'dado':
          jointClick(hit)
          break
        case 'halflap':
          halfLapClick(hit)
          break
        case 'mortiseTenon':
          mtClick(hit)
          break
        case 'finger':
          fingerClick(hit)
          break
      }
    },
    [activeMode, snapClick, cutClick, jointClick, halfLapClick, mtClick, fingerClick],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      switch (activeMode) {
        case 'snap':
          snapHover(hit)
          break
        case 'cut':
          cutHover(hit)
          break
        case 'dado':
          jointHover(hit)
          break
        case 'halflap':
          halfLapHover(hit)
          break
        case 'mortiseTenon':
          mtHover(hit)
          break
        case 'finger':
          fingerHover(hit)
          break
      }
    },
    [activeMode, snapHover, cutHover, jointHover, halfLapHover, mtHover, fingerHover],
  )

  const sourceFace: FaceHit | null =
    activeMode === 'snap'
      ? snap.sourceFace
      : activeMode === 'dado'
        ? joint.pendingHousing
        : activeMode === 'halflap'
          ? halfLap.pendingA
          : activeMode === 'mortiseTenon'
            ? mortiseTenon.pendingMortise
            : activeMode === 'finger'
              ? finger.pendingA
              : null

  const hoveredFace: FaceHit | null =
    activeMode === 'snap'
      ? snap.hoveredFace
      : activeMode === 'dado'
        ? joint.hoveredFace
        : activeMode === 'halflap'
          ? halfLap.hoveredFace
          : activeMode === 'mortiseTenon'
            ? mortiseTenon.hoveredFace
            : activeMode === 'finger'
              ? finger.hoveredFace
              : null

  return {
    activeMode,
    setMode,
    onFaceClick,
    onFaceHover,
    sourceFace,
    hoveredFace,
    interactionActive: activeMode !== 'none',
    snapPhase: snap.snapPhase,
    statuses: {
      dado: joint.statusMessage,
      halflap: halfLap.statusMessage,
      mortiseTenon: mortiseTenon.statusMessage,
      finger: finger.statusMessage,
    },
    lastPlacedCutId: cut.lastPlacedCutId,
    dowelTool: cut.dowelTool,
    armDowelTool: cut.armDowelTool,
  }
}
