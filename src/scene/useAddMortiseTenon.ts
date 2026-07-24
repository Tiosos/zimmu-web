import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { localNormalToFaceString } from './snapMath'

export interface AddMortiseTenonState {
  mortiseTenonActive: boolean
  pendingMortise: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateMortiseTenon: () => void
  cancelMortiseTenon: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddMortiseTenon(params: {
  parts: Part[]
  onAddMortiseTenon: (mortiseHit: FaceHit, tenonHit: FaceHit) => void
}): AddMortiseTenonState {
  const { parts, onAddMortiseTenon } = params
  const [mortiseTenonActive, setActive] = useState(false)
  const [pendingMortise, setPending] = useState<FaceHit | null>(null)
  const [statusMessage, setStatus] = useState<string | null>(null)
  const [hoveredFace, setHovered] = useState<FaceHit | null>(null)

  const activateMortiseTenon = useCallback(() => {
    setActive((v) => !v)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])
  const cancelMortiseTenon = useCallback(() => {
    setActive(false)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return
      if (pendingMortise === null) {
        setPending(hit)
        setStatus(null)
        return
      }
      if (hit.partId === pendingMortise.partId) {
        setStatus('Pick a different board for the tenon')
        setPending(null)
        return
      }
      const mortise = parts.find((p) => p.id === pendingMortise.partId)
      if (mortise?.kind !== 'board') {
        setPending(null)
        return
      }
      const mortiseFace = localNormalToFaceString(pendingMortise.localFaceNormal)
      const tenonEnd = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidMortiseTenon(mortise, mortiseFace, part, tenonEnd)) {
        setStatus('Tenon end must be a board end perpendicular to the mortise face')
        setPending(null)
        return
      }
      onAddMortiseTenon(pendingMortise, hit)
      setPending(null)
      setActive(false)
      setHovered(null)
    },
    [parts, pendingMortise, onAddMortiseTenon],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHovered(mortiseTenonActive ? hit : null)
    },
    [mortiseTenonActive],
  )

  return {
    mortiseTenonActive,
    pendingMortise,
    statusMessage,
    hoveredFace,
    activateMortiseTenon,
    cancelMortiseTenon,
    onFaceClick,
    onFaceHover,
  }
}
