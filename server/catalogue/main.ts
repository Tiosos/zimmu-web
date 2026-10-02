import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { keycloakVerifier } from './auth'
import { loadIdentityBindings } from './identity'
import { catalogueConfig } from './config'
import { catalogueServer } from './http'
import { CatalogueStore } from './store'

process.umask(0o077)
const config = catalogueConfig(process.env)
const bindings = () => loadIdentityBindings(config.bindingsPath, config.issuer, config.companyId)
bindings() // Refuse startup if the IT identity map is unavailable or invalid.
mkdirSync(dirname(config.database), { recursive: true, mode: 0o700 })
const store = new CatalogueStore(config.database, config.companyId)
const server = catalogueServer(store, keycloakVerifier(config, bindings))
server.listen(config.port, config.host, () => {
  console.info('Company catalogue API is listening.')
})
const stop = () => {
  server.close(() => {
    store.close()
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
