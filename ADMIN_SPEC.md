# osrs-bingo v2 — admin/backend design spec

Design-stage document — captures decisions made in planning conversations. No v2 code exists yet. See `FEATURE_IDEAS.md` for the higher-level feature backlog this spec fleshes out (item 1, admin side).

## Roles

Cascading permissions, each level includes everything below it:

**Dev ⊇ Admin ⊇ Player**

- **Player** — belongs to exactly one clan. Can freely "sign up" for tiles (broadcast "I'm working on this" to the clan, no gating/proof required in-app). Sees own clan's full analytics... no — sees only points totals for other clans, not their own detailed analytics (see Privacy below).
- **Admin** — belongs to exactly one clan. Everything a Player can do (Admins are still players — they sign up for tiles too), plus: can create/edit/delete tiles on their event's board (the board is shared across all clans in that event, so one Admin's edit is visible to every clan — not a per-clan board), an Admin view for updating tile progress/completion for their own clan, an Analytics page (own clan's full detail, other clans' totals only), and can rename their own clan's display name.
- **Dev** — not scoped to any clan. Builds and publishes boards/events, adds clans to an event as it progresses, can see and act on every clan's data, sees full analytics across all clans, and holds the only reference to real clan IDs (see Clan below). The Dev is also a normal clan's Admin/Player day-to-day — Dev status is an *elevation* layered on top of a normal per-clan login, not a replacement for it (see Auth below).

Proof-of-completion (screenshots etc.) happens entirely outside the app, on Discord — the app never stores or reviews proof images.

## Entities

- **Event** — id, name, board (the published template), UTC end-timestamp, status (draft/published/finished), list of participating clans. Created by Dev only. The app is meant to be reused for future events, so an event owns its own board/tiles/points/clans independently of any other event.
- **Clan** — id (real ID, hidden from Admin/Player, visible only to Dev), displayName (editable by that clan's own Admin), adminPassword, playerPassword. Belongs to one Event. Dev can add clans to an event mid-event.
- **Clan-without-app / "shadow" clan** — for competing clans that don't use the app. Dev manually enters a name + score as plain inputs, shown in analytics/leaderboards alongside real clans. (Future: a hook to hydrate this automatically, e.g. from a spreadsheet, like v1 did — not built now.)
- **BingoBoard** — the tile template, attached to an Event, shared across all participating clans. Built/edited by Dev or by any Admin in that event (see Roles above) — the board isn't Dev-exclusive, only clan-progress is scoped per clan.
- **Tile** (base) — id, name, points, type. Defines the *rule*. Five types:
  1. **Complete Once** — single completion flag.
  2. **Complete X Times** — counter toward a target X.
  3. **Collect One of Each (Y items)** — a set of Y items; complete when all Y have been individually collected. Track *which* items, not just a count.
  4. **Collect K of Y items** (K ≤ Y) — same item-tracking as #3, but complete once any K distinct items are collected. K = Y is equivalent to #3.
  5. **N Sets** — multiple item-sets; admin picks one or both completion modes: "one of each set" and/or "one full set complete." If both are enabled, whichever condition is met first completes the tile.
  - Types 3–5 reference items/item-sets — done, 2026-07-17. No pre-populated bank: admins (and Dev) search the OSRS Wiki's own structured API live and pick items, which get cached locally (stable id, equipment slot, image) the first time they're used in a tile or set. See "Item bank" under Known gaps below for the admin-write/lock model.
- **TileProgress** — per-clan, per-event state for a tile (which items collected, current count, completed flag). The Tile defines the rule once; TileProgress is what actually varies per clan, since one published board is shared but every clan's progress is independent.

## Auth / sessions

No individual accounts — a **shared password per role per clan** (adminPassword / playerPassword). Flow:

1. User enters their in-game name + the password they were given.
2. Backend checks the password against the clan's stored admin/player password; on success mints a signed session token (`{ign, role, clanId, eventId}` + expiry).
3. Token stored in a cookie. Returning visits **resume silently** — no re-entering credentials — with a small "Logged in as `IGN` · Log out" indicator always visible.
4. **Logout** clears the cookie and returns to the login screen.
5. **Dev master password** elevates the *current* session (adds `isDev: true`) rather than replacing it — Dev logs in as their own clan's Admin/Player normally, then separately unlocks Dev-only views via a master password, so both identities are usable in the same session.

## Event lifecycle / ending

Three independent ways an event ends:

1. **Timer** — a UTC end-timestamp set at event creation. All clans see a live countdown; ends automatically at that instant. Using UTC avoids timezone confusion across clans.
2. **Admin consensus early-finish** — a "Finish Early" button (behind a confirm-with-warning step, and toggleable/reversible before the event actually ends) that one Admin *per participating clan* must press. Once one Admin from every clan has pressed it, the event ends early.
3. **Dev override** — Dev can end the event early unilaterally, no consensus needed.

## Privacy / analytics

- No player names are ever attached to tile progress or completion — only that a tile progressed/completed.
- **Player**: sees own clan's points and other clans' points (totals only).
- **Admin**: Analytics page with full detail for their own clan (completion graphs, tile sign-ups, etc. — exact contents TBD) but only point totals for other clans.
- **Dev**: full analytics detail across all clans.
- Analytics must be **exportable** (for sharing / event finale use).

## Backend

**Supabase** (Postgres + Row Level Security), chosen over Firebase/custom-server because:
- The entity model is relational (Event → Clans → Board → Tiles → TileProgress → Items/ItemSets) — fits Postgres more naturally than a document store.
- The privacy rules ("own clan full detail, others' totals only, Dev sees all") map directly onto Postgres Row Level Security policies — real, transferable backend experience.
- Free tier is generous enough for this project's scale.
- Business rules (tile-completion logic, event-end consensus, permission checks) live in plain testable functions in front of the database — keeps TDD practice close to ordinary JS rather than starting testing practice on SQL/RLS policies.
- The custom password-per-role-per-clan login (see Auth) will be a small Supabase Edge Function rather than Supabase's built-in email/password auth, since the built-in flow assumes individual accounts.

Status (as of 2026-07-16): Supabase project set up, schema + RLS live, Dev master-password login and Dev dashboard built (create clan, create event, assign/unassign clan to event, item bank). Full board editor and a working Progress tab exist in `login.html`/`login.js`. See `supabase/` for the SQL/Edge Functions, `dev.html`/`dev.js` for the Dev dashboard, `login.html`/`login.js` for the Player/Admin app.

**No migration tool** — `schema.sql`/`rls.sql` (and the `reset*.sql` scripts) are meant to be re-run by hand in the Supabase SQL Editor after any change to them; nothing does this automatically. Real incident 2026-07-18: a feature appeared broken in Liel's manual testing despite passing live-verification scripts, because the live database was actually out of sync with the checked-in SQL — a change had been made to the files but never re-run against the project. **Checklist: after editing `schema.sql` or `rls.sql`, re-run both against the live project before considering the change done**, the same way a new/changed Edge Function needs an explicit `supabase functions deploy`. Proper migrations (the Supabase CLI already supports this, and the project already has it linked for Edge Function deploys — see `osrs-bingo-supabase-project` memory) were considered as a more durable fix and are logged as a low-priority possible feature in `FEATURE_IDEAS.md` instead of adopted now, since it would mean converting the current freely-editable `schema.sql`/`rls.sql` into an immutable migration timeline mid-project.

## Known gaps / not built yet

- **Editing a clan's name/prefix** — Dev-side is done (`update_clan()` + a Rename button on the Dev dashboard). Per the Auth section above, the clan's own Admin is *also* meant to be able to rename their own clan — that Admin-side version still isn't built, pending Admin-specific pages beyond the current shared board/Progress tabs.
- **Board building (tiles UI)** — done. Admins and Dev can create/edit/delete tiles of all 5 types, grouped under admin-defined point brackets, via the Edit tab in `login.html`.
- **Player/Admin board/tile view** — done. View tab shows the full board (grouped by bracket, progress bars); Progress tab (Admin-only) lets an Admin actually update progress per tile type (toggle for Complete Once, +1/-1 for Complete X Times, an item/set viewer modal with click-to-collect for the 3 item-based types).
- **Item bank** — done, 2026-07-17, reworked from the original Dev-only manual-entry version. Items are no longer hand-curated: any admin (or Dev) searches the OSRS Wiki live (via its own structured `action=bucket` API — always current, no scraper/bulk-import needed) and picks a result, which caches locally with a stable id, image, and equipment slot the first time it's used. Item sets are now admin-creatable too (`dev.html` for Dev, plus a new Item Sets section in `login.html`'s Edit tab for admins) — but locked to Dev-only once the admin's own event has started (`current_event_started()` in `rls.sql`), so a live event's sets can't be edited out from under it. Not yet built: the slot-based visual "equipment doll" set builder (still flat search, see `FEATURE_IDEAS.md`).
- **Player tile "sign-up" broadcasting** ("I'm working on this," no gating) — still not built. Distinct from progress/completion tracking, which is done.
- Event lifecycle beyond draft/published — Dev can toggle Publish/Unpublish, but "finished" (via timer, admin consensus, or Dev override, per the Event lifecycle section above) isn't built at all.
- **Analytics pages** (own-clan full detail, other-clans totals-only, exportable) — not built. `clan_totals()` (a safe cross-clan points-total RPC) exists in the backend but has no UI consuming it yet.
- Admin's own-clan rename (see first bullet), and the "shadow clan" (manually-tracked non-app clan) entity — neither built yet.
