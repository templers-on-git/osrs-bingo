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
  - Types 3–5 need an **item database** (name + photo) to reference — a future "bank" to bootstrap from scraped data (source TBD), so tiles can point at bank items/sets instead of fully custom ones.
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

Status (as of 2026-07-15): Supabase project set up, schema + RLS live, Dev master-password login and a Dev dashboard built (create clan, create event, assign/unassign clan to event). See `supabase/` for the SQL/Edge Functions and `dev.html`/`dev.js` for the dashboard.

## Known gaps / not built yet

- **Editing a clan's name/prefix** — Dev-side is done (`update_clan()` + a Rename button on the Dev dashboard, 2026-07-15). Per the Auth section above, the clan's own Admin is *also* meant to be able to rename their own clan — that Admin-side version still isn't built, pending the Admin pages themselves.
- Board building (tiles UI) — not started at all.
- Player/Admin **board/tile view** — `login.html`/`login.js` exist and work (log in, session persists, shows ign + role), but only as a placeholder screen. No board, no tile progress, nothing beyond confirming you're logged in.
- Event lifecycle beyond draft/published — Dev can now toggle Publish/Unpublish, but "finished" (via timer, admin consensus, or Dev override, per the Event lifecycle section above) isn't built at all.
