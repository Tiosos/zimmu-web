import type { ManufacturingPart } from '../scene/manufacturingPart'

export function buildPacketPartInventory(records: ManufacturingPart[]) {
  return {
    schemaVersion: 1 as const,
    parts: records.map((part) => ({
      id: part.id,
      label: part.label,
      kind: part.kind,
      material: part.material,
      dimensions:
        part.kind === 'board' ? part.local : { length: part.length, diameter: part.diameter },
      stock: part.stock,
      provenance: part.provenance,
      ...(part.kind === 'board'
        ? {
            finished: part.finished,
            cut: part.cut,
            grain: part.grain,
            edges: part.edges,
            requestedEdgeStock: part.requestedEdgeStock,
          }
        : {}),
    })),
  }
}
export type PacketPart = ReturnType<typeof buildPacketPartInventory>['parts'][number]
export function packetInventoryJson(inventory: ReturnType<typeof buildPacketPartInventory>) {
  return (
    JSON.stringify(
      inventory,
      (_key, value) =>
        typeof value === 'number' && !Number.isFinite(value) ? String(value) : value,
      2,
    ) + '\n'
  )
}
