import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { actorId, ApiError, requireRole, type Kind, type Principal } from './auth'
import { digest, identifier, inputOf, revision, textValue, validatedContent, type Content, type RuleContent } from './content'

export interface Draft {
  id: string; kind: Kind; definitionId: string; baseVersion: number; revision: number
  state: 'draft' | 'submitted' | 'published'; author: string; content: Content; hash: string
}
export interface Published {
  kind: Kind; definitionId: string; version: number; content: Content; hash: string
  author: string; approvedBy: string; publishedAt: string; draftId: string
}
export type Action = 'submit' | 'withdraw' | 'request-changes' | 'publish'

export class CatalogueStore {
  private readonly db: DatabaseSync
  private readonly tenantId: string
  constructor(path: string, tenantId: string) {
    this.tenantId = tenantId
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS drafts (tenant TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(tenant,id));
      CREATE TABLE IF NOT EXISTS versions (tenant TEXT NOT NULL, kind TEXT NOT NULL, definition_id TEXT NOT NULL,
        version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(tenant,kind,definition_id,version));
      CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL,
        draft_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_version_update BEFORE UPDATE ON versions BEGIN SELECT RAISE(ABORT,'Published versions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_version_delete BEFORE DELETE ON versions BEGIN SELECT RAISE(ABORT,'Published versions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;`)
  }
  close(): void { this.db.close() }
  private tenant(actor: Principal): void {
    if (actor.tenantId !== this.tenantId) throw new ApiError(403, 'The company tenant does not match.')
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = work(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private readDraft(id: string): Draft {
    const row = this.db.prepare('SELECT data FROM drafts WHERE tenant=? AND id=?').get(this.tenantId, id)
    if (!row) throw new ApiError(404, 'Draft not found.')
    return JSON.parse(String(row.data)) as Draft
  }
  private baseVersion(kind: Kind, id: string): number {
    const row = this.db.prepare('SELECT MAX(version) AS version FROM versions WHERE tenant=? AND kind=? AND definition_id=?').get(this.tenantId, kind, id)
    return Number(row?.version ?? 0)
  }
  private rule = (id: string, version: number): RuleContent | undefined => {
    const row = this.db.prepare('SELECT data FROM versions WHERE tenant=? AND kind=? AND definition_id=? AND version=?').get(this.tenantId, 'rule', id, version)
    return row ? (JSON.parse(String(row.data)) as Published).content as RuleContent : undefined
  }
  private record(actor: Principal, draft: Draft, action: string, note = ''): void {
    const entry = { action, revision: draft.revision, state: draft.state, definitionId: draft.definitionId,
      kind: draft.kind, hash: draft.hash, actor: actorId(actor), roles: actor.roles, at: new Date().toISOString(), note }
    this.db.prepare('INSERT INTO audit(tenant,draft_id,data) VALUES(?,?,?)').run(this.tenantId, draft.id, JSON.stringify(entry))
  }
  private write(draft: Draft): void {
    this.db.prepare('UPDATE drafts SET data=? WHERE tenant=? AND id=?').run(JSON.stringify(draft), this.tenantId, draft.id)
  }
  private editable(actor: Principal, draft: Draft, expected: number): void {
    this.tenant(actor); requireRole(actor, draft.kind)
    if (draft.revision !== revision(expected)) throw new ApiError(409, 'Draft changed; reload before acting.')
  }
  private creator(actor: Principal, draft: Draft): void {
    if (draft.author !== actorId(actor)) throw new ApiError(403, 'Only the creator can edit or submit this draft.')
  }
  create(actor: Principal, kind: Kind, definitionId: string, raw: unknown): Draft {
    this.tenant(actor); requireRole(actor, kind); const id = identifier(definitionId)
    return this.transaction(() => {
      const content = validatedContent(kind, raw, this.rule)
      const draft: Draft = { id: randomUUID(), kind, definitionId: id, baseVersion: this.baseVersion(kind, id),
        revision: 1, state: 'draft', author: actorId(actor), content, hash: digest(content) }
      this.db.prepare('INSERT INTO drafts(tenant,id,data) VALUES(?,?,?)').run(this.tenantId, draft.id, JSON.stringify(draft))
      this.record(actor, draft, 'create'); return draft
    })
  }
  get(actor: Principal, id: string): Draft {
    this.tenant(actor); const draft = this.readDraft(id); requireRole(actor, draft.kind); return draft
  }
  listDrafts(actor: Principal): Draft[] {
    this.tenant(actor)
    return this.db.prepare('SELECT data FROM drafts WHERE tenant=?').all(this.tenantId)
      .map((row) => JSON.parse(String(row.data)) as Draft).filter((draft) => actor.roles.includes(draft.kind === 'rule' ? 'Catalogue.RuleAdministrator' : 'Catalogue.ProductDesigner'))
  }
  listVersions(actor: Principal): Published[] {
    this.tenant(actor)
    return this.db.prepare('SELECT data FROM versions WHERE tenant=? ORDER BY kind,definition_id,version').all(this.tenantId)
      .map((row) => JSON.parse(String(row.data)) as Published)
  }
  audit(actor: Principal, id: string): unknown[] {
    this.get(actor, id)
    return this.db.prepare('SELECT sequence,data FROM audit WHERE tenant=? AND draft_id=? ORDER BY sequence').all(this.tenantId, id)
      .map((row) => ({ sequence: row.sequence, ...JSON.parse(String(row.data)) as Record<string, unknown> }))
  }
  edit(actor: Principal, id: string, expected: number, raw: unknown): Draft {
    return this.transaction(() => {
      const draft = this.readDraft(id); this.editable(actor, draft, expected); this.creator(actor, draft)
      if (draft.state !== 'draft') throw new ApiError(409, 'A submitted or published snapshot cannot be edited.')
      const content = validatedContent(draft.kind, raw, this.rule)
      const next = { ...draft, content, hash: digest(content), revision: draft.revision + 1 }
      this.write(next); this.record(actor, next, 'edit'); return next
    })
  }
  act(actor: Principal, id: string, expected: number, action: Action, note = ''): Draft {
    if (note.length > 2000) throw new ApiError(400, 'Review note is too long.')
    return this.transaction(() => {
      const draft = this.readDraft(id); this.editable(actor, draft, expected)
      let state: Draft['state']
      if (action === 'submit') {
        this.creator(actor, draft)
        if (draft.state !== 'draft') throw new ApiError(409, 'Only a working draft can be submitted.')
        validatedContent(draft.kind, inputOf(draft.kind, draft.content), this.rule)
        state = 'submitted'
      } else {
        if (draft.state !== 'submitted') throw new ApiError(409, 'This action requires a submitted snapshot.')
        if (action === 'withdraw') this.creator(actor, draft)
        if ((action === 'publish' || action === 'request-changes') && draft.kind === 'product' && draft.author === actorId(actor))
          throw new ApiError(403, 'A different authorised senior designer must review this product.')
        if (action === 'request-changes') textValue(note, 'Review note', 2000)
        state = action === 'publish' ? 'published' : 'draft'
      }
      const next = { ...draft, state, revision: draft.revision + 1 }
      if (action === 'publish') {
        if (this.baseVersion(draft.kind, draft.definitionId) !== draft.baseVersion)
          throw new ApiError(409, 'A newer version was published. Prepare a new draft against it.')
        // Validate the pinned recipe again, but publish its persisted snapshot, never fresh instance IDs.
        validatedContent(draft.kind, inputOf(draft.kind, draft.content), this.rule)
        const published: Published = { kind: draft.kind, definitionId: draft.definitionId, version: draft.baseVersion + 1,
          content: draft.content, hash: draft.hash, author: draft.author, approvedBy: actorId(actor),
          publishedAt: new Date().toISOString(), draftId: draft.id }
        this.db.prepare('INSERT INTO versions(tenant,kind,definition_id,version,data) VALUES(?,?,?,?,?)')
          .run(this.tenantId, published.kind, published.definitionId, published.version, JSON.stringify(published))
      }
      this.write(next); this.record(actor, next, action, note); return next
    })
  }
}
