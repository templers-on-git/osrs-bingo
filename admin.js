export async function createEvent(supabase, { name, endTimeUtc }) {
  const { data, error } = await supabase
    .from("events")
    .insert({ name, end_time_utc: endTimeUtc })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addClanToEvent(supabase, eventId, displayName) {
  const { data, error } = await supabase
    .rpc("create_clan", { p_event_id: eventId, p_display_name: displayName })
    .single();

  if (error) throw error;
  return {
    clanId: data.clan_id,
    adminPassword: data.admin_password,
    playerPassword: data.player_password,
  };
}
