import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { ProductionRelease } from '../scene/releases'
import type { Part } from '../scene/types'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'
import { compareReleaseSource } from './compareReleaseSource'
import {
  buildReleaseChangeReport,
  changeReviewCoverage,
  changeReviewMatchesSource,
  createChangeReview,
  MAX_CHANGE_REVIEWER_LENGTH,
  MAX_CHANGE_REVIEW_NOTE_LENGTH,
  type ChangeReviewDraft,
  releaseChangeReportFilename,
  releaseChangeReportJson,
  releaseChangeReportHtml,
} from './releaseChangeReport'
import { sourceReviewParts } from './sourceReviewParts'
import { useSourceReviewView } from './useSourceReviewView'
import { MAX_SOURCE_REVIEW_SEARCH } from './sourceReviewViewPreferences'
import { useLocalChangeReview } from './useLocalChangeReview'
import { downloadBlob } from './download'
import { resumeChangeReview, MAX_CHANGE_REVIEW_BYTES } from './resumeChangeReview'

function hasReviewEdits(review: ChangeReviewDraft) {
  return (
    review.reviewer !== '' ||
    review.notes !== '' ||
    review.entries.some((entry) => entry.reviewed || entry.note !== '')
  )
}
function ReviewFinding({
  entry,
  label,
  disabled,
  checkboxRef,
  onFocus,
  onChange,
}: {
  entry: ChangeReviewDraft['entries'][number]
  label: string
  disabled: boolean
  checkboxRef: (node: HTMLInputElement | null) => void
  onFocus: () => void
  onChange: (patch: { reviewed?: boolean; note?: string }) => void
}) {
  return (
    <div className="my-2 space-y-2 text-sm" onFocus={onFocus}>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          ref={checkboxRef}
          disabled={disabled}
          checked={entry.reviewed}
          onChange={(event) => onChange({ reviewed: event.target.checked })}
        />
        Reviewed: {label}
      </label>
      <label className="block">
        Review note
        <textarea
          className="mt-1 block w-full rounded border border-border bg-background p-2"
          aria-label={`Review note: ${label}`}
          disabled={disabled}
          maxLength={MAX_CHANGE_REVIEW_NOTE_LENGTH}
          rows={2}
          value={entry.note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </label>
    </div>
  )
}

// A cabinet-level hardware change links every board of the cabinet.
const PART_BUTTON_LIMIT = 5
function FindingParts({ parts, onShow }: { parts: Part[]; onShow: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const more = parts.length - PART_BUTTON_LIMIT
  return (
    <>
      {(expanded ? parts : parts.slice(0, PART_BUTTON_LIMIT)).map((part) => (
        <Button
          key={part.id}
          variant="outline"
          className="mr-2 mt-2"
          onClick={() => onShow(part.id)}
        >
          Show {part.label}
          {part.visible ? '' : ' (hidden)'}
        </Button>
      ))}
      {more > 0 && (
        <Button
          variant="ghost"
          className="mr-2 mt-2"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show fewer parts' : `Show ${more} more ${more === 1 ? 'part' : 'parts'}`}
        </Button>
      )}
    </>
  )
}

export function ReleaseSourceComparison({
  release,
  input,
  onClose,
  onInspect,
}: {
  release: ProductionRelease
  input: ProductionPacketInput
  onClose: () => void
  onInspect: (partId: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const searchInput = useRef<HTMLInputElement>(null)
  const partSearchInput = useRef<HTMLInputElement>(null)
  const pendingToggle = useRef<HTMLInputElement>(null)
  const findingNodes = useRef(new Map<string, HTMLInputElement>())
  const currentFinding = useRef<string | null>(null)
  const requestedFocus = useRef<string | null>(null)
  const alive = useRef(false)
  const operationPending = useRef(false)
  const [activity, setActivity] = useState<'export' | 'resume' | null>(null)
  const operationBusy = activity !== null
  const contextVersion = useRef(0)
  const editVersion = useRef(0)
  const [resumeError, setResumeError] = useState('')
  const [resumeNotice, setResumeNotice] = useState<{
    review: ChangeReviewDraft
    message: string
  } | null>(null)
  const [exportError, setExportError] = useState('')
  const [leaveNotice, setLeaveNotice] = useState('')
  const savedReview = useRef<ChangeReviewDraft | null>(null)
  const [lastBulkReview, setLastBulkReview] = useState<{
    before: ChangeReviewDraft
    after: ChangeReviewDraft
    message: string
  } | null>(null)
  const [reviewState, setReviewState] = useState<ChangeReviewDraft | null>(null)
  const { scene, projectName, hardwareLibrary, materialLibrary } = input
  const partsById = useMemo(
    () => new Map(scene.parts.map((part) => [part.id, part])),
    [scene.parts],
  )
  const result = useMemo(() => {
    try {
      const source = captureProductionSource({
        scene,
        projectName,
        hardwareLibrary,
        materialLibrary,
      })
      return {
        source,
        report: compareReleaseSource(release.source, source),
        error: null,
      }
    } catch (error) {
      return {
        source: null,
        report: null,
        error: error instanceof Error ? error.message : 'The source could not be compared.',
      }
    }
  }, [release, scene, projectName, hardwareLibrary, materialLibrary])
  useLayoutEffect(() => {
    contextVersion.current += 1
    currentFinding.current = null
    requestedFocus.current = null
  }, [
    release.id,
    release.revision,
    release.packetSha256,
    release.sourceSha256,
    release.source,
    result.source,
  ])
  const blankReview = useMemo(
    () =>
      result.source && result.report
        ? createChangeReview(release, result.source, result.report)
        : null,
    [release, result],
  )
  const matches = (draft: ChangeReviewDraft) =>
    result.source !== null && changeReviewMatchesSource(draft, release, result.source)
  const review = reviewState && matches(reviewState) ? reviewState : blankReview
  const autosave = useLocalChangeReview(
    release,
    result.source,
    reviewState && matches(reviewState) ? reviewState : null,
    (draft) => {
      editVersion.current += 1
      setReviewState(draft)
    },
    result.report,
  )
  const viewPreferences = useSourceReviewView(autosave.comparisonKey ?? null)
  const { search, pendingOnly, pendingFirst, setSearch, setPendingOnly, setPendingFirst } =
    viewPreferences
  const {
    partFilter,
    partSearch,
    pendingPartsFirst,
    setPartFilter,
    setPartSearch,
    setPendingPartsFirst,
  } = viewPreferences
  const {
    reviewedOnly,
    pendingPartsOnly,
    classification,
    changeType,
    setReviewedOnly,
    setPendingPartsOnly,
    setClassification,
    setChangeType,
  } = viewPreferences
  const {
    findingGroup,
    entityType,
    noteFilter,
    partSort,
    setFindingGroup,
    setEntityType,
    setNoteFilter,
    setPartSort,
  } = viewPreferences
  const busy = operationBusy || autosave.loading
  const coverage = result.report ? changeReviewCoverage(result.report) : []
  const coverageByReference = new Map(coverage.map((entry) => [entry.reference, entry]))
  const entriesByReference = new Map(review?.entries.map((entry) => [entry.reference, entry]) ?? [])
  const isPending = (reference: string) => entriesByReference.get(reference)?.reviewed === false
  const pendingOrder = <T,>(items: readonly T[], reference: (item: T) => string): readonly T[] =>
    pendingFirst
      ? [
          ...items.filter((item) => isPending(reference(item))),
          ...items.filter((item) => !isPending(reference(item))),
        ]
      : items
  const itemsFor = (category: 'manufacturing' | 'metadata') =>
    pendingOrder(
      (result.report?.changes ?? []).filter((change) => change.classification === category),
      (change) => `item:${change.key}`,
    )
  const sourceFindings = pendingOrder(
    result.report?.otherSourceChanges ?? [],
    (label) => `source:${JSON.stringify(label)}`,
  )
  const limitationFindings = pendingOrder(
    coverage.filter((entry) => entry.category === 'limitation'),
    (entry) => entry.reference,
  )
  const orderedCoverage = [
    ...(['manufacturing', 'metadata'] as const).flatMap((category) =>
      itemsFor(category).map((change) => coverageByReference.get(`item:${change.key}`)!),
    ),
    ...sourceFindings.map((label) => coverageByReference.get(`source:${JSON.stringify(label)}`)!),
    ...limitationFindings,
  ]
  const groupSummary = (references: readonly string[]) => {
    const pending = references.filter(isPending).length
    return `${pending} pending · ${references.length - pending} reviewed · ${references.length} total`
  }
  const partGroups = useMemo(
    () => sourceReviewParts(result.report?.changes ?? [], partsById),
    [result.report, partsById],
  )
  const activePart = partGroups.find((part) => part.id === partFilter)
  const matchesPart = (reference: string) =>
    !activePart || !reference.startsWith('item:') || activePart.references.includes(reference)
  const pendingForPart = (part: (typeof partGroups)[number]) =>
    part.references.filter(isPending).length
  const normalizeSearch = (value: string) => value.normalize('NFC').toLowerCase()
  const query = normalizeSearch(search.trim())
  const itemSearchText = useMemo(
    () =>
      new Map(
        (result.report?.changes ?? []).map((change) => [
          `item:${change.key}`,
          JSON.stringify(change) +
            ' ' +
            change.partIds.map((id) => partsById.get(id)?.label ?? '').join(' '),
        ]),
      ),
    [result.report, partsById],
  )
  const matchesSearch = (reference: string, note = entriesByReference.get(reference)?.note ?? '') =>
    !query ||
    [
      coverageByReference.get(reference)?.label ?? '',
      itemSearchText.get(reference) ?? '',
      note,
    ].some((text) => normalizeSearch(text).includes(query))
  const changesByReference = new Map(
    (result.report?.changes ?? []).map((change) => [`item:${change.key}`, change]),
  )
  const matchesItemFilters = (reference: string) => {
    const change = changesByReference.get(reference)
    return (
      !change ||
      ((entityType === 'all' || change.entity === entityType) &&
        (classification === 'all' || change.classification === classification) &&
        (changeType === 'all' || change.change === changeType))
    )
  }
  const matchesNote = (reference: string, note = entriesByReference.get(reference)?.note ?? '') =>
    noteFilter === 'all' ||
    (noteFilter === 'with' ? note.trim().length > 0 : note.trim().length === 0)
  const visibleFinding = (reference: string) =>
    (!pendingOnly || isPending(reference)) &&
    (!reviewedOnly || !isPending(reference)) &&
    (findingGroup === 'all' || coverageByReference.get(reference)?.category === findingGroup) &&
    matchesNote(reference) &&
    matchesItemFilters(reference) &&
    matchesSearch(reference) &&
    matchesPart(reference)
  const visibleCount = coverage.filter((entry) => visibleFinding(entry.reference)).length
  const visiblePending = orderedCoverage.filter(
    (entry) => isPending(entry.reference) && visibleFinding(entry.reference),
  )
  const matchingPendingCount = visiblePending.length
  const pendingCount = coverage.filter((entry) => isPending(entry.reference)).length
  const pendingSummary = (category: 'item' | 'source' | 'limitation') => {
    const group = coverage.filter((entry) => entry.category === category)
    return `${group.filter((entry) => isPending(entry.reference)).length} of ${group.length}`
  }
  const nextPending = (after: string | null, direction = 1) => {
    if (!visiblePending.length) return null
    const found = orderedCoverage.findIndex((entry) => entry.reference === after)
    const start = found < 0 ? (direction === 1 ? -1 : 0) : found
    for (let offset = 1; offset <= orderedCoverage.length; offset++) {
      const index = (start + direction * offset + orderedCoverage.length) % orderedCoverage.length
      const reference = orderedCoverage[index].reference
      if (isPending(reference) && visibleFinding(reference)) return reference
    }
    return null
  }

  const focusFinding = (reference: string) => {
    const node = findingNodes.current.get(reference)
    node?.focus()
    node?.scrollIntoView?.({ block: 'nearest' })
  }
  useLayoutEffect(() => {
    const reference = requestedFocus.current
    requestedFocus.current = null
    if (reference === '__part_search') partSearchInput.current?.focus()
    else if (reference === '__search') searchInput.current?.focus()
    else if (reference === '__pending_toggle') pendingToggle.current?.focus()
    else if (reference) focusFinding(reference)
  })
  const partQuery = normalizeSearch(partSearch.trim())
  const matchedParts = partGroups.filter(
    (part) =>
      (!pendingPartsOnly || pendingForPart(part) > 0) &&
      (!partQuery ||
        [
          part.id,
          part.label,
          ...part.references.map((reference) => entriesByReference.get(reference)?.note ?? ''),
        ].some((text) => normalizeSearch(text).includes(partQuery))),
  )
  const sortedParts =
    partSort === 'name'
      ? [...matchedParts].sort(
          (a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }) ||
            a.id.localeCompare(b.id),
        )
      : matchedParts
  const displayedParts = pendingPartsFirst
    ? [
        ...sortedParts.filter((part) => pendingForPart(part) > 0),
        ...sortedParts.filter((part) => pendingForPart(part) === 0),
      ]
    : sortedParts
  const pendingPartList = displayedParts.filter((part) => pendingForPart(part) > 0)
  const pendingPartFrom = (direction = 1) => {
    const found = displayedParts.findIndex((part) => part.id === activePart?.id)
    const start = found < 0 ? (direction === 1 ? -1 : 0) : found
    for (let offset = 1; offset <= displayedParts.length; offset++) {
      const index = (start + direction * offset + displayedParts.length) % displayedParts.length
      const part = displayedParts[index]
      if (pendingForPart(part) > 0) return part
    }
    return undefined
  }
  const nextPart = pendingPartFrom()
  const openPartReview = (part: (typeof partGroups)[number], pending = pendingOnly) => {
    const reference = orderedCoverage.find(
      (entry) =>
        part.references.includes(entry.reference) && (!pending || isPending(entry.reference)),
    )?.reference
    const target = reference ?? '__part_search'
    if (
      activePart?.id === part.id &&
      search === '' &&
      pending === pendingOnly &&
      !reviewedOnly &&
      classification === 'all' &&
      changeType === 'all' &&
      findingGroup === 'all' &&
      entityType === 'all' &&
      noteFilter === 'all'
    ) {
      if (reference) focusFinding(reference)
      else partSearchInput.current?.focus()
    } else {
      requestedFocus.current = target
      setReviewedOnly(false)
      setClassification('all')
      setChangeType('all')
      setFindingGroup('all')
      setEntityType('all')
      setNoteFilter('all')
      setPartFilter(part.id)
      setSearch('')
      setPendingOnly(pending)
    }
  }
  const updateReview = (updater: (draft: ChangeReviewDraft) => ChangeReviewDraft) => {
    if (!blankReview) return
    editVersion.current += 1
    setResumeNotice(null)
    setReviewState((previous) => updater(previous && matches(previous) ? previous : blankReview))
  }
  // Clear the checkpoint before commit so returning to an old source pair cannot revive undo.
  if (lastBulkReview && review !== lastBulkReview.after) setLastBulkReview(null)
  const canUndoBulk = !!lastBulkReview && review === lastBulkReview.after
  const visibleReviewed = orderedCoverage.filter(
    (entry) => !isPending(entry.reference) && visibleFinding(entry.reference),
  )
  const bulkReview = (reviewed: boolean) => {
    if (busy || !review) return
    const targets = reviewed ? visiblePending : visibleReviewed
    if (
      !targets.length ||
      !window.confirm(
        `${reviewed ? 'Mark' : 'Reopen'} ${targets.length} visible ${reviewed ? 'pending findings as reviewed' : 'reviewed findings as pending'}? Hidden findings and all notes will stay unchanged.`,
      )
    )
      return
    const references = new Set(targets.map((entry) => entry.reference))
    const after = {
      ...review,
      entries: review.entries.map((entry) =>
        references.has(entry.reference) ? { ...entry, reviewed } : entry,
      ),
    }
    updateReview(() => after)
    setLastBulkReview({
      before: review,
      after,
      message: `${targets.length} findings ${reviewed ? 'marked reviewed' : 'reopened'}.`,
    })
    requestedFocus.current = '__search'
  }
  const finding = (reference: string) => {
    const entry = entriesByReference.get(reference),
      info = coverageByReference.get(reference)
    return (
      entry &&
      info && (
        <ReviewFinding
          entry={entry}
          label={info.label}
          disabled={busy}
          checkboxRef={(node) => {
            if (node) findingNodes.current.set(reference, node)
            else findingNodes.current.delete(reference)
          }}
          onFocus={() => {
            currentFinding.current = reference
          }}
          onChange={(patch) => {
            if (pendingOnly && patch.reviewed) {
              const next = nextPending(reference)
              requestedFocus.current = next && next !== reference ? next : '__pending_toggle'
            }
            if (reviewedOnly && patch.reviewed === false)
              requestedFocus.current = '__pending_toggle'
            if (
              patch.note !== undefined &&
              (!matchesSearch(reference, patch.note) || !matchesNote(reference, patch.note))
            ) {
              requestedFocus.current = '__search'
            }
            updateReview((draft) => ({
              ...draft,
              entries: draft.entries.map((item) =>
                item.reference === reference ? { ...item, ...patch } : item,
              ),
            }))
          }}
        />
      )
    )
  }
  const canLeave = () => {
    if (!review || !hasReviewEdits(review) || savedReview.current === review) return true
    if (
      !window.confirm(
        'Discard review edits since your last report download? Download a report first to keep them.',
      )
    )
      return false
    autosave.discard()
    return true
  }
  const leave = async (action: () => void) => {
    setLeaveNotice('')
    if (!review || !hasReviewEdits(review) || savedReview.current === review || autosave.saved) {
      action()
      return
    }
    if (autosave.error) {
      if (canLeave()) action()
      return
    }
    const context = contextVersion.current
    for (let attempt = 0; attempt < 3; attempt++) {
      const version = editVersion.current
      const kept = await autosave.flush()
      if (!alive.current || context !== contextVersion.current) return
      if (version === editVersion.current) {
        if (kept || canLeave()) action()
        return
      }
    }
    setLeaveNotice('Your review changed while it was being saved. Try again.')
  }
  const close = () => {
    void leave(onClose)
  }
  useEffect(() => {
    alive.current = true
    const node = dialog.current!
    node.showModal()
    return () => {
      alive.current = false
      node.close()
    }
  }, [])
  const exportReport = async (format: 'html' | 'json') => {
    if (!result.source || !result.report || !review || operationPending.current) return
    operationPending.current = true
    setActivity('export')
    setExportError('')
    try {
      const report = await buildReleaseChangeReport(
        release,
        result.source,
        new Date(),
        review,
        result.report,
      )
      if (alive.current) {
        downloadBlob(
          format === 'html' ? releaseChangeReportHtml(report) : releaseChangeReportJson(report),
          releaseChangeReportFilename(report, format),
          format === 'html' ? 'text/html;charset=utf-8' : 'application/json',
        )
        savedReview.current = review
      }
    } catch (error) {
      if (alive.current)
        setExportError(
          error instanceof Error ? error.message : 'The report could not be downloaded.',
        )
    } finally {
      operationPending.current = false
      if (alive.current) setActivity(null)
    }
  }
  const resume = async (file: File) => {
    if (!result.source || !result.report || !review || operationPending.current) return
    const source = result.source
    const baseline = { ...release }
    const originalContext = contextVersion.current
    const originalEdit = editVersion.current
    operationPending.current = true
    setActivity('resume')
    setResumeError('')
    setResumeNotice(null)
    try {
      if (file.size > MAX_CHANGE_REVIEW_BYTES)
        throw new Error('Change review JSON exceeds the 64 MiB limit.')
      const restored = await resumeChangeReview(await file.text(), baseline, source)
      if (!alive.current) return
      if (originalContext !== contextVersion.current || originalEdit !== editVersion.current)
        throw new Error('The comparison or review changed while loading. Choose the JSON again.')
      if (
        hasReviewEdits(review) &&
        !window.confirm(
          'Replace your current review with the uploaded report? Your current notes and check-offs will be replaced, and the review draft saved in this browser will be replaced too.',
        )
      ) {
        setResumeNotice({
          review: restored,
          message: 'Resume cancelled. Your current review was kept.',
        })
        return
      }
      editVersion.current += 1
      setReviewState(restored)
      savedReview.current = restored
      setResumeNotice({
        review: restored,
        message: `Review resumed from ${file.name}. Further edits need a new download.`,
      })
    } catch (error) {
      if (alive.current)
        setResumeError(error instanceof Error ? error.message : 'The review could not be read.')
    } finally {
      operationPending.current = false
      if (alive.current) setActivity(null)
    }
  }
  return createPortal(
    <dialog
      onKeyDown={(event) => {
        if (
          !event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.nativeEvent.isComposing ||
          !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
        )
          return
        event.preventDefault()
        event.stopPropagation()
        if (busy) return
        const reference =
          event.key === 'Home'
            ? visiblePending[0]?.reference
            : event.key === 'End'
              ? visiblePending.at(-1)?.reference
              : nextPending(currentFinding.current, event.key === 'ArrowUp' ? -1 : 1)
        if (reference) focusFinding(reference)
      }}
      ref={dialog}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      className="fixed inset-0 m-auto max-h-[85vh] w-[min(1000px,94vw)] overflow-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={heading} className="text-lg font-semibold">
          Changes since revision {release.revision}
        </h2>
        <Button variant="outline" onClick={close}>
          Close comparison
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded source compared with the current design. Manufacturing changes include dimensions,
        stock, placement, machining and purchasing requirements. Labels, presentation and prices
        appear as metadata. This comparison does not approve production.
      </p>
      {resumeError && <p role="alert">Review could not be resumed: {resumeError}</p>}
      {resumeNotice && matches(resumeNotice.review) && <p role="status">{resumeNotice.message}</p>}
      {exportError && <p role="alert">Report export failed: {exportError}</p>}
      {leaveNotice && <p role="status">{leaveNotice}</p>}
      {result.error && <p role="alert">Comparison unavailable: {result.error}</p>}
      {result.report && (
        <>
          {reviewState && !matches(reviewState) && hasReviewEdits(reviewState) && (
            <p role="status">
              This comparison differs from your review. Its notes and check-offs are not applied.
            </p>
          )}
          {review && (
            <section
              aria-label="Change report review"
              className="my-4 space-y-3 rounded border border-border p-3 text-sm"
            >
              <h3 className="font-semibold">Change report review</h3>
              <p role="status">
                Review progress: {review.entries.filter((entry) => entry.reviewed).length} of{' '}
                {review.entries.length} findings reviewed.
              </p>
              <p role="status">
                Pending changes: {pendingSummary('item')} · Other source changes:{' '}
                {pendingSummary('source')} · Limitations: {pendingSummary('limitation')}
              </p>
              <label className="block">
                Search review findings
                <input
                  ref={searchInput}
                  type="search"
                  maxLength={MAX_SOURCE_REVIEW_SEARCH}
                  value={search}
                  disabled={busy}
                  className="mt-1 block w-full rounded border border-border bg-background p-2"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={busy || search === ''}
                onClick={() => {
                  setSearch('')
                  searchInput.current?.focus()
                }}
              >
                Clear finding search
              </Button>
              <Button
                variant="outline"
                disabled={
                  busy ||
                  (search === '' &&
                    !pendingOnly &&
                    !pendingFirst &&
                    partFilter === null &&
                    partSearch === '' &&
                    !pendingPartsFirst &&
                    !reviewedOnly &&
                    !pendingPartsOnly &&
                    classification === 'all' &&
                    changeType === 'all' &&
                    findingGroup === 'all' &&
                    entityType === 'all' &&
                    noteFilter === 'all' &&
                    partSort === 'comparison')
                }
                onClick={() => {
                  setFindingGroup('all')
                  setEntityType('all')
                  setNoteFilter('all')
                  setPartSort('comparison')
                  setReviewedOnly(false)
                  setPendingPartsOnly(false)
                  setClassification('all')
                  setChangeType('all')
                  setSearch('')
                  setPendingOnly(false)
                  setPendingFirst(false)
                  setPartFilter(null)
                  setPartSearch('')
                  setPendingPartsFirst(false)
                  searchInput.current?.focus()
                }}
              >
                Reset review view
              </Button>
              <section
                aria-label="Part review summary"
                className="space-y-2 rounded border border-border p-3"
              >
                <h4 className="font-semibold">Part review summary</h4>
                <p>
                  A finding linked to multiple parts appears in each part’s count. Part filters
                  apply to item findings; source sections and limitations remain in scope.
                </p>
                <label className="block">
                  Find a part in review
                  <input
                    ref={partSearchInput}
                    type="search"
                    maxLength={MAX_SOURCE_REVIEW_SEARCH}
                    value={partSearch}
                    disabled={busy}
                    onChange={(event) => setPartSearch(event.target.value)}
                    className="mt-1 block w-full rounded border border-border bg-background p-2"
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={busy || partSearch === ''}
                  onClick={() => {
                    setPartSearch('')
                    partSearchInput.current?.focus()
                  }}
                >
                  Clear part search
                </Button>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pendingPartsFirst}
                    disabled={busy}
                    onChange={(event) => setPendingPartsFirst(event.target.checked)}
                  />
                  Show pending parts first
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={pendingPartsOnly}
                    disabled={busy}
                    onChange={(event) => setPendingPartsOnly(event.target.checked)}
                  />{' '}
                  Show pending parts only
                </label>
                <Button
                  variant="outline"
                  disabled={busy || !nextPart}
                  onClick={() => {
                    if (nextPart) openPartReview(nextPart, true)
                  }}
                >
                  Next pending part
                </Button>
                {(['Previous', 'First', 'Last'] as const).map((position) => (
                  <Button
                    key={position}
                    variant="outline"
                    disabled={busy || !pendingPartList.length}
                    onClick={() => {
                      const part =
                        position === 'Previous'
                          ? pendingPartFrom(-1)
                          : position === 'First'
                            ? pendingPartList[0]
                            : pendingPartList.at(-1)
                      if (part) openPartReview(part, true)
                    }}
                  >
                    {position} pending part
                  </Button>
                ))}
                <label>
                  Part summary order
                  <select
                    aria-label="Part summary order"
                    disabled={busy}
                    value={partSort}
                    onChange={(event) => setPartSort(event.target.value as typeof partSort)}
                  >
                    <option value="comparison">Comparison order</option>
                    <option value="name">Part name (A–Z)</option>
                  </select>
                </label>
                <p role="status">
                  Showing {displayedParts.length} of {partGroups.length} parts.
                </p>
                {displayedParts.length === 0 && <p>No parts match the summary filters.</p>}
                {partFilter && !activePart && (
                  <p role="status">
                    The saved part filter is unavailable. All item findings are shown.
                  </p>
                )}
                {activePart && (
                  <p role="status">
                    Item findings filtered to {activePart.label} ({activePart.id}).
                  </p>
                )}
                <Button
                  variant="outline"
                  disabled={busy || partFilter === null}
                  onClick={() => {
                    setPartFilter(null)
                    partSearchInput.current?.focus()
                  }}
                >
                  Clear part filter
                </Button>
                <ul>
                  {displayedParts.map((part) => (
                    <li key={part.id} className="my-2 border-t pt-2">
                      <p>
                        {part.label} · {part.id}
                        {part.removed ? ' · Not in current design' : ''}
                      </p>
                      <p>
                        {pendingForPart(part)} pending ·{' '}
                        {part.references.length - pendingForPart(part)} reviewed ·{' '}
                        {part.references.length} total
                      </p>
                      <p>
                        {(['manufacturing', 'metadata'] as const)
                          .map(
                            (category) =>
                              `${part.references.filter((reference) => changesByReference.get(reference)?.classification === category).length} ${category}`,
                          )
                          .join(' · ')}
                      </p>
                      <p>
                        {(['added', 'removed', 'modified'] as const)
                          .map(
                            (type) =>
                              `${part.references.filter((reference) => changesByReference.get(reference)?.change === type).length} ${type}`,
                          )
                          .join(' · ')}
                      </p>
                      <Button
                        variant="outline"
                        disabled={busy}
                        aria-pressed={activePart?.id === part.id}
                        onClick={() => openPartReview(part)}
                      >
                        Filter findings for {part.label} ({part.id})
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
              <p role="status">
                Showing {visibleCount} of {coverage.length} findings.
              </p>
              <p role="status">
                Visible: {matchingPendingCount} pending · {visibleCount - matchingPendingCount}{' '}
                reviewed.
              </p>
              {visibleCount === 0 && (
                <p role="status">
                  No findings match the current filters. Reset review view to see all findings.
                </p>
              )}
              <div role="group" aria-label="Bulk review actions" className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || !matchingPendingCount}
                  onClick={() => bulkReview(true)}
                >
                  Mark visible pending findings reviewed ({matchingPendingCount})
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !visibleReviewed.length}
                  onClick={() => bulkReview(false)}
                >
                  Reopen visible reviewed findings ({visibleReviewed.length})
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !canUndoBulk}
                  onClick={() => {
                    if (!canUndoBulk || !lastBulkReview) return
                    updateReview(() => lastBulkReview.before)
                    setLastBulkReview(null)
                    requestedFocus.current = '__search'
                  }}
                >
                  Undo last bulk review change
                </Button>
                {canUndoBulk && (
                  <p role="status">
                    {lastBulkReview?.message} Undo is available until the next review edit or
                    comparison change.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label>
                  Finding group
                  <select
                    aria-label="Finding group"
                    disabled={busy}
                    value={findingGroup}
                    onChange={(event) => setFindingGroup(event.target.value as typeof findingGroup)}
                  >
                    <option value="all">All finding groups</option>
                    <option value="item">Item changes</option>
                    <option value="source">Other source changes</option>
                    <option value="limitation">Limitations</option>
                  </select>
                </label>
                <label>
                  Item kind
                  <select
                    aria-label="Item kind"
                    disabled={busy}
                    value={entityType}
                    onChange={(event) => setEntityType(event.target.value as typeof entityType)}
                  >
                    <option value="all">Parts and hardware</option>
                    <option value="part">Parts</option>
                    <option value="hardware">Hardware</option>
                  </select>
                </label>
                <label>
                  Finding notes
                  <select
                    aria-label="Finding notes"
                    disabled={busy}
                    value={noteFilter}
                    onChange={(event) => setNoteFilter(event.target.value as typeof noteFilter)}
                  >
                    <option value="all">All notes</option>
                    <option value="with">With a note</option>
                    <option value="without">Without a note</option>
                  </select>
                </label>
                <label>
                  Change classification
                  <select
                    aria-label="Change classification"
                    value={classification}
                    disabled={busy}
                    onChange={(event) =>
                      setClassification(event.target.value as typeof classification)
                    }
                  >
                    <option value="all">All classifications</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="metadata">Metadata</option>
                  </select>
                </label>
                <label>
                  Change type
                  <select
                    aria-label="Change type"
                    value={changeType}
                    disabled={busy}
                    onChange={(event) => setChangeType(event.target.value as typeof changeType)}
                  >
                    <option value="all">All change types</option>
                    <option value="added">Added</option>
                    <option value="removed">Removed</option>
                    <option value="modified">Modified</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={reviewedOnly}
                    disabled={busy}
                    onChange={(event) => setReviewedOnly(event.target.checked)}
                  />{' '}
                  Show reviewed only
                </label>
                <label className="flex items-center gap-2">
                  <input
                    ref={pendingToggle}
                    type="checkbox"
                    checked={pendingOnly}
                    disabled={busy}
                    onChange={(event) => setPendingOnly(event.target.checked)}
                  />
                  Show pending only
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pendingFirst}
                    disabled={busy}
                    onChange={(event) => setPendingFirst(event.target.checked)}
                  />
                  Show pending findings first
                </label>
                <Button
                  variant="outline"
                  disabled={busy || matchingPendingCount === 0}
                  onClick={() => {
                    const reference = nextPending(currentFinding.current)
                    if (reference) focusFinding(reference)
                  }}
                >
                  Next pending finding
                </Button>
                {(['Previous', 'First', 'Last'] as const).map((position) => (
                  <Button
                    key={position}
                    variant="outline"
                    disabled={busy || matchingPendingCount === 0}
                    onClick={() => {
                      const reference =
                        position === 'Previous'
                          ? nextPending(currentFinding.current, -1)
                          : position === 'First'
                            ? visiblePending[0]?.reference
                            : visiblePending.at(-1)?.reference
                      if (reference) focusFinding(reference)
                    }}
                  >
                    {position} pending finding
                  </Button>
                ))}
                <p>
                  Alt+↓ / Alt+↑: next / previous pending. Alt+Home / Alt+End: first / last pending.
                </p>
              </div>
              <div
                role="group"
                aria-label="Jump to pending review group"
                className="flex flex-wrap gap-2"
              >
                {(
                  [
                    ['item', 'Review pending changes'],
                    ['source', 'Review pending source changes'],
                    ['limitation', 'Review pending limitations'],
                  ] as const
                ).map(([category, label]) => {
                  const target = orderedCoverage.find(
                    (entry) => entry.category === category && isPending(entry.reference),
                  )
                  return (
                    <Button
                      key={category}
                      variant="outline"
                      disabled={busy || !target}
                      onClick={() => {
                        if (!target) return
                        if (
                          search === '' &&
                          pendingOnly &&
                          !activePart &&
                          classification === 'all' &&
                          changeType === 'all' &&
                          findingGroup === 'all' &&
                          entityType === 'all' &&
                          noteFilter === 'all'
                        )
                          focusFinding(target.reference)
                        else {
                          requestedFocus.current = target.reference
                          setClassification('all')
                          setChangeType('all')
                          setFindingGroup('all')
                          setEntityType('all')
                          setNoteFilter('all')
                          setPartFilter(null)
                          setSearch('')
                          setPendingOnly(true)
                        }
                      }}
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>
              {pendingCount === 0 && (
                <p role="status">
                  All findings reviewed.
                  {pendingOnly && ' Clear Show pending only to edit reviewed findings.'}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy} onClick={viewPreferences.forget}>
                  Forget remembered source review views
                </Button>
                {viewPreferences.paused && (
                  <Button
                    variant="outline"
                    disabled={busy || !viewPreferences.ready}
                    onClick={viewPreferences.resume}
                  >
                    Resume saving source review views
                  </Button>
                )}
              </div>
              {viewPreferences.message && <p role="status">{viewPreferences.message}</p>}
              {viewPreferences.actionError && <p role="alert">{viewPreferences.actionError}</p>}
              {viewPreferences.failed ? (
                <p role="alert">
                  Review view settings could not be remembered in this browser.
                  <Button variant="outline" onClick={viewPreferences.retry}>
                    Retry saving source review view
                  </Button>
                </p>
              ) : (
                viewPreferences.ready &&
                !viewPreferences.paused && (
                  <p className="text-muted-foreground">
                    View settings are remembered for ten recent source comparisons.
                  </p>
                )
              )}
              <p className="text-muted-foreground">
                View filters affect this dialog only. Downloads always include every finding.
              </p>
              <p role="status">
                {autosave.loading
                  ? 'Checking for a local review draft…'
                  : autosave.error
                    ? 'Local autosave unavailable. Download JSON to keep your edits.'
                    : autosave.saved
                      ? 'Review draft saved locally.'
                      : reviewState
                        ? 'Saving review draft…'
                        : 'Local autosave ready.'}
              </p>
              {autosave.restored && <p>Local review draft restored.</p>}
              {autosave.error && (
                <p role="alert">
                  {autosave.error}{' '}
                  <button type="button" onClick={autosave.retry}>
                    Retry local autosave
                  </button>
                </p>
              )}
              <label className="block">
                Reviewer name
                <input
                  className="mt-1 block w-full rounded border border-border bg-background p-2"
                  value={review.reviewer}
                  disabled={busy}
                  maxLength={MAX_CHANGE_REVIEWER_LENGTH}
                  onChange={(event) =>
                    updateReview((draft) => ({ ...draft, reviewer: event.target.value }))
                  }
                />
              </label>
              <label className="block">
                Overall review notes
                <textarea
                  className="mt-1 block w-full rounded border border-border bg-background p-2"
                  rows={3}
                  value={review.notes}
                  disabled={busy}
                  maxLength={MAX_CHANGE_REVIEW_NOTE_LENGTH}
                  onChange={(event) =>
                    updateReview((draft) => ({ ...draft, notes: event.target.value }))
                  }
                />
              </label>
              <p>
                Names and check-offs are self-declared review records. They do not grant production
                approval. Drafts autosave in this browser for up to ten recent comparisons. Download
                JSON for a portable backup.
              </p>
            </section>
          )}
          <label className="my-3 block text-sm font-medium">
            Resume change review JSON (version 2, up to 64 MiB)
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Resume change review JSON"
              className="mt-2 block"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void resume(file)
              }}
            />
          </label>
          <div className="my-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void exportReport('html')}>
              Download printable change report
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void exportReport('json')}>
              Download change report JSON
            </Button>
          </div>
          {busy && (
            <p role="status">
              {activity === 'resume'
                ? 'Reading and checking saved change review…'
                : 'Preparing captured change report…'}
            </p>
          )}
          <p className="mb-3 text-sm text-muted-foreground">
            Downloads capture the comparison when requested and include both source hashes. Later
            edits do not update downloaded reports.
          </p>
          <p role="status">
            {result.report.changes.length} changed items ·{' '}
            {result.report.changes.filter((c) => c.change === 'added').length} added ·{' '}
            {result.report.changes.filter((c) => c.change === 'removed').length} removed ·{' '}
            {result.report.changes.filter((c) => c.change === 'modified').length} modified
          </p>
          {result.report.changes.length === 0 && result.report.otherSourceChanges.length === 0 && (
            <p>No differences in compared source fields.</p>
          )}
          {(['manufacturing', 'metadata'] as const).map((category) => (
            <section key={category} aria-label={`${category} changes`} className="my-4">
              <h3 className="font-semibold">
                {category === 'manufacturing' ? 'Manufacturing changes' : 'Metadata changes'}
              </h3>
              <p role="status">
                {groupSummary(itemsFor(category).map((change) => `item:${change.key}`))}
              </p>
              <ul className="space-y-3">
                {itemsFor(category)
                  .filter((change) => visibleFinding(`item:${change.key}`))
                  .map((change) => (
                    <li key={change.key} className="rounded border border-border p-3 text-sm">
                      <p className="font-medium">
                        {change.label} · {change.entity} · {change.change}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">{change.id}</p>
                      {finding(`item:${change.key}`)}
                      <details>
                        <summary>Changed fields ({change.fields.length})</summary>
                        <ul>
                          {change.fields.map((field) => (
                            <li key={field.name} className="my-2">
                              <p>
                                {field.name} · {field.classification}
                              </p>
                              <pre className="whitespace-pre-wrap break-all text-xs">
                                {JSON.stringify(field.before, null, 2)} →{' '}
                                {JSON.stringify(field.after, null, 2)}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      </details>
                      {change.change === 'removed' && (
                        <p>Removed from the current design; no current part to select.</p>
                      )}
                      <FindingParts
                        parts={change.partIds.flatMap((id) => partsById.get(id) ?? [])}
                        onShow={(id) => {
                          void leave(() => onInspect(id))
                        }}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          {result.report.otherSourceChanges.length > 0 && (
            <section aria-label="Other source changes">
              <h3 className="font-semibold">Other source changes</h3>
              <p role="status">
                {groupSummary(sourceFindings.map((label) => `source:${JSON.stringify(label)}`))}
              </p>
              <p className="text-sm">
                These source sections also differ. Review them alongside the item changes.
              </p>
              <ul>
                {sourceFindings
                  .filter((label) => visibleFinding(`source:${JSON.stringify(label)}`))
                  .map((label) => (
                    <li key={label}>
                      {label}
                      {finding(`source:${JSON.stringify(label)}`)}
                    </li>
                  ))}
              </ul>
            </section>
          )}
          <section aria-label="Review comparison limitations" className="my-4 text-sm">
            <h3 className="font-semibold">Comparison limitations</h3>
            <p role="status">{groupSummary(limitationFindings.map((entry) => entry.reference))}</p>
            <ul>
              {limitationFindings
                .filter((entry) => visibleFinding(entry.reference))
                .map((entry) => (
                  <li key={entry.reference}>{finding(entry.reference)}</li>
                ))}
            </ul>
          </section>
          <p className="mt-4 text-sm text-muted-foreground">
            This view compares saved source records using current manufacturing rules. It does not
            compare the original exported ZIP, drawing layout, machine compatibility or hardware
            suitability. Changes to labels within machining definitions are conservatively treated
            as manufacturing changes. Use packet comparison to review actual exported outputs.
          </p>
        </>
      )}
    </dialog>,
    document.body,
  )
}
