import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { entraVerifier, ROLES, type Principal } from './auth'
import { STARTER_RULES } from '../../src/scene/constructionRules'
import { PRESET_MATERIALS } from '../../src/scene/carcasePresets'
import { CatalogueStore } from './store'
export const tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
export const audience = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
export const designer: Principal = { tenantId: tenant, objectId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', roles: [ROLES.product] }
export const reviewer: Principal = { tenantId: tenant, objectId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', roles: [ROLES.product] }
export const admin: Principal = { tenantId: tenant, objectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', roles: [ROLES.rule] }
export const reader: Principal = { tenantId: tenant, objectId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', roles: [] }
export const master = { name: 'Company construction', values: STARTER_RULES.values, materials: PRESET_MATERIALS }
export const product = { name: 'Company Base', source: { id: 'starter.base-600', version: 1 },
  rule: { id: 'company.master', version: 1 }, overrides: {} }
export function seedRules(store: CatalogueStore) {
  const draft = store.create(admin, 'rule', 'company.master', master)
  store.act(admin, draft.id, 1, 'submit'); store.act(admin, draft.id, 2, 'publish')
}
export async function signedTokens() {
  const pair = await generateKeyPair('RS256')
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'company-key', alg: 'RS256', use: 'sig' }] })
  return { verify: entraVerifier(tenant, audience, keys), keys, privateKey: pair.privateKey,
    token: async (claims: Record<string, unknown> = {}, omit: string[] = [], signer = pair.privateKey) => {
      const now = Math.floor(Date.now() / 1000)
      const payload: Record<string, unknown> = { iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: audience,
        iat: now, nbf: now, exp: now + 600, tid: tenant, oid: designer.objectId, ver: '2.0', scp: 'Catalogue.Access', roles: designer.roles, ...claims }
      omit.forEach((key) => { delete payload[key] })
      return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'company-key' }).sign(signer)
    } }
}
