# Review view storage status

Report automatic preference-write failures inline instead of claiming views were remembered. Keep saving enabled so the next navigation change can retry; successful later writes restore the remembered status. Preserve notes, acknowledgments, checkpoint and review exports. Paused saving retains its existing guidance and explicit-resume failure behavior. This optional storage does not save review progress.

Test initial storage denial, later recovery, unchanged review progress and failure after an explicit resume. Deliberately break the automatic-result handling and verify assertion failures.
