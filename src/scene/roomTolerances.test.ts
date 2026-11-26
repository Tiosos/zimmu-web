import { describe, expect, it } from 'vitest'
import {
  cornerToleranceIssues,
  servicePointIssues,
  walkwayIssues,
} from './roomAssessment'
import { wallPlacementPose } from './roomGeometry'
import {
  DEFAULT_CLEARANCE_TOLERANCES,
  emptyRoomGeometry,
  type RoomGeometry,
  type ServicePoint,
} from './projectStructure'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent, Scene } from './types'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'base',
  label: 'Base',
  parentId: null,
  visible: true,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  params: CARCASE_PRESETS[0].params,
}
const scene: Scene = {
  parts: [],
  materials: PRESET_MATERIALS,
  hardware: [],
  joints: [],
  components: [cabinet],
}
const roomWithWalls = (): RoomGeometry => ({
  ...emptyRoomGeometry(),
  walls: [
    {
      id: 'north',
      name: 'North',
      start: { x: 0, y: 0 },
      end: { x: 3600, y: 0 },
    },
    {
      id: 'east',
      name: 'East',
      start: { x: 3600, y: 0 },
      end: { x: 3600, y: 2800 },
    },
  ],
})

describe('S5 room tolerances and services', () => {
  it('reports walkway gaps below the configured tolerance only', () => {
    const near: RoomGeometry = {
      ...emptyRoomGeometry(),
      obstacles: [
        {
          id: 'island',
          name: 'Island',
          position: { x: 1000, y: -400 },
          width: 300,
          depth: 400,
          height: 900,
        },
      ],
    }
    const nearIssues = walkwayIssues(near, scene, new Set([cabinet.id]), DEFAULT_CLEARANCE_TOLERANCES)
    expect(nearIssues.some((issue) => issue.includes('Island'))).toBe(true)

    const far: RoomGeometry = {
      ...emptyRoomGeometry(),
      obstacles: [
        {
          id: 'island',
          name: 'Island',
          position: { x: 3000, y: -400 },
          width: 300,
          depth: 400,
          height: 900,
        },
      ],
    }
    expect(walkwayIssues(far, scene, new Set([cabinet.id]), DEFAULT_CLEARANCE_TOLERANCES)).toEqual([])
  })

  it('uses the configured corner tolerance', () => {
    const warnings = [
      { cabinetId: 'return', available: 450 },
      { cabinetId: 'wide', available: 750 },
    ]
    const issues = cornerToleranceIssues(warnings, 600)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('return')
  })

  it('checks service offsets, sizes and obstructed positions', () => {
    const room: RoomGeometry = {
      ...roomWithWalls(),
      obstacles: [
        {
          id: 'post',
          name: 'Post',
          position: { x: 100, y: 100 },
          width: 400,
          depth: 400,
          height: 2400,
        },
      ],
    }
    const services: ServicePoint[] = [
      {
        id: 's1',
        roomId: 'room-1',
        kind: 'electrical',
        name: 'Outlet A',
        size: '13A',
        offset: { x: 5000, y: 0 },
        elevation: 300,
        source: 'Site survey',
      },
      {
        id: 's2',
        roomId: 'room-1',
        kind: 'water',
        name: 'Sink feed',
        size: '15mm',
        offset: { x: 200, y: 200 },
        elevation: 150,
        source: 'Plumber',
      },
    ]
    const issues = servicePointIssues(room, 'room-1', services)
    expect(issues.some((issue) => issue.includes('outside the drawn room bounds'))).toBe(true)
    expect(issues.some((issue) => issue.includes('inside a room obstacle'))).toBe(true)
  })

  it('keeps free wall placements out of the square-to-wall solve', () => {
    const room = roomWithWalls()
    const placement = {
      cabinetId: cabinet.id,
      wallId: 'north',
      offset: 1200,
      setback: 0,
      manualOffset: { x: 0, y: 0 },
      squareToWall: false,
    }
    expect(wallPlacementPose(room, placement)).toBeNull()
    expect(wallPlacementPose(room, { ...placement, squareToWall: true })).not.toBeNull()
  })
})
