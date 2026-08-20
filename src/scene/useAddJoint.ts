import { useState, useCallback } from 'react'
import type { Component, ComponentId, FaceHit, Part } from './types'
import { isValidDadoSeat } from '../geom/dado'
import { localNormalToFaceString } from './snapMath'

export interface AddJointState {
  jointActive: boolean
  pendingHousing: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateJoint: () => void
  cancelJoint: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddJoint(params: {
  parts: Part[]
  byId: Map<ComponentId, Component>
  onAddJoint: (housingHit: FaceHit, housedHit: FaceHit) => void
}): AddJointState {
  const { parts, byId, onAddJoint } = params
  const [jointActive, setJointActive] = useState(false)
  const [pendingHousing, setPendingHousing] = useState<FaceHit | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const activateJoint = useCallback(() => {
    setJointActive((v) => !v)
    setPendingHousing(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const cancelJoint = useCallback(() => {
    setJointActive(false)
    setPendingHousing(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return

      if (pendingHousing === null) {
        setPendingHousing(hit)
        setStatusMessage(null)
        return
      }

      if (hit.partId === pendingHousing.partId) {
        setStatusMessage('Pick a different part for the housed board')
        setPendingHousing(null)
        return
      }
      const housing = parts.find((p) => p.id === pendingHousing.partId)
      if (housing?.kind !== 'board') {
        setPendingHousing(null)
        return
      }
      const housingFace = localNormalToFaceString(pendingHousing.localFaceNormal)
      const housedEnd = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidDadoSeat(housing, housingFace, part, housedEnd, byId)) {
        setStatusMessage('Housed board must be perpendicular to the housing face')
        setPendingHousing(null)
        return
      }

      onAddJoint(pendingHousing, hit)
      setPendingHousing(null)
      setJointActive(false)
      setHoveredFace(null)
    },
    [parts, byId, pendingHousing, onAddJoint],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(jointActive ? hit : null)
    },
    [jointActive],
  )

  return {
    jointActive,
    pendingHousing,
    statusMessage,
    hoveredFace,
    activateJoint,
    cancelJoint,
    onFaceClick,
    onFaceHover,
  }
}
