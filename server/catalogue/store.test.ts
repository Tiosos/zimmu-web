// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CatalogueStore } from './store'
import { actorId } from './auth'
import { admin, designer, master, product, reader, reviewer, seedRules, tenant } from './testSupport'

const stores: CatalogueStore[] = []; const folders: string[] = []
const open = (path = ':memory:', company = tenant) => { const store = new CatalogueStore(path, company); stores.push(store); return store }
afterEach(() => { stores.splice(0).forEach((store) => store.close()); folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })) })
const database = () => { const folder = mkdtempSync(join(tmpdir(), 'catalogue-test-')); folders.push(folder); return join(folder, 'company.sqlite') }
const submitted = (store: CatalogueStore) => {
  seedRules(store); const draft = store.create(designer, 'product', 'company.base', product)
  return store.act(designer, draft.id, 1, 'submit')
}

describe('company catalogue publishing', () => {
  it('requires IT for master rules and senior designers for products', () => {
    const store = open()
    expect(() => store.create(designer, 'rule', 'company.master', master)).toThrow(/company role/)
    seedRules(store)
    expect(() => store.create(admin, 'product', 'company.base', product)).toThrow(/company role/)
    expect(() => store.create(reader, 'product', 'company.base', product)).toThrow(/company role/)
    expect(store.listVersions(reader)).toHaveLength(1)
    expect(() => store.listVersions({ ...reader, tenantId: 'foreign' })).toThrow(/tenant/)
  })
  it('freezes submission and requires a different reviewer to publish the exact snapshot', () => {
    const store = open(); const draft = submitted(store)
    expect(() => store.edit(designer, draft.id, 2, product)).toThrow(/cannot be edited/)
    expect(() => store.act(designer, draft.id, 2, 'publish')).toThrow(/different/)
    expect(() => store.act(admin, draft.id, 2, 'publish')).toThrow(/company role/)
    expect(store.listVersions(reader)).toHaveLength(1)
    const approved = store.act(reviewer, draft.id, 2, 'publish', 'Checked dimensions and construction')
    expect(approved.state).toBe('published')
    const version = store.listVersions(reader).find((v) => v.kind === 'product')!
    expect(version.content).toEqual(draft.content)
    expect(version.hash).toBe(draft.hash)
    expect(version.author).toBe(actorId(designer)); expect(version.approvedBy).toBe(actorId(reviewer))
    expect(() => store.edit(designer, draft.id, 3, product)).toThrow(/cannot be edited/)
    expect(() => store.act(reviewer, draft.id, 3, 'publish')).toThrow(/submitted/)
    expect(store.audit(reviewer, draft.id)).toMatchObject([
      { action: 'create', revision: 1 }, { action: 'submit', revision: 2 }, { action: 'publish', revision: 3, actor: actorId(reviewer), hash: draft.hash },
    ])
  })
  it('returns requested changes to the creator and invalidates old reviews', () => {
    const store = open(); const draft = submitted(store)
    expect(() => store.act(reviewer, draft.id, 2, 'request-changes')).toThrow(/Review note/)
    store.act(reviewer, draft.id, 2, 'request-changes', 'Please increase depth')
    expect(() => store.edit(reviewer, draft.id, 3, product)).toThrow(/creator/)
    store.edit(designer, draft.id, 3, { ...product, overrides: { depth: 600 } })
    expect(() => store.act(reviewer, draft.id, 2, 'publish')).toThrow(/Draft changed/)
    expect(() => store.act(reviewer, draft.id, 4, 'submit')).toThrow(/creator/)
    store.act(designer, draft.id, 4, 'submit')
    store.act(reviewer, draft.id, 5, 'publish')
    expect(store.get(reviewer, draft.id).revision).toBe(6)
  })
  it('allows only creator withdrawal and rejects publication after withdrawal', () => {
    const store = open(); const draft = submitted(store)
    expect(() => store.act(reviewer, draft.id, 2, 'withdraw')).toThrow(/creator/)
    store.act(designer, draft.id, 2, 'withdraw')
    expect(() => store.act(reviewer, draft.id, 3, 'publish')).toThrow(/submitted/)
  })
  it('pins rule/material versions and rejects invalid recipes or missing references', () => {
    const store = open(); seedRules(store)
    expect(() => store.create(designer, 'product', 'company.base', { ...product, rule: { id: 'company.master', version: 99 } })).toThrow(/must exist/)
    expect(() => store.create(designer, 'product', 'company.base', { ...product, overrides: { width: 20 } })).toThrow(/width/)
    expect(() => store.create(designer, 'product', 'company.base', { ...product, overrides: { frontMount: 'half-overlay' } })).toThrow(/face frame/)
    expect(() => store.create(designer, 'product', 'company.base', { ...product, overrides: { section: {} } })).toThrow(/Unsupported/)
    expect(() => store.create(admin, 'rule', 'company.bad', { ...master, materials: { ...master.materials, '18mm Ply': { thickness: 0 } } })).toThrow(/thickness/)
    const draft = store.create(designer, 'product', 'company.base', product)
    const rule2 = store.create(admin, 'rule', 'company.master', { ...master, values: { ...master.values, frontReveal: 5 } })
    store.act(admin, rule2.id, 1, 'submit'); store.act(admin, rule2.id, 2, 'publish')
    store.act(designer, draft.id, 1, 'submit'); store.act(reviewer, draft.id, 2, 'publish')
    const published = store.listVersions(reader).find((v) => v.kind === 'product')!
    expect(published.content).toMatchObject({ rule: { version: 1 }, params: { frontReveal: 3 } })
  })
  it('preserves recipe precedence and rejects unimplemented fields/material mismatches', () => {
    const store = open(); seedRules(store)
    const draft = store.create(designer, 'product', 'company.recipe', { ...product, overrides: { frontReveal: 5, width: 750, hasTop: false } })
    expect(draft.content).toMatchObject({ params: { frontReveal: 5, width: 750, hasTop: false } })
    for (const overrides of [{ backSetback: 20 }, { width: Infinity }, { baseMode: 'invented' }, { hasTop: 'yes' },
      { edgeMaterial: '18mm Ply' }, { carcaseMaterial: 'missing' }, { frontReveal: -1 }]) {
      expect(() => store.create(designer, 'product', 'company.bad', { ...product, overrides })).toThrow()
    }
    expect(() => store.create(admin, 'rule', 'company.bad', { ...master, values: { ...master.values, width: 600 } })).toThrow(/supported/)
    expect(() => store.create(admin, 'rule', 'company.bad', { ...master, values: {} })).toThrow(/every common/)
    expect(() => store.create(admin, 'rule', 'company.bad', { ...master, materials: { ...master.materials, '18mm Ply': { thickness: 18, use: 'edge' } } })).toThrow(/correct/)
  })

  it('persists snapshots/audit across reopening and prevents SQL rewrite/deletion', () => {
    const path = database(); const store = open(path); const draft = submitted(store)
    store.act(reviewer, draft.id, 2, 'publish')
    const before = store.listVersions(reader); const audit = store.audit(reviewer, draft.id)
    store.close(); stores.splice(stores.indexOf(store), 1)
    const reopened = open(path)
    expect(reopened.listVersions(reader)).toEqual(before); expect(reopened.audit(reviewer, draft.id)).toEqual(audit)
    const sql = new DatabaseSync(path)
    try {
      expect(() => sql.exec('UPDATE versions SET data=\'{}\'')).toThrow(/immutable/)
      expect(() => sql.exec('DELETE FROM versions')).toThrow(/immutable/)
      expect(() => sql.exec('UPDATE audit SET data=\'{}\'')).toThrow(/append only/)
      expect(() => sql.exec('DELETE FROM audit')).toThrow(/append only/)
    } finally { sql.close() }
    expect(open(path, 'another-tenant').listVersions({ ...reader, tenantId: 'another-tenant' })).toEqual([])
  })
  it('rejects competing stale draft bases across database connections', () => {
    const path = database(); const first = open(path); seedRules(first); const second = open(path)
    const a = first.create(designer, 'product', 'company.base', product)
    const b = second.create(designer, 'product', 'company.base', { ...product, overrides: { width: 750 } })
    first.act(designer, a.id, 1, 'submit'); second.act(designer, b.id, 1, 'submit')
    first.act(reviewer, a.id, 2, 'publish')
    expect(() => second.act(reviewer, b.id, 2, 'publish')).toThrow(/newer version/)
    expect(second.get(reviewer, b.id).state).toBe('submitted')
    expect(second.listVersions(reader).filter((v) => v.kind === 'product')).toHaveLength(1)
    const current = second.create(designer, 'product', 'company.base', product)
    second.act(designer, current.id, 1, 'submit'); second.act(reviewer, current.id, 2, 'publish')
    expect(first.listVersions(reader).filter((v) => v.kind === 'product').map((v) => v.version)).toEqual([1, 2])
  })
  it('rolls back publication if its audit cannot be committed', () => {
    const path = database(); const store = open(path); const draft = submitted(store)
    const sql = new DatabaseSync(path)
    sql.exec("CREATE TRIGGER fail_publication_audit BEFORE INSERT ON audit WHEN json_extract(NEW.data,'$.action')='publish' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;")
    try {
      expect(() => store.act(reviewer, draft.id, 2, 'publish')).toThrow(/audit unavailable/)
      expect(store.get(reviewer, draft.id).state).toBe('submitted')
      expect(store.listVersions(reader).filter((v) => v.kind === 'product')).toEqual([])
      expect(store.audit(reviewer, draft.id)).toHaveLength(2)
    } finally { sql.close() }
  })
})
