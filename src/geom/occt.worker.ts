import { expose, transfer } from 'comlink'
import { initOCCT, makeBox } from './occt'
import { shapeToMeshData } from './mesh'

const api = {
  async buildPart(kind: 'board', dims: { length: number; width: number; thickness: number }) {
    const oc = await initOCCT()
    if (kind === 'board') {
      const shape = makeBox(oc, dims.length, dims.width, dims.thickness)
      const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
      shape.delete()
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
