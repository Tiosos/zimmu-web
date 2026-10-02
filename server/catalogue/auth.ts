import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export const ROLES = { rule: 'Catalogue.RuleAdministrator', product: 'Catalogue.ProductDesigner' } as const
export type Kind = keyof typeof ROLES
export interface Principal { tenantId: string; objectId: string; roles: string[] }
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function requireRole(actor: Principal, kind: Kind): void {
  if (!actor.roles.includes(ROLES[kind])) throw new ApiError(403, 'This operation requires an authorised company role.')
}
export const actorId = (actor: Principal): string => `${actor.tenantId}:${actor.objectId}`

export function entraVerifier(tenantId: string, audience: string, testKeys?: JWTVerifyGetKey) {
  if (!GUID.test(tenantId) || !GUID.test(audience)) throw new Error('Entra tenant and API client IDs must be GUIDs.')
  const issuer = `https://login.microsoftonline.com/${tenantId.toLowerCase()}/v2.0`
  const keys = testKeys ?? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`))
  return async (authorization: string | undefined): Promise<Principal> => {
    const match = authorization?.match(/^Bearer ([^\s]+)$/i)
    if (!match) throw new ApiError(401, 'A company API access token is required.')
    try {
      const { payload } = await jwtVerify(match[1], keys, { algorithms: ['RS256'], issuer,
        audience: audience.toLowerCase(), requiredClaims: ['exp', 'iat', 'tid', 'oid', 'scp'] })
      if (payload.ver !== '2.0' || payload.tid !== tenantId.toLowerCase() ||
          typeof payload.oid !== 'string' || !GUID.test(payload.oid) ||
          typeof payload.scp !== 'string' || !payload.scp.split(' ').includes('Catalogue.Access'))
        throw new Error('Invalid company access claims.')
      return { tenantId: tenantId.toLowerCase(), objectId: payload.oid.toLowerCase(),
        roles: Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === 'string') : [] }
    } catch {
      throw new ApiError(401, 'The company API access token is invalid or expired.')
    }
  }
}
