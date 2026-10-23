import { describe, expect, it } from 'vitest'
import { FILE_FORMAT_HISTORY } from './fileFormatHistory'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'

describe('file format history', () => {
  it('has no gap or overlap and ends at the current version', () => {
    let expected = FILE_FORMAT_HISTORY[0].first
    for (const step of FILE_FORMAT_HISTORY) {
      expect(step.first).toBe(expected)
      expect(step.last).toBeGreaterThanOrEqual(step.first)
      expected = step.last + 1
    }
    expect(FILE_FORMAT_HISTORY.at(-1)!.last).toBe(FILE_FORMAT_VERSION)
  })

  it('describes every step', () => {
    for (const step of FILE_FORMAT_HISTORY) expect(step.summary.trim()).not.toBe('')
  })
})

// A later feature is an optional field, so an older file is one that lacks it. If a new required
// field were read without a default, the file of the version before it would stop opening.
describe('every format version still opens', () => {
  const versions = Array.from({ length: FILE_FORMAT_VERSION }, (_, i) => i + 1)
  it.each(versions)('v%i: an empty project parses to the current scene shape', (version) => {
    const file = parseFile(
      JSON.stringify({
        version,
        scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
      }),
    )
    expect(file.scene.parts).toEqual([])
    expect(file.scene.components).toEqual([])
    expect(file.scene.joints).toEqual([])
    expect(file.scene.hardware).toEqual([])
    expect(file.scene.materials).toBeTypeOf('object')
  })
})
