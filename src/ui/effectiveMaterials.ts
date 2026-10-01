import type { MaterialDef } from '../scene/types'

// Scene rates override library rates field by field, while rates only the library has (such as a
// dowel's costPerM) stay available. BomModal carries its own inline copy of this merge; it is left
// alone, so this is the packet's and the reconciliation's one statement of it.
export function effectiveMaterialsOf(
  library: Record<string, MaterialDef>,
  scene: Record<string, MaterialDef>,
): Record<string, MaterialDef> {
  const merged: Record<string, MaterialDef> = {}
  for (const name of new Set([...Object.keys(library), ...Object.keys(scene)])) {
    merged[name] = { ...library[name], ...scene[name] }
  }
  return merged
}
