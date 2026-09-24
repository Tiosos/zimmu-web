import { describe, it, expect } from 'vitest'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { CARCASE_PRESETS, DEFAULT_FRAME_MATERIAL, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
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

  // Stage 1 cannot frame a split cabinet. The frame component stays — the cabinet asked for one —
  // but it emits nothing, exactly as a drawer whose box does not fit keeps its component and
  // declines its boards.
  it('keeps the frame but emits no boards where stage 1 cannot build one', () => {
    const split = splitSection(BASE.section, BASE.section.id, 'vertical', 'panel', 2)
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a', { frame: FRAME, section: split })]))
    expect(frames(out)).toHaveLength(1)
    expect(boardsOf(out)).toHaveLength(0)
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
