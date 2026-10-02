import {
  PublicClientApplication,
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser'

export interface CompanyConfig {
  tenantId: string
  clientId: string
  apiClientId: string
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function companyConfig(env: Record<string, unknown>): CompanyConfig | null {
  const ids = [env.VITE_ENTRA_TENANT_ID, env.VITE_ENTRA_SPA_CLIENT_ID, env.VITE_ENTRA_API_CLIENT_ID]
  if (!ids.every((id) => typeof id === 'string' && guid.test(id))) return null
  return {
    tenantId: String(ids[0]).toLowerCase(),
    clientId: String(ids[1]).toLowerCase(),
    apiClientId: String(ids[2]).toLowerCase(),
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
export function createCompanySession(config: CompanyConfig): CompanySession {
  const client = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: new URL(`${import.meta.env.BASE_URL}company-auth.html`, window.location.origin)
        .href,
    },
    cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
  })
  let ready: Promise<void> | undefined
  const initialize = () => (ready ??= client.initialize())
  const scopes = [`api://${config.apiClientId}/Catalogue.Access`]
  let account: AccountInfo | null = null
  let generation = 0
  return {
    async signIn() {
      const current = ++generation
      account = null
      await initialize()
      const response = await client.loginPopup({ scopes, prompt: 'select_account' })
      if (current !== generation) throw new SignInRequired()
      if (!response.account || response.account.tenantId.toLowerCase() !== config.tenantId) {
        await client.clearCache()
        throw new SignInRequired()
      }
      account = response.account
    },
    async token() {
      await initialize()
      const current = generation
      if (!account) throw new SignInRequired()
      try {
        const response = await client.acquireTokenSilent({ scopes, account })
        if (current !== generation || !response.accessToken) throw new SignInRequired()
        return response.accessToken
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) throw new SignInRequired()
        throw error
      }
    },
    async signOut() {
      ++generation
      const previous = account
      account = null
      await initialize()
      await client.clearCache()
      if (previous)
        await client.logoutPopup({
          account: previous,
          postLogoutRedirectUri: window.location.origin,
        })
    },
  }
}
let session: CompanySession | undefined
export function configuredSession(): CompanySession | null {
  const config = companyConfig(import.meta.env)
  if (!config) return null
  session ??= createCompanySession(config)
  return session
}
