import { useState, useCallback } from 'react'
import type { Component, ComponentId, FaceHit, Part } from './types'
import { isValidFingerJoint } from '../geom/fingerjoint'
import { localNormalToFaceString } from './snapMath'

export interface AddFingerJointState {
  fingerJointActive: boolean
  pendingA: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateFingerJoint: () => void
  cancelFingerJoint: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddFingerJoint(params: {
  parts: Part[]
  byId: Map<ComponentId, Component>
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
}): AddFingerJointState {
  const { parts, byId, onAddFingerJoint } = params
  const [fingerJointActive, setActive] = useState(false)
  const [pendingA, setPending] = useState<FaceHit | null>(null)
  const [statusMessage, setStatus] = useState<string | null>(null)
  const [hoveredFace, setHovered] = useState<FaceHit | null>(null)

  const activateFingerJoint = useCallback(() => {
    setActive((v) => !v)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])
  const cancelFingerJoint = useCallback(() => {
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
        setStatus('Pick a different board for the second end')
        setPending(null)
        return
      }
      const a = parts.find((p) => p.id === pendingA.partId)
      if (a?.kind !== 'board') {
        setPending(null)
        return
      }
      const endA = localNormalToFaceString(pendingA.localFaceNormal)
      const endB = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidFingerJoint(a, endA, part, endB, byId)) {
        setStatus('Both ends must form a right-angle corner of equal width')
        setPending(null)
        return
      }
      onAddFingerJoint(pendingA, hit)
      setPending(null)
      setActive(false)
      setHovered(null)
    },
    [parts, byId, pendingA, onAddFingerJoint],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHovered(fingerJointActive ? hit : null)
    },
    [fingerJointActive],
  )

  return {
    fingerJointActive,
    pendingA,
    statusMessage,
    hoveredFace,
    activateFingerJoint,
    cancelFingerJoint,
    onFaceClick,
    onFaceHover,
  }
}
