import { createServer, type IncomingMessage } from 'node:http'
import { ApiError, type Principal } from './auth'
import { object, only, revision, textValue } from './content'
import { CatalogueStore, type Action } from './store'

const MAX_BODY = 256 * 1024
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ApiError(415, 'Use application/json.')
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += bytes.length
    if (size > MAX_BODY) { req.resume(); throw new ApiError(413, 'Catalogue request is too large.') }
    chunks.push(bytes)
  }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Invalid JSON.') }
}
export function catalogueServer(store: CatalogueStore, verify: (authorization: string | undefined) => Promise<Principal>) {
  return createServer(async (req, res) => {
    const respond = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) })
      res.end(JSON.stringify(value))
    }
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (req.method === 'GET' && path === '/healthz') { respond(200, { status: 'ok' }); return }
      const actor = await verify(req.headers.authorization)
      if (req.method === 'GET' && path === '/api/catalogue/me') { respond(200, actor); return }
      if (req.method === 'GET' && path === '/api/catalogue/versions') { respond(200, store.listVersions(actor)); return }
      if (req.method === 'GET' && path === '/api/catalogue/drafts') { respond(200, store.listDrafts(actor)); return }
      if (req.method === 'POST' && path === '/api/catalogue/drafts') {
        const data = await body(req); only(data, ['kind', 'definitionId', 'content'])
        if (data.kind !== 'rule' && data.kind !== 'product') throw new ApiError(400, 'Unknown catalogue kind.')
        respond(201, store.create(actor, data.kind, textValue(data.definitionId, 'Definition ID'), data.content)); return
      }
      const match = path.match(/^\/api\/catalogue\/drafts\/([0-9a-f-]{36})(?:\/(audit|submit|withdraw|request-changes|publish))?$/)
      if (!match) throw new ApiError(404, 'Catalogue endpoint not found.')
      const [, id, action] = match
      if (req.method === 'GET' && action === 'audit') { respond(200, store.audit(actor, id)); return }
      if (req.method === 'GET' && !action) { respond(200, store.get(actor, id)); return }
      if (req.method === 'PUT' && !action) {
        const data = await body(req); only(data, ['expectedRevision', 'content'])
        respond(200, store.edit(actor, id, revision(data.expectedRevision), data.content)); return
      }
      if (req.method === 'POST' && action && action !== 'audit') {
        const data = await body(req); only(data, ['expectedRevision', 'note'])
        if (data.note !== undefined && typeof data.note !== 'string') throw new ApiError(400, 'Review note must be text.')
        respond(200, store.act(actor, id, revision(data.expectedRevision), action as Action, data.note as string | undefined)); return
      }
      throw new ApiError(405, 'Method is not allowed for this endpoint.')
    } catch (error) {
      respond(error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'Catalogue service could not complete the request.' })
    }
  })
}
