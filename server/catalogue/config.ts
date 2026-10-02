import { isAbsolute } from 'node:path'
import { GUID, keycloakIssuer } from './auth'
export function catalogueConfig(env: NodeJS.ProcessEnv) {
  const companyId = env.CATALOGUE_COMPANY_ID?.toLowerCase()
  const audience = env.KEYCLOAK_API_CLIENT_ID
  const spaClient = env.KEYCLOAK_SPA_CLIENT_ID
  const issuer = env.KEYCLOAK_ISSUER
  const bindingsPath = env.CATALOGUE_IDENTITY_MAP_PATH
  const database = env.CATALOGUE_DB_PATH
  const port = Number(env.CATALOGUE_PORT ?? 8787)
  if (
    !companyId ||
    !GUID.test(companyId) ||
    !issuer ||
    !audience ||
    !spaClient ||
    !/^[a-zA-Z0-9._-]{1,160}$/.test(audience) ||
    !/^[a-zA-Z0-9._-]{1,160}$/.test(spaClient) ||
    audience === spaClient
  )
    throw new Error(
      'Configure a stable CATALOGUE_COMPANY_ID UUID and distinct Keycloak API/SPA client IDs and realm issuer.',
    )
  keycloakIssuer(issuer)
  if (!bindingsPath || !isAbsolute(bindingsPath))
    throw new Error('CATALOGUE_IDENTITY_MAP_PATH must be an absolute IT-owned JSON file path.')
  if (!database || !isAbsolute(database))
    throw new Error('CATALOGUE_DB_PATH must name an absolute durable SQLite file path.')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('CATALOGUE_PORT must be a valid TCP port.')
  return {
    companyId,
    audience,
    spaClient,
    issuer,
    bindingsPath,
    database,
    port,
    host: env.CATALOGUE_HOST ?? '127.0.0.1',
  }
}
