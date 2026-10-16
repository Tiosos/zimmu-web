import { expect, it, vi } from 'vitest'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import * as validation from '../scene/fileValidation'
import { captureProductionSource } from './buildProductionPacket'
import { compareReleaseSource } from './compareReleaseSource'

// A version no build has shipped: a hard-coded literal cannot coincide with it.
vi.mock('../scene/useFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scene/useFile')>()),
  FILE_FORMAT_VERSION: 9999,
}))

it('validates a frozen source as the current file format version', () => {
  const validate = vi.spyOn(validation, 'validateCurrentFile')
  const source = captureProductionSource({
    scene: machiningProject(),
    projectName: 'Kitchen',
    materialLibrary: {},
    hardwareLibrary: {},
  })
  compareReleaseSource(source, source)
  expect(validate).toHaveBeenCalledTimes(2)
  for (const [file] of validate.mock.calls) expect(file.version).toBe(9999)
})
