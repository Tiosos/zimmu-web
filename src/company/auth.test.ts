import { beforeEach, describe, expect, it, vi } from 'vitest'
const msal = vi.hoisted(() => ({
  initialize: vi.fn(),
  loginPopup: vi.fn(),
  acquireTokenSilent: vi.fn(),
  clearCache: vi.fn(),
  logoutPopup: vi.fn(),
  config: null as unknown,
}))
vi.mock('@azure/msal-browser', () => ({
  BrowserCacheLocation: { MemoryStorage: 'memoryStorage' },
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    constructor(config: unknown) {
      msal.config = config
    }
    initialize = msal.initialize
    loginPopup = msal.loginPopup
    acquireTokenSilent = msal.acquireTokenSilent
    clearCache = msal.clearCache
    logoutPopup = msal.logoutPopup
  },
}))
import { companyConfig, createCompanySession, SignInRequired } from './auth'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
const tenantId = '11111111-1111-1111-1111-111111111111'
const clientId = '22222222-2222-2222-2222-222222222222'
const apiClientId = '33333333-3333-3333-3333-333333333333'
const account = { tenantId, homeAccountId: 'chosen-account' }
beforeEach(() => {
  vi.resetAllMocks()
  msal.initialize.mockResolvedValue(undefined)
  msal.loginPopup.mockResolvedValue({ account })
  msal.acquireTokenSilent.mockResolvedValue({ accessToken: 'api-token' })
  msal.clearCache.mockResolvedValue(undefined)
  msal.logoutPopup.mockResolvedValue(undefined)
})
describe('company authentication', () => {
  it('fails closed for missing and malformed public IDs', () => {
    expect(companyConfig({})).toBeNull()
    expect(
      companyConfig({
        VITE_ENTRA_TENANT_ID: tenantId,
        VITE_ENTRA_SPA_CLIENT_ID: 'common',
        VITE_ENTRA_API_CLIENT_ID: apiClientId,
      }),
    ).toBeNull()
    expect(
      companyConfig({
        VITE_ENTRA_TENANT_ID: tenantId,
        VITE_ENTRA_SPA_CLIENT_ID: clientId,
        VITE_ENTRA_API_CLIENT_ID: apiClientId,
      }),
    ).toEqual({ tenantId, clientId, apiClientId })
  })
  it('pins tenant, callback and memory-only cache with no secret', () => {
    createCompanySession({ tenantId, clientId, apiClientId })
    expect(msal.config).toMatchObject({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: `${window.location.origin}/company-auth.html`,
      },
      cache: { cacheLocation: 'memoryStorage' },
    })
  })
  it('waits for initialization and explicitly selects the account', async () => {
    let ready!: () => void
    msal.initialize.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve
        }),
    )
    const session = createCompanySession({ tenantId, clientId, apiClientId })
    const login = session.signIn()
    expect(msal.loginPopup).not.toHaveBeenCalled()
    ready()
    await login
    expect(msal.loginPopup).toHaveBeenCalledWith({
      scopes: [`api://${apiClientId}/Catalogue.Access`],
      prompt: 'select_account',
    })
    expect(await session.token()).toBe('api-token')
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({
      scopes: [`api://${apiClientId}/Catalogue.Access`],
      account,
    })
  })
  it('does not pick a cached first account', async () => {
    const session = createCompanySession({ tenantId, clientId, apiClientId })
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled()
  })
  it('rejects wrong-tenant and missing account results', async () => {
    for (const wrong of [null, { tenantId: clientId }]) {
      msal.loginPopup.mockResolvedValue({ account: wrong })
      const session = createCompanySession({ tenantId, clientId, apiClientId })
      await expect(session.signIn()).rejects.toBeInstanceOf(SignInRequired)
      await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
    }
  })
  it('requires explicit reconnect, never popup fallback during API commands', async () => {
    const session = createCompanySession({ tenantId, clientId, apiClientId })
    await session.signIn()
    msal.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError('interaction_required', 'Login required'),
    )
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
    expect(msal.loginPopup).toHaveBeenCalledTimes(1)
  })
  it('clears selected account/cache before remote logout finishes', async () => {
    const session = createCompanySession({ tenantId, clientId, apiClientId })
    await session.signIn()
    let done!: () => void
    msal.logoutPopup.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          done = resolve
        }),
    )
    const logout = session.signOut()
    await vi.waitFor(() => expect(msal.logoutPopup).toHaveBeenCalled())
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
    expect(msal.clearCache).toHaveBeenCalled()
    done()
    await logout
  })
  it('rejects an in-flight token or login after sign-out', async () => {
    const session = createCompanySession({ tenantId, clientId, apiClientId })
    await session.signIn()
    let token!: (value: unknown) => void
    msal.acquireTokenSilent.mockImplementation(
      () =>
        new Promise((resolve) => {
          token = resolve
        }),
    )
    const request = session.token()
    await vi.waitFor(() => expect(token).toBeDefined())
    await session.signOut()
    token({ accessToken: 'late' })
    await expect(request).rejects.toBeInstanceOf(SignInRequired)
    let login!: (value: unknown) => void
    msal.loginPopup.mockImplementation(
      () =>
        new Promise((resolve) => {
          login = resolve
        }),
    )
    const entering = session.signIn()
    await vi.waitFor(() => expect(login).toBeDefined())
    await session.signOut()
    login({ account })
    await expect(entering).rejects.toBeInstanceOf(SignInRequired)
  })
})
