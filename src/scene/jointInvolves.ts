import type { Joint, PartId } from './types'

export function jointInvolves(joint: Joint, partId: PartId): boolean {
  if (joint.kind === 'dado') return joint.housingPartId === partId || joint.housedPartId === partId
  if (joint.kind === 'halflap') return joint.partAId === partId || joint.partBId === partId
  if (joint.kind === 'mortise-tenon')
    return joint.mortisePartId === partId || joint.tenonPartId === partId
  return joint.partAId === partId || joint.partBId === partId
}
