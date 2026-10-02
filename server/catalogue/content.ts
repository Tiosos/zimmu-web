import { createHash } from 'node:crypto'
import { ApiError, type Kind } from './auth'
import {
  validatedCatalogueContent,
  identifier as sharedIdentifier,
  object as sharedObject,
  only as sharedOnly,
  revision as sharedRevision,
  textValue as sharedText,
  type Content,
  type RuleLookup,
} from '../../src/company/catalogueContent'
export { inputOf } from '../../src/company/catalogueContent'
export type {
  RuleContent,
  ProductContent,
  ProductSnapshot,
  Content,
  RuleLookup,
} from '../../src/company/catalogueContent'

export function validatedContent(kind: Kind, raw: unknown, lookup: RuleLookup): Content {
  try {
    return validatedCatalogueContent(kind, raw, lookup)
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : 'Invalid catalogue content.')
  }
}
export function digest(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry,
  )
  return createHash('sha256').update(canonical).digest('hex')
}

function apiBoundary<T>(action: () => T): T {
  try {
    return action()
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : 'Invalid catalogue content.')
  }
}
export const object = (value: unknown) => apiBoundary(() => sharedObject(value))
export const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  apiBoundary(() => sharedOnly(value, keys))
export const revision = (value: unknown) => apiBoundary(() => sharedRevision(value))
export const textValue = (value: unknown, label: string, max?: number) =>
  apiBoundary(() => sharedText(value, label, max))

export const identifier = (value: unknown) => apiBoundary(() => sharedIdentifier(value))
