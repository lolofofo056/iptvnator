# Live EPG Panel Collapse

## Summary

Add a shared, persisted live-TV EPG collapse state across M3U, Xtream, and Stalker. Default remains expanded. When an internal player is active, the EPG can collapse to a slim bottom line showing the current program and an expand button; the player grows to use the freed space. External MPV/VLC playback keeps the existing full EPG-only layout.

## Key Changes

- Add shared state helpers in `@iptvnator/portal/shared/util`:
    - storage key: `live-epg-panel-state`
    - states: `expanded | collapsed`
    - restore invalid/missing values to `expanded`
- Add a shared `LiveEpgPanelComponent` in `shared-portals`:
    - inputs: `collapsed`, `summary`, `loading`
    - output: `collapsedChange`
    - keeps projected EPG content mounted while collapsed, but visually hides and inerts it so existing EPG effects still update current-program state.
- Update the shared live layout SCSS mixin so `.epg.epg-collapsed` has a fixed slim height and `.video-player` fills the remaining space.
- Wire the wrapper into:
    - M3U `VideoPlayerComponent`
    - Xtream `LiveStreamLayoutComponent`
    - Stalker `StalkerLiveStreamLayoutComponent`
    - legacy shared `LiveStreamLayoutComponent`, including ArtPlayer as an internal player.
- Add i18n keys for collapse/expand/current-program labels to all locale JSON files, using English fallback where no translation is available.

## Behavior Rules

- Collapse is available only when an internal player is shown: Video.js, HTML5, or ArtPlayer.
- Radio playback still hides EPG entirely.
- External MPV/VLC playback does not render the collapse strip and keeps the full EPG panel.
- The slim line shows current program title, start/end time, and progress when available; otherwise it shows the existing no-program/EPG-unavailable message.
- The shared persisted state applies across all three live-TV modules.

## Tests

- Add unit coverage for restore/persist state validation.
- Add shared `LiveEpgPanelComponent` tests for summary rendering, toggle output, hidden-but-mounted body, and fallback text.
- Extend M3U, Xtream, and Stalker component specs for:
    - collapsed state from `localStorage`
    - toggle persistence
    - collapse only for internal players
    - external player keeps full EPG
    - current-program summary renders from each module's data source.
- Run:
    - `pnpm nx test shared-portals`
    - `pnpm nx test ui-epg`
    - `pnpm nx test portal-xtream-feature`
    - `pnpm nx test portal-stalker-feature`
    - `pnpm nx lint playlist-m3u-feature-player`
    - `pnpm nx build web`
- Verify in the running Electron app through CDP/agent-browser and Computer Use:
    - M3U, Xtream, Stalker live pages
    - Video.js, HTML5, ArtPlayer sizing
    - collapsed state survives reload/navigation
    - light and dark themes do not overlap or clip text.

## Docs And Plan Artifact

- Update `docs/architecture/iptvnator-ui-guidelines.md` with the collapsible live EPG pattern.
- Update module docs where they describe active live EPG behavior, especially M3U and Stalker EPG docs.
- If `IPTVNATOR_WIKI_VAULT` is configured after docs change, run `pnpm wiki:export --mode changed`.
