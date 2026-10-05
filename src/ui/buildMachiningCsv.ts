import type { MachiningSchedule } from '../scene/machiningSchedule'

const cell = (value: string | number | null) => {
  const text = value === null ? '' : String(value)
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildMachiningCsv(schedule: MachiningSchedule): string {
  const header = [
    'Part ID',
    'Part',
    'Material',
    'Cabinet ID',
    'Cabinet',
    'Parent ID',
    'Category',
    'Operation ID',
    'Operation',
    'Kind',
    'Source component ID',
    'Source joint ID',
    'Diameter (mm)',
    'Depth (mm)',
    'Count',
    'Pitch (mm)',
    'Depth mode',
    'Template',
    'Instruction',
    'Definition (part-local; mm and degrees)',
  ]
  const rows = schedule.entries.map((entry) => {
    const op = entry.operation
    return [
      entry.part.id,
      entry.part.label,
      entry.part.material,
      entry.part.provenance.cabinetId,
      entry.part.provenance.cabinetLabel,
      entry.part.provenance.parentId,
      entry.category,
      op.id,
      op.label,
      op.kind,
      entry.sourceComponentId,
      entry.sourceJointId,
      'diameter' in op ? op.diameter : null,
      'depth' in op ? op.depth : null,
      'count' in op ? op.count : entry.category === 'geometric-drilling' ? 1 : null,
      'pitch' in op ? op.pitch : null,
      entry.category === 'geometric-drilling' ? entry.depthMode : 'unassessed',
      op.kind === 'manual-machining' ? op.template : null,
      op.kind === 'manual-machining' ? op.instruction : null,
      JSON.stringify(op, (_key, value) =>
        typeof value === 'number' && !Number.isFinite(value) ? String(value) : value,
      ),
    ]
      .map(cell)
      .join(',')
  })
  return [header.join(','), ...rows].join('\n') + '\n'
}
