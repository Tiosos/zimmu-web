import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'

export interface AddHalfLapState {
  halfLapActive: boolean
  pendingA: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateHalfLap: () => void
  cancelHalfLap: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddHalfLap(params: {
  parts: Part[]
  onAddHalfLap: (aId: string, bId: string) => void
}): AddHalfLapState {
  const { parts, onAddHalfLap } = params
  const [halfLapActive, setHalfLapActive] = useState(false)
  const [pendingA, setPendingA] = useState<FaceHit | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const activateHalfLap = useCallback(() => {
    setHalfLapActive((v) => !v)
    setPendingA(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const cancelHalfLap = useCallback(() => {
    setHalfLapActive(false)
    setPendingA(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return
      if (pendingA === null) {
        setPendingA(hit)
        setStatusMessage(null)
        return
      }
      if (hit.partId === pendingA.partId) {
        setStatusMessage('Pick a different board for the second half of the lap')
        setPendingA(null)
        return
      }
      onAddHalfLap(pendingA.partId, hit.partId)
      setPendingA(null)
      setHalfLapActive(false)
      setHoveredFace(null)
    },
    [parts, pendingA, onAddHalfLap],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(halfLapActive ? hit : null)
    },
    [halfLapActive],
  )

  return {
    halfLapActive,
    pendingA,
    statusMessage,
    hoveredFace,
    activateHalfLap,
    cancelHalfLap,
    onFaceClick,
    onFaceHover,
  }
}
