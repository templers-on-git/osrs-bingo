import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { login } from "./auth.js";

const SUPABASE_URL = "https://swqaheqhglqtolzbtgfe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MSHvLGLg1hKI7BdqGtAP-Q_biIwaDUL";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const loginScreen = document.getElementById("name-screen");
const loggedInScreen = document.getElementById("loggedin-screen");
const ignInput = document.getElementById("ign-input");
const passwordInput = document.getElementById("password-input");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const ignDisplay = document.getElementById("ign-display");
const roleDisplay = document.getElementById("role-display");
const logoutBtn = document.getElementById("logout-btn");

function showLoggedIn(ign, role) {
  loginScreen.classList.add("hidden");
  loggedInScreen.classList.remove("hidden");
  ignDisplay.textContent = ign;
  roleDisplay.textContent = role;
}

function showLogin() {
  loggedInScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.value = "";
  loginError.classList.add("hidden");
}

async function handleLogin() {
  const ign = ignInput.value.trim();
  const password = passwordInput.value;
  if (!ign || !password) return;

  loginBtn.disabled = true;
  loginError.classList.add("hidden");

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }

    const { clan_role } = await login(supabase, { ign, password });
    showLoggedIn(ign, clan_role);
  } catch (err) {
    loginError.textContent = "Invalid name or password.";
    loginError.classList.remove("hidden");
  } finally {
    loginBtn.disabled = false;
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  showLogin();
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  const clanRole = session?.user?.app_metadata?.clan_role;
  const ign = session?.user?.app_metadata?.ign;
  if (clanRole) {
    showLoggedIn(ign, clanRole);
  } else {
    showLogin();
  }
}

loginBtn.addEventListener("click", handleLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
logoutBtn.addEventListener("click", handleLogout);

init();
