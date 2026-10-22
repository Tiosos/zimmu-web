import type { Scene, HardwareLibraryEntry, MaterialDef } from '../scene/types'

export interface ProductionPacketInput {
  scene: Scene
  projectName: string
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  materialLibrary: Record<string, MaterialDef>
  capturedAt?: Date
}

export const captureInput = (input: ProductionPacketInput) =>
  structuredClone({
    scene: input.scene,
    projectName: input.projectName,
    hardwareLibrary: input.hardwareLibrary,
    materialLibrary: input.materialLibrary,
  })

// The text whose SHA-256 is the manifest's sourceSha256. A release stores it verbatim.
export function captureProductionSource(input: ProductionPacketInput): string {
  return JSON.stringify(captureInput(input))
}
