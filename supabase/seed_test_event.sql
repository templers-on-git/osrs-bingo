-- One-off: creates a published test event with one test clan, and returns
-- that clan's freshly generated admin/player passwords. Run in the SQL
-- Editor, then copy the two passwords out of the result — they're only
-- ever shown this once.

with new_event as (
  insert into events (name, status, end_time_utc)
  values ('Test Event', 'published', now() + interval '7 days')
  returning id
)
select * from create_clan((select id from new_event), 'Test Clan');
