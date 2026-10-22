import type { ManufacturingPart } from '../scene/manufacturingPart'
const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
export function buildGrainMatchCsv(records: ManufacturingPart[]): string {
  const rows = records
    .filter((p) => p.kind === 'board' && p.grainMatch)
    .sort((a, b) => {
      if (a.kind !== 'board' || b.kind !== 'board') return 0
      return (
        a.grainMatch!.groupId.localeCompare(b.grainMatch!.groupId) ||
        a.grainMatch!.sequence - b.grainMatch!.sequence
      )
    })
    .map((p) => {
      if (p.kind !== 'board' || !p.grainMatch) return ''
      const g = p.grainMatch
      return [
        g.groupId,
        g.label,
        g.sequence,
        g.memberCount,
        p.id,
        p.label,
        p.material,
        g.direction,
        g.x,
        g.y,
        g.width,
        g.height,
        g.blankWidth,
        g.blankHeight,
        270,
        g.patternX,
        g.patternY,
        'Front-view X right; Y down',
        g.problem ?? '',
      ]
        .map(quote)
        .join(',')
    })
  return (
    [
      'Group ID,Group,Sequence,Members,Part ID,Part,Material,Grain direction,Cut X (mm),Cut Y (mm),Cut width (mm),Cut height (mm),Blank width (mm),Blank height (mm),Board rotation in blank (deg),Pattern X (mm),Pattern Y (mm),Coordinate frame,Problem',
      ...rows,
    ].join('\n') + '\n'
  )
}
