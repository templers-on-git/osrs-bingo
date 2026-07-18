export async function createEvent(supabase, { name, endTimeUtc }) {
  const { data, error } = await supabase
    .from("events")
    .insert({ name, end_time_utc: endTimeUtc })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listEvents(supabase) {
  const { data, error } = await supabase.from("events").select();
  if (error) throw error;
  return data;
}

export async function getEvent(supabase, eventId) {
  const { data, error } = await supabase.from("events").select().eq("id", eventId).single();
  if (error) throw error;
  return data;
}

// Wraps the safe list_clans() RPC (no password hashes) — usable by any
// logged-in Admin/Player in that event, not just Dev, unlike listClans below.
export async function listEventClans(supabase, eventId) {
  const { data, error } = await supabase.rpc("list_clans", { p_event_id: eventId });
  if (error) throw error;
  return data.map((c) => ({
    clanId: c.clan_id,
    displayName: c.display_name,
    isShadow: c.is_shadow,
    shadowScore: c.shadow_score,
  }));
}

export async function deleteEvent(supabase, eventId) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

export async function setEventStatus(supabase, eventId, status) {
  const { error } = await supabase.from("events").update({ status }).eq("id", eventId);
  if (error) throw error;
}

export async function updateEventEndTime(supabase, eventId, endTimeUtc) {
  const { error } = await supabase.from("events").update({ end_time_utc: endTimeUtc }).eq("id", eventId);
  if (error) throw error;
}

export async function updateEventStartTime(supabase, eventId, startTimeUtc) {
  const { error } = await supabase.from("events").update({ start_time_utc: startTimeUtc }).eq("id", eventId);
  if (error) throw error;
}

// Wraps the now-guarded clan_totals() RPC (see rls.sql) — ranks clans by
// points descending so the UI doesn't have to re-sort.
export async function getClanLeaderboard(supabase, eventId) {
  const { data, error } = await supabase.rpc("clan_totals", { p_event_id: eventId });
  if (error) throw error;
  return data
    .map((c) => ({ clanId: c.clan_id, displayName: c.display_name, totalPoints: c.total_points }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export async function createClan(supabase, { displayName, prefix }) {
  const { data, error } = await supabase
    .rpc("create_clan", { p_display_name: displayName, p_prefix: prefix })
    .single();

  if (error) throw error;
  return {
    clanId: data.clan_id,
    adminPassword: data.admin_password,
    playerPassword: data.player_password,
  };
}

export async function assignClanToEvent(supabase, clanId, eventId) {
  const { error } = await supabase.rpc("assign_clan_to_event", { p_clan_id: clanId, p_event_id: eventId });
  if (error) throw error;
}

export async function listClans(supabase) {
  const { data, error } = await supabase.rpc("list_dev_clans");
  if (error) throw error;
  return data.map((c) => ({
    clanId: c.clan_id,
    displayName: c.display_name,
    prefix: c.prefix,
    eventId: c.event_id,
  }));
}

export async function deleteClan(supabase, clanId) {
  const { error } = await supabase.rpc("delete_clan", { p_clan_id: clanId });
  if (error) throw error;
}

export async function updateClan(supabase, clanId, { displayName, prefix }) {
  const { error } = await supabase.rpc("update_clan", {
    p_clan_id: clanId,
    p_display_name: displayName,
    p_prefix: prefix,
  });
  if (error) throw error;
}

export async function regenerateClanPassword(supabase, clanId, role) {
  const { data, error } = await supabase.rpc("regenerate_clan_password", { p_clan_id: clanId, p_role: role });
  if (error) throw error;
  return data;
}

export async function createBracket(supabase, eventId, { label, points }) {
  const { data, error } = await supabase
    .from("point_brackets")
    .insert({ event_id: eventId, label, points })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listBrackets(supabase, eventId) {
  const { data, error } = await supabase.from("point_brackets").select().eq("event_id", eventId);
  if (error) throw error;
  return data;
}

export async function updateBracket(supabase, bracketId, { label, points }) {
  const { error } = await supabase.from("point_brackets").update({ label, points }).eq("id", bracketId);
  if (error) throw error;
}

export async function deleteBracket(supabase, bracketId) {
  const { error } = await supabase.from("point_brackets").delete().eq("id", bracketId);
  if (error) throw error;
}

export async function createTile(supabase, eventId, { name, bracketId, tileType, config }) {
  const { data, error } = await supabase
    .from("tiles")
    .insert({ event_id: eventId, name, bracket_id: bracketId, tile_type: tileType, config })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Embeds each tile's bracket (point value + label) in one query rather than
// a separate lookup — points now live only on the bracket, not the tile.
export async function listTiles(supabase, eventId) {
  const { data, error } = await supabase.from("tiles").select("*, point_brackets(*)").eq("event_id", eventId);
  if (error) throw error;
  return data;
}

export async function updateTile(supabase, tileId, { name, bracketId, tileType, config }) {
  const { error } = await supabase
    .from("tiles")
    .update({ name, bracket_id: bracketId, tile_type: tileType, config })
    .eq("id", tileId);

  if (error) throw error;
}

export async function deleteTile(supabase, tileId) {
  const { error } = await supabase.from("tiles").delete().eq("id", tileId);
  if (error) throw error;
}

export async function createItem(supabase, { name, photoUrl }) {
  const { data, error } = await supabase.from("items").insert({ name, photo_url: photoUrl }).select().single();
  if (error) throw error;
  return data;
}

export async function listItems(supabase) {
  const { data, error } = await supabase.from("items").select();
  if (error) throw error;
  return data;
}

export async function updateItem(supabase, itemId, { name, photoUrl }) {
  const { error } = await supabase.from("items").update({ name, photo_url: photoUrl }).eq("id", itemId);
  if (error) throw error;
}

export async function deleteItem(supabase, itemId) {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function createItemSet(supabase, { name }) {
  const { data, error } = await supabase.from("item_sets").insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function listItemSets(supabase) {
  const { data, error } = await supabase.from("item_sets").select();
  if (error) throw error;
  return data;
}

export async function updateItemSet(supabase, itemSetId, { name }) {
  const { error } = await supabase.from("item_sets").update({ name }).eq("id", itemSetId);
  if (error) throw error;
}

export async function deleteItemSet(supabase, itemSetId) {
  const { error } = await supabase.from("item_sets").delete().eq("id", itemSetId);
  if (error) throw error;
}

export async function addItemToSet(supabase, itemSetId, itemId) {
  const { error } = await supabase.from("item_set_members").insert({ item_set_id: itemSetId, item_id: itemId });
  if (error) throw error;
}

export async function removeItemFromSet(supabase, itemSetId, itemId) {
  const { error } = await supabase
    .from("item_set_members")
    .delete()
    .eq("item_set_id", itemSetId)
    .eq("item_id", itemId);

  if (error) throw error;
}

export async function listItemsInSet(supabase, itemSetId) {
  const { data, error } = await supabase.from("item_set_members").select("items(*)").eq("item_set_id", itemSetId);
  if (error) throw error;
  return data.map((row) => row.items);
}

export async function listItemsByIds(supabase, itemIds) {
  if (itemIds.length === 0) return [];
  const { data, error } = await supabase.from("items").select().in("id", itemIds);
  if (error) throw error;
  return data;
}

export async function searchLocalItems(supabase, query) {
  const { data, error } = await supabase.from("items").select().ilike("name", `%${query}%`).limit(20);
  if (error) throw error;
  return data;
}

// Resolves a wiki search pick to a stable local items.id, caching it on
// first use (keyed on wiki_page_name — see items_wiki_page_name_key in
// schema.sql). Needs no admin UPDATE privilege on items (see items_insert
// in rls.sql): find-by-wiki_page_name -> insert if missing -> on a unique
// violation (23505, two admins caching the same item at once), re-select
// and return whichever insert actually won.
export async function getOrCreateItemFromWiki(supabase, { name, photoUrl, equipmentSlot, wikiPageName }) {
  const { data: existing, error: findError } = await supabase
    .from("items")
    .select()
    .eq("wiki_page_name", wikiPageName)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from("items")
    .insert({ name, photo_url: photoUrl, equipment_slot: equipmentSlot, wiki_page_name: wikiPageName })
    .select()
    .single();
  if (!insertError) return inserted;
  if (insertError.code !== "23505") throw insertError;

  const { data: winner, error: raceError } = await supabase
    .from("items")
    .select()
    .eq("wiki_page_name", wikiPageName)
    .maybeSingle();
  if (raceError) throw raceError;
  return winner;
}

export async function elevateToDev(supabase, password) {
  const { error } = await supabase.functions.invoke("dev-elevate", { body: { password } });
  if (error) throw error;

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
}
