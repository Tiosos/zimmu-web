import { describe, it, expect } from 'vitest'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { CARCASE_PRESETS, DEFAULT_FRAME_MATERIAL, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { BoardPart, CarcaseComponent, CarcaseParams, FaceFrameComponent, Scene } from './types'

const FRAME = { stileWidth: 44, railWidth: 32, midStileWidth: 56, midRailWidth: 38 }

// Base 600: one doored leaf on a 100 mm toe kick — a cabinet stage 1 can frame, and one whose
// floor is not zero.
const BASE = CARCASE_PRESETS[0].params

const cab = (id: string, over: Partial<CarcaseParams> = { frame: FRAME }): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...BASE, ...over },
})

const sceneOf = (components: Scene['components']): Scene => ({
  parts: [],
  materials: PRESET_MATERIALS,
  hardware: [],
  joints: [],
  components,
})

const frames = (s: Scene) =>
  s.components.filter((c): c is FaceFrameComponent => c.kind === 'faceFrame')

const boardsOf = (s: Scene) =>
  s.parts.filter(
    (p): p is BoardPart =>
      p.kind === 'board' &&
      p.role !== undefined &&
      (p.role.startsWith('stile-') || p.role.startsWith('rail-')),
  )

const roles = (s: Scene) => boardsOf(s).map((p) => p.role!).sort()

const board = (s: Scene, role: string): BoardPart => {
  const b = boardsOf(s).find((p) => p.role === role)
  expect(b, `no board ${role}`).toBeDefined()
  return b!
}

describe('regenerateFaceFrames', () => {
  it('gives a framed cabinet exactly one frame', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    expect(frames(out)).toHaveLength(1)
    expect(frames(out)[0].parentId).toBe('cmp_a')
    expect(frames(out)[0].driven).toBe(true)
  })

  it('gives a frameless cabinet none', () => {
    expect(frames(regenerateFaceFrames(sceneOf([cab('cmp_a', {})])))).toHaveLength(0)
  })

  it('emits the frame boards under the frame', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    expect(roles(out)).toEqual(['rail-bottom', 'rail-top', 'stile-left', 'stile-right'])
    const frameId = frames(out)[0].id
    for (const b of boardsOf(out)) {
      expect(b.parentId).toBe(frameId)
      expect(b.driven).toBe(true)
    }
  })

  // The figures from faceFrameGeometry, carried onto real boards. A stile stands from the carcase
  // floor (100, above the kick) to the top (720); the frame is solid stock 20 thick, in front of
  // the carcase at y ∈ [−20, 0].
  it('places each member where the geometry says, in front of the carcase', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const left = board(out, 'stile-left')
    expect(left.position).toEqual({ x: 0, y: -20, z: 100 })
    expect(left.length).toBe(620)
    expect(left.width).toBe(44)
    expect(left.thickness).toBe(20)

    const right = board(out, 'stile-right')
    expect(right.position).toEqual({ x: 556, y: -20, z: 100 })

    const top = board(out, 'rail-top')
    expect(top.position).toEqual({ x: 44, y: -20, z: 688 })
    // Thickness-on-y: board length runs carcase z, width runs carcase x.
    expect(top.length).toBe(32)
    expect(top.width).toBe(512)
  })

  it('makes every member of the frame material, grain along its own run', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    for (const b of boardsOf(out)) expect(b.material).toBe(DEFAULT_FRAME_MATERIAL)
    // Board length runs carcase z, so a stile's grain is its length and a rail's is its width.
    expect(board(out, 'stile-left').grain).toBe('length')
    expect(board(out, 'rail-top').grain).toBe('width')
  })

  it('gives each cabinet its own frame', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a'), cab('cmp_b')]))
    expect(frames(out).map((f) => f.parentId).sort()).toEqual(['cmp_a', 'cmp_b'])
    expect(boardsOf(out)).toHaveLength(8)
  })

  it('emits and reconciles a mid stile for a vertically divided cabinet', () => {
    const split = splitSection(BASE.section, BASE.section.id, 'vertical', 'panel', 2)
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a', { frame: FRAME, section: split })]))
    expect(frames(out)).toHaveLength(1)
    const midRole = `stile-${BASE.section.id}-0`
    expect(roles(out)).toEqual([
      'rail-bottom',
      'rail-top',
      'stile-left',
      'stile-right',
      midRole,
    ].sort())
    const mid = board(out, midRole)
    expect(mid.position).toEqual({ x: 272, y: -20, z: 132 })
    expect(mid.length).toBe(556)
    expect(mid.width).toBe(56)
    expect(mid.label).toBe('Mid stile 1')
    expect(mid.material).toBe(DEFAULT_FRAME_MATERIAL)

    const again = regenerateFaceFrames(out)
    expect(board(again, midRole).id).toBe(mid.id)
  })

  it('bores a large-overlay 38B pattern only into the hinged outer stile', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const left = board(out, 'stile-left')
    const right = board(out, 'stile-right')
    const rows = left.cuts.filter((cut) => cut.id.startsWith('frame_plate_'))
    expect(rows).toHaveLength(2)
    expect(right.cuts.filter((cut) => cut.id.startsWith('frame_plate_'))).toEqual([])
    for (const cut of rows) {
      expect(cut.kind).toBe('hole-array')
      if (cut.kind !== 'hole-array') continue
      expect(cut.face).toBe('-Z')
      expect(cut.count).toBe(2)
      expect(cut.pitch).toBe(40)
      // 44 mm stile, 42.5 mm overlay -> Blum X = OL - 35 + 9 = 16.5 from inner edge.
      expect(cut.start.y).toBeCloseTo(44 - 16.5, 9)
    }
  })

  it('records inset adapter work as manual template machining, never fake CNC holes', () => {
    const out = regenerateFaceFrames(
      sceneOf([cab('cmp_a', { frame: FRAME, frontMount: 'inset' })]),
    )
    const left = board(out, 'stile-left')
    expect(left.cuts.filter((cut) => cut.id.startsWith('frame_plate_'))).toEqual([])
    expect(left.operations).toHaveLength(2)
    for (const op of left.operations ?? []) {
      expect(op.kind).toBe('manual-machining')
      expect(op.hardwareKey).toBe('hinge-blum-clip-inset-175h5030-21')
      expect(op.diameter).toBe(3)
      expect(op.pitch).toBe(32)
      expect(op.count).toBe(2)
      expect(op.angle).toBe(12)
      expect(op.edgeOffset).toBe(10)
      expect(op.template).toBe('Blum PLATEMATE')
      expect(op.sourceComponentId).toBe(frames(out)[0].id)
    }
  })

  it('replaces generated inset instructions when the mount changes instead of accumulating them', () => {
    const inset = regenerateFaceFrames(
      sceneOf([cab('cmp_a', { frame: FRAME, frontMount: 'inset' })]),
    )
    expect(board(inset, 'stile-left').operations).toHaveLength(2)

    const overlay = regenerateFaceFrames({
      ...inset,
      components: inset.components.map((c) =>
        c.kind === 'carcase'
          ? cab('cmp_a', { frame: FRAME, frontMount: 'overlay' })
          : c,
      ),
    })
    expect(board(overlay, 'stile-left').operations).toEqual([])
    expect(
      board(overlay, 'stile-left').cuts.filter((cut) => cut.id.startsWith('frame_plate_')),
    ).toHaveLength(2)
  })

  it('puts a half-overlay mid-stile wraparound pilot on that stile, not a carcase side', () => {
    let section = splitSection(BASE.section, BASE.section.id, 'vertical', 'panel', 2)
    const kids = section.content.kind === 'split' ? section.content.children : []
    section = setFrontOn(section, kids[1].id, { kind: 'door', leaves: 1, hinge: 'left' })
    const out = regenerateFaceFrames(
      sceneOf([
        cab('cmp_a', {
          frame: FRAME,
          section,
          frontMount: 'half-overlay',
        }),
      ]),
    )
    const mid = board(out, `stile-${BASE.section.id}-0`)
    const rows = mid.cuts.filter((cut) => cut.id.startsWith('frame_plate_'))
    expect(rows.length).toBeGreaterThan(0)
    for (const cut of rows) {
      expect(cut.kind).toBe('hole-array')
      if (cut.kind !== 'hole-array') continue
      expect(cut.face).toBe('+Y')
      expect(cut.count).toBe(1)
      expect(cut.diameter).toBeCloseTo((1 / 8) * 25.4, 9)
      expect(cut.start.z).toBeCloseTo(10, 9)
    }
  })

  it('emits a mid rail for a horizontally divided cabinet', () => {
    const split = splitSection(BASE.section, BASE.section.id, 'horizontal', 'panel', 2)
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a', { frame: FRAME, section: split })]))
    const midRole = `rail-${BASE.section.id}-0`
    const mid = board(out, midRole)
    expect(mid.position).toEqual({ x: 44, y: -20, z: 391 })
    expect(mid.length).toBe(38)
    expect(mid.width).toBe(512)
    expect(mid.label).toBe('Mid rail 1')
  })

  it('removes the frame when the cabinet turns frameless', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const unframed = regenerateFaceFrames({
      ...framed,
      components: framed.components.map((c) => (c.kind === 'carcase' ? cab('cmp_a', {}) : c)),
    })
    expect(frames(unframed)).toHaveLength(0)
    expect(roles(unframed)).toEqual([])
  })

  // A detached frame is the user's, exactly as a detached drawer is: no regeneration, no deletion.
  it('keeps a detached frame and its boards when the cabinet turns frameless', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const detached = {
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'faceFrame'
          ? { ...c, driven: false }
          : c.kind === 'carcase'
            ? cab('cmp_a', {})
            : c,
      ),
    }
    const out = regenerateFaceFrames(detached)
    expect(frames(out)).toHaveLength(1)
    expect(roles(out)).toHaveLength(4)
  })

  // A board the user detached from a driven frame is theirs even when the frame goes. It stays,
  // re-homed on the cabinet — the frame it hung from no longer exists — with its role released so
  // a later frame cannot reclaim it.
  it('keeps a detached board when its driven frame is dropped', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const stile = board(framed, 'stile-left')
    const detached = {
      ...framed,
      parts: framed.parts.map((p) => (p.id === stile.id ? { ...p, driven: false } : p)),
      components: framed.components.map((c) => (c.kind === 'carcase' ? cab('cmp_a', {}) : c)),
    }
    const out = regenerateFaceFrames(detached)
    expect(frames(out)).toHaveLength(0)
    const kept = out.parts.find((p) => p.id === stile.id)
    expect(kept?.parentId).toBe('cmp_a')
    expect(kept?.role).toBeUndefined()
    const ids = new Set(out.components.map((c) => c.id))
    expect(out.parts.every((p) => p.parentId === null || ids.has(p.parentId))).toBe(true)
  })

  // Detached means no regeneration, not only no deletion: a cabinet resized under a detached frame
  // leaves the frame's boards exactly where the user left them.
  it("leaves a detached frame's boards alone when the cabinet changes", () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const detached = {
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'faceFrame'
          ? { ...c, driven: false }
          : c.kind === 'carcase'
            ? cab('cmp_a', { frame: FRAME, width: 900 })
            : c,
      ),
    }
    expect(boardsOf(regenerateFaceFrames(detached))).toEqual(boardsOf(framed))
  })

  it('does not build a second frame beside a detached one', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const detached = {
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'faceFrame' ? { ...c, driven: false } : c,
      ),
    }
    expect(frames(regenerateFaceFrames(detached))).toHaveLength(1)
  })

  // A width of 6 typed on the way to 600 must not empty the frame mid-keystroke: an unresolvable
  // cabinet carries its frame and boards through untouched, the contract drawers already keep.
  it('carries the frame through an unresolvable cabinet', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const typing = {
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'carcase' ? cab('cmp_a', { frame: FRAME, width: 6 }) : c,
      ),
    }
    const out = regenerateFaceFrames(typing)
    expect(frames(out)).toEqual(frames(framed))
    expect(boardsOf(out)).toEqual(boardsOf(framed))
  })

  it('keeps board ids across a resize', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const before = board(framed, 'stile-left').id
    const wider = regenerateFaceFrames({
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'carcase' ? cab('cmp_a', { frame: FRAME, width: 900 }) : c,
      ),
    })
    expect(board(wider, 'stile-left').id).toBe(before)
    expect(board(wider, 'stile-right').position.x).toBe(856)
  })

  it('is idempotent', () => {
    const once = regenerateFaceFrames(sceneOf([cab('cmp_a')]))
    const twice = regenerateFaceFrames(once)
    expect(twice.components).toEqual(once.components)
    expect(twice.parts).toEqual(once.parts)
  })

  it('leaves a scene with no cabinets alone', () => {
    const empty = sceneOf([])
    expect(regenerateFaceFrames(empty)).toBe(empty)
  })
})
