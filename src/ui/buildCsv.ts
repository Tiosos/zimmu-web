import type { Part } from '../scene/types'

export function buildCsv(parts: Part[]): string {
  const header = 'Label,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = parts.map((p) => {
    const needsQuoting = p.label.includes(',') || p.label.includes('"')
    const label = needsQuoting ? `"${p.label.replace(/"/g, '""')}"` : p.label
    return `${label},${p.length},${p.width},${p.thickness},${p.cuts.length}`
  })
  return [header, ...rows].join('\n')
}
