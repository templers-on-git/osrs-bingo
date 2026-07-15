-- DEV-ONLY reset: wipes every osrs-bingo EVENT-scoped table (events, clans,
-- tiles, brackets, progress...) so schema.sql and rls.sql can be run fresh
-- from a clean slate. Only ever run this against the dev project while
-- there's no real event/clan data you care about keeping — this is exactly
-- the kind of destructive, all-data-gone action we deliberately decided NOT
-- to expose inside the app itself.
--
-- Does NOT touch the item bank (items/item_sets/item_set_members) — that's
-- deliberately independent of any event (one shared bank reused across
-- events), so wiping event data shouldn't also nuke a curated item bank.
-- See reset_item_bank.sql for that, kept as a separate script on purpose.

drop table if exists tile_progress cascade;
drop table if exists finish_early_votes cascade;
drop table if exists tiles cascade;
drop table if exists point_brackets cascade;
drop table if exists clans cascade;
drop table if exists events cascade;

drop function if exists check_clan_password(uuid, text, text);
drop function if exists generate_clan_password();
drop function if exists create_clan(uuid, text);
drop function if exists regenerate_clan_password(uuid, text);
drop function if exists login_with_password(text);
drop function if exists current_clan_id();
drop function if exists current_role_claim();
drop function if exists current_is_dev();
drop function if exists current_event_id();
drop function if exists clan_totals(uuid);
