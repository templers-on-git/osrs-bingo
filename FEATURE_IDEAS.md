# osrs-bingo v2 — feature backlog

Discussion/backlog only — none of this is implemented yet. See `BUGS_AND_CHANGES.md` for bug reports and small UI/behavior tweaks instead.

## Next up (start here)

1. ~~Search when adding items to a set~~ — deferred (not skipped): `dev.js`'s "Add to set" control (Item Sets section) is still a plain flat `<select>` with no search, same gap the tile-creation picker in `login.html` already fixed (checkboxes + live search). Holding off because item-bank access/creation is likely to change shape once the equipment-slot-aware item bank and set-builder UI (see below) land — don't want to build search UI against the current flat-list access pattern twice.
2. **Player tile sign-up** — ✅ done. Players broadcast "I'm working on this tile" to their clan via `tile_signups` (`tileSignups.js`), separate from `tile_progress` per `ADMIN_SPEC.md`'s Privacy section. Keyed on `ign` (not the anonymous auth session id) so a player keeps control of their sign-ups across logout/login.
3. **Hide/show completed tiles** — ✅ done. Independent "Hide completed tiles" checkbox on both View and Progress tabs (`login.js`'s `visibleTiles()`), since hiding on the board doesn't necessarily mean an admin wants them hidden while marking progress too.
4. **Clan progress summary at top of board** — total points collected so far, tiles done out of total tiles available, and an overall progress indicator that's point-based (not just tile-count-based, since tiles carry different point values via brackets).
5. **Dev cross-clan Admin access** — on the Dev dashboard, for a given event, Dev should see all its clans and be able to act with that clan's Admin permissions (view/edit their board progress etc.) to help troubleshoot when something isn't working for a clan, without needing that clan's actual Admin password. RLS already lets Dev bypass everything (`current_is_dev()` is OR'd into every write policy), so this is a UI gap, not a backend one — needs a way for Dev to pick "act as clan X" and have `login.html`'s screens use that chosen clan instead of deriving `clanId`/`eventId` purely from the Dev's own session `app_metadata` (which has no `clan_id` when acting as pure Dev).

## Confirmed direction

1. **Admin / player split** — ✅ done. Full design in `ADMIN_SPEC.md`; View/Edit/Progress tabs live in `login.html`.
2. **Tile history** — a log of completed tiles with who finished what and when. Not built.
3. **Dark/light theme** toggle. Not built.
4. **Mobile-friendly** layout (current app is desktop-oriented). Not built.
5. **Results/summary tools** — exportable end-of-event summary, plus graphs/charts for a visual recap. Not built (`clan_totals()` RPC exists backend-side, no UI yet — see `ADMIN_SPEC.md` known gaps).

## Deferred / uncertain (item bank & set builder)

The item bank and item-set management UI (Dev dashboard) shipped 2026-07-16 as a basic proof of concept — plain list of items (name + photo) and sets (name + members), enough to prove the collect-item tile types can work end to end. The following are explicitly **not built yet**, deferred until the basic version is tried with the clan and proves worth investing further in:

- **Equipment-slot-aware items**: give each item an equipment slot (head/cape/neck/weapon/shield/body/legs/hands/feet/ring/ammo, same slots as the in-game equipment interface), so an item can declare where it's worn.
- **Slot-based set builder UI**: build item sets against a visual layout modeled on the in-game equipment interface (an "equipment doll") instead of a flat item list/dropdown. Liel provided the reference layout (2026-07-16) — standard OSRS worn-equipment screen: Head (top-center); Cape / Neck / Ammo (next row, left/center/right); Weapon / Body / Shield (next row, left/center/right); Legs (center); Hands / Feet / Ring (bottom row, left/center/right). 11 slots total.
- **Wiki scraper / bulk import**: investigate the OSRS Wiki's own structured data (API, or existing community datasets like osrsbox-db-style JSON dumps that already include equipment slot metadata) before writing a custom HTML scraper — likely cleaner and less fragile than scraping Wiki pages directly. Scope to a curated subset of items relevant to actual bingo tiles (boss drops, clue rewards, etc.), not the entire in-game item database.

## Done — multi-clan support

Multi-clan (clan-vs-clan competition within one event) is no longer deferred — it's built and is the actual v2 architecture, not a bolt-on: per-clan admin/player passwords, one shared board per event with independent per-clan progress, and a Dev role above individual clan Admins. See `ADMIN_SPEC.md` for the full design and current status.
