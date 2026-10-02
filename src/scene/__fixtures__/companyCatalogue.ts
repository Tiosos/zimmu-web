/// <reference types="node" />
import { createHash } from 'node:crypto'
import { validatedCatalogueContent } from '../../company/catalogueContent'
import { seedContent } from '../../company/seed'
import type { RuleContent, Published } from '../../company/types'
import { canonicalContent, type CataloguePackage } from '../cataloguePackage'
export const companyId = '11111111-1111-1111-1111-111111111111'
export const staffId = '22222222-2222-2222-2222-222222222222'
export const reviewerId = '33333333-3333-3333-3333-333333333333'
export function packageFixture(version = 1, company = companyId): CataloguePackage {
  const rule = seedContent('rule', []) as RuleContent
  rule.name = 'Company master'
  for (const stock of Object.values(rule.materials))
    if (stock.use !== 'edge') stock.thickness = stock.thickness! + version - 1
  rule.values.frontReveal = 4 + version
  const product = validatedCatalogueContent(
    'product',
    {
      name: 'Company base',
      source: { id: 'starter.base-600', version: 1 },
      rule: { id: 'company.master', version },
      overrides: { width: 600 + version * 10, frontReveal: 4 + version },
    },
    () => rule,
  )
  const entry = (kind: 'rule' | 'product', content: Published['content']): Published => ({
    kind,
    definitionId: kind === 'rule' ? 'company.master' : 'company.base',
    version,
    content,
    hash: createHash('sha256').update(canonicalContent(content)).digest('hex'),
    author: `${company}:${staffId}`,
    approvedBy: `${company}:${kind === 'rule' ? staffId : reviewerId}`,
    publishedAt: '2026-10-02T12:00:00.000Z',
    draftId: '44444444-4444-4444-4444-444444444444',
  })
  return {
    format: 'zimmu-company-catalogue',
    schemaVersion: 1,
    companyId: company,
    versions: [entry('rule', rule), entry('product', product)],
  }
}
