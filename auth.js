export async function login(supabase, { ign, password }) {
  const { data, error } = await supabase.functions.invoke("login", { body: { ign, password } });
  if (error) throw error;

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;

  return data;
}
