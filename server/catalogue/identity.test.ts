// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { identityBindings, loadIdentityBindings } from './identity'
import { issuer, tenant, designer, reviewer } from './testSupport'
const data = {
  issuer,
  companyId: tenant,
  users: [{ subject: 'keycloak-subject', staffId: designer.objectId }],
}
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))
it('binds exact external subjects to stable canonical staff IDs', () => {
  expect(identityBindings(data, issuer, tenant).get('keycloak-subject')).toBe(designer.objectId)
  expect(identityBindings({ ...data, users: [] }, issuer, tenant).size).toBe(0)
})
it('rejects duplicate subjects/staff, wrong company/issuer and caller identity fields', () => {
  for (const raw of [
    null,
    [],
    { ...data, issuer: 'other' },
    { ...data, companyId: 'other' },
    { ...data, roles: [] },
    { ...data, users: {} },
    { ...data, users: [{ subject: '', staffId: designer.objectId }] },
    { ...data, users: [null] },
    { ...data, users: [[]] },
    { ...data, users: [{ subject: 'a b', staffId: designer.objectId }] },
    { ...data, users: [{ subject: 'a' + String.fromCharCode(1), staffId: designer.objectId }] },
    { ...data, users: [{ subject: 'x'.repeat(256), staffId: designer.objectId }] },
    { ...data, users: Array(10001).fill(data.users[0]) },
    { ...data, users: [{ subject: 'x', staffId: 'email@example.com' }] },
    { ...data, users: [{ ...data.users[0], email: 'staff@example.com' }] },
    { ...data, users: [data.users[0], { subject: 'other', staffId: designer.objectId }] },
    {
      ...data,
      users: [data.users[0], { subject: 'keycloak-subject', staffId: reviewer.objectId }],
    },
  ])
    expect(() => identityBindings(raw, issuer, tenant)).toThrow()
})
it('reloads IT changes and fails closed for missing, malformed and oversized files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zimmu-bindings-'))
  dirs.push(dir)
  const path = join(dir, 'bindings.json')
  expect(() => loadIdentityBindings(path, issuer, tenant)).toThrow()
  writeFileSync(path, JSON.stringify(data))
  expect(loadIdentityBindings(path, issuer, tenant).size).toBe(1)
  writeFileSync(path, JSON.stringify({ ...data, users: [] }))
  expect(loadIdentityBindings(path, issuer, tenant).size).toBe(0)
  writeFileSync(path, '{')
  expect(() => loadIdentityBindings(path, issuer, tenant)).toThrow()
  writeFileSync(path, ' '.repeat(1024 * 1024 + 1))
  expect(() => loadIdentityBindings(path, issuer, tenant)).toThrow(/exceeds/)
})
