// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { catalogueConfig } from './config'
import { audience, tenant, issuer, spaClient } from './testSupport'
const env = {
  CATALOGUE_COMPANY_ID: tenant,
  KEYCLOAK_ISSUER: issuer,
  KEYCLOAK_API_CLIENT_ID: audience,
  KEYCLOAK_SPA_CLIENT_ID: spaClient,
  CATALOGUE_IDENTITY_MAP_PATH: '/var/lib/zimmu/staff.json',
  CATALOGUE_DB_PATH: '/var/lib/zimmu/company.sqlite',
}
describe('Keycloak catalogue runtime configuration', () => {
  it('fails closed without explicit provider, canonical identity and durable files', () => {
    expect(() => catalogueConfig({})).toThrow(/Configure/)
    expect(() => catalogueConfig({ ...env, CATALOGUE_COMPANY_ID: 'company' })).toThrow(/Configure/)
    expect(() => catalogueConfig({ ...env, KEYCLOAK_SPA_CLIENT_ID: audience })).toThrow(/Configure/)
    expect(() => catalogueConfig({ ...env, KEYCLOAK_API_CLIENT_ID: 'client/path' })).toThrow(
      /Configure/,
    )
    expect(() => catalogueConfig({ ...env, CATALOGUE_IDENTITY_MAP_PATH: 'staff.json' })).toThrow(
      /absolute/,
    )
    expect(() => catalogueConfig({ ...env, CATALOGUE_DB_PATH: ':memory:' })).toThrow(/absolute/)
    expect(() => catalogueConfig({ ...env, CATALOGUE_PORT: '0' })).toThrow(/port/)
    expect(() => catalogueConfig({ ...env, CATALOGUE_PORT: '65536' })).toThrow(/port/)
    expect(() =>
      catalogueConfig({ ...env, KEYCLOAK_ISSUER: 'http://id.example/realms/company' }),
    ).toThrow(/HTTPS/)
    expect(() =>
      catalogueConfig({
        ENTRA_TENANT_ID: tenant,
        ENTRA_API_CLIENT_ID: audience,
        CATALOGUE_DB_PATH: env.CATALOGUE_DB_PATH,
      }),
    ).toThrow(/Configure/)
  })
  it('binds loopback unless hosting is explicitly configured', () => {
    expect(catalogueConfig(env)).toMatchObject({
      companyId: tenant,
      audience,
      issuer,
      spaClient,
      host: '127.0.0.1',
      port: 8787,
    })
    expect(
      catalogueConfig({ ...env, CATALOGUE_HOST: '0.0.0.0', CATALOGUE_PORT: '8080' }).port,
    ).toBe(8080)
  })
})
