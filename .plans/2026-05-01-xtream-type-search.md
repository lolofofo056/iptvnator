# Fix Xtream Type-Level VOD/Series Search

## Summary

- Root cause: `withSelection()` receives the `q` query through the Xtream catalog facade, but `filteredAndSortedContent` returns `sortedContent()` immediately when `selectedCategoryId` is null, so `categorySearchTerm` is ignored on all-items VOD/series routes.
- Fix the store selector so VOD and series search terms filter the current type even when no category is selected.
- No public API, route, schema, or Electron IPC contract changes are needed.

## Key Changes

- Update `libs/portal/xtream/data-access/src/lib/stores/features/with-selection.feature.ts` so:
  - `vod` and `series` apply `filterBySearchTerm` whether `selectedCategoryId` is null or set.
  - Existing selected-category behavior, sorting, pagination reset, and `live` behavior stay unchanged.
  - Empty search terms still return the full sorted current type.
- Update `libs/portal/xtream/data-access/src/lib/stores/features/with-selection.feature.spec.ts` with regression coverage for:
  - VOD all-items search with `selectedCategoryId === null`.
  - Series all-items search with `selectedCategoryId === null`, ideally across multiple categories.
  - Existing category-scoped search remains covered and unchanged.

## Test Plan

- Run `pnpm nx test portal-xtream-data-access`.
- Run `pnpm nx test portal-xtream-feature` to confirm the shared catalog route/facade integration still passes.
- Run `pnpm nx build web` as the Angular/Nx build validation.
- Manual Electron check:
  - Start `pnpm run serve:backend`.
  - Load agent-browser guidance with `agent-browser skills get core` and `agent-browser skills get electron`.
  - Attach using `agent-browser --cdp 9222 snapshot -i`.
  - Verify an Xtream playlist can search from `/vod?q=...` and `/series?q=...` with no category selected, and still search inside a selected category.

## Assumptions

- Scope is limited to Xtream VOD/series catalog search, not the separate global search page.
- Documentation updates are not expected because this is a regression fix for existing behavior; reassess after implementation.
- Finalized plan file target: `.plans/2026-05-01-xtream-type-search.md`.
