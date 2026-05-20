import type { OpenCascadeInstance, TopoDS_Shape } from 'opencascade.js'

// Single OCCT instance per page load. Initialization downloads and instantiates
// a ~65MB WASM module, so it must only happen once.
let ocPromise: Promise<OpenCascadeInstance> | null = null

export async function initOCCT(): Promise<OpenCascadeInstance> {
  if (ocPromise === null) {
    // Dynamic import keeps the WASM out of the entry bundle so first paint
    // doesn't wait on 65MB of geometry kernel.
    ocPromise = import('opencascade.js').then((mod) => mod.initOpenCascade())
  }
  return ocPromise
}

export function makeBox(
  oc: OpenCascadeInstance,
  dx: number,
  dy: number,
  dz: number,
): TopoDS_Shape {
  const builder = new oc.BRepPrimAPI_MakeBox_2(dx, dy, dz)
  const shape = builder.Shape()
  builder.delete()
  return shape
}
