import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompanyCatalogue } from './CompanyCatalogue'
import { CompanyApi } from './api'
import { SignInRequired } from './auth'
import { seedContent } from './seed'
import type { Draft, Principal, Published, RuleContent } from './types'

const author: Principal = {
  tenantId: 'tenant',
  objectId: 'author',
  roles: ['Catalogue.ProductDesigner'],
}
const reviewer: Principal = { ...author, objectId: 'reviewer' }
const rules: Published = {
  kind: 'rule',
  definitionId: 'company.master',
  version: 2,
  content: { ...seedContent('rule', []), name: 'Master rules' } as RuleContent,
  author: 'tenant:it',
  approvedBy: 'tenant:it',
  publishedAt: '2026-10-02T00:00:00Z',
  hash: 'rule-hash',
  draftId: 'rule-draft',
}
const initial: Draft = {
  id: '00000000-0000-0000-0000-000000000001',
  kind: 'product',
  definitionId: 'company.base',
  revision: 7,
  baseVersion: 3,
  state: 'submitted',
  author: 'tenant:author',
  hash: 'saved-hash',
  content: {
    name: 'Cabinet',
    source: { id: 'starter.base-600', version: 1 },
    rule: { id: 'company.master', version: 2 },
    overrides: { depth: 600 },
  },
}
function harness(principal = reviewer, draft = initial) {
  let currentDraft = structuredClone(draft)
  const session = {
    signIn: vi.fn().mockResolvedValue(undefined),
    token: vi.fn().mockResolvedValue('api-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
  }
  const transport = vi.fn(async (path: string | URL | Request, options?: RequestInit) => {
    const url = String(path)
    let data: unknown
    if (url.endsWith('/me')) data = principal
    else if (url.endsWith('/versions')) data = [rules]
    else if (url.endsWith('/audit'))
      data = [
        {
          sequence: 1,
          action: 'submit',
          actor: 'tenant:author',
          revision: 7,
          state: 'submitted',
          at: '2026-10-02T01:00:00Z',
          hash: 'saved-hash',
          note: 'Please review',
        },
      ]
    else if (options?.method === 'PUT' || options?.method === 'POST') {
      const body = JSON.parse(String(options.body))
      currentDraft = {
        ...currentDraft,
        revision: currentDraft.revision + 1,
        content: body.content ?? currentDraft.content,
        state: url.endsWith('/publish')
          ? 'published'
          : url.endsWith('/submit')
            ? 'submitted'
            : 'draft',
      }
      data = currentDraft
    } else data = [currentDraft]
    return new Response(JSON.stringify(data), { status: 200 })
  })
  const api = new CompanyApi(session, transport)
  const onClose = vi.fn()
  render(<CompanyCatalogue session={session} api={api} onClose={onClose} />)
  return { session, transport, api, onClose, user: userEvent.setup() }
}
async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Sign in with Keycloak' }))
  await screen.findByRole('button', { name: /Cabinet.*company.base/ })
}
async function select(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Cabinet.*company.base/ }))
  await screen.findByText(/Saved digest: saved-hash/)
}
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('company publishing UI', () => {
  it('keeps unconfigured installation read-only with an IT setup message', () => {
    render(<CompanyCatalogue session={null} onClose={() => {}} />)
    expect(screen.getByText(/Company sign-in is not configured/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Sign in/ })).toBeNull()
  })
  it('loads server-verified callback data without signing in twice', async () => {
    const session = { signIn: vi.fn(), token: vi.fn(), signOut: vi.fn() }
    render(
      <CompanyCatalogue
        session={session}
        initialData={{ actor: reviewer, drafts: [initial], versions: [rules] }}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Sign in with Keycloak' })).toBeNull()
    expect(screen.getByRole('button', { name: /Cabinet.*company.base/ })).toBeTruthy()
    expect(session.signIn).not.toHaveBeenCalled()
  })
  it('displays a callback error with an explicit reconnect action', () => {
    const session = { signIn: vi.fn(), token: vi.fn(), signOut: vi.fn() }
    render(
      <CompanyCatalogue
        session={session}
        initialError="Company sign-in could not complete."
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Company sign-in could not complete.')
    expect(screen.getByRole('button', { name: 'Sign in with Keycloak' })).toBeTruthy()
  })
  it('requires a different designer and hides author publication controls', async () => {
    const { user } = harness(author)
    await connect(user)
    await select(user)
    expect(screen.getByText(/A different authorised senior designer/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Review publication' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Withdraw to edit' })).toBeTruthy()
  })
  it('shows pinned versions and audit notes, requires confirmation, sends exact reviewed revision', async () => {
    const { user, transport } = harness()
    await connect(user)
    await select(user)
    expect(screen.getByText(/Pinned company rules: company.master v2/)).toBeTruthy()
    expect(screen.getByText('Review note: Please review')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Review publication' }))
    expect(screen.getByText('Publish company.base v4?')).toBeTruthy()
    expect(transport.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await screen.findByText(/Company version published/)
    const command = transport.mock.calls.find(([path]) => String(path).endsWith('/publish'))
    expect(JSON.parse(String(command?.[1]?.body))).toEqual({ expectedRevision: 7, note: '' })
    expect(screen.queryByRole('button', { name: 'Review publication' })).toBeNull()
  })
  it('requires a note when requesting changes and returns the draft to its creator', async () => {
    const { user, transport } = harness()
    await connect(user)
    await select(user)
    expect(
      (screen.getByRole('button', { name: 'Request changes' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.type(screen.getByRole('textbox', { name: 'Review note' }), 'Check depth')
    await user.click(screen.getByRole('button', { name: 'Request changes' }))
    await screen.findByText(/returned to its creator/)
    const command = transport.mock.calls.find(([path]) => String(path).endsWith('/request-changes'))
    expect(JSON.parse(String(command?.[1]?.body))).toEqual({
      expectedRevision: 7,
      note: 'Check depth',
    })
  })
  it('blocks submission while dirty, saves input-only content, then submits returned revision', async () => {
    const { user, transport } = harness(author, { ...initial, state: 'draft' })
    await connect(user)
    await select(user)
    await user.clear(screen.getByRole('spinbutton', { name: 'Depth override (mm)' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Depth override (mm)' }), '650')
    expect(
      (screen.getByRole('button', { name: 'Submit for review' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText(/Draft saved/)
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))
    await screen.findByText(/Draft submitted/)
    const edit = transport.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(String(edit?.[1]?.body))).toMatchObject({
      expectedRevision: 7,
      content: { overrides: { depth: 650 }, rule: { id: 'company.master', version: 2 } },
    })
    const submit = transport.mock.calls.find(([path]) => String(path).endsWith('/submit'))
    expect(JSON.parse(String(submit?.[1]?.body))).toEqual({ expectedRevision: 8 })
  })
  it('locks a conflict until explicit reload and never silently retries publication', async () => {
    const { user, transport } = harness()
    await connect(user)
    await select(user)
    await user.click(screen.getByRole('button', { name: 'Review publication' }))
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Draft changed; reload before acting.' }), {
        status: 409,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await screen.findByRole('alert')
    expect(
      (screen.getByRole('button', { name: 'Review publication' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(transport.mock.calls.filter(([path]) => String(path).endsWith('/publish'))).toHaveLength(
      1,
    )
    await user.click(screen.getByRole('button', { name: 'Reload catalogue' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.queryByText(/Saved digest:/)).toBeNull()
    await select(user)
    expect(
      (screen.getByRole('button', { name: 'Review publication' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
  it('locks an uncertain write outcome and a failed reload', async () => {
    const { user, transport } = harness()
    await connect(user)
    await select(user)
    await user.click(screen.getByRole('button', { name: 'Review publication' }))
    transport.mockRejectedValueOnce(new TypeError('offline'))
    await user.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await screen.findByText(/request outcome is uncertain/)
    expect(
      (screen.getByRole('button', { name: 'Review publication' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    transport.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    await user.click(screen.getByRole('button', { name: 'Reload catalogue' }))
    await screen.findByRole('alert')
    expect(
      (screen.getByRole('button', { name: 'Review publication' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
  it('clears private snapshots on token expiry and server 401', async () => {
    const { user, session } = harness()
    await connect(user)
    await select(user)
    session.token.mockRejectedValueOnce(new SignInRequired())
    await user.click(screen.getByRole('button', { name: 'Reload catalogue' }))
    await screen.findByRole('button', { name: 'Sign in with Keycloak' })
    expect(screen.queryByText(/Saved digest/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Cabinet.*company.base/ })).toBeNull()
    expect(session.signOut).toHaveBeenCalled()
  })
  it('clears private data when the API rejects an access token with 401', async () => {
    const { user, transport } = harness()
    await connect(user)
    await select(user)
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 }),
    )
    await user.click(screen.getByRole('button', { name: 'Reload catalogue' }))
    await screen.findByRole('button', { name: 'Sign in with Keycloak' })
    expect(screen.queryByText(/Saved digest/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Cabinet.*company.base/ })).toBeNull()
  })
  it('blocks reconnect until sign-out finishes and contains CAD keyboard shortcuts', async () => {
    const { user, session } = harness()
    await connect(user)
    await select(user)
    const keyboard = vi.fn()
    window.addEventListener('keydown', keyboard)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Delete' })
    expect(keyboard).not.toHaveBeenCalled()
    window.removeEventListener('keydown', keyboard)
    let finish!: () => void
    session.signOut.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      (screen.getByRole('button', { name: 'Sign in with Keycloak' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await act(async () => {
      finish()
    })
    expect(
      (screen.getByRole('button', { name: 'Sign in with Keycloak' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
  it('ignores a late publication response after sign-out', async () => {
    const { user, transport } = harness()
    await connect(user)
    await select(user)
    await user.click(screen.getByRole('button', { name: 'Review publication' }))
    let finish!: (response: Response) => void
    transport.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(finish).toBeDefined())
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await act(async () => {
      finish(new Response(JSON.stringify({ ...initial, state: 'published' })))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await screen.findByRole('button', { name: 'Sign in with Keycloak' })
    await waitFor(() => expect(screen.queryByText(/Company version published/)).toBeNull())
    expect(screen.queryByText(/Saved digest/)).toBeNull()
  })
  it('offers published history but no write controls to a catalogue reader', async () => {
    const { user } = harness({ ...author, roles: [] })
    await connect(user)
    expect(screen.queryByRole('button', { name: 'New product' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New rules' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Master rules.*company.master v2/ }))
    expect(screen.getByText(/Approved by: tenant:it/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Draft next version' })).toBeNull()
  })
  it('copies immutable rule content into a new version, edits stock and common fields', async () => {
    const { user } = harness({ ...author, roles: ['Catalogue.RuleAdministrator'] })
    await connect(user)
    await user.click(screen.getByRole('button', { name: /Master rules.*company.master v2/ }))
    await user.click(screen.getByRole('button', { name: 'Draft next version' }))
    expect(
      (screen.getByRole('textbox', { name: 'Company definition ID' }) as HTMLInputElement).value,
    ).toBe('company.master')
    await user.type(screen.getByRole('textbox', { name: 'New stock name' }), 'ABS 1mm')
    await user.click(screen.getByRole('button', { name: 'Add stock' }))
    expect(screen.getByRole('spinbutton', { name: 'ABS 1mm thickness (mm)' })).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Edge band: ABS 1mm' }))
    expect(
      screen.getByRole('combobox', { name: 'Edge band' }).querySelector('option[value="ABS 1mm"]'),
    ).toBeTruthy()
    expect(rules.content).not.toHaveProperty('materials.ABS 1mm')
  })
  it('allows inheriting product dimensions and prevents dirty close without consent', async () => {
    const { user, onClose } = harness(author, { ...initial, state: 'draft' })
    await connect(user)
    await select(user)
    await user.clear(screen.getByRole('spinbutton', { name: 'Depth override (mm)' }))
    vi.mocked(window.confirm).mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
