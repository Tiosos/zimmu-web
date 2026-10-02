// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { generateKeyPair } from 'jose'
import { entraVerifier, ROLES } from './auth'

import { audience, designer, signedTokens, tenant } from './testSupport'

let fixture: Awaited<ReturnType<typeof signedTokens>>
beforeAll(async () => { fixture = await signedTokens() })
const token = (...args: Parameters<typeof fixture.token>) => fixture.token(...args)

describe('Entra access token verification', () => {
  it('derives identity and app roles from a verified delegated token', async () => {
    expect(await entraVerifier(tenant, audience, fixture.keys)(`Bearer ${await token()}`))
      .toEqual({ tenantId: tenant, objectId: designer.objectId, roles: [ROLES.product] })
  })
  it.each([
    { aud: 'another-api' }, { iss: 'https://evil.invalid' }, { tid: 'another-tenant' },
    { oid: 'display-name' }, { scp: 'Other.Scope' }, { ver: '1.0' },
    { exp: 1 }, { nbf: Math.floor(Date.now() / 1000) + 600 },
  ])('rejects invalid access claims %j', async (claims) => {
    await expect(entraVerifier(tenant, audience, fixture.keys)(`Bearer ${await token(claims)}`)).rejects.toMatchObject({ status: 401 })
  })
  it.each(['exp', 'iat', 'oid', 'scp', 'tid'])('requires %s, rejecting ID/app-only tokens', async (claim) => {
    await expect(entraVerifier(tenant, audience, fixture.keys)(`Bearer ${await token({}, [claim])}`)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects unsigned, foreign-key and malformed authorization', async () => {
    const other = await generateKeyPair('RS256')
    const verify = entraVerifier(tenant, audience, fixture.keys)
    await expect(verify(`Bearer ${await token({}, [], other.privateKey)}`)).rejects.toMatchObject({ status: 401 })
    await expect(verify('Bearer eyJhbGciOiJub25lIn0.e30.')).rejects.toMatchObject({ status: 401 })
    await expect(verify(undefined)).rejects.toMatchObject({ status: 401 })
    await expect(verify('Basic token')).rejects.toMatchObject({ status: 401 })
  })
})
