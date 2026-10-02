import type { CompanySession } from './auth'
import type { Action, Audit, Content, Draft, Kind, Principal, Published } from './types'

export class CompanyApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export class CompanyApi {
  private session: CompanySession
  private transport: typeof fetch
  constructor(session: CompanySession, transport: typeof fetch = fetch) {
    this.session = session
    this.transport = transport
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const token = await this.session.token()
    const response = await this.transport(`/api/catalogue${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    if (!response.ok) {
      let message = 'The catalogue service could not complete the request.'
      try {
        const data = (await response.json()) as { error?: unknown }
        if (typeof data.error === 'string') message = data.error
      } catch {
        /* Proxy errors may not be JSON. */
      }
      throw new CompanyApiError(response.status, message)
    }
    return response.json() as Promise<T>
  }
  me = () => this.request<Principal>('/me')
  drafts = () => this.request<Draft[]>('/drafts')
  versions = () => this.request<Published[]>('/versions')
  audit = (id: string) => this.request<Audit[]>(`/drafts/${encodeURIComponent(id)}/audit`)
  create = (kind: Kind, definitionId: string, content: Content) =>
    this.request<Draft>('/drafts', 'POST', { kind, definitionId, content })
  edit = (draft: Draft, content: Content) =>
    this.request<Draft>(`/drafts/${encodeURIComponent(draft.id)}`, 'PUT', {
      expectedRevision: draft.revision,
      content,
    })
  act = (draft: Draft, action: Action, note?: string) =>
    this.request<Draft>(`/drafts/${encodeURIComponent(draft.id)}/${action}`, 'POST', {
      expectedRevision: draft.revision,
      ...(note === undefined ? {} : { note }),
    })
}
