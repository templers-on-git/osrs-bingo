-- DEV-ONLY reset: wipes item SETS only (item_sets/item_set_members) — the
-- groupings tiles reference, e.g. "Barrows armour" or "Fire cape drops".
-- Does NOT touch the items table itself: individual items are cached from
-- OSRS Wiki searches one at a time (see getOrCreateItemFromWiki in
-- admin.js) and are comparatively expensive to rebuild, so this script lets
-- you throw away and rebuild just the *groupings* without losing that cache.
-- If you want to wipe items too, use reset_item_bank.sql instead (or
-- reset_all.sql for everything at once).
--
-- Any tile whose config references a wiped set (n_sets tiles store set ids
-- in tile.config, not a foreign key) will just show 0 items for that set
-- until its config is edited to point at new sets — nothing else breaks.

drop table if exists item_set_members cascade;
drop table if exists item_sets cascade;
