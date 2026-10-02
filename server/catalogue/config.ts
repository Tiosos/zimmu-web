import { isAbsolute } from 'node:path'
import { GUID } from './auth'
export function catalogueConfig(env: NodeJS.ProcessEnv) {
  const tenant = env.ENTRA_TENANT_ID?.toLowerCase()
  const audience = env.ENTRA_API_CLIENT_ID?.toLowerCase()
  const database = env.CATALOGUE_DB_PATH
  const port = Number(env.CATALOGUE_PORT ?? 8787)
  if (!tenant || !audience || !GUID.test(tenant) || !GUID.test(audience)) throw new Error('Configure ENTRA_TENANT_ID and ENTRA_API_CLIENT_ID GUIDs.')
  if (!database || !isAbsolute(database)) throw new Error('CATALOGUE_DB_PATH must name an absolute durable SQLite file path.')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('CATALOGUE_PORT must be a valid TCP port.')
  return { tenant, audience, database, port, host: env.CATALOGUE_HOST ?? '127.0.0.1' }
}
