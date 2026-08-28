import { describe, it, expect } from 'vitest'
import { changeJointKind, convertibleKinds } from './changeJointKind'
import { componentsById } from './componentTree'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { defaultDadoJoint, defaultFingerJoint } from './defaultJoint'
import { isOwnedBy } from './cutOwnership'
import { reconcileJoints } from './reconcileJoints'
import { regenerateComponents } from './regenerateComponents'
import type { BoardPart, CarcaseComponent, Joint, Scene } from './types'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

// The shipped preset is screwed together, so its side/bottom joint is the one a user reaches for.
const screwed: Scene = reconcileJoints(
  regenerateComponents({
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [cabinet],
  }),
)
const byId = componentsById(screwed.components)
const SIDE_BOTTOM = 'joint_cmp_1_left-side__bottom'
const screw = screwed.joints.find((j) => j.id === SIDE_BOTTOM)!
const boardOf = (role: string): BoardPart => {
  const part = screwed.parts.find((p) => p.role === role)
  if (part?.kind !== 'board') throw new Error(`no board for ${role}`)
  return part
}

function cutsOf(s: Scene, jointId: string): string[] {
  return s.parts.flatMap((p) =>
    p.kind === 'board' ? p.cuts.filter((c) => isOwnedBy(c, jointId)).map((c) => c.kind) : [],
  )
}

describe('convertibleKinds', () => {
  it('offers both kinds for a face-and-end pairing the cabinet emits', () => {
    expect(screw.kind).toBe('screw')
    expect(convertibleKinds(screw, screwed.parts, byId)).toEqual(['dado', 'screw'])
  })

  // A finger joint meets two ends at a corner. Converting one would need the housing panel's face,
  // which the joint does not name — so it is left alone rather than guessed at.
  it('offers nothing for a pairing that is not a face and an end', () => {
    const finger = defaultFingerJoint(
      boardOf('left-side'),
      boardOf('bottom'),
      '-Y',
      '-X',
      'j_finger',
      'Finger joint 1',
    )

    expect(convertibleKinds(finger, screwed.parts, byId)).toEqual([])
  })

  // Two panels face to face: a dado can house one in the other's broad face, but there is no
  // thickness to centre a pilot in, and deriveScrewJoint refuses exactly this.
  it("withholds the screw where the housed end is the panel's broad face", () => {
    const laminated = defaultDadoJoint(
      boardOf('bottom'),
      boardOf('top'),
      '-Z',
      '+Z',
      'j_face',
      'Dado 1',
      byId,
    )

    expect(convertibleKinds(laminated, screwed.parts, byId)).toEqual(['dado'])
    expect(changeJointKind(laminated, 'screw', screwed.parts, byId)).toBeNull()
  })

  it('offers nothing once the panels no longer meet', () => {
    const turned: Scene = {
      ...screwed,
      parts: screwed.parts.map((p) =>
        p.role === 'bottom' ? { ...p, rotation: { x: 0, y: 0, z: 90 } } : p,
      ),
    }

    expect(convertibleKinds(screw, turned.parts, byId)).toEqual([])
  })
})

describe('changeJointKind', () => {
  it('keeps the joint identity and hands it to the user', () => {
    const dado = changeJointKind(screw, 'dado', screwed.parts, byId)!

    expect(dado.kind).toBe('dado')
    expect(dado.id).toBe(screw.id)
    expect(dado.label).toBe(screw.label)
    expect(dado.driven).toBe(false)
    // Still the cabinet's joint: that tag is what regeneration matches to leave it standing, and
    // what deletes it along with the cabinet.
    expect(dado.sourceComponentId).toBe('cmp_1')
  })

  it("seeds the new kind rather than carrying the old one's figures across", () => {
    const dado = changeJointKind(screw, 'dado', screwed.parts, byId)!

    expect(dado.kind === 'dado' && dado.depth).toBeGreaterThan(0)
    expect(dado.kind === 'dado' && dado.profile).toBe('plain')
  })

  it("re-derives the cuts into the new kind's geometry, in place", () => {
    expect(cutsOf(screwed, SIDE_BOTTOM)).toEqual(['hole-array', 'hole-array'])

    const dado = changeJointKind(screw, 'dado', screwed.parts, byId)!
    const after = reconcileJoints({
      ...screwed,
      joints: screwed.joints.map((j: Joint) => (j.id === SIDE_BOTTOM ? dado : j)),
    })

    expect(cutsOf(after, SIDE_BOTTOM)).toEqual(['box'])
  })

  it('survives the regeneration that follows it', () => {
    const dado = changeJointKind(screw, 'dado', screwed.parts, byId)!
    const wider = regenerateComponents({
      ...screwed,
      joints: screwed.joints.map((j: Joint) => (j.id === SIDE_BOTTOM ? dado : j)),
      components: [{ ...cabinet, params: { ...cabinet.params, width: 900 } }],
    })

    expect(wider.joints.filter((j) => j.id === SIDE_BOTTOM)).toHaveLength(1)
    expect(wider.joints.find((j) => j.id === SIDE_BOTTOM)!.kind).toBe('dado')
    expect(wider.joints.filter((j) => j.kind === 'screw').length).toBeGreaterThan(0)
  })
})
