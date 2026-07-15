-- DEV-ONLY reset: wipes every osrs-bingo table (and everything that depends
-- on them — policies, etc., via cascade) so schema.sql and rls.sql can be
-- run fresh from a clean slate. Only ever run this against the dev project
-- while there's no real event/clan data you care about keeping — this is
-- exactly the kind of destructive, all-data-gone action we deliberately
-- decided NOT to expose inside the app itself.

drop table if exists tile_progress cascade;
drop table if exists finish_early_votes cascade;
drop table if exists item_set_members cascade;
drop table if exists item_sets cascade;
drop table if exists items cascade;
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
