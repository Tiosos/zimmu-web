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

export function makeCylinder(
  oc: OpenCascadeInstance,
  radius: number,
  height: number,
): TopoDS_Shape {
  // BRepPrimAPI_MakeCylinder_2(R, H): default axis +Z, base circle centered at origin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new (oc as any).BRepPrimAPI_MakeCylinder_2(radius, height)
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

export type ExportSpec =
  | {
      kind: 'board'
      label: string
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
      matrix: number[]
    }
  | {
      kind: 'cylinder'
      label: string
      diameter: number
      length: number
      matrix: number[]
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

function makeTransformedShape(oc: OpenCascadeInstance, spec: ExportSpec): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const shape =
    spec.kind === 'board' ? makeShape(oc, spec) : makeCylinder(oc, spec.diameter / 2, spec.length)
  const trsf = new O.gp_Trsf_1()
  // gp_Trsf.SetValues expects row-major 3x4 (a11..a14, a21..a24, a31..a34).
  // spec.matrix is column-major: m[col*4 + row].
  const m = spec.matrix
  trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14])
  const xform = new O.BRepBuilderAPI_Transform_2(shape, trsf, false)
  const moved = xform.Shape()
  shape.delete()
  trsf.delete()
  xform.delete()
  return moved
}

// Named-solid STEP via XCAF. Symbol overloads (_1/_2) confirmed by a later live spike.
export function writeStep(oc: OpenCascadeInstance, specs: ExportSpec[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  O.Interface_Static.SetCVal('write.step.unit', 'MM')

  const app = O.XCAFApp_Application.GetApplication()
  const doc = new O.Handle_TDocStd_Document_1()
  app.NewDocument(new O.TCollection_ExtendedString_2('MDTV-XCAF', true), doc)
  const shapeTool = O.XCAFDoc_DocumentTool.ShapeTool(doc.get().Main())

  const moved: TopoDS_Shape[] = []
  for (const spec of specs) {
    const shape = makeTransformedShape(oc, spec)
    const lbl = shapeTool.AddShape(shape, false, true)
    O.TDataStd_Name.Set_2(lbl, new O.TCollection_ExtendedString_2(spec.label, true))
    moved.push(shape)
  }

  const writer = new O.STEPCAFControl_Writer_1()
  const pr = new O.Message_ProgressRange_1()
  writer.Transfer_1(doc, O.STEPControl_StepModelType.STEPControl_AsIs, '', pr)
  writer.Write('out.step')
  pr.delete()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text: string = (oc as any).FS.readFile('out.step', { encoding: 'utf8' })
  for (const s of moved) s.delete()
  writer.delete()
  return text
}
