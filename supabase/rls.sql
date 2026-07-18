-- osrs-bingo v2 Row Level Security policies — review before running.
-- Run AFTER schema.sql, on a clean database (see reset.sql if you need to
-- wipe and start over — this script assumes none of these policies exist
-- yet, so it does not guard against re-running).
--
-- These read {clan_id, clan_role, is_dev, event_id} out of app_metadata on
-- a real (anonymous) Supabase Auth session — see
-- supabase/functions/login/index.ts for how that gets attached. Until a
-- session has app_metadata set, these all resolve to null/false, which is
-- the safe default (no access).

-- ── Claim helpers ────────────────────────────────────────────────────────────

create or replace function current_clan_id()
returns uuid
language sql stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'clan_id')::uuid
$$;

-- our own claim is "clan_role" (admin/player) — deliberately not "role",
-- which Supabase/PostgREST reserve for the underlying Postgres role
create or replace function current_role_claim()
returns text
language sql stable
as $$
  select auth.jwt() -> 'app_metadata' ->> 'clan_role'
$$;

create or replace function current_is_dev()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_dev')::boolean, false)
$$;

-- event_id is stored directly in app_metadata (set at login), so policies
-- can read it straight from the JWT instead of looking it up via clans —
-- looking it up by querying clans from within a clans policy caused
-- infinite recursion (a policy re-triggers itself), and querying it from
-- other tables' policies was needless overhead anyway.
create or replace function current_event_id()
returns uuid
language sql stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'event_id')::uuid
$$;

-- ign is stamped into app_metadata at login (see functions/login/index.ts) —
-- used to scope tile_signups writes to "the name you logged in as", so a
-- player keeps control of their own sign-ups across logout/login as long as
-- they type the same ign, without needing a real per-player account.
create or replace function current_ign()
returns text
language sql stable
as $$
  select auth.jwt() -> 'app_metadata' ->> 'ign'
$$;

-- True once "now" is at/after the calling admin's own current event's
-- effective start (start_time_utc if set, else created_at as a fallback —
-- same convention as the Analytics points-over-time graph). No
-- current_event_id() at all (e.g. a pure Dev session with no clan_id) ->
-- false, matching this file's "no session data = safe default" pattern.
-- Used to lock item_sets/item_set_members writes to Dev-only once an
-- admin's own event has begun — see item_sets_write below.
create or replace function current_event_started()
returns boolean
language sql stable
as $$
  select coalesce(
    (select now() >= coalesce(e.start_time_utc, e.created_at) from events e where e.id = current_event_id()),
    false
  )
$$;

-- ── Lock down the clans table entirely ──────────────────────────────────────
-- Column-level revokes don't work here: Supabase's "automatically expose new
-- tables" setting grants anon/authenticated table-level SELECT on clans, and
-- in Postgres a table-level grant overrides any narrower column-level
-- revoke. So instead of trying to hide just the password-hash columns, we
-- block direct API access to the table completely and expose only the safe
-- fields through list_clans() below (same pattern as clan_totals()).

revoke all on clans from anon, authenticated;

-- ── events ───────────────────────────────────────────────────────────────────

alter table events enable row level security;

create policy events_select on events for select using (
  current_is_dev() or events.id = current_event_id()
);

create policy events_dev_write on events for all using (current_is_dev()) with check (current_is_dev());

-- ── clans ────────────────────────────────────────────────────────────────────

alter table clans enable row level security;

-- direct table access is fully revoked above (see list_clans() instead) —
-- this policy is a backstop in case table-level access is ever re-granted
-- (e.g. someone flips a Supabase "expose" setting back on) rather than the
-- primary line of defense
create policy clans_select on clans for select using (
  current_is_dev() or event_id = current_event_id()
);

create policy clans_dev_write on clans for all using (current_is_dev()) with check (current_is_dev());

-- ── point_brackets (same access shape as tiles — shared board metadata) ──────

alter table point_brackets enable row level security;

create policy point_brackets_select on point_brackets for select using (
  current_is_dev() or point_brackets.event_id = current_event_id()
);

create policy point_brackets_write on point_brackets for all using (
  current_is_dev() or (current_role_claim() = 'admin' and point_brackets.event_id = current_event_id())
) with check (
  current_is_dev() or (current_role_claim() = 'admin' and point_brackets.event_id = current_event_id())
);

-- ── tiles (board is dev-authored, everyone in the event can read it) ─────────

alter table tiles enable row level security;

create policy tiles_select on tiles for select using (
  current_is_dev() or tiles.event_id = current_event_id()
);

-- Board is shared across all clans in an event, so any Admin in that event
-- (not just Dev) can create/edit/delete its tiles — one Admin's edit affects
-- every clan's view of the board, by design (per ADMIN_SPEC.md).
-- Dropped explicitly (unlike the rest of this file) since this replaces the
-- older Dev-only tiles_dev_write policy on an already-live database — a
-- fresh run via reset.sql wouldn't have it to drop, but this makes the
-- rename safe either way.
drop policy if exists tiles_dev_write on tiles;
create policy tiles_write on tiles for all using (
  current_is_dev() or (current_role_claim() = 'admin' and tiles.event_id = current_event_id())
) with check (
  current_is_dev() or (current_role_claim() = 'admin' and tiles.event_id = current_event_id())
);

-- ── items / item_sets / item_set_members (shared bank, read-only to clans) ──

alter table items enable row level security;
alter table item_sets enable row level security;
alter table item_set_members enable row level security;

create policy items_select on items for select using (current_clan_id() is not null or current_is_dev());

-- items writes are split into 3 policies (not one `for all`, which can't
-- express "yes insert, no update") because caching a wiki-search pick while
-- building a tile should stay open to admins always — regardless of the
-- item_sets lock below — but renaming/deleting a globally-shared item stays
-- Dev-only, since it could silently affect other events' tiles/sets.
-- items_dev_write is dropped explicitly (not just superseded) since a plain
-- `create policy` alongside it would leave the old, wider policy still
-- active — RLS policies are permissive by default (OR'd together), so an
-- unwanted old policy doesn't get overridden by a newer, narrower one.
drop policy if exists items_dev_write on items;
create policy items_insert on items for insert with check (
  current_is_dev() or current_role_claim() = 'admin'
);
create policy items_dev_update on items for update using (current_is_dev()) with check (current_is_dev());
create policy items_dev_delete on items for delete using (current_is_dev());

create policy item_sets_select on item_sets for select using (current_clan_id() is not null or current_is_dev());

-- Admin-writable, but locked to Dev-only once the admin's own event has
-- started (current_event_started()) — Liel wants admins building sets
-- during setup, not touching them once an event is live.
drop policy if exists item_sets_dev_write on item_sets;
create policy item_sets_write on item_sets for all using (
  current_is_dev() or (current_role_claim() = 'admin' and not current_event_started())
) with check (
  current_is_dev() or (current_role_claim() = 'admin' and not current_event_started())
);

create policy item_set_members_select on item_set_members for select using (current_clan_id() is not null or current_is_dev());

-- Same lock as item_sets_write above — adding/removing a set's members is
-- "touching the set" just as much as renaming/deleting it.
drop policy if exists item_set_members_dev_write on item_set_members;
create policy item_set_members_write on item_set_members for all using (
  current_is_dev() or (current_role_claim() = 'admin' and not current_event_started())
) with check (
  current_is_dev() or (current_role_claim() = 'admin' and not current_event_started())
);

-- ── tile_progress — the actual privacy-sensitive table: detail stays within
--    your own clan; other clans' totals come only through clan_totals() below

alter table tile_progress enable row level security;

create policy tile_progress_select on tile_progress for select using (
  current_is_dev() or clan_id = current_clan_id()
);

create policy tile_progress_dev_write on tile_progress for all using (current_is_dev()) with check (current_is_dev());

-- Admins write their own clan's progress. `for all` (not just `for update`)
-- is required: the app writes via upsert (INSERT ... ON CONFLICT DO UPDATE),
-- since a tile_progress row doesn't exist until the first write on a given
-- tile — an update-only policy would let RLS block that very first insert.
-- Dropped explicitly (unlike the rest of this file) since this replaces an
-- already-live update-only version of the same policy, same reasoning as
-- the tiles_write rename above.
drop policy if exists tile_progress_admin_write on tile_progress;
create policy tile_progress_admin_write on tile_progress for all using (
  current_role_claim() = 'admin' and clan_id = current_clan_id()
) with check (
  current_role_claim() = 'admin' and clan_id = current_clan_id()
);

-- ── tile_signups — visible to your own clan only; any logged-in player
--    manages their own row (matched by ign, not role) ─────────────────────────

alter table tile_signups enable row level security;

create policy tile_signups_select on tile_signups for select using (
  current_is_dev() or clan_id = current_clan_id()
);

create policy tile_signups_write on tile_signups for all using (
  current_is_dev() or (clan_id = current_clan_id() and ign = current_ign())
) with check (
  current_is_dev() or (clan_id = current_clan_id() and ign = current_ign())
);

-- ── finish_early_votes ────────────────────────────────────────────────────────

alter table finish_early_votes enable row level security;

create policy finish_early_votes_select on finish_early_votes for select using (
  current_is_dev() or finish_early_votes.event_id = current_event_id()
);

-- one admin per clan casts their clan's vote
create policy finish_early_votes_insert on finish_early_votes for insert with check (
  current_role_claim() = 'admin' and clan_id = current_clan_id()
);

create policy finish_early_votes_dev_write on finish_early_votes for all using (current_is_dev()) with check (current_is_dev());

-- ── safe clan listing (no password hashes) ──────────────────────────────────

create or replace function list_clans(p_event_id uuid)
returns table (clan_id uuid, display_name text, is_shadow boolean, shadow_score int)
language sql
security definer
stable
as $$
  select c.id, c.display_name, c.is_shadow, c.shadow_score
  from clans c
  where c.event_id = p_event_id
    and (current_is_dev() or p_event_id = current_event_id());
$$;

-- ── cross-clan totals, safely, without exposing per-clan tile detail ────────

-- Points now come from the tile's bracket (tiles.points was dropped —
-- points live only on point_brackets, see schema.sql), hence the extra join.
--
-- Had no permission guard until now — same gap as list_clans() was built
-- with a guard for from the start: security definer bypasses RLS entirely,
-- so without this check any caller could pass an arbitrary p_event_id and
-- read cross-clan point totals for an event they have no session tied to.
-- Found while building the Admin Analytics leaderboard (which calls this).
create or replace function clan_totals(p_event_id uuid)
returns table (clan_id uuid, display_name text, total_points bigint)
language sql
security definer
stable
as $$
  select c.id, c.display_name,
    coalesce(sum(case when tp.completed then pb.points else 0 end), 0)
  from clans c
  left join tile_progress tp on tp.clan_id = c.id
  left join tiles t on t.id = tp.tile_id
  left join point_brackets pb on pb.id = t.bracket_id
  where c.event_id = p_event_id
    and (current_is_dev() or p_event_id = current_event_id())
  group by c.id, c.display_name;
$$;
