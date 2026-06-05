import type { OpenCascadeInstance, TopoDS_Shape } from 'opencascade.js'
import type { Vec3 } from '../scene/types'

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

export function makeBox(oc: OpenCascadeInstance, dx: number, dy: number, dz: number): TopoDS_Shape {
  const builder = new oc.BRepPrimAPI_MakeBox_1(dx, dy, dz)
  const shape = builder.Shape()
  builder.delete()
  return shape
}

export function makeCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  position: Vec3,
  size: Vec3,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new (oc as any).BRepPrimAPI_MakeBox_1(size.x, size.y, size.z)
  const toolShape = builder.Shape()
  builder.delete()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trsf = new (oc as any).gp_Trsf_1()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vec = new (oc as any).gp_Vec_4(position.x, position.y, position.z)
  trsf.SetTranslation_1(vec)
  vec.delete()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xform = new (oc as any).BRepBuilderAPI_Transform_2(toolShape, trsf, false)
  trsf.delete()
  const movedTool = xform.Shape()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pr1 = new (oc as any).Message_ProgressRange_1()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const op = new (oc as any).BRepAlgoAPI_Cut_3(shape, movedTool, pr1)
  pr1.delete()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pr2 = new (oc as any).Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  if (!op.IsDone()) {
    console.warn('makeCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    op.delete()
    xform.delete()
    movedTool.delete()
    toolShape.delete()
    return shape
  }

  const result = op.Shape()
  op.delete()
  xform.delete()
  movedTool.delete()
  toolShape.delete()

  return result
}

export interface ExportSpec {
  label: string
  length: number
  width: number
  thickness: number
  cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
  matrix: number[] // column-major 16, from composeWorldMatrix
}

export function makeShape(
  oc: OpenCascadeInstance,
  dims: {
    length: number
    width: number
    thickness: number
    cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
  },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeBox(oc, dims.length, dims.width, dims.thickness)
  for (const cut of sorted) {
    if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
    const prev = current
    current = makeCut(oc, current, cut.position, cut.size)
    if (prev !== current) prev.delete()
  }
  return current
}
