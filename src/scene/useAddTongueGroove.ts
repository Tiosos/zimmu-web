import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { localNormalToFaceString } from './snapMath'

export interface AddTongueGrooveState {
  tongueGrooveActive: boolean
  pendingA: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateTongueGroove: () => void
  cancelTongueGroove: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddTongueGroove(params: {
  parts: Part[]
  onAddTongueGroove: (grooveHit: FaceHit, tongueHit: FaceHit) => void
}): AddTongueGrooveState {
  const { parts, onAddTongueGroove } = params
  const [tongueGrooveActive, setActive] = useState(false)
  const [pendingA, setPending] = useState<FaceHit | null>(null)
  const [statusMessage, setStatus] = useState<string | null>(null)
  const [hoveredFace, setHovered] = useState<FaceHit | null>(null)

  const activateTongueGroove = useCallback(() => {
    setActive((v) => !v)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])
  const cancelTongueGroove = useCallback(() => {
    setActive(false)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return
      if (pendingA === null) {
        setPending(hit)
        setStatus(null)
        return
      }
      if (hit.partId === pendingA.partId) {
        setStatus('Pick a different board for the tongue edge')
        setPending(null)
        return
      }
      const groove = parts.find((p) => p.id === pendingA.partId)
      if (groove?.kind !== 'board') {
        setPending(null)
        return
      }
      const grooveEdge = localNormalToFaceString(pendingA.localFaceNormal)
      const tongueEdge = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidTongueGroove(groove, grooveEdge, part, tongueEdge)) {
        setStatus('Edges must be facing long edges of equal-thickness boards')
        setPending(null)
        return
      }
      onAddTongueGroove(pendingA, hit)
      setPending(null)
      setActive(false)
      setHovered(null)
    },
    [parts, pendingA, onAddTongueGroove],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHovered(tongueGrooveActive ? hit : null)
    },
    [tongueGrooveActive],
  )

  return {
    tongueGrooveActive,
    pendingA,
    statusMessage,
    hoveredFace,
    activateTongueGroove,
    cancelTongueGroove,
    onFaceClick,
    onFaceHover,
  }
}
