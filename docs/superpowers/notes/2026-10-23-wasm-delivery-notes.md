# Geometry engine (WASM) delivery — findings and open questions

Recorded 2026-10-23, during the review follow-up PRs (#155–#157). Nothing here is implemented yet.
Plan: none yet; a plan should follow once the questions below are answered.

## What was measured

Measured on the production build (`pnpm build`, `vite preview`), not on a real host.

| Item | Value |
|------|-------|
| `opencascade.wasm`, raw | 62.8 MB |
| gzip -9 | 13.1 MB |
| Brotli q5 / q9 | 10.9 MB / 10.4 MB |
| Content-Type from `vite preview` | `application/wasm` (correct, so streaming compilation is possible) |
| Content-Encoding from `vite preview` | none — sent uncompressed |
| Cache-Control from `vite preview` | `no-cache` (revalidates on every load) |

`vite preview` is not a production server, so the last two rows are a baseline, not a finding about
any real deployment.

## How the app loads it today

- The kernel starts loading when the app mounts: `useScene` runs a 1×1×1 warm-up `buildPart` through
  the worker (`src/scene/useScene.ts`, "Readiness is the kernel having built something"). The UI is
  usable meanwhile; only the add buttons are disabled.
- The only signal while loading is a hover tooltip, `title="Loading geometry engine…"`, on the
  disabled buttons (`src/ui/sidebar.tsx`). There is no visible indicator and no progress.
- **Defect:** the warm-up call ends in `.catch(() => {})`. If the file is blocked, the user is offline
  or the worker fails, nothing is reported: the buttons stay disabled with the same tooltip forever.
  This is independent of hosting and can be fixed without any of the answers below.

## Options considered

1. **Surface the state and the failure** (visible "loading" text; an error with a retry). Small, no
   hosting knowledge needed. Recommended first step.
2. **Host configuration:** Brotli for `/assets/*` and `Cache-Control: public, max-age=31536000,
   immutable` (filenames are content-hashed). Depends on the host; some hosts cap single-file size
   (the uncompressed 62.8 MB may exceed such a cap — check the current limit for the chosen host).
3. **A real byte-count progress bar.** Requires fetching the file ourselves and handing it to
   Emscripten, which works against the project note not to change how opencascade.js loads its WASM.
   Not recommended unless users are on slow links (see question 2).

## Open questions

Each stays open until someone answers it here.

1. **What serves the built app?** (Netlify, Vercel, Cloudflare Pages, S3 + CDN, nginx, GitHub Pages,
   something else.) This decides whether compression, caching headers and the file-size cap can be
   configured at all.
   *Answer:* _open_

2. **Who are the users and on what network?** (Office network, public internet, mobile.) This decides
   whether a progress bar (option 3) is worth the effort or a plain loading state (option 1) is
   enough.
   *Answer:* _open_

3. **What should a load failure look like?** A banner, or a message in the toolbar next to the
   disabled buttons; and whether it offers a retry.
   *Answer:* _open_

4. **Sequencing.** (a) Merge #157 before starting option 1: **decided** — merge was requested on
   2026-10-23. (b) Do option 1 as its own PR afterwards: _open_.
   *Answer:* (a) yes; (b) _open_

## Related, not part of these questions

- Remote branch cleanup is blocked from the agent session (see PR #157). 25 merged branches last
  touched before 2026-10-16 are waiting for the repository owner to delete them.
