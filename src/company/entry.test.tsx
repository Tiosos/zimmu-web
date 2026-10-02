import { beforeEach, expect, it, vi } from 'vitest'
const page = vi.hoisted(() => ({
  configuredSession: vi.fn(),
  prepare: vi.fn(),
  me: vi.fn(),
  drafts: vi.fn(),
  versions: vi.fn(),
  render: vi.fn<(node: { props: Record<string, unknown> }) => void>(),
}))
vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: page.render, unmount: vi.fn() }),
}))
vi.mock('./auth', () => ({
  configuredSession: page.configuredSession,
  SignInRequired: class extends Error {},
}))
vi.mock('./api', () => ({
  CompanyApiError: class extends Error {},
  CompanyApi: class {
    me = page.me
    drafts = page.drafts
    versions = page.versions
  },
}))
vi.mock('./CompanyCatalogue', () => ({ CompanyCatalogue: () => null }))
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  document.body.innerHTML = '<p id="status">Loading</p><div id="company-root"></div>'
  window.history.replaceState(null, '', '/company-auth.html')
  page.configuredSession.mockReturnValue({ prepare: page.prepare })
  page.me.mockResolvedValue({ tenantId: 'company', objectId: 'staff', roles: [] })
  page.drafts.mockResolvedValue([])
  page.versions.mockResolvedValue([])
})
it('consumes callback before mounting and obtains server identity before enabling editor', async () => {
  let finish!: (value: boolean) => void
  page.prepare.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  await import('./entry')
  expect(page.render).not.toHaveBeenCalled()
  expect(page.me).not.toHaveBeenCalled()
  finish(true)
  await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))
  expect(page.render.mock.calls[0][0].props.initialData).toEqual({
    actor: { tenantId: 'company', objectId: 'staff', roles: [] },
    drafts: [],
    versions: [],
  })
  expect(document.getElementById('status')?.hidden).toBe(true)
})
it('never supplies private data when callback or API identity fails', async () => {
  page.prepare.mockResolvedValue(true)
  page.me.mockRejectedValue(new Error('invalid server identity'))
  await import('./entry')
  await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))
  const props = page.render.mock.calls[0][0].props
  expect(props.initialData).toBeUndefined()
  expect(props.initialError).toBe('Company sign-in could not complete. Try signing in again.')
})
it('renders unconfigured mode without API calls and cleans response parameters', async () => {
  page.configuredSession.mockReturnValue(null)
  window.history.replaceState(null, '', '/company-auth.html?code=untrusted#state=invalid')
  await import('./entry')
  await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))
  expect(page.prepare).not.toHaveBeenCalled()
  expect(page.me).not.toHaveBeenCalled()
  expect(page.render.mock.calls[0][0].props.session).toBeNull()
  expect(window.location.search).toBe('')
  expect(window.location.hash).toBe('')
})
it('does not fetch private catalogue data without an authenticated callback', async () => {
  page.prepare.mockResolvedValue(false)
  await import('./entry')
  await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))
  expect(page.me).not.toHaveBeenCalled()
  expect(page.render.mock.calls[0][0].props.initialData).toBeUndefined()
})
it('contains callback failure before any API calls or private data', async () => {
  page.prepare.mockRejectedValue(new Error('state mismatch'))
  await import('./entry')
  await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))
  expect(page.me).not.toHaveBeenCalled()
  expect(page.render.mock.calls[0][0].props.initialData).toBeUndefined()
  expect(page.render.mock.calls[0][0].props.initialError).toBeTruthy()
})
