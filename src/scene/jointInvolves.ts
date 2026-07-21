import type { Joint, PartId } from './types'

export function jointInvolves(joint: Joint, partId: PartId): boolean {
  return joint.kind === 'dado'
    ? joint.housingPartId === partId || joint.housedPartId === partId
    : joint.partAId === partId || joint.partBId === partId
}
