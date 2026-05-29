import type { Part } from './types'

export function shapeKey(part: Part): string {
  if (part.kind === 'board') return `board|${part.length}|${part.width}|${part.thickness}`
  throw new Error(`unknown part kind: ${(part as { kind: string }).kind}`)
}
