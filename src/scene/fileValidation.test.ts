import { describe, expect, it, vi } from 'vitest'
import type { ZimmuFile } from './types'
import {
  validateCurrentFile,
  validateLegacyFileInput,
  ZimmuFileValidationError,
} from './fileValidation'
import { parseFile } from './useFile'

const CAMERA = { position: { x: 250, y: -200, z: 150 }, target: { x: 0, y: 0, z: 0 } }

function file(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 17,
    name: 'Validated fixture',
    appVersion: '0.0.0',
    units: 'mm',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    camera: CAMERA,
    scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
    ...overrides,
  }
}

function board(id = 'b1') {
  return {
    kind: 'board',
    id,
    label: 'Board',
    length: 600,
    width: 300,
    thickness: 18,
    grain: 'free',
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  }
}

describe('zimmu file validation boundary', () => {
  it('rejects a non-object root with a path-aware error', () => {
    expect(() => validateLegacyFileInput(null)).toThrowError(
      new ZimmuFileValidationError('file', 'must be an object'),
    )
  })

  it('rejects a non-numeric version before migration code sees it', () => {
    expect(() => validateLegacyFileInput(file({ version: '17' }))).toThrow(
      'file.version must be a finite number',
    )
  })

  it('rejects the wrong scene container type', () => {
    expect(() => validateLegacyFileInput(file({ scene: [] }))).toThrow(
      'file.scene must be an object',
    )
  })

  it('rejects parts that are not an array', () => {
    expect(() =>
      validateLegacyFileInput(
        file({ scene: { parts: {}, materials: {}, hardware: [], joints: [], components: [] } }),
      ),
    ).toThrow('file.scene.parts must be an array')
  })

  it('rejects a geometry number supplied as a string', () => {
    expect(() =>
      validateLegacyFileInput(
        file({
          scene: {
            parts: [{ ...board(), length: '600' }],
            materials: {},
            hardware: [],
            joints: [],
            components: [],
          },
        }),
      ),
    ).toThrow('file.scene.parts[0].length must be a finite number')
  })

  it('rejects a malformed vector before it can reach geometry code', () => {
    expect(() =>
      validateLegacyFileInput(
        file({
          scene: {
            parts: [{ ...board(), position: null }],
            materials: {},
            hardware: [],
            joints: [],
            components: [],
          },
        }),
      ),
    ).toThrow('file.scene.parts[0].position must be an object')
  })

  it('validates material numeric fields', () => {
    expect(() =>
      validateLegacyFileInput(
        file({
          scene: {
            parts: [],
            materials: { Ply: { thickness: '18' } },
            hardware: [],
            joints: [],
            components: [],
          },
        }),
      ),
    ).toThrow('file.scene.materials."Ply".thickness must be a finite number')
  })

  it('keeps the existing forward-compatible rule that unknown part kinds are skipped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const raw = validateLegacyFileInput(
      file({
        scene: {
          parts: [{ kind: 'future-solid', id: 'future', label: 'Future' }],
          materials: {},
          hardware: [],
          joints: [],
          components: [],
        },
      }),
    )
    expect(raw.scene.parts).toEqual([])
    expect(warn).toHaveBeenCalledWith('zimmu: unknown part kind "future-solid" — skipped')
    warn.mockRestore()
  })

  it('parseFile returns a fully current-normalised board', () => {
    const parsed = parseFile(
      JSON.stringify(
        file({
          scene: {
            parts: [{ ...board(), grain: undefined, visible: undefined, driven: undefined }],
            materials: {},
            hardware: [],
            joints: [],
            components: [],
          },
        }),
      ),
    )
    expect(parsed.scene.parts[0]).toMatchObject({
      kind: 'board',
      grain: 'free',
      visible: true,
      driven: false,
      parentId: null,
    })
  })

  it('the final current-model assertion rejects duplicate part ids', () => {
    const current = file({
      scene: {
        parts: [board('dup'), board('dup')],
        materials: {},
        hardware: [],
        joints: [],
        components: [],
      },
    }) as unknown as ZimmuFile
    expect(() => validateCurrentFile(current)).toThrow(
      'file.scene.parts[1].id duplicates id "dup"',
    )
  })

  it('accepts a valid current file end to end', () => {
    const parsed = parseFile(
      JSON.stringify(
        file({
          scene: {
            parts: [board()],
            materials: { Ply: { thickness: 18, sheet: { length: 2440, width: 1220 } } },
            hardware: [],
            joints: [],
            components: [],
          },
        }),
      ),
    )
    expect(parsed.name).toBe('Validated fixture')
    expect(parsed.scene.parts).toHaveLength(1)
  })
})
