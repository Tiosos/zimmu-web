import { describe, it, expect } from 'vitest'
import { resolvePlacement } from './resolvePlacement'
import { regenerateComponents } from './regenerateComponents'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { Anchor, BoardPart, CarcaseComponent, Scene } from './types'

// The claim this file exists for, stated on `CarcaseParams.frontReveal` in types.ts:
//
//   "One number governs the gap between two fronts, between a front and the carcase, and between
//    the doors of two cabinets standing side by side."
//
// The third of those was unreachable until cabinets could be placed against each other: the
// placement design named it as one of two shipped-but-untestable claims, and gave it as part of its
// own justification. Placement shipped; this is the test it unblocked.
//
// A front's board WIDTH runs across the cabinet (carcase x) and its LENGTH runs up it — the board
// axes `orientedPanel` maps a door onto. Measured on the fixture below: a door of a 600-wide
// cabinet at reveal 3 comes out 597 wide at local x = 1.5, i.e. the full width less half a reveal
// on each side.

const preset = CARCASE_PRESETS[0].params

const cab = (id: string, frontReveal: number, anchor?: Anchor): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...preset, frontMount: 'overlay', frontReveal },
  ...(anchor === undefined ? {} : { anchor }),
})

// Two cabinets butted left-to-right, built the way the app builds them: placement first, then the
// generator. `gap: 0` is what "standing side by side" means.
function sideBySide(frontReveal: number): Scene {
  const scene: Scene = {
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components: [
      cab('cmp_a', frontReveal),
      cab('cmp_b', frontReveal, { to: 'cmp_a', face: 'right', gap: 0, offset: { u: 0, v: 0 } }),
    ],
  }
  return regenerateComponents(resolvePlacement(scene))
}

// The door's span in WORLD carcase x: its cabinet's position plus its own local box.
function doorSpan(scene: Scene, componentId: string): { x0: number; x1: number } {
  const parent = scene.components.find((c) => c.id === componentId)
  if (parent === undefined) throw new Error(`no component ${componentId}`)
  const door = scene.parts.find(
    (p): p is BoardPart =>
      p.kind === 'board' && p.parentId === componentId && (p.role?.startsWith('front-') ?? false),
  )
  if (door === undefined) throw new Error(`no front on ${componentId}`)
  return { x0: parent.position.x + door.position.x, x1: parent.position.x + door.position.x + door.width }
}

describe('two cabinets standing side by side', () => {
  it('leaves exactly one reveal between their doors', () => {
    const scene = sideBySide(3)
    const a = doorSpan(scene, 'cmp_a')
    const b = doorSpan(scene, 'cmp_b')
    // Measured: A spans [1.5, 598.5] and B — anchored at x = 600 — spans [601.5, 1198.5].
    expect(b.x0 - a.x1).toBeCloseTo(3, 6)
  })

  // What makes it "one number governs": the gap tracks the reveal 1:1 rather than merely being
  // some constant that happens to equal 3 at the preset's value.
  it('tracks the reveal rather than a fixed figure', () => {
    for (const reveal of [0, 3, 10, 25]) {
      const scene = sideBySide(reveal)
      const a = doorSpan(scene, 'cmp_a')
      const b = doorSpan(scene, 'cmp_b')
      expect(b.x0 - a.x1, `reveal ${reveal}`).toBeCloseTo(reveal, 6)
    }
  })

  // The fixture has to be a real adjacency or the gap above measures nothing: the cabinets must be
  // butted, and the doors must not overlap each other.
  it('butts the carcases with no gap of their own', () => {
    const scene = sideBySide(3)
    const a = scene.components.find((c) => c.id === 'cmp_a')
    const b = scene.components.find((c) => c.id === 'cmp_b')
    expect(b!.position.x - a!.position.x).toBeCloseTo(preset.width, 6)
  })

  it('never overlaps the two doors', () => {
    for (const reveal of [0, 3, 25]) {
      const scene = sideBySide(reveal)
      const a = doorSpan(scene, 'cmp_a')
      const b = doorSpan(scene, 'cmp_b')
      expect(a.x1, `reveal ${reveal}`).toBeLessThanOrEqual(b.x0)
    }
  })
})
