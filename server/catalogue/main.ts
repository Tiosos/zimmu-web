import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { entraVerifier } from './auth'
import { catalogueConfig } from './config'
import { catalogueServer } from './http'
import { CatalogueStore } from './store'

process.umask(0o077)
const config = catalogueConfig(process.env)
mkdirSync(dirname(config.database), { recursive: true, mode: 0o700 })
const store = new CatalogueStore(config.database, config.tenant)
const server = catalogueServer(store, entraVerifier(config.tenant, config.audience))
server.listen(config.port, config.host, () => { console.info('Company catalogue API is listening.') })
const stop = () => { server.close(() => { store.close(); process.exit(0) }) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
