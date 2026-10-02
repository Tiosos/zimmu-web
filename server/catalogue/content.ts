import { createHash } from 'node:crypto'
import { CABINET_CATALOGUE } from '../../src/scene/catalogue'
import { RULE_KEYS, type RuleOverrides } from '../../src/scene/constructionRules'
import { validateCabinetRules } from '../../src/scene/fileValidation'
import { validateCarcaseParams } from '../../src/scene/carcaseValidation'
import { roleThicknessFor } from '../../src/scene/resolveThickness'
import type { CarcaseParams, MaterialDef } from '../../src/scene/types'
import { ApiError, type Kind } from './auth'

export interface RuleContent { name: string; values: RuleOverrides; materials: Record<string, MaterialDef> }
export interface ProductContent {
  name: string
  source: { id: string; version: number }
  rule: { id: string; version: number }
  overrides: Partial<CarcaseParams>
}
export interface ProductSnapshot extends ProductContent { category: 'base' | 'wall' | 'tall'; params: CarcaseParams }
export type Content = RuleContent | ProductSnapshot
export type RuleLookup = (id: string, version: number) => RuleContent | undefined

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'A JSON object is required.')
  return value as Record<string, unknown>
}
export function only(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new ApiError(400, 'Unsupported request field.')
}
export function textValue(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, `${label} is required and must be at most ${max} characters.`)
  return value.trim()
}
export function identifier(value: unknown): string {
  const id = textValue(value, 'Definition ID', 80)
  if (!/^[a-z][a-z0-9.-]*$/.test(id) || id.startsWith('starter.')) throw new ApiError(400, 'Use a company definition ID, not a reserved starter ID.')
  return id
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ApiError(400, 'An exact positive revision/version is required.')
  return Number(value)
}
const required = ['carcaseMaterial', 'backMaterial', 'frontMaterial', 'frameMaterial', 'backMode', 'jointMethod', 'frontMount', 'frontReveal']
const scalarKeys = [...RULE_KEYS, 'width', 'height', 'depth', 'baseMode', 'hasTop', 'toeKickHeight', 'toeKickSetback'] as const satisfies readonly (keyof CarcaseParams)[]

function validateRules(raw: unknown): RuleContent {
  const value = object(raw); only(value, ['name', 'values', 'materials'])
  const name = textValue(value.name, 'Rule name')
  const values = object(value.values)
  if (required.some((key) => !Object.hasOwn(values, key))) throw new ApiError(400, 'Master rules must define every common construction/material/front field.')
  validateCabinetRules({ companyId: 'validation', companyVersion: 1, project: values })
  const materials = object(value.materials)
  if (Object.keys(materials).length > 100) throw new ApiError(400, 'At most 100 material stocks are supported.')
  for (const [name, rawMaterial] of Object.entries(materials)) {
    textValue(name, 'Material name')
    const stock = object(rawMaterial); only(stock, ['thickness', 'hasGrain', 'use'])
    if (typeof stock.thickness !== 'number' || !Number.isFinite(stock.thickness) || stock.thickness <= 0 ||
        (stock.hasGrain !== undefined && typeof stock.hasGrain !== 'boolean') ||
        (stock.use !== undefined && stock.use !== 'edge')) throw new ApiError(400, 'Material stock needs positive finite thickness and valid grain/use.')
  }
  for (const key of RULE_KEYS.filter((key) => key.endsWith('Material'))) {
    const name = values[key]
    if (name === '' && key === 'edgeMaterial') continue
    if (name === undefined && key === 'edgeMaterial') continue
    const stock = materials[String(name)]
    if (!Object.hasOwn(materials, String(name)) || !stock ||
        (key === 'edgeMaterial' ? object(stock).use !== 'edge' : object(stock).use === 'edge'))
      throw new ApiError(400, `${key} must name the correct material stock.`)
  }
  return { name, values: values as RuleOverrides, materials: materials as Record<string, MaterialDef> }
}

function validateProduct(raw: unknown, lookup: RuleLookup): ProductSnapshot {
  const value = object(raw); only(value, ['name', 'source', 'rule', 'overrides'])
  const name = textValue(value.name, 'Product name')
  const source = object(value.source); only(source, ['id', 'version'])
  const rule = object(value.rule); only(rule, ['id', 'version'])
  const sourceId = textValue(source.id, 'Starter layout ID'); const sourceVersion = revision(source.version)
  const ruleId = identifier(rule.id); const ruleVersion = revision(rule.version)
  const seed = CABINET_CATALOGUE.find((d) => d.catalogueId === sourceId && d.catalogueVersion === sourceVersion)
  const master = lookup(ruleId, ruleVersion)
  if (!seed || !master) throw new ApiError(400, 'The pinned layout and published company rule version must exist.')
  const overrides = object(value.overrides); only(overrides, scalarKeys)
  const ruleOverrides = Object.fromEntries(Object.entries(overrides).filter(([key]) => (RULE_KEYS as readonly string[]).includes(key)))
  validateCabinetRules({ companyId: ruleId, companyVersion: ruleVersion, project: ruleOverrides })
  for (const [key, entry] of Object.entries(overrides)) {
    if (['width', 'height', 'depth', 'toeKickHeight', 'toeKickSetback'].includes(key) &&
        (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0)) throw new ApiError(400, 'Dimensions must be finite and non-negative.')
    if (key === 'baseMode' && !['none', 'toe-kick', 'ladder', 'legs'].includes(String(entry))) throw new ApiError(400, 'Invalid base mode.')
    if (key === 'hasTop' && typeof entry !== 'boolean') throw new ApiError(400, 'hasTop must be boolean.')
  }
  const params = { ...seed.params, ...master.values, ...seed.ruleOverrides, ...overrides } as CarcaseParams
  for (const key of RULE_KEYS.filter((key) => key.endsWith('Material'))) {
    const material = params[key as keyof CarcaseParams]
    if (key === 'edgeMaterial' && !material) continue
    const stock = master.materials[String(material)]
    if (!Object.hasOwn(master.materials, String(material)) || !stock ||
        (key === 'edgeMaterial' ? stock.use !== 'edge' : stock.use === 'edge')) throw new ApiError(400, `${key} cannot resolve the correct stock.`)
  }
  const errors = validateCarcaseParams(params, roleThicknessFor(params, master.materials, new Map()))
  if (errors.length) throw new ApiError(400, errors.join('; '))
  return { name, source: { id: sourceId, version: sourceVersion }, rule: { id: ruleId, version: ruleVersion },
    overrides: overrides as Partial<CarcaseParams>, category: seed.category, params }
}

export function validatedContent(kind: Kind, raw: unknown, lookup: RuleLookup): Content {
  try { return kind === 'rule' ? validateRules(raw) : validateProduct(raw, lookup) }
  catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, error instanceof Error ? error.message : 'Invalid catalogue content.')
  }
}
export const inputOf = (kind: Kind, content: Content): unknown => kind === 'rule' ? content : {
  name: content.name, source: (content as ProductSnapshot).source, rule: (content as ProductSnapshot).rule, overrides: (content as ProductSnapshot).overrides,
}
export function digest(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry)
  return createHash('sha256').update(canonical).digest('hex')
}
