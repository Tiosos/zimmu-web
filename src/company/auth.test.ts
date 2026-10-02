import { beforeEach, describe, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  login: vi.fn(),
  updateToken: vi.fn(),
  createLogoutUrl: vi.fn(),
  clients: [] as {
    config: unknown
    authenticated: boolean
    token?: string
    idToken?: string
    clearToken: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = false
    token: string | undefined
    idToken: string | undefined
    config: unknown
    constructor(config: unknown) {
      this.config = config
      sdk.clients.push(this)
    }
    init = sdk.init
    login = sdk.login
    updateToken = sdk.updateToken
    createLogoutUrl = sdk.createLogoutUrl
    clearToken = vi.fn(() => {
      this.authenticated = false
      this.token = undefined
      this.idToken = undefined
    })
  },
}))
import { companyConfig, createCompanySession, SignInRequired } from './auth'
const config = {
  url: 'https://identity.example.invalid',
  realm: 'company',
  clientId: 'zimmu-catalogue-editor',
}
const env = {
  VITE_KEYCLOAK_URL: config.url,
  VITE_KEYCLOAK_REALM: config.realm,
  VITE_KEYCLOAK_CLIENT_ID: config.clientId,
}
const callback = `${window.location.origin}/company-auth.html`
const authenticate = () =>
  Object.assign(sdk.clients.at(-1)!, {
    authenticated: true,
    token: 'api-token',
    idToken: 'id-token',
  })
beforeEach(() => {
  vi.resetAllMocks()
  sdk.clients.length = 0
  sdk.init.mockResolvedValue(false)
  sdk.login.mockResolvedValue(undefined)
  sdk.updateToken.mockResolvedValue(false)
  sdk.createLogoutUrl.mockReturnValue('https://identity.example.invalid/logout')
})
describe('Keycloak company session', () => {
  it('requires explicit realm/client configuration and rejects unsafe URLs', () => {
    expect(companyConfig(env)).toEqual(config)
    for (const url of [
      'http://identity.example.invalid',
      'https://user:password@identity.example.invalid',
      'https://identity.example.invalid?x=1',
      'https://identity.example.invalid#x',
      'file:///realm',
      'not-url',
    ]) {
      expect(companyConfig({ ...env, VITE_KEYCLOAK_URL: url })).toBeNull()
    }
    for (const field of ['VITE_KEYCLOAK_URL', 'VITE_KEYCLOAK_REALM', 'VITE_KEYCLOAK_CLIENT_ID'])
      expect(companyConfig({ ...env, [field]: '' })).toBeNull()
    expect(companyConfig({ ...env, VITE_KEYCLOAK_REALM: '../other' })).toBeNull()
    expect(companyConfig({ ...env, VITE_KEYCLOAK_CLIENT_ID: 'a b' })).toBeNull()
    expect(
      companyConfig({ VITE_ENTRA_TENANT_ID: 'old', VITE_ENTRA_SPA_CLIENT_ID: 'old' }),
    ).toBeNull()
    expect(companyConfig({ ...env, VITE_KEYCLOAK_URL: 'http://localhost:8080' })).not.toBeNull()
  })
  it('initializes before use with code flow, PKCE and explicit callback/scope', async () => {
    const session = createCompanySession(config)
    expect(await session.prepare()).toBe(false)
    expect(sdk.clients[0].config).toEqual(config)
    expect(sdk.init).toHaveBeenCalledWith({
      pkceMethod: 'S256',
      flow: 'standard',
      responseMode: 'fragment',
      checkLoginIframe: false,
      redirectUri: callback,
      scope: 'Catalogue.Access',
      enableLogging: false,
    })
    await session.signIn()
    expect(sdk.init).toHaveBeenCalledTimes(1)
    expect(sdk.login).toHaveBeenCalledWith({
      redirectUri: callback,
      scope: 'Catalogue.Access',
      prompt: 'login',
    })
  })
  it('waits for initialization before login and API token use', async () => {
    let ready!: (value: boolean) => void
    sdk.init.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          ready = resolve
        }),
    )
    const session = createCompanySession(config)
    const login = session.signIn()
    expect(sdk.login).not.toHaveBeenCalled()
    authenticate()
    ready(true)
    await login
    expect(await session.prepare()).toBe(true)
    expect(await session.token()).toBe('api-token')
    expect(sdk.updateToken).toHaveBeenCalledWith(30)
  })
  it('requires sign-in for unauthenticated accounts without automatic navigation', async () => {
    const session = createCompanySession(config)
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
    expect(sdk.updateToken).not.toHaveBeenCalled()
    expect(sdk.login).not.toHaveBeenCalled()
  })
  it('clears expired sessions and asks for explicit reconnect', async () => {
    const session = createCompanySession(config)
    await session.prepare()
    authenticate()
    sdk.updateToken.mockRejectedValue(new Error('expired'))
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
    expect(sdk.clients[0].token).toBeUndefined()
    expect(sdk.login).not.toHaveBeenCalled()
  })
  it('rejects a missing token after refresh', async () => {
    const session = createCompanySession(config)
    await session.prepare()
    authenticate()
    sdk.clients[0].token = undefined
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
  })
  it('preserves logout hint and clears tokens before remote navigation', async () => {
    const navigate = vi.fn(() => {
      expect(sdk.clients[0].token).toBeUndefined()
      expect(sdk.clients[0].idToken).toBeUndefined()
    })
    const session = createCompanySession(config, navigate)
    await session.prepare()
    authenticate()
    sdk.createLogoutUrl.mockImplementation(() => {
      expect(sdk.clients[0].idToken).toBe('id-token')
      return 'https://identity.example.invalid/logout'
    })
    await session.signOut()
    expect(navigate).toHaveBeenCalledWith('https://identity.example.invalid/logout')
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
  })
  it('rejects late refresh and login responses after sign-out', async () => {
    const session = createCompanySession(config, vi.fn())
    await session.prepare()
    authenticate()
    let refresh!: () => void
    sdk.updateToken.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          refresh = resolve
        }),
    )
    const request = session.token()
    await vi.waitFor(() => expect(refresh).toBeDefined())
    await session.signOut()
    authenticate() // SDK can finish a pending refresh after local clearing.
    sdk.clients[0].token = 'late-token'
    refresh()
    await expect(request).rejects.toBeInstanceOf(SignInRequired)
    expect(sdk.clients[0].token).toBeUndefined()
    let login!: () => void
    sdk.login.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          login = resolve
        }),
    )
    const entering = session.signIn()
    await vi.waitFor(() => expect(login).toBeDefined())
    await session.signOut()
    login()
    await expect(entering).rejects.toBeInstanceOf(SignInRequired)
  })
  it('rejects pending callback after sign-out and clears any late tokens', async () => {
    let ready!: (value: boolean) => void
    sdk.init.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          ready = resolve
        }),
    )
    const session = createCompanySession(config, vi.fn())
    const preparing = session.prepare()
    const logout = session.signOut()
    authenticate()
    ready(true)
    expect(await preparing).toBe(false)
    await logout
    expect(sdk.clients[0].token).toBeUndefined()
    await expect(session.token()).rejects.toBeInstanceOf(SignInRequired)
  })
  it('recreates the SDK after failed initialization instead of reusing a broken client', async () => {
    sdk.init.mockRejectedValueOnce(new Error('invalid callback'))
    const session = createCompanySession(config)
    await expect(session.prepare()).rejects.toBeInstanceOf(SignInRequired)
    expect(sdk.clients).toHaveLength(2)
    expect(sdk.clients[0].clearToken).toHaveBeenCalled()
    expect(await session.prepare()).toBe(false)
  })
})
