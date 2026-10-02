import { createRoot } from 'react-dom/client'
import '../index.css'
import { CompanyCatalogue } from './CompanyCatalogue'
import { configuredSession, SignInRequired } from './auth'
import { CompanyApi, CompanyApiError } from './api'
import type { CompanyData } from './types'

async function start() {
  const element = document.getElementById('company-root')
  const status = document.getElementById('status')
  if (!element || !status) throw new Error('Company catalogue page is missing its mount point.')
  const session = configuredSession()
  const api = session ? new CompanyApi(session) : undefined
  let initialData: CompanyData | undefined
  let initialError = ''
  try {
    // Keycloak consumes/verifies its callback before React or API calls.
    if (session && api && (await session.prepare())) {
      const [actor, drafts, versions] = await Promise.all([api.me(), api.drafts(), api.versions()])
      initialData = { actor, drafts, versions }
    }
  } catch (error) {
    initialError =
      error instanceof CompanyApiError
        ? error.message
        : error instanceof SignInRequired
          ? error.message
          : 'Company sign-in could not complete. Try signing in again.'
  }
  if (!session) window.history.replaceState(null, '', window.location.pathname)
  const root = createRoot(element)
  status.hidden = true
  root.render(
    <CompanyCatalogue
      session={session}
      api={api}
      initialData={initialData}
      initialError={initialError}
      onClose={() => {
        root.unmount()
        status.hidden = false
        status.textContent =
          'Company catalogue closed. You can close this window and return to CAD.'
        window.close()
      }}
    />,
  )
}
void start().catch(() => {
  const status = document.getElementById('status')
  if (status)
    status.textContent = 'Company catalogue could not load. Close this window and try again.'
})
