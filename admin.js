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

export async function deleteEvent(supabase, eventId) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;
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

export async function regenerateClanPassword(supabase, clanId, role) {
  const { data, error } = await supabase.rpc("regenerate_clan_password", { p_clan_id: clanId, p_role: role });
  if (error) throw error;
  return data;
}

export async function elevateToDev(supabase, password) {
  const { error } = await supabase.functions.invoke("dev-elevate", { body: { password } });
  if (error) throw error;

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
}
