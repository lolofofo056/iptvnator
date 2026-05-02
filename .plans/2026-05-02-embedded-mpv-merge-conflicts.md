# Resolve Embedded MPV PR Merge Conflicts

## Summary

- Update `feat/embedded-mpv-mac-os-experimental` by merging `origin/master` into the branch, not rebasing, so no force-push is needed.
- Resolve the four simulated conflicts while preserving both sides:
    - master’s settings refactor, cover-size setting, live EPG panel work, favorite/recent UX changes
    - branch’s macOS Embedded MPV support, player option gating, IPC typings, and package/runtime behavior
- Leave untracked `tools/wiki/` untouched.

## Key Changes

- Settings: keep master’s refactored section components/options and reapply Embedded MPV support in that shape: `EmbeddedMpvSupport` signal, async support probe in `ngOnInit`, and conditional `VideoPlayer.EmbeddedMpv` option before external MPV/VLC.
- Settings store/interfaces: combine `CoverSize`/`coverSize: 'medium'` with `VideoPlayer.EmbeddedMpv`, embedded MPV prepare/sanitize logic, and `isEmbeddedPlayer()` including Video.js, HTML5, ArtPlayer, and Embedded MPV.
- Live playback conflicts: keep master’s `LiveEpgPanel`, date navigation, loading state, and favorite/recent outputs; add Embedded MPV rendering through `WebPlayerViewComponent` with full `ResolvedPortalPlayback` metadata where needed.
- Electron typings/preload: keep master’s new EPG/current-program and recent-batch APIs while preserving all Embedded MPV IPC APIs and session update hooks.

## Public Interfaces

- Preserve existing branch additions:
    - `VideoPlayer.EmbeddedMpv = 'embedded-mpv'`
    - `EmbeddedMpvSupport`, `EmbeddedMpvSession`, `EmbeddedMpvBounds`
    - `window.electron` Embedded MPV support/session methods
- Preserve master additions:
    - `CoverSize = 'small' | 'medium' | 'large'`
    - `Settings.coverSize`
    - `getCurrentProgramsBatch`
    - `dbRemoveRecentItemsBatch`

## Test Plan

- Static checks:
    - `rg '<<<<<<<|=======|>>>>>>>'`
    - `git diff --check`
    - `pnpm run typecheck:ci`
- Unit tests:
    - `pnpm run test:unit:all`
- E2E tests:
    - `pnpm nx run web-e2e:e2e-ci`
    - `pnpm nx run electron-backend-e2e:e2e-ci`
- Build/package confidence:
    - `pnpm run build:frontend`
    - `pnpm run build:backend`
    - run local package-layout validation if a package artifact is produced; otherwise rely on the pushed GitHub Actions macOS/Linux/Windows package jobs.
- Docs/wiki:
    - Verify `docs/architecture/embedded-mpv-native.md` still matches the merged packaging/runtime behavior.
    - If repo docs changed and `IPTVNATOR_WIKI_VAULT` is set, run `pnpm wiki:export --mode changed`; otherwise report it as skipped.

## Commit And Push

- Stage only tracked merge-resolution files plus the saved `.plans/...` file; do not stage untracked `tools/wiki/`.
- Commit as `chore: resolve master conflicts for embedded mpv branch`.
- Push normally with `git push origin feat/embedded-mpv-mac-os-experimental`.
- Recheck PR #877 merge state and checks with `gh pr view --json mergeStateStatus,statusCheckRollup`; note that Vercel was already an external failure unrelated to these conflicts.
