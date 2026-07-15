-- osrs-bingo v2 schema draft — review before running in the Supabase SQL Editor.
-- Matches the entities in ADMIN_SPEC.md. RLS policies are added separately, after this.

create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'finished')),
  end_time_utc timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists clans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  display_name text not null,
  admin_password_hash text not null,
  player_password_hash text not null,
  is_shadow boolean not null default false, -- true = manually-tracked clan not using the app
  shadow_score int, -- only used when is_shadow = true
  created_at timestamptz not null default now()
);

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

create table if not exists tiles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  points int not null,
  tile_type text not null check (
    tile_type in ('complete_once', 'complete_x_times', 'collect_one_of_each', 'collect_k_of_y', 'n_sets')
  ),
  -- type-specific config, e.g. {"target": 5} for complete_x_times,
  -- {"item_ids": [...]} for collect_one_of_each / collect_k_of_y, {"k": 2} added for collect_k_of_y,
  -- {"set_ids": [...], "mode": "one_of_each" | "full_set" | "either"} for n_sets
  config jsonb not null default '{}'
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

-- Creates a clan with freshly generated admin/player passwords and returns the
-- plaintext values once — this is the only time they're ever visible again.
create or replace function create_clan(p_event_id uuid, p_display_name text)
returns table (clan_id uuid, admin_password text, player_password text)
language plpgsql
security definer
as $$
declare
  v_admin_password text := generate_clan_password();
  v_player_password text := generate_clan_password();
  v_clan_id uuid;
begin
  insert into clans (event_id, display_name, admin_password_hash, player_password_hash)
  values (p_event_id, p_display_name, crypt(v_admin_password, gen_salt('bf')), crypt(v_player_password, gen_salt('bf')))
  returning id into v_clan_id;

  return query select v_clan_id, v_admin_password, v_player_password;
end;
$$;

-- Regenerates a single clan's password for one role, invalidating the old one.
-- Use this for "lost password" instead of ever clearing/resetting tables.
create or replace function regenerate_clan_password(p_clan_id uuid, p_role text)
returns text
language plpgsql
security definer
as $$
declare
  v_password text := generate_clan_password();
begin
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

-- Login lookup: only one event is ever "published" (live) at a time, so a
-- password only needs to be checked against that event's clans. Returns zero
-- rows if nothing matches. Only ever called from the login Edge Function
-- using the service role key — never exposed to anon/authenticated clients
-- directly (revoked below), since it's a brute-forceable password check.
create or replace function login_with_password(p_password text)
returns table (clan_id uuid, event_id uuid, role text)
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  select id into v_event_id from events where status = 'published' order by created_at desc limit 1;
  if v_event_id is null then
    return;
  end if;

  return query
    select c.id, c.event_id, 'admin'::text
    from clans c
    where c.event_id = v_event_id and c.admin_password_hash = crypt(p_password, c.admin_password_hash)
  union all
    select c.id, c.event_id, 'player'::text
    from clans c
    where c.event_id = v_event_id and c.player_password_hash = crypt(p_password, c.player_password_hash);
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
