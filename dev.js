import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  elevateToDev,
  createEvent,
  listEvents,
  deleteEvent,
  setEventStatus,
  createClan,
  assignClanToEvent,
  listClans,
  deleteClan,
  regenerateClanPassword,
} from "./admin.js";

const SUPABASE_URL = "https://swqaheqhglqtolzbtgfe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MSHvLGLg1hKI7BdqGtAP-Q_biIwaDUL";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const loginScreen = document.getElementById("name-screen");
const dashboard = document.getElementById("dashboard");
const passwordInput = document.getElementById("name-input");
const loginBtn = document.getElementById("name-btn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const newClanPasswordsBox = document.getElementById("new-clan-passwords");
const clanNameInput = document.getElementById("clan-name-input");
const clanPrefixInput = document.getElementById("clan-prefix-input");
const createClanBtn = document.getElementById("create-clan-btn");
const eventNameInput = document.getElementById("event-name-input");
const eventEndInput = document.getElementById("event-end-input");
const createEventBtn = document.getElementById("create-event-btn");
const unassignedClansList = document.getElementById("unassigned-clans-list");
const eventsList = document.getElementById("events-list");

let events = [];
let clans = [];

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  loadDashboard();
}

function showLogin() {
  dashboard.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.value = "";
  loginError.classList.add("hidden");
}

async function handleLogin() {
  const password = passwordInput.value;
  if (!password) return;

  loginBtn.disabled = true;
  loginError.classList.add("hidden");

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }

    await elevateToDev(supabase, password);
    showDashboard();
  } catch (err) {
    loginError.textContent = "Incorrect password.";
    loginError.classList.remove("hidden");
  } finally {
    loginBtn.disabled = false;
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  showLogin();
}

async function loadDashboard() {
  [events, clans] = await Promise.all([listEvents(supabase), listClans(supabase)]);
  renderDashboard();
}

// Shared row markup for a clan, used both in the unassigned list and inside
// each event card — showRemove only makes sense for clans already on an event.
function clanRowHtml(c, { showRemove }) {
  return `
    <li>
      <span>${c.displayName}${c.prefix ? ` (${c.prefix})` : ""}</span>
      <span class="dev-row-actions">
        ${showRemove ? `<button class="btn-ghost" data-remove-clan="${c.clanId}">Remove</button>` : ""}
        <button class="btn-ghost" data-regen="${c.clanId}" data-role="admin">Regen admin pw</button>
        <button class="btn-ghost" data-regen="${c.clanId}" data-role="player">Regen player pw</button>
        <button class="btn-ghost" data-delete-clan="${c.clanId}">Delete</button>
      </span>
    </li>`;
}

function renderDashboard() {
  const unassigned = clans.filter((c) => c.eventId === null);

  unassignedClansList.innerHTML = unassigned.length
    ? unassigned.map((c) => clanRowHtml(c, { showRemove: false })).join("")
    : "<li class=\"dev-empty\">None</li>";

  eventsList.innerHTML = events.map((event) => {
    const assigned = clans.filter((c) => c.eventId === event.id);
    const unassignedOptions = unassigned
      .map((c) => `<option value="${c.clanId}">${c.displayName}</option>`)
      .join("");

    const publishToggle = event.status === "draft"
      ? `<button class="btn-ghost" data-publish-event="${event.id}">Publish</button>`
      : event.status === "published"
        ? `<button class="btn-ghost" data-unpublish-event="${event.id}">Unpublish</button>`
        : "";

    return `
      <div class="dev-event-card">
        <h3>
          ${event.name} <span class="dev-status">${event.status}</span>
          ${publishToggle}
          <button class="btn-ghost" data-delete-event="${event.id}">Delete event</button>
        </h3>
        <p class="dev-muted">Ends: ${new Date(event.end_time_utc).toLocaleString()}</p>
        <ul class="dev-list">
          ${assigned.length
            ? assigned.map((c) => clanRowHtml(c, { showRemove: true })).join("")
            : "<li class=\"dev-empty\">No clans yet</li>"}
        </ul>
        ${unassigned.length ? `
          <div class="dev-form">
            <select data-assign-select="${event.id}">${unassignedOptions}</select>
            <button class="btn-ghost" data-assign-btn="${event.id}">Add clan</button>
          </div>` : ""}
      </div>`;
  }).join("");
}

async function handleCreateClan() {
  const displayName = clanNameInput.value.trim();
  if (!displayName) return;
  const prefix = clanPrefixInput.value.trim() || null;

  createClanBtn.disabled = true;
  try {
    const clan = await createClan(supabase, { displayName, prefix });
    newClanPasswordsBox.innerHTML = `
      <strong>${displayName}</strong> created — save these now, they won't be shown again:<br>
      Admin password: <code>${clan.adminPassword}</code><br>
      Player password: <code>${clan.playerPassword}</code>`;
    newClanPasswordsBox.classList.remove("hidden");
    clanNameInput.value = "";
    clanPrefixInput.value = "";
    await loadDashboard();
  } finally {
    createClanBtn.disabled = false;
  }
}

async function handleCreateEvent() {
  const name = eventNameInput.value.trim();
  const endLocal = eventEndInput.value;
  if (!name || !endLocal) return;

  createEventBtn.disabled = true;
  try {
    await createEvent(supabase, { name, endTimeUtc: new Date(endLocal).toISOString() });
    eventNameInput.value = "";
    eventEndInput.value = "";
    await loadDashboard();
  } finally {
    createEventBtn.disabled = false;
  }
}

// Event delegation: the Remove/Delete/Regen/Add-clan buttons inside these
// lists are re-created every time renderDashboard() runs (innerHTML is
// fully replaced on every reload), so listeners attached directly to them
// would be lost each time. Attaching one listener to each never-replaced
// container instead works because clicks "bubble up" from whatever was
// actually clicked to its parents — we just check which button (if any)
// triggered it. Both the unassigned-clans list and each event's clan list
// share this same handler, since Delete/Regen apply to a clan either way.
async function handleClanListClick(e) {
  const deleteClanId = e.target.dataset.deleteClan;
  if (deleteClanId) {
    if (confirm("Permanently delete this clan? Its passwords cannot be recovered.")) {
      await deleteClan(supabase, deleteClanId);
      await loadDashboard();
    }
    return;
  }

  const regenClanId = e.target.dataset.regen;
  if (regenClanId) {
    const role = e.target.dataset.role;
    const clanName = clans.find((c) => c.clanId === regenClanId)?.displayName ?? "clan";
    const password = await regenerateClanPassword(supabase, regenClanId, role);
    newClanPasswordsBox.innerHTML = `<strong>${clanName}</strong> — new ${role} password: <code>${password}</code> — save it now, it won't be shown again.`;
    newClanPasswordsBox.classList.remove("hidden");
    return;
  }

  const removeClanId = e.target.dataset.removeClan;
  if (removeClanId) {
    await assignClanToEvent(supabase, removeClanId, null);
    await loadDashboard();
  }
}

unassignedClansList.addEventListener("click", handleClanListClick);

eventsList.addEventListener("click", async (e) => {
  const deleteEventId = e.target.dataset.deleteEvent;
  if (deleteEventId) {
    if (confirm("Permanently delete this event? Assigned clans will be unassigned, not deleted.")) {
      await deleteEvent(supabase, deleteEventId);
      await loadDashboard();
    }
    return;
  }

  const publishEventId = e.target.dataset.publishEvent;
  if (publishEventId) {
    await setEventStatus(supabase, publishEventId, "published");
    await loadDashboard();
    return;
  }

  const unpublishEventId = e.target.dataset.unpublishEvent;
  if (unpublishEventId) {
    await setEventStatus(supabase, unpublishEventId, "draft");
    await loadDashboard();
    return;
  }

  const assignEventId = e.target.dataset.assignBtn;
  if (assignEventId) {
    const select = eventsList.querySelector(`select[data-assign-select="${assignEventId}"]`);
    if (select?.value) {
      await assignClanToEvent(supabase, select.value, assignEventId);
      await loadDashboard();
    }
    return;
  }

  await handleClanListClick(e);
});

createClanBtn.addEventListener("click", handleCreateClan);
createEventBtn.addEventListener("click", handleCreateEvent);

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.app_metadata?.is_dev) {
    showDashboard();
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
