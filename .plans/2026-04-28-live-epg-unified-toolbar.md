# Unified Live EPG Toolbar

## Summary

Merge the current-program strip and date navigator into one shared `app-live-epg-panel` toolbar for M3U, Xtream, and Stalker live playback. The EPG list starts directly below the unified toolbar when the panel is expanded. In collapsed mode, keep the slim current-program strip and show a compact date chip.

## Key Changes

- Update `EpgListComponent` to support controlled date state:
    - Add `[selectedDate]`, `(selectedDateChange)`, and `[showDateNavigator]`.
    - Rename its internal date signal to avoid API collision.
    - Keep existing standalone behavior by default, so non-live or external-player layouts still show the internal date row.
- Add small shared EPG date helpers in `@iptvnator/ui/epg`:
    - Today date key.
    - Parse date key.
    - Shift date key by previous/next day.
- Extend `LiveEpgPanelComponent` with optional date navigation:
    - Inputs: `[showDateNavigator]`, `[selectedDate]`.
    - Output: `(dateNavigation)` emitting `prev | next`.
    - Expanded toolbar: collapse button, current-program label/title/time, previous-day button, date label, next-day button, progress line.
    - Collapsed toolbar: current-program summary plus compact date chip; the chip opens a small menu for previous/next day on narrow or collapsed states.
- Wire the unified toolbar into M3U, Xtream, and Stalker live layouts.
- Update focused unit specs and e2e selectors that currently assume `.selected-date` / `.next-day` live inside `app-epg-list`.
- Update `docs/architecture/iptvnator-ui-guidelines.md` to document that live inline-player layouts use the unified current-program/date toolbar.

## Test Plan

- Run unit tests:
    - `pnpm nx test ui-epg`
    - `pnpm nx test shared-portals`
    - `pnpm nx test portal-xtream-feature`
    - `pnpm nx test portal-stalker-feature`
    - `pnpm nx test web`
- Run build/type validation through Nx:
    - `pnpm nx build web --configuration=development`
- Use the running Electron app via CDP `127.0.0.1:9222` with `agent-browser`:
    - Verify the IPTVnator page target is selected.
    - Confirm the old `app-epg-list #channel-header` date row is absent when wrapped by `app-live-epg-panel`.
    - Confirm the program list starts immediately below the unified toolbar.
    - Click previous/next day in the unified toolbar and verify visible EPG programs change.
    - Collapse the panel and verify the slim strip remains, body is inert, and the date chip stays visible.
    - Capture a screenshot for visual confirmation.
- If docs changed and `IPTVNATOR_WIKI_VAULT` is configured, run `pnpm wiki:export --mode changed`.

## Assumptions

- Keep external MPV/VLC and non-inline layouts on the existing full EPG list behavior.
- Use existing translation keys for current program, loading, no program info, previous day, and next day.
- Leave unrelated dirty worktree changes untouched.
