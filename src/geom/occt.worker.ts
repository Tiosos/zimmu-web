import { expose, transfer } from 'comlink'
import { initOCCT, makeShape, writeStep } from './occt'
import type { ExportSpec } from './occt'
import { shapeToMeshData } from './mesh'
import type { Vec3 } from '../scene/types'

const api = {
  async buildPart(
    kind: 'board',
    dims: {
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
    },
  ) {
    const oc = await initOCCT()
    if (kind === 'board') {
      const shape = makeShape(oc, dims)
      const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
      shape.delete()
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
  async exportStep(specs: ExportSpec[]): Promise<string> {
    const oc = await initOCCT()
    return writeStep(oc, specs)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
