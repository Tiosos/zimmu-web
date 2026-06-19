import type { OpenCascadeInstance, TopoDS_Shape } from 'opencascade.js'
import type { CutDef, DowelCut, MitreCut, Vec3 } from '../scene/types'
import { computeMitreTool } from './mitre'
import {
  computeEndTool,
  computeNotchTool,
  computeAxialBoreTool,
  computeTransverseBoreTool,
  type BoxToolDescriptor,
  type CylinderToolDescriptor,
} from './dowelCut'

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

// Subtract an angled half-space (oversized rotated box) to bevel one end of the
// board. The cutting tool geometry is derived by the pure computeMitreTool so the
// math is unit-tested; only the OCCT plumbing lives here (browser-only).
export function makeMitreCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  board: { length: number; width: number; thickness: number },
  mitre: MitreCut,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const tool = computeMitreTool(board, mitre)

  const builder = new O.BRepPrimAPI_MakeBox_1(tool.boxSize.x, tool.boxSize.y, tool.boxSize.z)
  const boxShape = builder.Shape()
  builder.delete()

  // Translate the box to its pre-rotation origin.
  const tTrsf = new O.gp_Trsf_1()
  const tVec = new O.gp_Vec_4(tool.boxOrigin.x, tool.boxOrigin.y, tool.boxOrigin.z)
  tTrsf.SetTranslation_1(tVec)
  tVec.delete()
  const tXform = new O.BRepBuilderAPI_Transform_2(boxShape, tTrsf, false)
  tTrsf.delete()
  const translated = tXform.Shape()

  // Rotate about the pivot edge to tilt the inner face into the board.
  const rTrsf = new O.gp_Trsf_1()
  const pnt = new O.gp_Pnt_3(tool.pivot.x, tool.pivot.y, tool.pivot.z)
  const dir = new O.gp_Dir_4(tool.axisDir.x, tool.axisDir.y, tool.axisDir.z)
  const ax1 = new O.gp_Ax1_2(pnt, dir)
  rTrsf.SetRotation_1(ax1, tool.angleRad)
  pnt.delete()
  dir.delete()
  ax1.delete()
  const rXform = new O.BRepBuilderAPI_Transform_2(translated, rTrsf, false)
  rTrsf.delete()
  const movedTool = rXform.Shape()

  const pr1 = new O.Message_ProgressRange_1()
  const op = new O.BRepAlgoAPI_Cut_3(shape, movedTool, pr1)
  pr1.delete()
  const pr2 = new O.Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  const cleanup = () => {
    op.delete()
    rXform.delete()
    movedTool.delete()
    tXform.delete()
    translated.delete()
    boxShape.delete()
  }

  if (!op.IsDone()) {
    console.warn('makeMitreCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }

  const result = op.Shape()
  cleanup()
  return result
}

// Rotate + translate an oversized box and subtract it. Generalizes makeMitreCut's
// body; serves dowel end cuts and notches. makeMitreCut is left as-is for boards.
export function makeBoxCutAt(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tool: BoxToolDescriptor,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const builder = new O.BRepPrimAPI_MakeBox_1(tool.boxSize.x, tool.boxSize.y, tool.boxSize.z)
  const boxShape = builder.Shape()
  builder.delete()

  const tTrsf = new O.gp_Trsf_1()
  const tVec = new O.gp_Vec_4(tool.boxOrigin.x, tool.boxOrigin.y, tool.boxOrigin.z)
  tTrsf.SetTranslation_1(tVec)
  tVec.delete()
  const tXform = new O.BRepBuilderAPI_Transform_2(boxShape, tTrsf, false)
  tTrsf.delete()
  const translated = tXform.Shape()

  const rTrsf = new O.gp_Trsf_1()
  const pnt = new O.gp_Pnt_3(tool.pivot.x, tool.pivot.y, tool.pivot.z)
  const dir = new O.gp_Dir_4(tool.axisDir.x, tool.axisDir.y, tool.axisDir.z)
  const ax1 = new O.gp_Ax1_2(pnt, dir)
  rTrsf.SetRotation_1(ax1, tool.angleRad)
  pnt.delete()
  dir.delete()
  ax1.delete()
  const rXform = new O.BRepBuilderAPI_Transform_2(translated, rTrsf, false)
  rTrsf.delete()
  const movedTool = rXform.Shape()

  const pr1 = new O.Message_ProgressRange_1()
  const op = new O.BRepAlgoAPI_Cut_3(shape, movedTool, pr1)
  pr1.delete()
  const pr2 = new O.Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  const cleanup = () => {
    op.delete()
    rXform.delete()
    movedTool.delete()
    tXform.delete()
    translated.delete()
    boxShape.delete()
  }

  if (!op.IsDone()) {
    console.warn('makeBoxCutAt: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}

// Build an oriented cylinder tool and subtract it. Serves both bore types.
// gp_Ax2_3 / BRepPrimAPI_MakeCylinder_3 overloads are this design's best read of
// the embind API and are UNVERIFIED until the live OCCT spike (browser-only).
export function makeCylinderCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tool: CylinderToolDescriptor,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const pnt = new O.gp_Pnt_3(tool.basePoint.x, tool.basePoint.y, tool.basePoint.z)
  const dir = new O.gp_Dir_4(tool.dir.x, tool.dir.y, tool.dir.z)
  const ax2 = new O.gp_Ax2_3(pnt, dir)
  const builder = new O.BRepPrimAPI_MakeCylinder_3(ax2, tool.radius, tool.height)
  const toolShape = builder.Shape()
  builder.delete()
  ax2.delete()
  pnt.delete()
  dir.delete()

  const pr1 = new O.Message_ProgressRange_1()
  const op = new O.BRepAlgoAPI_Cut_3(shape, toolShape, pr1)
  pr1.delete()
  const pr2 = new O.Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  const cleanup = () => {
    op.delete()
    toolShape.delete()
  }
  if (!op.IsDone()) {
    console.warn('makeCylinderCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}

// Build a cylinder from a dowel's dims and fold each cut through a subtraction,
// mirroring makeShape. Bore/notch arms are implemented in later tasks.
export function makeDowelShape(
  oc: OpenCascadeInstance,
  dims: { diameter: number; length: number; cuts: DowelCut[] },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeCylinder(oc, dims.diameter / 2, dims.length)
  const dowel = { diameter: dims.diameter, length: dims.length }
  for (const cut of sorted) {
    const prev = current
    switch (cut.kind) {
      case 'end':
        if (cut.angle <= 0 && cut.offset <= 0) continue
        current = makeBoxCutAt(oc, current, computeEndTool(dowel, cut))
        break
      case 'notch':
        if (cut.depth <= 0 || cut.width <= 0) continue
        current = makeBoxCutAt(oc, current, computeNotchTool(dowel, cut))
        break
      case 'bore-axial':
        if (cut.diameter <= 0 || cut.depth <= 0) continue
        current = makeCylinderCut(oc, current, computeAxialBoreTool(dowel, cut))
        break
      case 'bore-transverse':
        if (cut.diameter <= 0 || cut.depth <= 0) continue
        current = makeCylinderCut(oc, current, computeTransverseBoreTool(dowel, cut))
        break
      default: {
        const _exhaustive: never = cut
        throw new Error(`unknown dowel cut kind: ${(_exhaustive as { kind: string }).kind}`)
      }
    }
    if (prev !== current) prev.delete()
  }
  return current
}

export type ExportSpec =
  | {
      kind: 'board'
      label: string
      length: number
      width: number
      thickness: number
      cuts: CutDef[]
      matrix: number[] // column-major 16, from composeWorldMatrix
    }
  | {
      kind: 'cylinder'
      label: string
      diameter: number
      length: number
      cuts: DowelCut[]
      matrix: number[]
    }

export function makeShape(
  oc: OpenCascadeInstance,
  dims: {
    length: number
    width: number
    thickness: number
    cuts: CutDef[]
  },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeBox(oc, dims.length, dims.width, dims.thickness)
  for (const cut of sorted) {
    const prev = current
    if (cut.kind === 'box') {
      if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
      current = makeCut(oc, current, cut.position, cut.size)
    } else {
      if (cut.angle <= 0) continue
      current = makeMitreCut(oc, current, dims, cut)
    }
    if (prev !== current) prev.delete()
  }
  return current
}

function makeTransformedShape(oc: OpenCascadeInstance, spec: ExportSpec): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  let shape: TopoDS_Shape
  switch (spec.kind) {
    case 'board':
      shape = makeShape(oc, spec)
      break
    case 'cylinder':
      shape = makeDowelShape(oc, { diameter: spec.diameter, length: spec.length, cuts: spec.cuts })
      break
    default: {
      const _exhaustive: never = spec
      throw new Error(`unknown export spec kind: ${(_exhaustive as { kind: string }).kind}`)
    }
  }
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

// Named-solid STEP via XCAF. Symbol overloads (_1/_2) are the design's best reading
// of the embind API and are UNVERIFIED at runtime — no live browser spike has been run
// (OCCT is browser-only, untestable in Node). See 2026-06-05-3d-export-notes.md.
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
