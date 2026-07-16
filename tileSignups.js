function rowToSignup(row) {
  return {
    tileId: row.tile_id,
    clanId: row.clan_id,
    ign: row.ign,
    signedUpAt: row.signed_up_at,
  };
}

export async function signUpForTile(supabase, tileId, clanId, ign) {
  const { data, error } = await supabase
    .from("tile_signups")
    .upsert({ tile_id: tileId, clan_id: clanId, ign }, { onConflict: "tile_id,clan_id,ign" })
    .select()
    .single();

  if (error) throw error;
  return rowToSignup(data);
}

export async function dropTileSignUp(supabase, tileId, clanId, ign) {
  const { error } = await supabase
    .from("tile_signups")
    .delete()
    .eq("tile_id", tileId)
    .eq("clan_id", clanId)
    .eq("ign", ign);

  if (error) throw error;
}

export async function listClanTileSignups(supabase, clanId) {
  const { data, error } = await supabase.from("tile_signups").select().eq("clan_id", clanId);
  if (error) throw error;
  return data.map(rowToSignup);
}
