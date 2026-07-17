-- osrs-bingo v2 schema draft — review before running in the Supabase SQL Editor.
-- Matches the entities in ADMIN_SPEC.md. RLS policies are added separately, after this.
--
-- NOTE: create_clan/assign_clan_to_event/list_dev_clans below call
-- current_is_dev(), which is defined in rls.sql, not here. Postgres allows
-- this forward reference at CREATE FUNCTION time (resolved at call time,
-- not creation time), but it means a truly from-scratch setup (e.g. right
-- after reset.sql) must run this file AND rls.sql before any of those three
-- functions are actually called, even though rls.sql "runs after" this file.

create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'finished')),
  start_time_utc timestamptz,
  end_time_utc timestamptz not null,
  created_at timestamptz not null default now()
);

-- `create table if not exists` above won't retroactively add this column to
-- the live project's already-existing events table.
alter table events add column if not exists start_time_utc timestamptz;

-- event_id is nullable: a clan is created on its own (Dev-only) and then
-- assigned to exactly one event afterward via assign_clan_to_event(). It's
-- still only ever in one event at a time, just not atomically with creation.
-- on delete set null (not cascade): deleting an event unassigns its clans
-- rather than deleting them — a clan's identity/passwords survive event
-- deletion, since those were handed out to real people.
create table if not exists clans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  display_name text not null,
  prefix text,
  admin_password_hash text not null,
  player_password_hash text not null,
  is_shadow boolean not null default false, -- true = manually-tracked clan not using the app
  shadow_score int, -- only used when is_shadow = true
  created_at timestamptz not null default now()
);

-- `create table if not exists` above won't retroactively change an
-- already-existing FK's ON DELETE behavior (e.g. the live project's, from
-- before this was set-null instead of cascade) — this does that part,
-- idempotently. clans_event_id_fkey is Postgres's default name for a
-- single-column inline FK on clans.event_id.
alter table clans drop constraint if exists clans_event_id_fkey;
alter table clans add constraint clans_event_id_fkey foreign key (event_id) references events(id) on delete set null;

-- `create table if not exists` above won't retroactively alter an
-- already-existing clans table (e.g. the live project's, from before
-- clans were decoupled from events) — these do that part, idempotently.
alter table clans alter column event_id drop not null;
alter table clans add column if not exists prefix text;

-- one row per clan once their admin presses "Finish Early"; event ends when
-- every clan in the event has a row here
create table if not exists finish_early_votes (
  event_id uuid not null references events(id) on delete cascade,
  clan_id uuid not null references clans(id) on delete cascade,
  pressed_at timestamptz not null default now(),
  primary key (event_id, clan_id)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text
);

create table if not exists item_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists item_set_members (
  item_set_id uuid not null references item_sets(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  primary key (item_set_id, item_id)
);

-- A tile's points live only on its bracket (not on the tile itself) — one
-- shared, admin-defined set of point tiers per event (e.g. "Easy" = 5pts,
-- "Hard" = 20pts), so changing a bracket's point value updates every tile
-- in it at once instead of drifting out of sync per-tile.
create table if not exists point_brackets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  points int not null
);

create table if not exists tiles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  bracket_id uuid not null references point_brackets(id) on delete restrict,
  tile_type text not null check (
    tile_type in ('complete_once', 'complete_x_times', 'collect_one_of_each', 'collect_k_of_y', 'n_sets')
  ),
  -- type-specific config, e.g. {"target": 5} for complete_x_times,
  -- {"item_ids": [...]} for collect_one_of_each / collect_k_of_y, {"k": 2} added for collect_k_of_y,
  -- {"set_ids": [...], "mode": "one_of_each" | "full_set" | "either"} for n_sets
  config jsonb not null default '{}'
);

-- Ephemeral, player-attributed "I'm working on this" signal — deliberately
-- separate from tile_progress (which stays anonymous, no player names, per
-- ADMIN_SPEC.md's Privacy section). Keyed on ign (not the anonymous auth
-- user id) so the same player can sign up/drop across different login
-- sessions, since ign is what's stamped into app_metadata at login and
-- stays stable across logout/login as long as they type the same name.
create table if not exists tile_signups (
  tile_id uuid not null references tiles(id) on delete cascade,
  clan_id uuid not null references clans(id) on delete cascade,
  ign text not null,
  signed_up_at timestamptz not null default now(),
  primary key (tile_id, clan_id, ign)
);

create table if not exists tile_progress (
  tile_id uuid not null references tiles(id) on delete cascade,
  clan_id uuid not null references clans(id) on delete cascade,
  current_count int not null default 0,
  collected_item_ids uuid[] not null default '{}',
  completed boolean not null default false,
  completed_at timestamptz,
  primary key (tile_id, clan_id)
);

-- password check helper, used by the login Edge Function
create or replace function check_clan_password(p_clan_id uuid, p_role text, p_password text)
returns boolean
language sql
security definer
as $$
  select case p_role
    when 'admin' then admin_password_hash = crypt(p_password, admin_password_hash)
    when 'player' then player_password_hash = crypt(p_password, player_password_hash)
    else false
  end
  from clans where id = p_clan_id;
$$;

-- Generates a random, easy-to-type password: 10 characters, uppercase letters
-- and digits only, with ambiguous characters (0/O, 1/I/L) removed.
create or replace function generate_clan_password()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..10 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Old signature from when clans were created atomically with an event
-- assignment — superseded by create_clan(text, text) below, which has no
-- event_id and (unlike this one) actually checks current_is_dev(). Dropped
-- explicitly since `create or replace` can't change a function's parameter
-- list — it would otherwise leave this unguarded version still callable.
drop function if exists create_clan(uuid, text);

-- Creates a clan (not yet assigned to any event — see assign_clan_to_event)
-- with freshly generated admin/player passwords and returns the plaintext
-- values once — this is the only time they're ever visible again. Dev-only:
-- security definer functions bypass RLS entirely, and Supabase grants
-- execute on new functions to anon/authenticated by default, so the check
-- has to happen explicitly in the function body.
create or replace function create_clan(p_display_name text, p_prefix text default null)
returns table (clan_id uuid, admin_password text, player_password text)
language plpgsql
security definer
as $$
declare
  v_admin_password text := generate_clan_password();
  v_player_password text := generate_clan_password();
  v_clan_id uuid;
begin
  if not current_is_dev() then
    raise exception 'dev only';
  end if;

  insert into clans (display_name, prefix, admin_password_hash, player_password_hash)
  values (p_display_name, p_prefix, crypt(v_admin_password, gen_salt('bf')), crypt(v_player_password, gen_salt('bf')))
  returning id into v_clan_id;

  return query select v_clan_id, v_admin_password, v_player_password;
end;
$$;

-- Assigns (or, with p_event_id = null, unassigns) a clan to/from an event.
-- Dev-only, same reasoning as create_clan above.
create or replace function assign_clan_to_event(p_clan_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not current_is_dev() then
    raise exception 'dev only';
  end if;

  update clans set event_id = p_event_id where id = p_clan_id;
end;
$$;

-- Dev-only listing of every clan regardless of event assignment (unlike
-- list_clans below, which is scoped to one event and safe for non-Dev
-- roles). Used by the Dev dashboard to show unassigned clans available to
-- add to an event.
--
-- plpgsql (not sql) deliberately: a `language sql` function body is
-- validated eagerly at CREATE time, so referencing current_is_dev() (only
-- defined later, in rls.sql) would fail on a true from-scratch run right
-- after reset.sql — plpgsql defers name resolution to first call instead,
-- same as create_clan/assign_clan_to_event below.
create or replace function list_dev_clans()
returns table (clan_id uuid, display_name text, prefix text, event_id uuid)
language plpgsql
security definer
stable
as $$
begin
  return query
    select c.id, c.display_name, c.prefix, c.event_id
    from clans c
    where current_is_dev();
end;
$$;

-- Permanently deletes a clan (and its passwords). Dev-only, same reasoning
-- as create_clan above. Events are deleted via a plain table delete instead
-- (see events_dev_write in rls.sql) since events aren't locked out at the
-- grant level the way clans are.
create or replace function delete_clan(p_clan_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not current_is_dev() then
    raise exception 'dev only';
  end if;

  delete from clans where id = p_clan_id;
end;
$$;

-- Renames a clan (display name and/or prefix). Dev-only for now — per
-- ADMIN_SPEC.md, a clan's own Admin is *meant* to be able to rename their
-- own clan too, but that's future Admin-side work; this is the Dev-only
-- version, same reasoning as create_clan above.
create or replace function update_clan(p_clan_id uuid, p_display_name text, p_prefix text)
returns void
language plpgsql
security definer
as $$
begin
  if not current_is_dev() then
    raise exception 'dev only';
  end if;

  update clans set display_name = p_display_name, prefix = p_prefix where id = p_clan_id;
end;
$$;

-- Regenerates a single clan's password for one role, invalidating the old one.
-- Use this for "lost password" instead of ever clearing/resetting tables.
-- Dev-only, same reasoning as create_clan above — this one had NO check at
-- all until now, meaning any anonymous session could silently invalidate
-- and learn any clan's password. Found while wiring this into the Dev
-- dashboard, fixed immediately.
create or replace function regenerate_clan_password(p_clan_id uuid, p_role text)
returns text
language plpgsql
security definer
as $$
declare
  v_password text := generate_clan_password();
begin
  if not current_is_dev() then
    raise exception 'dev only';
  end if;

  if p_role = 'admin' then
    update clans set admin_password_hash = crypt(v_password, gen_salt('bf')) where id = p_clan_id;
  elsif p_role = 'player' then
    update clans set player_password_hash = crypt(v_password, gen_salt('bf')) where id = p_clan_id;
  else
    raise exception 'invalid role: %', p_role;
  end if;

  return v_password;
end;
$$;

-- Login lookup. Admins can get into a clan's event while it's still 'draft'
-- (to build the board, check clan names, etc. before anyone else sees it)
-- or once it's 'published'; Players only once it's 'published'. No longer
-- assumes a single global "the live event" — checks each clan's own
-- event's status directly, so multiple draft events can coexist (e.g. Dev
-- building several at once) without this needing to pick just one. Returns
-- zero rows if nothing matches. Only ever called from the login Edge
-- Function using the service role key — never exposed to anon/authenticated
-- clients directly (revoked below), since it's a brute-forceable password check.
create or replace function login_with_password(p_password text)
returns table (clan_id uuid, event_id uuid, role text)
language plpgsql
security definer
as $$
begin
  return query
    select c.id, c.event_id, 'admin'::text
    from clans c
    join events e on e.id = c.event_id
    where e.status in ('draft', 'published')
      and c.admin_password_hash = crypt(p_password, c.admin_password_hash)
  union all
    select c.id, c.event_id, 'player'::text
    from clans c
    join events e on e.id = c.event_id
    where e.status = 'published'
      and c.player_password_hash = crypt(p_password, c.player_password_hash);
end;
$$;

revoke all on function login_with_password(text) from public, anon, authenticated;

-- Singleton table holding the one Dev master password. There is never more
-- than one row (enforced by the boolean primary key trick: id can only ever
-- be `true`). Set/rotate it manually via the SQL editor:
--   insert into dev_settings (id, master_password_hash) values (true, crypt('choose-a-password', gen_salt('bf')))
--   on conflict (id) do update set master_password_hash = excluded.master_password_hash;
-- Deliberately no app-facing function to set this — same reasoning as the
-- rest of the password model, see regenerate_clan_password.
create table if not exists dev_settings (
  id boolean primary key default true,
  constraint dev_settings_singleton check (id),
  master_password_hash text not null
);

revoke all on dev_settings from anon, authenticated;

-- Only ever called from the dev-elevate Edge Function using the service
-- role key — never exposed to anon/authenticated clients directly, since
-- it's a brute-forceable password check (same reasoning as login_with_password).
create or replace function check_dev_password(p_password text)
returns boolean
language sql
security definer
as $$
  select master_password_hash = crypt(p_password, master_password_hash)
  from dev_settings where id = true;
$$;

revoke all on function check_dev_password(text) from public, anon, authenticated;
