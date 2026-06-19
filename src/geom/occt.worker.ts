import { expose, transfer } from 'comlink'
import { initOCCT, makeShape, makeDowelShape, writeStep } from './occt'
import type { ExportSpec } from './occt'
import type { TopoDS_Shape } from 'opencascade.js'
import { shapeToMeshData } from './mesh'
import type { CutDef, DowelCut } from '../scene/types'

export type BuildSpec =
  | {
      kind: 'board'
      length: number
      width: number
      thickness: number
      cuts: CutDef[]
    }
  | { kind: 'cylinder'; diameter: number; length: number; cuts: DowelCut[] }

const MESH_OPTS = { linearDeflection: 0.1, angularDeflection: 0.5 }

const api = {
  async buildPart(spec: BuildSpec) {
    const oc = await initOCCT()
    let shape: TopoDS_Shape
    switch (spec.kind) {
      case 'board':
        shape = makeShape(oc, spec)
        break
      case 'cylinder':
        shape = makeDowelShape(oc, {
          diameter: spec.diameter,
          length: spec.length,
          cuts: spec.cuts,
        })
        break
      default: {
        const _exhaustive: never = spec
        throw new Error(`unknown build spec kind: ${(_exhaustive as { kind: string }).kind}`)
      }
    }
    const data = shapeToMeshData(oc, shape, MESH_OPTS)
    shape.delete()
    return transfer(data, [data.positions.buffer, data.normals.buffer])
  },
  async exportStep(specs: ExportSpec[]): Promise<string> {
    const oc = await initOCCT()
    return writeStep(oc, specs)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
