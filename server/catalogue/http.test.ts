// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { CatalogueStore, type Draft } from './store'
import { catalogueServer } from './http'
import { audience, designer, product, reader, reviewer, seedRules, signedTokens, tenant } from './testSupport'

let store: CatalogueStore
let server: ReturnType<typeof catalogueServer>
let fixture: Awaited<ReturnType<typeof signedTokens>>
let base: string
beforeAll(async () => {
  fixture = await signedTokens(); store = new CatalogueStore(':memory:', tenant); seedRules(store)
  server = catalogueServer(store, fixture.verify)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); store.close() })
const request = async (path: string, options: RequestInit = {}, claims: Record<string, unknown> = {}) => fetch(base + path, {
  ...options, headers: { Authorization: `Bearer ${await fixture.token(claims)}`, 'Content-Type': 'application/json', ...options.headers },
})
const post = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })

describe('authenticated catalogue HTTP API', () => {
  it('rejects missing, wrong-audience and app-only tokens without disclosing content', async () => {
    expect((await fetch(base + '/api/catalogue/versions')).status).toBe(401)
    expect((await request('/api/catalogue/versions', {}, { aud: 'wrong' })).status).toBe(401)
    const appToken = await fixture.token({}, ['scp'])
    const response = await fetch(base + '/api/catalogue/versions', { headers: { Authorization: `Bearer ${appToken}` } })
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(appToken)
    expect((await request('/api/catalogue/me')).headers.get('cache-control')).toBe('no-store')
    expect((await request('/api/catalogue/me')).headers.get('access-control-allow-origin')).toBeNull()
  })
  it('derives actor identity server-side and enforces independent publication', async () => {
    const created = await request('/api/catalogue/drafts', post({ kind: 'product', definitionId: 'company.http', content: product }))
    expect(created.status).toBe(201)
    const draft = await created.json() as Draft
    const path = `/api/catalogue/drafts/${draft.id}`
    expect(draft.author).toBe(`${tenant}:${designer.objectId}`)
    expect((await request(path + '/submit', post({ expectedRevision: 1 }))).status).toBe(200)
    expect((await request(path + '/publish', post({ expectedRevision: 2 }))).status).toBe(403)
    expect((await request(path + '/publish', post({ expectedRevision: 2 }), { oid: reviewer.objectId })).status).toBe(200)
    const versions = await request('/api/catalogue/versions', {}, { oid: reader.objectId, roles: [] })
    expect(versions.status).toBe(200)
    expect(await versions.json()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'product', definitionId: 'company.http', version: 1 })]))
    const audit = await request(path + '/audit')
    expect(await audit.json()).toHaveLength(3)
  })
  it('rejects forged actor/approval fields, malformed inputs and oversized requests', async () => {
    expect((await request('/api/catalogue/drafts', post({ kind: 'product', definitionId: 'company.bad', content: product, actor: reviewer }))).status).toBe(400)
    expect((await request('/api/catalogue/drafts', post({ kind: 'other', definitionId: 'company.bad', content: product }))).status).toBe(400)
    expect((await request('/api/catalogue/drafts', { method: 'POST', body: '{}' , headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    expect((await request('/api/catalogue/drafts', { method: 'POST', body: '{' })).status).toBe(400)
    expect((await request('/api/catalogue/drafts', post({ note: 'x'.repeat(256 * 1024) }))).status).toBe(413)
    expect((await request('/api/catalogue/drafts', post({ kind: 'rule', definitionId: 'company.bad', content: product }))).status).toBe(403)
  })
  it('returns a bounded error for chunked bodies without resetting the socket', async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(128 * 1024)))
      controller.enqueue(new TextEncoder().encode('x'.repeat(128 * 1024 + 1)))
      controller.close()
    } })
    const response = await request('/api/catalogue/drafts', { method: 'POST', body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'Catalogue request is too large.' })
  })

  it('allows only one concurrent command against an exact revision', async () => {
    const response = await request('/api/catalogue/drafts', post({ kind: 'product', definitionId: 'company.concurrent', content: product }))
    const draft = await response.json() as Draft
    const path = `/api/catalogue/drafts/${draft.id}`
    const commands = await Promise.all([
      request(path, { method: 'PUT', body: JSON.stringify({ expectedRevision: 1, content: { ...product, name: 'First edit' } }) }),
      request(path, { method: 'PUT', body: JSON.stringify({ expectedRevision: 1, content: { ...product, name: 'Changed' } }) }),
    ])
    expect(commands.map((response) => response.status).sort()).toEqual([200, 409])
    expect((await request(path + '/submit', post({ expectedRevision: 0 }))).status).toBe(400)
  })
  it('does not accept ID tokens for another client, even from the company tenant', async () => {
    const response = await request('/api/catalogue/me', {}, { aud: 'cccccccc-cccc-cccc-cccc-cccccccccccc' })
    expect(response.status).toBe(401)
    expect(audience).not.toBe(designer.objectId)
  })
})
