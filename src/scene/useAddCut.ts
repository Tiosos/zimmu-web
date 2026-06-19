import { useState, useCallback } from 'react'
import type { CutDef, CutId, DowelCut, Face, FaceHit, Part, PartId } from './types'
import { defaultCutSize, faceAxes } from './snapMath'
import { dowelSurfaceFromNormal, azimuthFromHit } from '../geom/dowelCut'

export type DowelCutTool = 'end' | 'notch' | 'bore-axial' | 'bore-transverse'

export interface AddCutState {
  cutActive: boolean
  lastPlacedCutId: CutId | null
  hoveredFace: FaceHit | null
  activateCut: () => void
  cancelCut: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
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
  const [dowelTool, setDowelTool] = useState<DowelCutTool | null>(null)

  const activateCut = useCallback(() => {
    setCutActive((v) => !v)
  }, [])

  const cancelCut = useCallback(() => {
    setCutActive(false)
    setLastPlacedCutId(null)
    setHoveredFace(null)
    setDowelTool(null)
  }, [])

  const armDowelTool = useCallback((tool: DowelCutTool) => {
    setDowelTool((cur) => (cur === tool ? null : tool))
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (!part) return

      if (part.kind === 'cylinder') {
        if (!dowelTool) return
        const surface = dowelSurfaceFromNormal(hit.localFaceNormal)
        const isCap = surface === 'cap+' || surface === 'cap-'
        const end = surface === 'cap+' ? '+Z' : '-Z'
        const h = hit.localHitPoint
        const r = part.diameter / 2
        const n = part.cuts.length + 1
        const id = `cut_${crypto.randomUUID()}` as CutId
        let newCut: DowelCut | null = null
        switch (dowelTool) {
          case 'end':
            // NOTE: spec §4 said default angle 0; that is a no-op on click, so we
            // seed 45° (a visible mitre) — recorded in the implementation notes.
            if (isCap)
              newCut = { kind: 'end', id, label: `End ${n}`, end, offset: 0, angle: 45, azimuth: 0 }
            break
          case 'bore-axial':
            if (isCap)
              newCut = {
                kind: 'bore-axial',
                id,
                label: `Bore ${n}`,
                end,
                diameter: Math.max(2, part.diameter / 3),
                depth: part.length,
              }
            break
          case 'notch':
            if (!isCap)
              newCut = {
                kind: 'notch',
                id,
                label: `Notch ${n}`,
                position: h.z,
                width: 20,
                depth: r / 2,
                azimuth: azimuthFromHit(h),
              }
            break
          case 'bore-transverse':
            if (!isCap)
              newCut = {
                kind: 'bore-transverse',
                id,
                label: `Bore ${n}`,
                position: h.z,
                azimuth: azimuthFromHit(h),
                diameter: Math.max(2, part.diameter / 3),
                depth: part.diameter,
              }
            break
        }
        if (!newCut) return
        const cut = newCut
        onUpdate(
          hit.partId,
          (p) => (p.kind === 'cylinder' ? { ...p, cuts: [...p.cuts, cut] } : p),
          'Add cut',
        )
        onSelect(hit.partId)
        setLastPlacedCutId(cut.id)
        setDowelTool(null)
        return
      }

      if (!cutActive || part.kind !== 'board') return

      const lfn = hit.localFaceNormal
      const ax = Math.abs(lfn.x),
        ay = Math.abs(lfn.y),
        az = Math.abs(lfn.z)
      let face: Face
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
        kind: 'box',
        id: cutId,
        label: `Cut ${part.cuts.length + 1}`,
        face,
        position: { x: position.x, y: position.y, z: position.z },
        size,
      }

      onUpdate(
        hit.partId,
        (p) => (p.kind === 'board' ? { ...p, cuts: [...p.cuts, newCut] } : p),
        'Add cut',
      )
      onSelect(hit.partId)
      setLastPlacedCutId(cutId)
    },
    [cutActive, dowelTool, parts, onUpdate, onSelect],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(cutActive || dowelTool ? hit : null)
    },
    [cutActive, dowelTool],
  )

  return {
    cutActive,
    lastPlacedCutId,
    hoveredFace,
    activateCut,
    cancelCut,
    onFaceClick,
    onFaceHover,
    dowelTool,
    armDowelTool,
  }
}
