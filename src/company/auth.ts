import Keycloak from 'keycloak-js'

export interface CompanyConfig {
  url: string
  realm: string
  clientId: string
}
export function companyConfig(env: Record<string, unknown>): CompanyConfig | null {
  const url = env.VITE_KEYCLOAK_URL
  const realm = env.VITE_KEYCLOAK_REALM
  const clientId = env.VITE_KEYCLOAK_CLIENT_ID
  if (
    typeof url !== 'string' ||
    typeof realm !== 'string' ||
    typeof clientId !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,160}$/.test(realm) ||
    !/^[a-zA-Z0-9._-]{1,160}$/.test(clientId)
  )
    return null
  try {
    const parsed = new URL(url)
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== 'https:' &&
        !(
          parsed.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
        ))
    )
      return null
    return { url: parsed.href.replace(/\/$/, ''), realm, clientId }
  } catch {
    return null
  }
}
export class SignInRequired extends Error {
  constructor() {
    super('Your company session needs verification. Sign in again to continue.')
  }
}
export interface CompanySession {
  signIn(): Promise<void>
  token(): Promise<string>
  signOut(): Promise<void>
}
export interface PreparedCompanySession extends CompanySession {
  prepare(): Promise<boolean>
}
export function createCompanySession(
  config: CompanyConfig,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): PreparedCompanySession {
  let client = new Keycloak(config)
  let ready: Promise<boolean> | undefined
  let initialized = false
  let generation = 0
  let signedOut = false
  const redirectUri = new URL(
    `${import.meta.env.BASE_URL}company-auth.html`,
    window.location.origin,
  ).href
  const initialize = () =>
    (ready ??= client
      .init({
        pkceMethod: 'S256',
        flow: 'standard',
        responseMode: 'fragment',
        checkLoginIframe: false,
        redirectUri,
        scope: 'Catalogue.Access',
        enableLogging: false,
      })
      .then((authenticated) => {
        initialized = true
        return authenticated
      })
      .catch(() => {
        initialized = false
        client.clearToken()
        client = new Keycloak(config)
        ready = undefined
        throw new SignInRequired()
      }))
  return {
    async prepare() {
      const current = generation
      await initialize()
      return current === generation && !signedOut && client.authenticated === true
    },
    async signIn() {
      const current = ++generation
      signedOut = false
      await initialize()
      if (current !== generation) throw new SignInRequired()
      await client.login({ redirectUri, scope: 'Catalogue.Access', prompt: 'login' })
      if (current !== generation) throw new SignInRequired()
    },
    async token() {
      await initialize()
      const current = generation
      if (signedOut || !client.authenticated) throw new SignInRequired()
      try {
        await client.updateToken(30)
        if (current !== generation || signedOut || !client.token) throw new SignInRequired()
        return client.token
      } catch {
        if (current === generation || signedOut) client.clearToken()
        throw new SignInRequired()
      }
    },
    async signOut() {
      ++generation
      signedOut = true
      // Preserve the SDK-generated ID-token hint, then erase tokens before navigation.
      const pending = ready
      let existingLogout: string | undefined
      try {
        if (initialized) existingLogout = client.createLogoutUrl({ redirectUri })
      } finally {
        client.clearToken()
      }
      if (pending) await pending.catch(() => false)
      if (!initialized) return
      let logout: string
      try {
        logout = existingLogout ?? client.createLogoutUrl({ redirectUri })
      } finally {
        client.clearToken()
      }
      navigate(logout)
    },
  }
}
let session: PreparedCompanySession | undefined
export function configuredSession(): PreparedCompanySession | null {
  const config = companyConfig(import.meta.env)
  if (!config) return null
  session ??= createCompanySession(config)
  return session
}
