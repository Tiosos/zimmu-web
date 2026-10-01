import { describe, expect, it } from 'vitest'
import { buildWallElevation, lengthLabel } from './wallElevation'
import { kitchenWall, SITE, wallCabinet, wallScene } from './__fixtures__/wallElevation'
import type { RoomGeometry } from '../scene/projectStructure'
import type { AssemblyDim } from './assembly'

const build = (f = kitchenWall()) =>
  buildWallElevation(f.room, f.room.walls[0], f.scene, f.cabinetIds)
const chain = (view: ReturnType<typeof build>) =>
  view.dims.filter((d) => d.axis === 'h' && d.ring === 1).sort((a, b) => a.start - b.start)

describe('buildWallElevation', () => {
  it('breaks one chain at every cabinet and opening edge, and it sums to the wall', () => {
    const view = build()
    const segments = chain(view)
    expect(segments.map((s) => s.label)).toEqual(['1000', '600', '200', '1200', '983'])
    expect(segments[0].start).toBe(0)
    for (let i = 1; i < segments.length; i++) expect(segments[i].start).toBeCloseTo(segments[i - 1].end)
    expect(segments.reduce((sum, s) => sum + (s.end - s.start), 0)).toBeCloseTo(3983)
    expect(segments.every((s) => s.side === 'below')).toBe(true)
  })

  it('reads the first chain segment as the gap from the wall START', () => {
    // Lopsided on purpose: 1000 at the start and 983 at the end. A builder measuring from the far
    // end would label the first segment 983.
    expect(chain(build())[0].label).toBe('1000')
    expect(chain(build()).at(-1)?.label).toBe('983')
  })

  it('states the overall length once, on ring 2, with its provenance in the label', () => {
    const overall = build().dims.filter((d) => d.axis === 'h' && d.ring === 2)
    expect(overall).toHaveLength(1)
    expect(overall[0]).toMatchObject({ side: 'below', start: 0, end: 3983, label: '3983 drawn — unverified' })
  })

  it.each([
    ['measured, inside tolerance', { ...SITE, value: 3980 }, '3980 ±5 (site)', true],
    ['measured, exactly on the tolerance', { ...SITE, value: 3978 }, '3978 ±5 (site)', true],
    ['measured, outside tolerance', { ...SITE, value: 3950 }, 'drawn 3983 / site 3950 ±5', false],
    ['drawn only', undefined, '3983 drawn — unverified', false],
    ['fractional uncertainty', { ...SITE, value: 3983, uncertainty: 0.5 }, '3983 ±0.5 (site)', true],
  ])('labels the wall length when %s', (_name, measured, label, verified) => {
    const view = build(kitchenWall(measured))
    expect(lengthLabel(view.length)).toBe(label)
    expect(view.length.verified).toBe(verified)
    expect(view.dims.find((d) => d.ring === 2 && d.axis === 'h')?.label).toBe(label)
  })

  it('dimensions opening sill and height on the right, cabinet height on the left', () => {
    const view = build()
    const right = view.dims.filter((d) => d.side === 'right')
    expect(right).toEqual([
      expect.objectContaining({ axis: 'v', start: 0, end: 900, label: '900', ring: 1 }),
      expect.objectContaining({ axis: 'v', start: 900, end: 2000, label: '1100', ring: 1 }),
    ])
    const cabinet = view.spans.find((s) => s.kind === 'cabinet')!
    const left = view.dims.filter((d) => d.side === 'left')
    expect(left).toEqual([
      expect.objectContaining({
        axis: 'v',
        start: cabinet.z0,
        end: cabinet.z1,
        label: String(Math.round(cabinet.z1 - cabinet.z0)),
      }),
    ])
  })

  it('emits a repeated height once and stacks overlapping heights on ring 2', () => {
    const a = wallCabinet('a', 0)
    const b = wallCabinet('b', 700)
    const tall = wallCabinet('tall', 1400, { height: 2100 })
    const room: RoomGeometry = {
      ...kitchenWall().room,
      openings: [],
      placements: [a, b, tall].map((c) => ({
        cabinetId: c.id,
        wallId: 'long',
        offset: c.position.x,
        setback: 0,
        manualOffset: { x: 0, y: 0 },
      })),
    }
    const view = buildWallElevation(room, room.walls[0], wallScene([a, b, tall]), new Set(['a', 'b', 'tall']))
    const left = view.dims.filter((d) => d.side === 'left')
    expect(left).toHaveLength(2)
    expect(left.map((d) => d.ring).sort()).toEqual([1, 2])
  })

  const expectNoSharedRing = (dims: AssemblyDim[]) => {
    for (const a of dims)
      for (const b of dims) {
        if (a === b || a.ring !== b.ring) continue
        expect(a.end <= b.start || b.end <= a.start, `${a.label} and ${b.label} share ring ${a.ring}`).toBe(true)
      }
    for (const d of dims) expect(d.label).toBe(String(Math.round(d.end - d.start)))
  }

  it('gives a third overlapping cabinet height its own ring instead of sharing ring 2', () => {
    const base = wallCabinet('base', 0)
    const wall = { ...wallCabinet('wall', 700), position: { x: 700, y: 0, z: 1400 } }
    const tall = wallCabinet('tall', 1400, { height: 2100 })
    const room: RoomGeometry = {
      ...kitchenWall().room,
      openings: [],
      placements: [base, wall, tall].map((c) => ({
        cabinetId: c.id,
        wallId: 'long',
        offset: c.position.x,
        setback: 0,
        manualOffset: { x: 0, y: 0 },
      })),
    }
    const view = buildWallElevation(room, room.walls[0], wallScene([base, wall, tall]), new Set(['base', 'wall', 'tall']))
    const left = view.dims.filter((d) => d.side === 'left')
    expectNoSharedRing(left)
    expect(left.find((d) => d.label === '2100')?.ring).toBe(3)
  })

  it('stacks two windows of different sills and a door on the right without overlap', () => {
    const f = kitchenWall()
    const room: RoomGeometry = {
      ...f.room,
      placements: [],
      openings: [
        { id: 'a', wallId: 'long', kind: 'window', offset: 100, width: 1000, sill: 900, height: 1100 },
        { id: 'b', wallId: 'long', kind: 'window', offset: 1500, width: 1000, sill: 1000, height: 800 },
        { id: 'd', wallId: 'long', kind: 'door', offset: 3000, width: 800, sill: 0, height: 2000 },
      ],
    }
    const view = buildWallElevation(room, room.walls[0], f.scene, new Set())
    const right = view.dims.filter((d) => d.side === 'right')
    expectNoSharedRing(right)
    expect(Math.max(...right.map((d) => d.ring))).toBe(3)
  })

  it('projects onto the wall, not the world x axis (rotated wall, turned cabinet)', () => {
    const straight = build()
    const c = { ...wallCabinet('kitchen', 0), position: { x: 0, y: 1000, z: 0 }, rotation: { x: 0, y: 0, z: 90 } }
    const room: RoomGeometry = {
      ...kitchenWall().room,
      walls: [{ id: 'long', name: 'Kitchen', start: { x: 0, y: 0 }, end: { x: 0, y: 3983 } }],
      openings: [],
    }
    const view = buildWallElevation(room, room.walls[0], wallScene([c]), new Set(['kitchen']))
    const span = view.spans[0]
    const reference = straight.spans.find((s) => s.kind === 'cabinet')!
    expect(span.x0).toBeCloseTo(reference.x0, 6)
    expect(span.x1).toBeCloseTo(reference.x1, 6)
  })

  it('shows the real extent of a cabinet hanging past either wall end', () => {
    const over = wallCabinet('over', 3700)
    const room: RoomGeometry = {
      ...kitchenWall().room,
      openings: [],
      placements: [{ cabinetId: 'over', wallId: 'long', offset: 3700, setback: 0, manualOffset: { x: 0, y: 0 } }],
    }
    const end = buildWallElevation(room, room.walls[0], wallScene([over]), new Set(['over']))
    expect(end.bounds.w).toBeGreaterThan(3983)
    expect(end.length).toMatchObject({ drawn: 3983 })
    const overall = end.dims.find((d) => d.ring === 2 && d.axis === 'h')!
    expect([overall.start, overall.end]).toEqual([0, 3983])

    const before = wallCabinet('before', -200)
    const room2: RoomGeometry = {
      ...room,
      placements: [{ cabinetId: 'before', wallId: 'long', offset: -200, setback: 0, manualOffset: { x: 0, y: 0 } }],
    }
    const start = buildWallElevation(room2, room2.walls[0], wallScene([before]), new Set(['before']))
    const overall2 = start.dims.find((d) => d.ring === 2 && d.axis === 'h')!
    expect([overall2.start, overall2.end]).toEqual([200, 4183])
    expect(start.bounds.x).toBe(0)
    expect(start.bounds.w).toBeCloseTo(4183)
  })

  it('keeps a span below the floor inside the bounds, with the floor above its bottom', () => {
    const sunk = { ...wallCabinet('sunk', 0), position: { x: 0, y: 0, z: -300 } }
    const room: RoomGeometry = {
      ...kitchenWall().room,
      openings: [],
      placements: [{ cabinetId: 'sunk', wallId: 'long', offset: 0, setback: 0, manualOffset: { x: 0, y: 0 } }],
    }
    const view = buildWallElevation(room, room.walls[0], wallScene([sunk]), new Set(['sunk']))
    const span = view.spans[0]
    expect(view.floorZ).toBe(300)
    expect(span.z0).toBe(0)
    expect(view.bounds.h).toBeCloseTo(span.z1)
    expect(view.floorZ).toBeGreaterThan(span.z0)
    const height = view.dims.find((d) => d.side === 'left')!
    expect([height.start, height.end]).toEqual([span.z0, span.z1])
    expect(height.label).toBe('720')
  })

  it('puts the floor at 0 on a normal wall', () => {
    expect(build().floorZ).toBe(0)
  })

  it('still draws an empty wall, with only its length', () => {
    const f = kitchenWall()
    const room = { ...f.room, openings: [], placements: [] }
    const view = buildWallElevation(room, room.walls[0], f.scene, f.cabinetIds)
    expect(view.spans).toEqual([])
    expect(view.bounds).toEqual({ x: 0, y: 0, w: 3983, h: 1 })
    expect(view.dims.map((d) => d.label)).toEqual(['3983', '3983 drawn — unverified'])
  })
})
