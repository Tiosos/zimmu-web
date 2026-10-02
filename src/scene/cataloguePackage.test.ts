/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { packageFixture, companyId } from './__fixtures__/companyCatalogue'
import {
  MAX_CATALOGUE_BYTES,
  installCataloguePackage,
  parseCataloguePackage,
  validateCataloguePackage,
  validateInstalledCatalogues,
  qualifiedDefinition,
  verifyCataloguePackage,
} from './cataloguePackage'
import {
  catalogueDefinition,
  catalogueBaseline,
  installedDefinitions,
  reconcileCatalogue,
} from './catalogue'
import { previewCatalogueUpdate, previewProjectRules, acceptedRulePreview } from './ruleFlow'
import { DEFAULT_CABINET_RULES } from './constructionRules'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { defaultProject } from './projectStructure'
import { applyPipeline } from './pipeline'
import { PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent, Scene, CarcaseParams } from './types'

const empty = (): Scene => ({
  parts: [],
  components: [],
  materials: PRESET_MATERIALS,
  joints: [],
  hardware: [],
})
const first = (s: Scene) => s.components[0] as CarcaseComponent
function placed(s: Scene): Scene {
  const d = installedDefinitions(s.companyCatalogues)[0]
  return applyPipeline({
    ...s,
    components: [
      {
        kind: 'carcase',
        id: 'cabinet',
        label: d.name,
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        params: catalogueBaseline(d, s.cabinetRules)!,
        catalogue: { id: d.catalogueId, version: d.catalogueVersion, overrides: {} },
      },
    ],
  })
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())
describe('published company catalogue package', () => {
  it('accepts exact published snapshots and hashes, independently of field order', async () => {
    const pkg = packageFixture()
    const checked = await parseCataloguePackage(JSON.stringify(pkg))
    expect(checked).toEqual(pkg)
    expect(checked).not.toBe(pkg)
    expect(JSON.stringify(checked)).not.toContain('token')
  })
  it.each([
    [
      'schema',
      (p: CataloguePackageLike) => {
        p.schemaVersion = 2
      },
    ],
    [
      'company',
      (p: CataloguePackageLike) => {
        p.companyId = 'other'
        for (const v of p.versions as { author: string; approvedBy: string }[]) {
          v.author = `other:${v.author.split(':')[1]}`
          v.approvedBy = `other:${v.approvedBy.split(':')[1]}`
        }
      },
    ],
    [
      'unknown field',
      (p: CataloguePackageLike) => {
        p.extra = true
      },
    ],
  ])('rejects invalid %s before import', (_name, change) => {
    const pkg = packageFixture() as unknown as CataloguePackageLike
    change(pkg)
    expect(() => validateCataloguePackage(pkg)).toThrow()
  })
  it('rejects noncanonical/reserved IDs and invalid publication references', () => {
    for (const change of [
      (p: ReturnType<typeof packageFixture>) => {
        p.versions[0].definitionId = 'starter.fake'
      },
      (p: ReturnType<typeof packageFixture>) => {
        p.versions[0].author = 'other:staff'
      },
      (p: ReturnType<typeof packageFixture>) => {
        p.versions[0].hash = 'bad'
      },
      (p: ReturnType<typeof packageFixture>) => {
        p.versions[0].draftId = 'bad'
      },
      (p: ReturnType<typeof packageFixture>) => {
        p.versions[0].publishedAt = 'bad'
      },
      (p: ReturnType<typeof packageFixture>) => {
        p.versions[0].version = 0
      },
    ]) {
      const pkg = packageFixture()
      pkg.versions = [pkg.versions[0]]
      change(pkg)
      expect(() => validateCataloguePackage(pkg)).toThrow()
    }
  })
  it('rejects noncanonical rule content and definition IDs', () => {
    const pkg = packageFixture()
    pkg.versions = [pkg.versions[0]]
    pkg.versions[0].content.name = ' Leading space'
    expect(() => validateCataloguePackage(pkg)).toThrow(/Non-canonical rule/)
    pkg.versions[0].content.name = 'Company master'
    pkg.versions[0].definitionId = ' company.master'
    expect(() => validateCataloguePackage(pkg)).toThrow(/canonical/)
  })
  it('requires a different product approver belonging to the same company', () => {
    const pkg = packageFixture()
    pkg.versions[1].approvedBy = pkg.versions[1].author
    expect(() => validateCataloguePackage(pkg)).toThrow(/different approver/)
    pkg.versions[1].approvedBy = `55555555-5555-5555-5555-555555555555:${companyId}`
    expect(() => validateCataloguePackage(pkg)).toThrow(/identity/)
  })
  it('rejects duplicate versions, drafts, and missing exact rule dependencies', () => {
    const pkg = packageFixture()
    expect(() =>
      validateCataloguePackage({ ...pkg, versions: [...pkg.versions, pkg.versions[0]] }),
    ).toThrow(/Duplicate/)
    expect(() =>
      validateCataloguePackage({ ...pkg, versions: [{ ...pkg.versions[0], kind: 'draft' }] }),
    ).toThrow(/published/)
    expect(() => validateCataloguePackage({ ...pkg, versions: [pkg.versions[1]] })).toThrow(
      /pinned/,
    )
  })
  it('rejects inconsistent resolved params, invalid stock and unsupported recipe fields', () => {
    const pkg = packageFixture()
    const p = pkg.versions[1].content as {
      params: CarcaseParams
      overrides: Record<string, unknown>
    }
    p.params.width++
    expect(() => validateCataloguePackage(pkg)).toThrow(/snapshot/)
    p.params.width--
    p.overrides.section = {}
    expect(() => validateCataloguePackage(pkg)).toThrow(/Unsupported/)
    const stockPkg = packageFixture()
    const rule = stockPkg.versions[0].content as {
      materials: Record<string, { thickness: number }>
    }
    Object.values(rule.materials)[0].thickness = -1
    expect(() => validateCataloguePackage(stockPkg)).toThrow(/stock/)
  })
  it('checks digest even when content is semantically valid', async () => {
    const pkg = packageFixture()
    pkg.versions[0].content.name = 'Changed name'
    await expect(verifyCataloguePackage(pkg)).rejects.toThrow(/digest mismatch/)
  })
  it('bounds input bytes, package and installed version counts and duplicate companies', async () => {
    await expect(parseCataloguePackage(' '.repeat(MAX_CATALOGUE_BYTES + 1))).rejects.toThrow(
      /2 MiB/,
    )
    expect(() => validateCataloguePackage({ ...packageFixture(), versions: [] })).toThrow(/1–200/)
    expect(() =>
      validateCataloguePackage({ ...packageFixture(), versions: Array(201).fill(null) }),
    ).toThrow(/1–200/)
    expect(() => validateInstalledCatalogues([packageFixture(), packageFixture()])).toThrow(
      /Duplicate company/,
    )
    expect(() => validateInstalledCatalogues(Array(101).fill(null))).toThrow(/Invalid installed/)
    const many = Array.from({ length: 3 }, (_, n) => {
      const p = packageFixture(1, `${n + 1}1111111-1111-1111-1111-111111111111`)
      p.versions = Array.from({ length: 200 }, (_, i) => ({
        ...p.versions[0],
        definitionId: `company.rules-${i}`,
      }))
      return p
    })
    expect(() => validateInstalledCatalogues(many)).toThrow(/too many/)
  })
  it('installs atomically without touching geometry or original stock and is idempotent', () => {
    const original = placed(installCataloguePackage(empty(), packageFixture()))
    const before = JSON.stringify(original)
    const next = installCataloguePackage(original, packageFixture(2))
    expect(JSON.stringify(original)).toBe(before)
    expect(next.components).toBe(original.components)
    expect(next.parts).toBe(original.parts)
    expect(next.materials.Melamine).toEqual(original.materials.Melamine)
    expect(installCataloguePackage(next, packageFixture(2))).toBe(next)
    expect(first(next).catalogue?.version).toBe(1)
  })
  it('rejects immutable version and stock conflicts and preserves project prices', () => {
    const scene = installCataloguePackage(empty(), packageFixture())
    const bad = packageFixture()
    bad.versions[0].publishedAt = '2026-10-03T12:00:00Z'
    expect(() => installCataloguePackage(scene, bad)).toThrow(/immutable version/)
    const stock = Object.keys(scene.materials).find((name) => name.startsWith('company:'))!
    const priced = {
      ...scene,
      materials: { ...scene.materials, [stock]: { ...scene.materials[stock], costPerM2: 123 } },
    }
    expect(installCataloguePackage(priced, packageFixture()).materials[stock].costPerM2).toBe(123)
    priced.materials[stock].thickness = 999
    expect(() => installCataloguePackage(priced, packageFixture())).toThrow(/stock conflicts/)
  })
  it('resolves same product IDs from different companies independently', () => {
    const a = packageFixture()
    const b = packageFixture(2, '55555555-5555-5555-5555-555555555555')
    const s = installCataloguePackage(installCataloguePackage(empty(), a), b)
    expect(installedDefinitions(s.companyCatalogues)).toHaveLength(2)
    expect(installCataloguePackage(s, a)).toBe(s)
    expect(
      catalogueDefinition(qualifiedDefinition(a.companyId, 'company.base'), 1, s.companyCatalogues)
        ?.params.width,
    ).toBe(610)
    expect(
      catalogueDefinition(qualifiedDefinition(b.companyId, 'company.base'), 2, s.companyCatalogues)
        ?.params.width,
    ).toBe(620)
    expect(catalogueDefinition(qualifiedDefinition(a.companyId, 'company.base'), 1)).toBeUndefined()
  })
  it('previews updates with pinned new stocks and retains project/item overrides', () => {
    let s = placed(installCataloguePackage(empty(), packageFixture()))
    const component = first(s)
    component.params.width = 750
    s = applyPipeline({
      ...s,
      components: [reconcileCatalogue(component, s.cabinetRules, s.companyCatalogues)],
    })
    s = previewProjectRules(s, { ...DEFAULT_CABINET_RULES, project: { frontReveal: 7 } }).candidate
    s = installCataloguePackage(s, packageFixture(2))
    const preview = previewCatalogueUpdate(s, 'cabinet', 2)
    expect(preview.errors).toEqual([])
    expect(first(s).catalogue?.version).toBe(1)
    expect(first(preview.candidate).params.width).toBe(750)
    expect(first(preview.candidate).params.frontReveal).toBe(7)
    expect(first(preview.candidate).params.carcaseMaterial).toContain(':v2:')
    expect(first(preview.candidate).catalogue?.overrides.width).toBe(750)
    expect(first(preview.candidate).params.section).toEqual(component.params.section)
    expect(
      acceptedRulePreview(
        { ...s, cabinetRules: { ...DEFAULT_CABINET_RULES, project: {} } },
        preview,
      ),
    ).toBeUndefined()
    expect(acceptedRulePreview(s, preview)).toBe(preview.candidate)
  })
  it('reopens saved installed definitions offline without geometry adoption and preserves legacy files', () => {
    const scene = installCataloguePackage(
      placed(installCataloguePackage(empty(), packageFixture())),
      packageFixture(2),
    )
    const file = {
      version: FILE_FORMAT_VERSION,
      name: 'Project',
      appVersion: '',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene,
      project: defaultProject(scene, 'Project'),
    }
    const reopened = parseFile(JSON.stringify(file))
    expect(reopened.scene.companyCatalogues).toEqual(scene.companyCatalogues)
    expect(first(reopened.scene).params).toEqual(first(scene).params)
    expect(reopened.scene.parts).toEqual(scene.parts)
    expect(previewCatalogueUpdate(reopened.scene, 'cabinet', 2).errors).toEqual([])
    const legacy = parseFile(
      JSON.stringify({
        ...file,
        version: 26,
        scene: empty(),
        project: defaultProject(empty(), 'Legacy'),
      }),
    )
    expect(legacy.scene.companyCatalogues).toBeUndefined()
    const broken = structuredClone(file)
    broken.scene.companyCatalogues![0].versions[1].content = { name: 'Broken' } as never
    expect(() => parseFile(JSON.stringify(broken))).toThrow()
  })
})
type CataloguePackageLike = Record<string, unknown>
