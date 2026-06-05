import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from './download'

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('creates an anchor with the filename, clicks it, and revokes the url', () => {
    const click = vi.fn()
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement
    const createEl = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    downloadBlob(new ArrayBuffer(4), 'thing.stl', 'model/stl')

    expect(createEl).toHaveBeenCalledWith('a')
    expect(anchor.download).toBe('thing.stl')
    expect(anchor.href).toBe('blob:fake')
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})
