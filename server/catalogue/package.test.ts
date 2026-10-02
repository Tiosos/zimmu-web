// @vitest-environment node
import { expect, it } from 'vitest'
import { CatalogueStore } from './store'
import { digest } from './content'
import { designer, reviewer, reader, product, seedRules, tenant } from './testSupport'
import { parseCataloguePackage } from '../../src/scene/cataloguePackage'
it('exports real immutable SQLite publications with hashes compatible with browser verification', async () => {
  const store = new CatalogueStore(':memory:', tenant)
  try {
    seedRules(store)
    const draft = store.create(designer, 'product', 'company.base', product)
    store.act(designer, draft.id, 1, 'submit')
    const before = store.listVersions(reader)
    expect(before.map((v) => v.kind)).toEqual(['rule'])
    store.act(reviewer, draft.id, 2, 'publish')
    store.create(designer, 'product', 'company.unpublished', product)
    const versions = store.listVersions(reader)
    expect(versions).toHaveLength(2)
    for (const v of versions) expect(v.hash).toBe(digest(v.content))
    const text = JSON.stringify({
      format: 'zimmu-company-catalogue',
      schemaVersion: 1,
      companyId: tenant,
      versions,
    })
    const checked = await parseCataloguePackage(text)
    expect(checked.versions).toEqual(versions)
    expect(text).not.toContain('company.unpublished')
  } finally {
    store.close()
  }
})
