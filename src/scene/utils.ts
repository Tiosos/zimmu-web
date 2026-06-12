import type { Part } from './types'

export function shapeKey(part: Part): string {
  if (part.kind === 'board') {
    const cutKey = part.cuts
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (c) =>
          `${c.position.x},${c.position.y},${c.position.z}|${c.size.x},${c.size.y},${c.size.z}`,
      )
      .join(';')
    return `board|${part.length}|${part.width}|${part.thickness}|${cutKey}`
  }
  if (part.kind === 'cylinder') {
    return `cylinder|${part.diameter}|${part.length}`
  }
  throw new Error(`unknown part kind: ${(part as { kind: string }).kind}`)
}
