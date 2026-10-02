import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { configuredSession, SignInRequired, type CompanySession } from './auth'
import { CompanyApi, CompanyApiError } from './api'
import { ContentForm } from './ContentForm'
import { seedContent } from './seed'
import { RULE_LABELS } from '../ui/ruleLabels'
import type { ProductContent, RuleContent } from './types'
import {
  COMPANY_ROLES,
  editableContent,
  permissions,
  principalId,
  type Action,
  type Audit,
  type Content,
  type CompanyData,
  type Draft,
  type Kind,
  type Principal,
  type Published,
} from './types'

interface Editor {
  kind: Kind
  definitionId: string
  content: Content
  saved: Draft | null
}
export function CompanyCatalogue({
  onClose,
  session: suppliedSession,
  api: suppliedApi,
  initialData,
  initialError = '',
}: {
  onClose: () => void
  session?: CompanySession | null
  api?: CompanyApi
  initialData?: CompanyData
  initialError?: string
}) {
  const [session] = useState(() =>
    suppliedSession === undefined ? configuredSession() : suppliedSession,
  )
  const [api] = useState(() => suppliedApi ?? (session ? new CompanyApi(session) : null))
  const [actor, setActor] = useState<Principal | null>(initialData?.actor ?? null)
  const [drafts, setDrafts] = useState<Draft[]>(initialData?.drafts ?? [])
  const [versions, setVersions] = useState<Published[]>(initialData?.versions ?? [])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])
  const [history, setHistory] = useState<Published | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [confirmation, setConfirmation] = useState<Draft | null>(null)
  const generation = useRef(0)
  const working = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const dirty =
    !!editor &&
    (!editor.saved ||
      JSON.stringify(editor.content) !==
        JSON.stringify(editableContent(editor.kind, editor.saved.content)))
  useEffect(() => {
    const sessionGeneration = generation
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => {
      ++sessionGeneration.current
      previous?.focus()
    }
  }, [])
  function clear() {
    setActor(null)
    setDrafts([])
    setVersions([])
    setEditor(null)
    setAudit([])
    setHistory(null)
    setConfirmation(null)
    setNote('')
    setMessage('')
  }
  async function run(work: (current: () => boolean) => Promise<void>) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    setMessage('')
    const requestGeneration = generation.current
    const current = () => generation.current === requestGeneration
    try {
      await work(current)
    } catch (failure) {
      if (!current()) return
      setConfirmation(null)
      if (
        failure instanceof SignInRequired ||
        (failure instanceof CompanyApiError && failure.status === 401)
      ) {
        clear()
        setLocked(false)
        await session?.signOut().catch(() => {})
        setError('Your company session needs verification. Sign in again to continue.')
      } else {
        setError(
          failure instanceof CompanyApiError
            ? failure.message
            : 'The request outcome is uncertain. Reload the catalogue before acting again.',
        )
        if (!(failure instanceof CompanyApiError) || failure.status !== 400) setLocked(true)
      }
    } finally {
      if (current()) {
        working.current = false
        setBusy(false)
      }
    }
  }
  async function load(current: () => boolean) {
    if (!api) return
    const [principal, loadedDrafts, loadedVersions] = await Promise.all([
      api.me(),
      api.drafts(),
      api.versions(),
    ])
    if (!current()) return
    setActor(principal)
    setDrafts(loadedDrafts)
    setVersions(loadedVersions)
    setEditor(null)
    setAudit([])
    setHistory(null)
    setNote('')
    setConfirmation(null)
    setLocked(false)
  }
  const abandon = () => !dirty || window.confirm('Discard unsaved catalogue changes?')
  const close = () => {
    if (abandon()) onClose()
  }
  async function selectDraft(draft: Draft, current: () => boolean) {
    if (!api) return
    const entries = await api.audit(draft.id)
    if (!current()) return
    setEditor({
      kind: draft.kind,
      definitionId: draft.definitionId,
      content: editableContent(draft.kind, draft.content),
      saved: draft,
    })
    setAudit(entries)
    setHistory(null)
    setNote('')
    setConfirmation(null)
  }
  async function signOut() {
    if (!session || !abandon()) return
    const requestGeneration = ++generation.current
    working.current = true
    setBusy(true)
    setLocked(false)
    setError('')
    clear()
    try {
      await session.signOut()
    } catch {
      if (generation.current === requestGeneration)
        setError(
          'Local sign-out completed. Keycloak sign-out could not finish. Close this catalogue window and try again.',
        )
    } finally {
      if (generation.current === requestGeneration) {
        working.current = false
        setBusy(false)
      }
    }
  }
  function changeContent(content: Content) {
    setEditor((e) => (e ? { ...e, content } : e))
    setConfirmation(null)
  }
  async function save(current: () => boolean) {
    if (!api || !editor) return
    const result = editor.saved
      ? await api.edit(editor.saved, editor.content)
      : await api.create(editor.kind, editor.definitionId, editor.content)
    if (!current()) return
    setDrafts((all) => [...all.filter((d) => d.id !== result.id), result])
    await selectDraft(result, current)
    if (current()) setMessage('Draft saved. Review the saved snapshot before submission.')
  }
  async function act(action: Action, draft: Draft, current: () => boolean) {
    if (!api) return
    const result = await api.act(
      draft,
      action,
      action === 'request-changes' || action === 'publish' ? note.trim() : undefined,
    )
    if (!current()) return
    setDrafts((all) => all.map((d) => (d.id === result.id ? result : d)))
    await selectDraft(result, current)
    if (action === 'publish') {
      const all = await api.versions()
      if (current()) setVersions(all)
    }
    if (current())
      setMessage(
        action === 'publish'
          ? 'Company version published. Existing CAD designs remain unchanged.'
          : `Draft ${action === 'request-changes' ? 'returned to its creator with your note' : action === 'withdraw' ? 'withdrawn for editing' : 'submitted for review'}.`,
      )
  }
  const saved = editor?.saved
  const allowed = actor && saved ? permissions(actor, saved) : null
  const disabled = busy || locked
  return (
    <dialog
      ref={dialog}
      onKeyDown={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      aria-labelledby="company-title"
      className="bg-background text-foreground border border-border rounded-lg p-0 w-[min(1100px,95vw)] max-h-[90vh] backdrop:bg-black/60"
    >
      <div className="p-4 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="company-title" className="font-semibold text-lg">
            Company catalogue
          </h2>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </header>
        <p className="text-sm text-muted-foreground">
          Publish company construction rules and cabinet recipes. Catalogue approval does not
          release work for production.
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
            {locked && ' Reload and review the saved snapshot before another command.'}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!session ? (
          <p role="status">
            Company sign-in is not configured. Ask IT to enable the company catalogue for this
            installation.
          </p>
        ) : !actor ? (
          <Button
            disabled={busy}
            onClick={() => {
              void run(async (current) => {
                await session.signIn()
                if (current()) await load(current)
              })
            }}
          >
            Sign in with Keycloak
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="break-all">Verified company identity: {principalId(actor)}</span>
              <span>
                {actor.roles.includes(COMPANY_ROLES.rule) ? 'IT rule administrator' : ''}{' '}
                {actor.roles.includes(COMPANY_ROLES.product) ? 'Authorised senior designer' : ''}
                {!actor.roles.some((r) =>
                  Object.values(COMPANY_ROLES).includes(r as typeof COMPANY_ROLES.rule),
                ) && 'Catalogue reader'}
              </span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (abandon()) void run(load)
                }}
              >
                Reload catalogue
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void signOut()
                }}
              >
                Sign out
              </Button>
            </div>
            <div className="grid md:grid-cols-[240px_minmax(0,1fr)] gap-5">
              <aside className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(['rule', 'product'] as const)
                    .filter((kind) => actor.roles.includes(COMPANY_ROLES[kind]))
                    .map((kind) => (
                      <Button
                        key={kind}
                        size="sm"
                        disabled={disabled}
                        onClick={() => {
                          if (!abandon()) return
                          setEditor({
                            kind,
                            definitionId: '',
                            content: seedContent(kind, versions),
                            saved: null,
                          })
                          setAudit([])
                          setHistory(null)
                          setNote('')
                          setConfirmation(null)
                        }}
                      >
                        New {kind === 'rule' ? 'rules' : 'product'}
                      </Button>
                    ))}
                </div>
                <h3 className="font-medium">Drafts and submissions</h3>
                {!drafts.length && <p className="text-sm">No drafts available for your roles.</p>}
                {drafts.map((draft) => (
                  <button
                    type="button"
                    key={draft.id}
                    disabled={disabled}
                    aria-pressed={saved?.id === draft.id}
                    className="block w-full text-left text-sm border border-border rounded p-2 disabled:opacity-50"
                    onClick={() => {
                      if (abandon()) void run((current) => selectDraft(draft, current))
                    }}
                  >
                    {draft.content.name}
                    <br />
                    {draft.definitionId} · {draft.kind}
                    <br />
                    {draft.state} · r{draft.revision}
                  </button>
                ))}
                <h3 className="font-medium">Published versions</h3>
                {!versions.length && <p className="text-sm">No company versions published yet.</p>}
                {versions.map((version) => (
                  <button
                    type="button"
                    key={`${version.kind}:${version.definitionId}:${version.version}`}
                    disabled={disabled}
                    className="block w-full text-left text-sm border border-border rounded p-2 disabled:opacity-50"
                    onClick={() => {
                      if (!abandon()) return
                      setEditor(null)
                      setAudit([])
                      setHistory(version)
                      setConfirmation(null)
                    }}
                  >
                    {version.content.name}
                    <br />
                    {version.definitionId} v{version.version}
                  </button>
                ))}
              </aside>
              <main className="min-w-0 space-y-4">
                {!editor && !history && (
                  <p>Select a draft or published version, or create a new definition.</p>
                )}
                {history && (
                  <>
                    <h3 className="font-medium">
                      {history.definitionId} v{history.version} — published
                    </h3>
                    <p className="text-sm break-all">
                      Author: {history.author}
                      <br />
                      Approved by: {history.approvedBy}
                      <br />
                      Published: {history.publishedAt}
                      <br />
                      Digest: {history.hash}
                    </p>
                    <Snapshot content={history.content} />
                    {actor.roles.includes(COMPANY_ROLES[history.kind]) && (
                      <Button
                        disabled={disabled}
                        onClick={() => {
                          setEditor({
                            kind: history.kind,
                            definitionId: history.definitionId,
                            content: editableContent(history.kind, history.content),
                            saved: null,
                          })
                          setHistory(null)
                          setNote('')
                        }}
                      >
                        Draft next version
                      </Button>
                    )}
                  </>
                )}
                {editor && (
                  <>
                    <h3 className="font-medium">
                      {editor.kind === 'rule'
                        ? 'Master construction rules'
                        : 'Cabinet product recipe'}
                    </h3>
                    <p className="text-sm">
                      {saved
                        ? `${saved.definitionId} · ${saved.state} · revision ${saved.revision} · based on v${saved.baseVersion}`
                        : 'New working draft'}
                    </p>
                    {!saved || allowed?.edit ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!disabled) void run(save)
                        }}
                        className="space-y-4"
                      >
                        <fieldset disabled={disabled} className="space-y-4">
                          <label className="block text-sm">
                            Company definition ID
                            <input
                              aria-label="Company definition ID"
                              className="block w-full bg-background border border-border rounded p-2"
                              value={editor.definitionId}
                              disabled={!!saved}
                              required
                              pattern="[a-z][a-z0-9.\-]*"
                              maxLength={80}
                              placeholder="company.base-600"
                              onChange={(e) =>
                                setEditor({ ...editor, definitionId: e.target.value })
                              }
                            />
                          </label>
                          <ContentForm
                            kind={editor.kind}
                            content={editor.content}
                            versions={versions}
                            onChange={changeContent}
                          />
                          <Button type="submit" disabled={!dirty}>
                            Save draft
                          </Button>
                        </fieldset>
                      </form>
                    ) : (
                      <Snapshot content={saved.content} />
                    )}
                    {saved && (
                      <>
                        <p className="text-sm break-all">
                          Creator: {saved.author}
                          <br />
                          Saved digest: {saved.hash}
                        </p>
                        {dirty && <p role="status">Unsaved changes. Save before submitting.</p>}
                        <div className="flex flex-wrap gap-2">
                          {allowed?.submit && (
                            <Button
                              disabled={disabled || dirty}
                              onClick={() => {
                                void run((current) => act('submit', saved, current))
                              }}
                            >
                              Submit for review
                            </Button>
                          )}
                          {allowed?.withdraw && (
                            <Button
                              variant="outline"
                              disabled={disabled}
                              onClick={() => {
                                void run((current) => act('withdraw', saved, current))
                              }}
                            >
                              Withdraw to edit
                            </Button>
                          )}
                        </div>
                        {saved.kind === 'product' &&
                          saved.state === 'submitted' &&
                          saved.author === principalId(actor) && (
                            <p>
                              A different authorised senior designer must review and approve this
                              product.
                            </p>
                          )}
                        {allowed?.review && (
                          <div className="space-y-2 border border-border rounded p-3">
                            <label className="block text-sm">
                              Review note
                              <textarea
                                aria-label="Review note"
                                disabled={disabled}
                                maxLength={2000}
                                className="block w-full bg-background border border-border rounded p-2"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                              />
                            </label>
                            <Button
                              variant="outline"
                              disabled={disabled || !note.trim()}
                              onClick={() => {
                                void run((current) => act('request-changes', saved, current))
                              }}
                            >
                              Request changes
                            </Button>{' '}
                            <Button disabled={disabled} onClick={() => setConfirmation(saved)}>
                              Review publication
                            </Button>
                          </div>
                        )}
                        {confirmation && (
                          <section
                            aria-label="Publication confirmation"
                            className="border border-border rounded p-3 space-y-2"
                          >
                            <h4 className="font-medium">
                              Publish {confirmation.definitionId} v{confirmation.baseVersion + 1}?
                            </h4>
                            <p className="text-sm break-all">
                              Saved revision {confirmation.revision}. Digest: {confirmation.hash}.
                              This exact snapshot becomes immutable.
                            </p>
                            <Snapshot content={confirmation.content} />
                            <Button
                              disabled={disabled}
                              onClick={() => {
                                void run((current) => act('publish', confirmation, current))
                              }}
                            >
                              Confirm publication
                            </Button>{' '}
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => setConfirmation(null)}
                            >
                              Cancel publication
                            </Button>
                          </section>
                        )}
                        <h4 className="font-medium">Audit history</h4>
                        <ol className="space-y-2">
                          {audit.map((entry) => (
                            <li
                              key={entry.sequence}
                              className="text-sm break-all border-b border-border pb-2"
                            >
                              {entry.at} · {entry.action} · r{entry.revision}
                              <br />
                              {entry.actor}
                              {entry.note && <p>Review note: {entry.note}</p>}
                              <details>
                                <summary>Digest</summary>
                                {entry.hash}
                              </details>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </>
                )}
              </main>
            </div>
          </>
        )}
        {busy && <p role="status">Contacting company catalogue…</p>}
      </div>
    </dialog>
  )
}
function Snapshot({ content }: { content: Content }) {
  const rule = content as RuleContent
  const product = content as ProductContent
  const labels: Record<string, string> = {
    ...RULE_LABELS,
    width: 'Width (mm)',
    height: 'Height (mm)',
    depth: 'Depth (mm)',
    toeKickHeight: 'Toe kick height (mm)',
    toeKickSetback: 'Toe kick setback (mm)',
    baseMode: 'Base mode',
    hasTop: 'Has top',
  }
  const fields = (values: Record<string, unknown>) => (
    <table className="w-full text-sm">
      <tbody>
        {Object.entries(values)
          .filter(([, value]) => typeof value !== 'object')
          .map(([key, value]) => (
            <tr key={key}>
              <th className="text-left font-normal pr-3">{labels[key] ?? key}</th>
              <td>
                {value === ''
                  ? 'None'
                  : typeof value === 'boolean'
                    ? value
                      ? 'Yes'
                      : 'No'
                    : String(value)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )
  return (
    <section aria-label="Saved definition snapshot" className="space-y-2 bg-secondary rounded p-3">
      <h4 className="text-sm font-medium">Saved definition: {content.name}</h4>
      {rule.values ? (
        <>
          {fields(rule.values)}
          <h5 className="font-medium text-sm">Pinned material stock</h5>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Stock</th>
                <th>Thickness (mm)</th>
                <th>Grain</th>
                <th>Use</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rule.materials).map(([name, stock]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-center">{stock.thickness}</td>
                  <td className="text-center">{stock.hasGrain ? 'Yes' : 'No'}</td>
                  <td className="text-center">
                    {stock.use === 'edge' ? 'Edge band' : 'Panel/frame'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <p className="text-sm">
            Pinned layout: {product.source.id} v{product.source.version}
            <br />
            Pinned company rules: {product.rule.id} v{product.rule.version}
          </p>
          <h5 className="font-medium text-sm">Recipe overrides</h5>
          {Object.keys(product.overrides).length ? (
            fields(product.overrides)
          ) : (
            <p className="text-sm">No overrides. Inherit pinned rule/layout.</p>
          )}
          {product.params && (
            <>
              <h5 className="font-medium text-sm">Resolved construction and dimensions</h5>
              {fields(product.params as unknown as Record<string, unknown>)}
            </>
          )}
        </>
      )}
    </section>
  )
}
