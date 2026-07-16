function rowToProgress(tileId, clanId, row) {
  if (!row) {
    return { tileId, clanId, currentCount: 0, collectedItemIds: [], completed: false, completedAt: null };
  }

  return {
    tileId: row.tile_id,
    clanId: row.clan_id,
    currentCount: row.current_count,
    collectedItemIds: row.collected_item_ids,
    completed: row.completed,
    completedAt: row.completed_at,
  };
}

export async function getTileProgress(supabase, tileId, clanId) {
  const { data, error } = await supabase
    .from("tile_progress")
    .select()
    .eq("tile_id", tileId)
    .eq("clan_id", clanId)
    .maybeSingle();

  if (error) throw error;
  return rowToProgress(tileId, clanId, data);
}

export async function listClanTileProgress(supabase, clanId) {
  const { data, error } = await supabase.from("tile_progress").select().eq("clan_id", clanId);
  if (error) throw error;
  return data.map((row) => rowToProgress(row.tile_id, row.clan_id, row));
}

export async function markTileComplete(supabase, tileId, clanId) {
  const { data, error } = await supabase
    .from("tile_progress")
    .upsert(
      { tile_id: tileId, clan_id: clanId, completed: true, completed_at: new Date().toISOString() },
      { onConflict: "tile_id,clan_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return rowToProgress(tileId, clanId, data);
}

export async function unmarkTileComplete(supabase, tileId, clanId) {
  const { data, error } = await supabase
    .from("tile_progress")
    .upsert(
      { tile_id: tileId, clan_id: clanId, completed: false, completed_at: null },
      { onConflict: "tile_id,clan_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return rowToProgress(tileId, clanId, data);
}

export async function incrementTileProgress(supabase, tile, clanId, delta = 1) {
  const progress = await getTileProgress(supabase, tile.id, clanId);
  const currentCount = Math.max(0, progress.currentCount + delta);
  const completed = isTileComplete(tile, { currentCount });
  const completedAt = completed ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("tile_progress")
    .upsert(
      { tile_id: tile.id, clan_id: clanId, current_count: currentCount, completed, completed_at: completedAt },
      { onConflict: "tile_id,clan_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return rowToProgress(tile.id, clanId, data);
}

export async function collectItemForTile(supabase, tile, clanId, itemId, itemsBySet) {
  const progress = await getTileProgress(supabase, tile.id, clanId);
  const collectedItemIds = progress.collectedItemIds.includes(itemId)
    ? progress.collectedItemIds
    : [...progress.collectedItemIds, itemId];
  const completed = isTileComplete(tile, { collectedItemIds }, itemsBySet);
  const completedAt = completed ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("tile_progress")
    .upsert(
      { tile_id: tile.id, clan_id: clanId, collected_item_ids: collectedItemIds, completed, completed_at: completedAt },
      { onConflict: "tile_id,clan_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return rowToProgress(tile.id, clanId, data);
}

export async function uncollectItemForTile(supabase, tile, clanId, itemId, itemsBySet) {
  const progress = await getTileProgress(supabase, tile.id, clanId);
  const collectedItemIds = progress.collectedItemIds.filter((id) => id !== itemId);
  const completed = isTileComplete(tile, { collectedItemIds }, itemsBySet);
  const completedAt = completed ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("tile_progress")
    .upsert(
      { tile_id: tile.id, clan_id: clanId, collected_item_ids: collectedItemIds, completed, completed_at: completedAt },
      { onConflict: "tile_id,clan_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return rowToProgress(tile.id, clanId, data);
}

export function isTileComplete(tile, progress, itemsBySet) {
  if (tile.tileType === "complete_once") {
    return progress.completed;
  }

  if (tile.tileType === "complete_x_times") {
    return progress.currentCount >= tile.config.target;
  }

  if (tile.tileType === "collect_one_of_each") {
    return tile.config.itemIds.every((id) => progress.collectedItemIds.includes(id));
  }

  if (tile.tileType === "collect_k_of_y") {
    const collectedCount = tile.config.itemIds.filter((id) => progress.collectedItemIds.includes(id)).length;
    return collectedCount >= tile.config.k;
  }

  if (tile.tileType === "n_sets") {
    const sets = tile.config.setIds.map((setId) => itemsBySet[setId]);

    const fullSetComplete = sets.some((itemIds) => itemIds.every((id) => progress.collectedItemIds.includes(id)));
    const oneOfEachComplete = sets.every((itemIds) => itemIds.some((id) => progress.collectedItemIds.includes(id)));

    if (tile.config.mode === "full_set") return fullSetComplete;
    if (tile.config.mode === "one_of_each") return oneOfEachComplete;
    if (tile.config.mode === "either") return fullSetComplete || oneOfEachComplete;
  }
}
