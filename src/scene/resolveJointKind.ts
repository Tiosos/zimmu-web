import type { ComponentId, Joint } from './types'

// The joinery a carcase generates. Named here, beside the resolver that answers with one, so the
// descriptor table and the override lookup cannot name different sets.
export type CarcaseJointKind = 'dado' | 'finger' | 'screw'

export type RoleJointKind = (
  housingRole: string,
  housedRole: string,
) => CarcaseJointKind | undefined

// The id a generated joint carries, derived from the component and the role pair so a regeneration
// reproduces it without looking anything up. Stated once because the role pair and the id encode
// the same thing two ways: the emit writes it, and the override lookup reads it back.
export function carcaseJointId(
  componentId: ComponentId,
  housingRole: string,
  housedRole: string,
): string {
  return `joint_${componentId}_${housingRole}__${housedRole}`
}

// The one statement of what kind of joint a role pair actually has: the joint the user took
// ownership of, else nothing — and the cabinet's own `jointMethod` stands.
//
// Read *before* the layout resolves boxes, never applied after: a dado at the left side is what
// makes the bottom come out 6 mm longer, so the layout has to see it. An override applied to the
// finished panel instead would only move it, leaving a groove-deep gap at the other end. That keeps
// the generator a function in one direction — overrides in, boxes out — and an override must never
// depend on a generated dimension.
export function jointKindFor(joints: Joint[], componentId: ComponentId): RoleJointKind {
  const taken = new Map(
    joints
      .filter((j) => j.sourceComponentId === componentId && !j.driven)
      .map((j) => [j.id, j.kind] as const),
  )
  return (housingRole, housedRole) => {
    const kind = taken.get(carcaseJointId(componentId, housingRole, housedRole))
    // The Joint union is wider than the three kinds a carcase emits; anything else is not a joint
    // this generator could have made, so it says nothing about how to size the panels.
    return kind === 'dado' || kind === 'finger' || kind === 'screw' ? kind : undefined
  }
}
