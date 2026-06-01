import { useState, useCallback } from 'react'
import type { CutDef, CutId, FaceHit, Part, PartId } from './types'
import { defaultCutSize, faceAxes } from './snapMath'

export interface AddCutState {
  cutActive: boolean
  lastPlacedCutId: CutId | null
  hoveredFace: FaceHit | null
  activateCut: () => void
  cancelCut: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddCut(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
  onSelect: (id: PartId) => void
}): AddCutState {
  const { parts, onUpdate, onSelect } = params
  const [cutActive, setCutActive] = useState(false)
  const [lastPlacedCutId, setLastPlacedCutId] = useState<CutId | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const activateCut = useCallback(() => {
    setCutActive((v) => !v)
  }, [])

  const cancelCut = useCallback(() => {
    setCutActive(false)
    setLastPlacedCutId(null)
    setHoveredFace(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      if (!cutActive) return
      const part = parts.find((p) => p.id === hit.partId)
      if (!part || part.kind !== 'board') return

      const lfn = hit.localFaceNormal
      const ax = Math.abs(lfn.x),
        ay = Math.abs(lfn.y),
        az = Math.abs(lfn.z)
      let face: CutDef['face']
      if (ax >= ay && ax >= az) face = lfn.x > 0 ? '+X' : '-X'
      else if (ay >= ax && ay >= az) face = lfn.y > 0 ? '+Y' : '-Y'
      else face = lfn.z > 0 ? '+Z' : '-Z'

      const size = defaultCutSize(face)
      const axes = faceAxes(face)
      const h = hit.localHitPoint
      const boardDim: Record<string, number> = { x: part.length, y: part.width, z: part.thickness }

      const position: Record<string, number> = { x: 0, y: 0, z: 0 }
      position[axes.depth] = face.startsWith('+') ? boardDim[axes.depth] - size[axes.depth] : 0
      position[axes.u] = h[axes.u] - size[axes.u] / 2
      position[axes.v] = h[axes.v] - size[axes.v] / 2

      const cutId = `cut_${crypto.randomUUID()}` as CutId
      const newCut: CutDef = {
        id: cutId,
        label: `Cut ${part.cuts.length + 1}`,
        face,
        position: { x: position.x, y: position.y, z: position.z },
        size,
      }

      onUpdate(hit.partId, (p) => ({ ...p, cuts: [...p.cuts, newCut] }), 'Add cut')
      onSelect(hit.partId)
      setLastPlacedCutId(cutId)
    },
    [cutActive, parts, onUpdate, onSelect],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(cutActive ? hit : null)
    },
    [cutActive],
  )

  return {
    cutActive,
    lastPlacedCutId,
    hoveredFace,
    activateCut,
    cancelCut,
    onFaceClick,
    onFaceHover,
  }
}
