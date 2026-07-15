# osrs-bingo v2 — feature backlog

Discussion/backlog only — none of this is implemented yet.

## Confirmed direction

1. **Admin / player split** — two distinct views instead of one undifferentiated page. Full design now in `ADMIN_SPEC.md` (roles, entities, tile types, auth/sessions, event lifecycle, privacy, backend choice).
2. **Tile history** — a log of completed tiles with who finished what and when.
3. **Dark/light theme** toggle.
4. **Mobile-friendly** layout (current app is desktop-oriented).
5. **Results/summary tools** — exportable end-of-event summary, plus graphs/charts for a visual recap.

## Deferred / uncertain (item bank & set builder)

The item bank and item-set management UI (Dev dashboard) shipped 2026-07-16 as a basic proof of concept — plain list of items (name + photo) and sets (name + members), enough to prove the collect-item tile types can work end to end. The following are explicitly **not built yet**, deferred until the basic version is tried with the clan and proves worth investing further in:

- **Equipment-slot-aware items**: give each item an equipment slot (head/cape/neck/weapon/shield/body/legs/hands/feet/ring/ammo, same slots as the in-game equipment interface), so an item can declare where it's worn.
- **Slot-based set builder UI**: build item sets against a visual layout modeled on the in-game equipment interface (an "equipment doll") instead of a flat item list/dropdown. Liel provided the reference layout (2026-07-16) — standard OSRS worn-equipment screen: Head (top-center); Cape / Neck / Ammo (next row, left/center/right); Weapon / Body / Shield (next row, left/center/right); Legs (center); Hands / Feet / Ring (bottom row, left/center/right). 11 slots total.
- **Wiki scraper / bulk import**: investigate the OSRS Wiki's own structured data (API, or existing community datasets like osrsbox-db-style JSON dumps that already include equipment slot metadata) before writing a custom HTML scraper — likely cleaner and less fragile than scraping Wiki pages directly. Scope to a curated subset of items relevant to actual bingo tiles (boss drops, clue rewards, etc.), not the entire in-game item database.

## Deferred / uncertain

**Multi-clan support** — each clan runs its own bingo instance (clan-vs-clan competition):
- Per-clan passwords so members "log into" their clan's version
- Separate admin/player sides per clan
- A way to switch between clan instances
- A "super-admin / god" role above individual clan admins

Not committed to yet — unsure about scale and maintenance cost. Keep in mind as a possible future direction when shaping v2 architecture (avoid decisions that would make this hard to add later), but don't build any of it until it's explicitly greenlit.
