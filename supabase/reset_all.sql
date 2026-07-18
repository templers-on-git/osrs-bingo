-- DEV-ONLY reset: wipes EVERYTHING — events, clans, tiles, brackets,
-- progress, signups, votes, AND the item bank (items/item_sets/
-- item_set_members) — so schema.sql and rls.sql can be run fresh from a
-- truly clean slate. Equivalent to running reset.sql + reset_item_bank.sql
-- together, kept as one file for convenience when you want to wipe
-- absolutely everything in one go.
--
-- Does NOT touch dev_settings (the Dev master password) — that's a
-- standalone singleton, not event/clan/item data, and none of the other
-- reset scripts touch it either. Rotate it manually if you ever need to
-- (see schema.sql's comment on dev_settings for how).
--
-- Only ever run this against the dev project while there's no real data you
-- care about keeping — this is exactly the kind of destructive, all-data-gone
-- action deliberately kept out of the app itself.

drop table if exists tile_progress cascade;
drop table if exists tile_signups cascade;
drop table if exists finish_early_votes cascade;
drop table if exists tiles cascade;
drop table if exists point_brackets cascade;
drop table if exists clans cascade;
drop table if exists events cascade;

drop table if exists item_set_members cascade;
drop table if exists item_sets cascade;
drop table if exists items cascade;

drop function if exists check_clan_password(uuid, text, text);
drop function if exists generate_clan_password();
drop function if exists create_clan(uuid, text);
drop function if exists create_clan(text, text);
drop function if exists assign_clan_to_event(uuid, uuid);
drop function if exists list_dev_clans();
drop function if exists delete_clan(uuid);
drop function if exists update_clan(uuid, text, text);
drop function if exists regenerate_clan_password(uuid, text);
drop function if exists login_with_password(text);
drop function if exists list_clans(uuid);
drop function if exists clan_totals(uuid);
drop function if exists current_clan_id();
drop function if exists current_role_claim();
drop function if exists current_is_dev();
drop function if exists current_event_id();
drop function if exists current_ign();
drop function if exists current_event_started();
