import {
  validatedCatalogueContent,
  object,
  only,
  revision,
  identifier,
} from '../company/catalogueContent'
import type { Published, RuleContent } from '../company/types'
import type { Scene, MaterialDef } from './types'
import { RULE_KEYS } from './constructionRules'

export interface CataloguePackage {
  format: 'zimmu-company-catalogue'
  schemaVersion: 1
  companyId: string
  versions: Published[]
}
export const MAX_CATALOGUE_BYTES = 2 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const canonicalContent = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry,
  )
export const qualifiedDefinition = (company: string, id: string) => `company:${company}:${id}`
export const qualifiedStock = (company: string, id: string, version: number, name: string) =>
  `${qualifiedDefinition(company, id)}:v${version}:${name}`
export function remapRuleMaterials<T extends Record<string, unknown>>(
  values: T,
  company: string,
  id: string,
  version: number,
): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      (RULE_KEYS as readonly string[]).includes(key) &&
      key.endsWith('Material') &&
      typeof value === 'string' &&
      value
        ? qualifiedStock(company, id, version, value)
        : value,
    ]),
  ) as T
}
const versionKey = (v: Published) => `${v.kind}:${v.definitionId}:${v.version}`

/** Synchronous structural/semantic boundary, also used before saved-file migration. */
export function validateCataloguePackage(raw: unknown, maxVersions = 200): CataloguePackage {
  const value = object(raw)
  only(value, ['format', 'schemaVersion', 'companyId', 'versions'])
  if (value.format !== 'zimmu-company-catalogue' || value.schemaVersion !== 1)
    throw new Error('Unsupported company catalogue package format/version.')
  if (typeof value.companyId !== 'string' || !UUID.test(value.companyId))
    throw new Error('Catalogue company ID must be a canonical UUID.')
  if (
    !Array.isArray(value.versions) ||
    !value.versions.length ||
    value.versions.length > maxVersions
  )
    throw new Error(`Catalogue must contain 1–${maxVersions} published versions.`)
  const seen = new Set<string>()
  for (const rawVersion of value.versions) {
    const v = object(rawVersion)
    only(v, [
      'kind',
      'definitionId',
      'version',
      'content',
      'hash',
      'author',
      'approvedBy',
      'publishedAt',
      'draftId',
    ])
    if (v.kind !== 'rule' && v.kind !== 'product')
      throw new Error('Only published rule/product versions may be imported.')
    if (identifier(v.definitionId) !== v.definitionId)
      throw new Error('Definition ID must be canonical.')
    revision(v.version)
    if (typeof v.hash !== 'string' || !/^[0-9a-f]{64}$/.test(v.hash))
      throw new Error('Invalid published content digest.')
    for (const key of ['author', 'approvedBy']) {
      if (
        typeof v[key] !== 'string' ||
        !v[key].startsWith(`${value.companyId}:`) ||
        !UUID.test(v[key].slice(value.companyId.length + 1))
      )
        throw new Error('Publication identity must belong to the package company.')
    }
    if (v.kind === 'product' && v.author === v.approvedBy)
      throw new Error('Product publication requires a different approver.')
    if (
      typeof v.draftId !== 'string' ||
      !UUID.test(v.draftId) ||
      typeof v.publishedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT/.test(v.publishedAt) ||
      !Number.isFinite(Date.parse(v.publishedAt))
    )
      throw new Error('Invalid publication date/draft reference.')
    const key = versionKey(v as unknown as Published)
    if (seen.has(key)) throw new Error('Duplicate published version in package.')
    seen.add(key)
  }
  const pkg = value as unknown as CataloguePackage
  const rules = new Map<string, RuleContent>()
  for (const v of pkg.versions.filter((v) => v.kind === 'rule')) {
    const content = validatedCatalogueContent('rule', v.content, () => undefined) as RuleContent
    if (canonicalContent(content) !== canonicalContent(v.content))
      throw new Error('Non-canonical rule snapshot.')
    rules.set(`${v.definitionId}:${v.version}`, content)
  }
  for (const v of pkg.versions.filter((v) => v.kind === 'product')) {
    const rawContent = object(v.content)
    only(rawContent, ['name', 'source', 'rule', 'overrides', 'category', 'params'])
    const content = validatedCatalogueContent(
      'product',
      {
        name: rawContent.name,
        source: rawContent.source,
        rule: rawContent.rule,
        overrides: rawContent.overrides,
      },
      (id, version) => rules.get(`${id}:${version}`),
    )
    if (canonicalContent(content) !== canonicalContent(v.content))
      throw new Error('Published product snapshot does not match its pinned rules/layout.')
  }
  return pkg
}

export function validateInstalledCatalogues(raw: unknown): CataloguePackage[] {
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error('Invalid installed company catalogues.')
  const packages = raw.map((entry) => validateCataloguePackage(entry, 500))
  if (
    new Set(packages.map((p) => p.companyId)).size !== packages.length ||
    packages.reduce((n, p) => n + p.versions.length, 0) > 500
  )
    throw new Error('Duplicate company or too many installed versions.')
  return packages
}
export async function verifyCataloguePackage(raw: unknown): Promise<CataloguePackage> {
  const pkg = validateCataloguePackage(raw)
  for (const version of pkg.versions) {
    const bytes = new TextEncoder().encode(canonicalContent(version.content))
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    if (hash !== version.hash)
      throw new Error(`Content digest mismatch: ${version.definitionId} v${version.version}.`)
  }
  return structuredClone(pkg)
}
export async function parseCataloguePackage(text: string): Promise<CataloguePackage> {
  if (new TextEncoder().encode(text).length > MAX_CATALOGUE_BYTES)
    throw new Error('Catalogue package exceeds 2 MiB.')
  return verifyCataloguePackage(JSON.parse(text) as unknown)
}
export function installCataloguePackage(scene: Scene, raw: CataloguePackage): Scene {
  const pkg = validateCataloguePackage(raw)
  const installed = validateInstalledCatalogues(scene.companyCatalogues ?? [])
  const previous = installed.find((p) => p.companyId === pkg.companyId)
  const versions = new Map((previous?.versions ?? []).map((v) => [versionKey(v), v]))
  for (const v of pkg.versions) {
    const old = versions.get(versionKey(v))
    if (old && canonicalContent(old) !== canonicalContent(v))
      throw new Error('An installed immutable version conflicts with this package.')
    versions.set(versionKey(v), v)
  }
  const merged = { ...pkg, versions: [...versions.values()] }
  const packages = previous
    ? installed.map((p) => (p.companyId === pkg.companyId ? merged : p))
    : [...installed, merged]
  validateInstalledCatalogues(packages)
  const materials = { ...scene.materials }
  for (const v of pkg.versions.filter((v) => v.kind === 'rule')) {
    for (const [name, stock] of Object.entries((v.content as RuleContent).materials)) {
      const key = qualifiedStock(pkg.companyId, v.definitionId, v.version, name)
      const old: MaterialDef | undefined = materials[key]
      if (
        old &&
        (old.thickness !== stock.thickness ||
          (old.hasGrain ?? true) !== (stock.hasGrain ?? true) ||
          old.use !== stock.use)
      )
        throw new Error(`Installed material stock conflicts: ${name}.`)
      if (!old) materials[key] = structuredClone(stock)
    }
  }
  if (
    canonicalContent(scene.companyCatalogues ?? []) === canonicalContent(packages) &&
    canonicalContent(materials) === canonicalContent(scene.materials)
  )
    return scene
  return { ...scene, companyCatalogues: structuredClone(packages), materials }
}
