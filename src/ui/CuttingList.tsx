import type { Part } from '../scene/types'

export function buildCsv(parts: Part[]): string {
  const header = 'Label,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = parts.map((p) => {
    const label = p.label.includes(',') ? `"${p.label}"` : p.label
    return `${label},${p.length},${p.width},${p.thickness},${p.cuts.length}`
  })
  return [header, ...rows].join('\n')
}
