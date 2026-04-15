# EPG Investigation Issues

These are credible EPG problems identified during investigation, but they do not yet explain the current single-source hashed-`tvg-id` mismatch issue.

## 1. Redirected gzipped EPG URLs

- Problem: EPG fetch followed HTTP redirects, but gzip detection originally depended on the entered URL rather than the final response.
- Impact: Redirects from a plain URL to a `.gz` payload could fetch successfully but fail during parsing.
- Status: Fixed.

## 2. Inconsistent M3U EPG lookup fallback order

- Problem: Different M3U code paths used different lookup keys when resolving EPG, such as `tvg-id || name` in one place and `tvg-id || tvg-name || name` in another.
- Impact: Some channels could resolve EPG in one surface but not another.
- Status: Patched, but not believed to be the root cause of the current issue.

## 3. Case-sensitive `tvg-id` mismatch risk

- Problem: XMLTV channel ids and M3U `tvg-id` values may differ only by case.
- Impact: Exact id lookup can miss valid EPG rows unless the backend also tries a case-insensitive channel-id match.
- Status: Patched, but not believed to be the root cause of the current issue.

## 4. Multi-source EPG channel row overwrite / deletion risk

- Problem: `epg_channels.id` is globally unique while each row stores only one `source_url`. Importing another source with the same channel id can overwrite ownership, and clearing one source can cascade-delete shared programs.
- Impact: With multiple EPG URLs configured, channels may appear to lose EPG unpredictably over time.
- Status: Identified, not patched in this investigation, and not applicable to the current single-source report.

## 5. Programme-before-channel parse ordering risk

- Problem: The worker only inserts programmes for channel ids already seen in the current parse.
- Impact: If an XMLTV feed emits `<programme>` entries before the matching `<channel>`, those programmes are skipped.
- Status: Identified, not patched, and still a possible storage-path issue even with a single EPG source.
