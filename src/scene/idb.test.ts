import { describe, it, expect, beforeEach } from 'vitest'
import { readHandle, writeHandle, clearHandle } from './idb'

describe('idb', () => {
  beforeEach(async () => {
    await clearHandle()
  })

  it('readHandle returns null when nothing is stored', async () => {
    const result = await readHandle()
    expect(result).toBeNull()
  })

  it('writeHandle stores a handle that readHandle retrieves', async () => {
    const mockHandle = { name: 'test.zimmu' } as unknown as FileSystemFileHandle
    await writeHandle(mockHandle)
    const result = await readHandle()
    expect(result).toStrictEqual(mockHandle)
  })

  it('clearHandle removes the stored handle', async () => {
    const mockHandle = { name: 'test.zimmu' } as unknown as FileSystemFileHandle
    await writeHandle(mockHandle)
    await clearHandle()
    const result = await readHandle()
    expect(result).toBeNull()
  })
})
