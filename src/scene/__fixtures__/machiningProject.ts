import { manufacturingProject } from './manufacturingProject'
import type { BoardPart, CylinderPart } from '../types'

export function machiningProject() {
  const scene = manufacturingProject()
  scene.components = [scene.components[0]]
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board' || p.id === 'manual-round')
  const board = scene.parts[0] as BoardPart
  const round = scene.parts[1] as CylinderPart
  board.parentId = scene.components[0].id
  board.visible = false
  board.operations![0].sourceComponentId = 'jig-owner'
  board.cuts = [
    {
      kind: 'box',
      id: 'rebate',
      label: 'Rebate',
      face: '+Z',
      position: { x: 0, y: 0, z: 12 },
      size: { x: 30, y: 30, z: 6 },
      sourceComponentId: 'rebate-owner',
    },
    { kind: 'mitre', id: 'bevel', label: 'Bevel', end: '+X', axis: 'Z', angle: 45 },
    {
      kind: 'hole-array',
      id: 'row',
      label: 'Clearance row',
      face: '+Z',
      axis: 'U',
      start: { x: 40, y: 32, z: 18 },
      pitch: 32,
      count: 3,
      diameter: 5,
      depth: 18,
      sourceJointId: 'screw-owner',
    },
  ]
  round.cuts.push(
    { kind: 'notch', id: 'notch', label: 'Notch', position: 50, width: 10, depth: 2, azimuth: 0 },
    {
      kind: 'bore-axial',
      id: 'axial',
      label: 'Axial',
      end: '-Z',
      diameter: 3,
      depth: round.length,
    },
    {
      kind: 'bore-transverse',
      id: 'cross',
      label: 'Cross',
      position: 100,
      azimuth: 90,
      diameter: 3,
      depth: 4,
    },
  )
  return scene
}
