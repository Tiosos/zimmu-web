# Matching note focus

After selecting a matching-note finding, focus its rendered note field and scroll it into view. Commit selection/filter state before querying the field so focus belongs to the destination finding. Use synchronous navigation with no delayed callback or stale focus after closing. Preserve existing selection, summary query and progress. Test focus/scroll through conflicting filters and keyboard activation in Chromium.
