import type { CarcaseParams, MaterialDef } from '../scene/types'
import type { RuleOverrides } from '../scene/constructionRules'

export const COMPANY_ROLES = {
  rule: 'Catalogue.RuleAdministrator',
  product: 'Catalogue.ProductDesigner',
} as const
export type Kind = keyof typeof COMPANY_ROLES
export interface Principal {
  tenantId: string
  objectId: string
  roles: string[]
}
export const principalId = (actor: Principal) => `${actor.tenantId}:${actor.objectId}`
export interface RuleContent {
  name: string
  values: RuleOverrides
  materials: Record<string, MaterialDef>
}
export interface ProductContent {
  name: string
  source: { id: string; version: number }
  rule: { id: string; version: number }
  overrides: Partial<CarcaseParams>
  category?: 'base' | 'wall' | 'tall'
  params?: CarcaseParams
}
export type Content = RuleContent | ProductContent
export interface Draft {
  id: string
  kind: Kind
  definitionId: string
  baseVersion: number
  revision: number
  state: 'draft' | 'submitted' | 'published'
  author: string
  content: Content
  hash: string
}
export interface Published {
  kind: Kind
  definitionId: string
  version: number
  content: Content
  hash: string
  author: string
  approvedBy: string
  publishedAt: string
  draftId: string
}
export interface Audit {
  sequence: number
  action: string
  revision: number
  state: string
  actor: string
  at: string
  note: string
  hash: string
}
export type Action = 'submit' | 'withdraw' | 'request-changes' | 'publish'
export function permissions(actor: Principal, draft: Draft) {
  const authorised = actor.roles.includes(COMPANY_ROLES[draft.kind])
  const creator = draft.author === principalId(actor)
  return {
    edit: authorised && creator && draft.state === 'draft',
    submit: authorised && creator && draft.state === 'draft',
    withdraw: authorised && creator && draft.state === 'submitted',
    review: authorised && draft.state === 'submitted' && (draft.kind === 'rule' || !creator),
  }
}
export function editableContent(kind: Kind, content: Content): Content {
  if (kind === 'rule') return structuredClone(content)
  const product = content as ProductContent
  return structuredClone({
    name: product.name,
    source: product.source,
    rule: product.rule,
    overrides: product.overrides,
  })
}

export interface CompanyData {
  actor: Principal
  drafts: Draft[]
  versions: Published[]
}
