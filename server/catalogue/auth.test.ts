// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { generateKeyPair } from 'jose'
import { keycloakVerifier, keycloakIssuer, ROLES } from './auth'
import { authConfig, audience, designer, signedTokens, tenant } from './testSupport'
import { CatalogueStore } from './store'
import { product, seedRules } from './testSupport'

let fixture: Awaited<ReturnType<typeof signedTokens>>
beforeAll(async () => {
  fixture = await signedTokens()
})
const token = (...args: Parameters<typeof fixture.token>) => fixture.token(...args)
const bindings = new Map([
  ['external-subject', designer.objectId],
  [designer.objectId, designer.objectId],
])
const verify = () => keycloakVerifier(authConfig, () => bindings, fixture.keys)

describe('Keycloak API access token verification', () => {
  it('derives canonical staff identity and only allowlisted API-client roles', async () => {
    expect(
      await verify()(
        `Bearer ${await token({ sub: 'external-subject', tid: 'forged-company', oid: 'forged-staff', roles: [ROLES.rule], realm_access: { roles: [ROLES.rule] } })}`,
      ),
    ).toEqual({ tenantId: tenant, objectId: designer.objectId, roles: [ROLES.product] })
    expect(
      (
        await verify()(
          `Bearer ${await token({ resource_access: { [audience]: { roles: [ROLES.product, ROLES.product, 'unrelated'] } } })}`,
        )
      ).roles,
    ).toEqual([ROLES.product])
    expect(
      (
        await verify()(
          `Bearer ${await token({ resource_access: { other: { roles: [ROLES.rule] } }, realm_access: { roles: [ROLES.rule] }, roles: [ROLES.rule] })}`,
        )
      ).roles,
    ).toEqual([])
  })
  it.each([
    { aud: 'another-api' },
    { iss: 'https://evil.invalid/realms/company' },
    { sub: 'unbound' },
    { sub: '' },
    { scope: 'Other.Scope' },
    { azp: audience },
    { azp: 'another-spa' },
    { typ: 'ID' },
    { typ: 'Refresh' },
    { exp: 1 },
    { iat: 'yesterday' },
    { iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) },
    { scope: 'prefixCatalogue.AccessSuffix' },
    { sub: 42 },
    { iat: Math.floor(Date.now() / 1000) + 60 },
    { iat: Math.floor(Date.now() / 1000) + 20, exp: Math.floor(Date.now() / 1000) + 20 },
    { nbf: Math.floor(Date.now() / 1000) + 600 },
  ])('rejects invalid access claims %j', async (claims) => {
    await expect(verify()(`Bearer ${await token(claims)}`)).rejects.toMatchObject({ status: 401 })
  })
  it.each(['exp', 'iat', 'sub', 'scope', 'azp', 'typ'])(
    'requires %s, rejecting ID/service tokens',
    async (claim) => {
      await expect(verify()(`Bearer ${await token({}, [claim])}`)).rejects.toMatchObject({
        status: 401,
      })
    },
  )
  it('rejects unsigned, foreign-key and malformed authorization', async () => {
    const other = await generateKeyPair('RS256')
    await expect(verify()(`Bearer ${await token({}, [], other.privateKey)}`)).rejects.toMatchObject(
      { status: 401 },
    )
    await expect(verify()('Bearer eyJhbGciOiJub25lIn0.e30.')).rejects.toMatchObject({ status: 401 })
    await expect(verify()(undefined)).rejects.toMatchObject({ status: 401 })
    await expect(verify()('Basic token')).rejects.toMatchObject({ status: 401 })
  })
  it('fails closed when bindings are unavailable or invalid', async () => {
    for (const map of [
      () => {
        throw new Error('unavailable')
      },
      () => new Map([[designer.objectId, 'invalid']]),
    ]) {
      await expect(
        keycloakVerifier(authConfig, map, fixture.keys)(`Bearer ${await token()}`),
      ).rejects.toMatchObject({ status: 401 })
    }
  })
  it('rejects unsafe verifier configuration', () => {
    for (const config of [
      { ...authConfig, companyId: 'bad' },
      { ...authConfig, audience: '' },
      { ...authConfig, spaClient: '' },
      { ...authConfig, spaClient: audience },
    ])
      expect(() => keycloakVerifier(config, () => bindings, fixture.keys)).toThrow()
  })
  it('revokes a removed binding even with an unexpired signed token', async () => {
    const mutable = new Map(bindings)
    const check = keycloakVerifier(authConfig, () => mutable, fixture.keys)
    const auth = `Bearer ${await token()}`
    expect(await check(auth)).toMatchObject({ objectId: designer.objectId })
    mutable.delete(designer.objectId)
    await expect(check(auth)).rejects.toMatchObject({ status: 401 })
  })
  it('keeps a migrated author from approving their old submitted draft and retains evidence', async () => {
    const store = new CatalogueStore(':memory:', tenant)
    try {
      seedRules(store)
      const draft = store.create(designer, 'product', 'company.migrated', product)
      store.act(designer, draft.id, 1, 'submit')
      const migrated = await verify()(`Bearer ${await token({ sub: 'external-subject' })}`)
      expect(migrated).toEqual(designer)
      expect(() => store.act(migrated, draft.id, 2, 'publish')).toThrow(/different authorised/)
      expect(store.get(migrated, draft.id).author).toBe(`${tenant}:${designer.objectId}`)
      expect(store.audit(migrated, draft.id)).toHaveLength(2)
    } finally {
      store.close()
    }
  })
  it('accepts trusted HTTPS/loopback realm paths only', () => {
    expect(keycloakIssuer('https://id.example/realms/company')).toBe(
      'https://id.example/realms/company',
    )
    expect(keycloakIssuer('http://127.0.0.1:8080/realms/company')).toBe(
      'http://127.0.0.1:8080/realms/company',
    )
    for (const url of [
      'http://id.example/realms/company',
      'https://user:pass@id.example/realms/company',
      'https://id.example/realms/company?x=1',
      'https://id.example/realms/company#x',
      'https://id.example/realms/company/',
      'https://id.example',
    ])
      expect(() => keycloakIssuer(url)).toThrow()
  })
})
