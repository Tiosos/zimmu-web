// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { catalogueConfig } from './config'
import { audience, tenant } from './testSupport'
const env = { ENTRA_TENANT_ID: tenant, ENTRA_API_CLIENT_ID: audience, CATALOGUE_DB_PATH: '/var/lib/zimmu/company.sqlite' }
describe('catalogue runtime configuration', () => {
  it('fails closed without real tenant/API IDs and durable storage', () => {
    expect(() => catalogueConfig({})).toThrow(/Configure/)
    expect(() => catalogueConfig({ ...env, ENTRA_TENANT_ID: 'common' })).toThrow(/GUIDs/)
    expect(() => catalogueConfig({ ...env, CATALOGUE_DB_PATH: ':memory:' })).toThrow(/absolute/)
    expect(() => catalogueConfig({ ...env, CATALOGUE_PORT: '0' })).toThrow(/port/)
    expect(() => catalogueConfig({ ...env, CATALOGUE_PORT: '65536' })).toThrow(/port/)
  })
  it('binds loopback unless hosting is explicitly configured', () => {
    expect(catalogueConfig(env)).toMatchObject({ tenant, audience, host: '127.0.0.1', port: 8787 })
    expect(catalogueConfig({ ...env, CATALOGUE_HOST: '0.0.0.0', CATALOGUE_PORT: '8080' }).port).toBe(8080)
  })
})
