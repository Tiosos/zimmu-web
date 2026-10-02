import { expect, it, vi } from 'vitest'
import { CompanyApi, CompanyApiError } from './api'
import { permissions, editableContent, type Draft } from './types'
const actor = { tenantId: 'tenant', objectId: 'author', roles: ['Catalogue.ProductDesigner'] }
const draft: Draft = {
  id: 'id',
  kind: 'product',
  definitionId: 'company.base',
  baseVersion: 1,
  revision: 7,
  state: 'submitted',
  author: 'tenant:author',
  hash: 'digest',
  content: {
    name: 'Base',
    source: { id: 'starter.base-600', version: 1 },
    rule: { id: 'company.master', version: 2 },
    overrides: { depth: 600 },
    params: {} as never,
  },
}
it('prevents own product approval and non-role writes, allowing a different designer', () => {
  expect(permissions(actor, draft)).toEqual({
    edit: false,
    submit: false,
    withdraw: true,
    review: false,
  })
  expect(permissions({ ...actor, objectId: 'other' }, draft).review).toBe(true)
  expect(permissions({ ...actor, roles: [] }, draft).review).toBe(false)
  expect(permissions({ ...actor, objectId: 'other', roles: [] }, draft).review).toBe(false)
  expect(permissions({ ...actor, roles: [] }, { ...draft, state: 'draft' }).edit).toBe(false)
  expect(permissions({ ...actor, roles: [] }, draft).withdraw).toBe(false)
  expect(permissions({ ...actor, roles: ['Catalogue.RuleAdministrator'] }, draft).review).toBe(
    false,
  )
  expect(
    permissions({ ...actor, roles: ['Catalogue.RuleAdministrator'] }, { ...draft, kind: 'rule' })
      .review,
  ).toBe(true)
  expect(permissions(actor, { ...draft, state: 'published' })).toEqual({
    edit: false,
    submit: false,
    withdraw: false,
    review: false,
  })
})
it('preserves pins/overrides but excludes server-resolved fields when copying products', () => {
  const copy = editableContent('product', draft.content)
  expect(copy).toEqual({
    name: 'Base',
    source: { id: 'starter.base-600', version: 1 },
    rule: { id: 'company.master', version: 2 },
    overrides: { depth: 600 },
  })
  expect(copy).not.toBe(draft.content)
})
it('sends only API access bearer token and exact revision to a same-origin route', async () => {
  const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(draft)))
  const api = new CompanyApi(
    { token: async () => 'api-token', signIn: async () => {}, signOut: async () => {} },
    transport,
  )
  await api.act(draft, 'publish', 'Reviewed')
  expect(transport).toHaveBeenCalledWith(
    '/api/catalogue/drafts/id/publish',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: 'Bearer api-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 7, note: 'Reviewed' }),
    }),
  )
})
it('preserves conflict status and never retries writes', async () => {
  const transport = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ error: 'Draft changed' }), { status: 409 }))
  const api = new CompanyApi(
    { token: async () => 'token', signIn: async () => {}, signOut: async () => {} },
    transport,
  )
  await expect(api.edit(draft, draft.content)).rejects.toMatchObject({
    status: 409,
    message: 'Draft changed',
  })
  expect(transport).toHaveBeenCalledTimes(1)
})
it('handles non-JSON proxy failures and does not fetch without a token', async () => {
  const transport = vi.fn().mockResolvedValue(new Response('upstream failure', { status: 502 }))
  const session = {
    token: vi.fn().mockResolvedValue('token'),
    signIn: async () => {},
    signOut: async () => {},
  }
  const api = new CompanyApi(session, transport)
  await expect(api.me()).rejects.toBeInstanceOf(CompanyApiError)
  session.token.mockRejectedValue(new Error('expired'))
  await expect(api.versions()).rejects.toThrow('expired')
  expect(transport).toHaveBeenCalledTimes(1)
})
