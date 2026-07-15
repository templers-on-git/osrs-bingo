-- DEV-ONLY reset: wipes the item bank (items/item_sets/item_set_members)
-- only. Kept separate from reset.sql on purpose — the item bank is shared
-- across every event (no event_id on any of these tables), so it shouldn't
-- be wiped just because you're resetting one event's data. Run this only
-- when you actually want to throw away the curated item bank itself.

drop table if exists item_set_members cascade;
drop table if exists item_sets cascade;
drop table if exists items cascade;
