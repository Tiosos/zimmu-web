import type { MaterialDef } from './types'

// Scene rates override library rates field by field, while rates only the library has (such as a
// dowel's costPerM) stay available. `use` is taken from the scene alone, so a library entry never
// makes a project's panel material edge stock. The BOM, the nest, the packet and the reconciliation
// all merge through this.
export function withoutUse(def: MaterialDef): MaterialDef {
  const copy = { ...def }
  delete copy.use
  return copy
}

export function effectiveMaterialsOf(
  library: Record<string, MaterialDef>,
  scene: Record<string, MaterialDef>,
): Record<string, MaterialDef> {
  const merged: Record<string, MaterialDef> = {}
  for (const name of new Set([...Object.keys(library), ...Object.keys(scene)])) {
    merged[name] = { ...(name in library ? withoutUse(library[name]) : {}), ...scene[name] }
  }
  return merged
}
