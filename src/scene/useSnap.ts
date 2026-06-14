import { useState, useEffect, useCallback } from 'react'
import type { FaceHit, Part, PartId } from './types'
import { computeSnapTransform } from './snapMath'

export interface SnapState {
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  activateSnap: () => void
  cancelSnap: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useSnap(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
}): SnapState {
  const { parts, onUpdate } = params

  const [snapActive, setSnapActive] = useState(false)
  const [snapPhase, setSnapPhase] = useState<'idle' | 'source-picked'>('idle')
  const [sourceFace, setSourceFace] = useState<FaceHit | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const cancelSnap = useCallback(() => {
    setSnapActive(false)
    setSnapPhase('idle')
    setSourceFace(null)
    setHoveredFace(null)
  }, [])

  const activateSnap = useCallback(() => {
    if (snapActive) {
      cancelSnap()
    } else {
      setSnapActive(true)
      setSnapPhase('idle')
    }
  }, [snapActive, cancelSnap])

  // Cancel if source part is deleted while snap is in progress
  useEffect(() => {
    if (sourceFace && !parts.find((p) => p.id === sourceFace.partId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cancelSnap()
    }
  }, [parts, sourceFace, cancelSnap])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      if (!snapActive) return

      if (snapPhase === 'idle') {
        setSourceFace(hit)
        setSnapPhase('source-picked')
        return
      }

      // source-picked: apply guards then snap
      if (hit.partId === sourceFace!.partId) return

      const srcFace = sourceFace!
      const srcPart = parts.find((p) => p.id === srcFace.partId)
      if (!srcPart || srcPart.kind !== 'board') return
      const { position, rotation } = computeSnapTransform(srcFace, hit, srcPart)

      const noMove =
        Math.abs(position.x - srcPart.position.x) < 0.001 &&
        Math.abs(position.y - srcPart.position.y) < 0.001 &&
        Math.abs(position.z - srcPart.position.z) < 0.001 &&
        Math.abs(rotation.x - srcPart.rotation.x) < 0.001 &&
        Math.abs(rotation.y - srcPart.rotation.y) < 0.001 &&
        Math.abs(rotation.z - srcPart.rotation.z) < 0.001
      if (noMove) {
        setSourceFace(null)
        setSnapPhase('idle')
        return
      }

      const sourceLabel = parts.find((p) => p.id === srcFace.partId)?.label ?? srcFace.partId
      const targetLabel = parts.find((p) => p.id === hit.partId)?.label ?? hit.partId
      onUpdate(
        srcFace.partId,
        (p) => ({ ...p, position, rotation }),
        `Snap ${sourceLabel} to ${targetLabel}`,
      )

      setSourceFace(null)
      setSnapPhase('idle')
      // snapActive stays true — chained snaps
    },
    [snapActive, snapPhase, sourceFace, parts, onUpdate],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      if (!snapActive) {
        setHoveredFace(null)
        return
      }
      if (snapPhase === 'idle') {
        setHoveredFace(null)
        return
      }
      if (hit?.partId === sourceFace?.partId) {
        setHoveredFace(null)
        return
      }
      setHoveredFace(hit)
    },
    [snapActive, snapPhase, sourceFace],
  )

  return {
    snapActive,
    snapPhase,
    sourceFace,
    hoveredFace,
    activateSnap,
    cancelSnap,
    onFaceClick,
    onFaceHover,
  }
}
