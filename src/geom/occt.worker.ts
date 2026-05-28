import { expose, transfer } from 'comlink'
import { initOCCT, makeBox } from './occt'
import { shapeToMeshData } from './mesh'

const api = {
  async buildBox(dx: number, dy: number, dz: number) {
    const oc = await initOCCT()
    const shape = makeBox(oc, dx, dy, dz)
    const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
    shape.delete()
    // Transfer the underlying ArrayBuffers — zero-copy hand-off to the main thread.
    return transfer(data, [data.positions.buffer, data.normals.buffer])
  },
}

expose(api)

export type OcctWorkerApi = typeof api
