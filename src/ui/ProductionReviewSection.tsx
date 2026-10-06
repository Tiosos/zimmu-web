import { Button } from '@/components/ui/button'
import { REVIEW_STATUS_LABELS, type ProductionReview } from '../scene/productionReview'
import type { Selection } from '../scene/types'

export function ProductionReviewSection({
  review,
  onInspect,
}: {
  review: ProductionReview
  onInspect?: (selection: NonNullable<Selection>) => void
}) {
  return (
    <section aria-label="Production packet review summary" className="border rounded p-3 mb-4">
      <h3 className="font-medium">Production packet review summary</h3>
      <p>
        {REVIEW_STATUS_LABELS[review.status]} · {review.counts.needsCorrection} need correction ·{' '}
        {review.counts.advisory} advisory · {review.counts.unassessed} unassessed
      </p>
      <p className="text-xs text-muted-foreground">{review.scope}</p>
      <p className="text-xs text-muted-foreground">{review.classification}</p>
      {(['needs-correction', 'advisory', 'unassessed'] as const).map((category) => {
        const items = review.items.filter((item) => item.category === category)
        const label =
          category === 'needs-correction'
            ? 'Needs correction'
            : category === 'advisory'
              ? 'Advisory findings'
              : 'Unassessed checks'
        return (
          <details key={category} open={category === 'needs-correction' && items.length > 0}>
            <summary>
              {label} ({items.length})
            </summary>
            {items.slice(0, 200).map((item) => (
              <div key={item.reference} className="border-t py-2 text-sm">
                <p>
                  {item.source} ·{' '}
                  {item.sourceReferences.length ? item.sourceReferences.join(', ') : item.code}
                </p>
                <p>{item.message}</p>
                <p className="text-xs break-all">Reference: {item.reference}</p>
                {item.operationId && (
                  <p>
                    Operation {item.operationId} · Component {item.sourceComponentId ?? 'none'} ·
                    Joint {item.sourceJointId ?? 'none'}
                  </p>
                )}
                {item.targets.map((target) => (
                  <p key={`${target.kind}/${target.id}`}>
                    {target.label} [{target.id}]{' '}
                    {onInspect && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onInspect({ kind: target.kind, id: target.id })}
                      >
                        Inspect {target.label}
                      </Button>
                    )}
                  </p>
                ))}
                {item.locations.map((location) => (
                  <p key={location} className="text-xs break-all">
                    {location}
                  </p>
                ))}
              </div>
            ))}
            {items.length > 200 && (
              <p>
                Showing 200 items in this category. PDF and JSON exports include all review items.
              </p>
            )}
          </details>
        )
      })}
    </section>
  )
}
