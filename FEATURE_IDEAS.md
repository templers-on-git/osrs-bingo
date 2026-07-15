# osrs-bingo v2 — feature backlog

Discussion/backlog only — none of this is implemented yet.

## Next up (start here)

1. **Player tile sign-up** — Players can broadcast "I'm working on this tile" to their clan, no gating/proof required (per `ADMIN_SPEC.md`'s Player role). Ephemeral/presence-style, distinct from `tile_progress` (which tracks actual completion, not who's attempting it) — no player names are ever attached to progress/completion per the Privacy section, so sign-up needs its own separate, non-persistent-to-progress mechanism.
2. **Dev cross-clan Admin access** — on the Dev dashboard, for a given event, Dev should see all its clans and be able to act with that clan's Admin permissions (view/edit their board progress etc.) to help troubleshoot when something isn't working for a clan, without needing that clan's actual Admin password. RLS already lets Dev bypass everything (`current_is_dev()` is OR'd into every write policy), so this is a UI gap, not a backend one — needs a way for Dev to pick "act as clan X" and have `login.html`'s screens use that chosen clan instead of deriving `clanId`/`eventId` purely from the Dev's own session `app_metadata` (which has no `clan_id` when acting as pure Dev).

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
