import { useState, useEffect, useCallback } from 'react'
import type { FaceHit, Part, PartId, Vec3 } from './types'
import { computeSnapDelta } from './snapMath'

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

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function vecLen(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
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
      if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return

      const delta = computeSnapDelta(sourceFace!, hit)
      if (vecLen(delta) < 0.001) {
        // Already flush — reset to idle without a history entry
        setSourceFace(null)
        setSnapPhase('idle')
        return
      }

      const src = sourceFace!
      const sourceLabel = parts.find((p) => p.id === src.partId)?.label ?? src.partId
      const targetLabel = parts.find((p) => p.id === hit.partId)?.label ?? hit.partId

      onUpdate(
        src.partId,
        (p) => ({
          ...p,
          position: {
            x: p.position.x + delta.x,
            y: p.position.y + delta.y,
            z: p.position.z + delta.z,
          },
        }),
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
      if (hit && dot(sourceFace!.faceNormal, hit.faceNormal) > 0) {
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
