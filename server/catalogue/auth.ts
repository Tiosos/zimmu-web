import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export const ROLES = {
  rule: 'Catalogue.RuleAdministrator',
  product: 'Catalogue.ProductDesigner',
} as const
export type Kind = keyof typeof ROLES
export interface Principal {
  tenantId: string
  objectId: string
  roles: string[]
}
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function requireRole(actor: Principal, kind: Kind): void {
  if (!actor.roles.includes(ROLES[kind]))
    throw new ApiError(403, 'This operation requires an authorised company role.')
}
export const actorId = (actor: Principal): string => `${actor.tenantId}:${actor.objectId}`

export interface KeycloakAuthConfig {
  issuer: string
  audience: string
  spaClient: string
  companyId: string
}
export function keycloakIssuer(value: string): string {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
    !/\/realms\/[a-zA-Z0-9._-]+$/.test(url.pathname)
  )
    throw new Error('Use an HTTPS Keycloak realm issuer (HTTP only on loopback).')
  return url.href
}
export function keycloakVerifier(
  config: KeycloakAuthConfig,
  bindings: () => ReadonlyMap<string, string>,
  testKeys?: JWTVerifyGetKey,
) {
  const { issuer, audience, spaClient, companyId } = config
  if (
    keycloakIssuer(issuer) !== issuer ||
    !GUID.test(companyId) ||
    !audience ||
    !spaClient ||
    audience === spaClient
  )
    throw new Error('Invalid Keycloak API configuration.')
  const keys = testKeys ?? createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`))
  return async (authorization: string | undefined): Promise<Principal> => {
    const match = authorization?.match(/^Bearer ([^\s]+)$/i)
    if (!match) throw new ApiError(401, 'A company API access token is required.')
    try {
      const { payload } = await jwtVerify(match[1], keys, {
        algorithms: ['RS256'],
        issuer,
        audience,
        requiredClaims: ['exp', 'iat', 'sub', 'scope', 'azp', 'typ'],
      })
      if (
        typeof payload.iat !== 'number' ||
        !Number.isFinite(payload.iat) ||
        payload.iat > Date.now() / 1000 + 30 ||
        typeof payload.exp !== 'number' ||
        payload.exp <= payload.iat ||
        payload.typ !== 'Bearer' ||
        payload.azp !== spaClient ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('Catalogue.Access')
      )
        throw new Error('Invalid company API claims.')
      const staffId = bindings().get(payload.sub)
      if (!staffId || !GUID.test(staffId))
        throw new Error('The Keycloak account is not bound to a company staff identity.')
      const resources = payload.resource_access
      const resource =
        resources &&
        typeof resources === 'object' &&
        !Array.isArray(resources) &&
        Object.hasOwn(resources, audience)
          ? (resources as Record<string, unknown>)[audience]
          : undefined
      const roles =
        resource && typeof resource === 'object' && !Array.isArray(resource)
          ? (resource as Record<string, unknown>).roles
          : undefined
      return {
        tenantId: companyId.toLowerCase(),
        objectId: staffId.toLowerCase(),
        roles: Array.isArray(roles)
          ? [
              ...new Set(
                roles.filter(
                  (role): role is typeof ROLES.rule | typeof ROLES.product =>
                    role === ROLES.rule || role === ROLES.product,
                ),
              ),
            ]
          : [],
      }
    } catch {
      throw new ApiError(
        401,
        'The company API access token or staff identity binding is invalid or expired.',
      )
    }
  }
}
