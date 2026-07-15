import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  elevateToDev,
  createEvent,
  listEvents,
  deleteEvent,
  setEventStatus,
  updateEventEndTime,
  createClan,
  assignClanToEvent,
  listClans,
  deleteClan,
  updateClan,
  regenerateClanPassword,
  createItem,
  listItems,
  updateItem,
  deleteItem,
  createItemSet,
  listItemSets,
  updateItemSet,
  deleteItemSet,
  addItemToSet,
  removeItemFromSet,
  listItemsInSet,
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

const itemNameInput = document.getElementById("item-name-input");
const itemPhotoInput = document.getElementById("item-photo-input");
const createItemBtn = document.getElementById("create-item-btn");
const itemsList = document.getElementById("items-list");
const itemSetNameInput = document.getElementById("item-set-name-input");
const createItemSetBtn = document.getElementById("create-item-set-btn");
const itemSetsList = document.getElementById("item-sets-list");

let events = [];
let clans = [];
let items = [];
let itemSets = [];
let itemsBySetId = {}; // set id -> array of item rows currently in that set
let editingItemId = null;
let editingItemSetId = null;
const editingEndTimeFor = new Set(); // event ids currently showing the end-time editor

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
  [events, clans, items, itemSets] = await Promise.all([
    listEvents(supabase),
    listClans(supabase),
    listItems(supabase),
    listItemSets(supabase),
  ]);
  const memberLists = await Promise.all(itemSets.map((s) => listItemsInSet(supabase, s.id)));
  itemsBySetId = Object.fromEntries(itemSets.map((s, i) => [s.id, memberLists[i]]));

  renderDashboard();
  renderItems();
  renderItemSets();
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local time
// (no timezone) — the reverse of new Date(inputValue).toISOString(), which
// the create-event form already uses to go the other direction.
function toDatetimeLocalValue(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Shared row markup for a clan, used both in the unassigned list and inside
// each event card — showRemove only makes sense for clans already on an event.
function clanRowHtml(c, { showRemove }) {
  return `
    <li>
      <span>${c.displayName}${c.prefix ? ` (${c.prefix})` : ""}</span>
      <span class="dev-row-actions">
        ${showRemove ? `<button class="btn-ghost" data-remove-clan="${c.clanId}">Remove</button>` : ""}
        <button class="btn-ghost" data-rename-clan="${c.clanId}">Rename</button>
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
        <p class="dev-muted">
          Ends: ${new Date(event.end_time_utc).toLocaleString()}
          ${editingEndTimeFor.has(event.id) ? `
            <input type="datetime-local" data-end-input="${event.id}" value="${toDatetimeLocalValue(event.end_time_utc)}">
            <button class="btn-ghost" data-save-end="${event.id}">Save</button>
          ` : `
            <button class="btn-ghost" data-edit-end="${event.id}">Change end time</button>
          `}
        </p>
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

function itemRowHtml(item) {
  if (item.id === editingItemId) return itemFormHtml(item);

  return `
    <li>
      <span>${item.photo_url ? `<img src="${escapeAttr(item.photo_url)}" alt="" class="item-thumb">` : ""}${escapeAttr(item.name)}</span>
      <span class="dev-row-actions">
        <button class="btn-ghost" data-edit-item="${item.id}">Edit</button>
        <button class="btn-ghost" data-delete-item="${item.id}">Delete</button>
      </span>
    </li>`;
}

function itemFormHtml(item) {
  return `
    <li>
      <span class="dev-form">
        <input class="item-edit-name" value="${escapeAttr(item.name)}" placeholder="Item name">
        <input class="item-edit-photo" value="${escapeAttr(item.photo_url ?? "")}" placeholder="Photo URL">
        <button class="btn-ghost" data-save-item="${item.id}">Save</button>
        <button class="btn-ghost" data-cancel-edit-item="${item.id}">Cancel</button>
      </span>
    </li>`;
}

function renderItems() {
  itemsList.innerHTML = items.length ? items.map(itemRowHtml).join("") : "<li class=\"dev-empty\">No items yet</li>";
}

function itemSetCardHtml(set) {
  if (set.id === editingItemSetId) return itemSetFormHtml(set);

  const members = itemsBySetId[set.id] || [];
  const availableToAdd = items.filter((i) => !members.some((m) => m.id === i.id));

  return `
    <div class="dev-event-card">
      <h3>
        ${escapeAttr(set.name)}
        <button class="btn-ghost" data-edit-item-set="${set.id}">Rename</button>
        <button class="btn-ghost" data-delete-item-set="${set.id}">Delete</button>
      </h3>
      <ul class="dev-list">
        ${members.length
          ? members.map((m) => `
            <li>
              <span>${escapeAttr(m.name)}</span>
              <button class="btn-ghost" data-remove-member="${m.id}" data-set-id="${set.id}">Remove</button>
            </li>`).join("")
          : "<li class=\"dev-empty\">No items yet</li>"}
      </ul>
      ${availableToAdd.length ? `
        <div class="dev-form">
          <select data-add-member-select="${set.id}">
            ${availableToAdd.map((i) => `<option value="${i.id}">${escapeAttr(i.name)}</option>`).join("")}
          </select>
          <button class="btn-ghost" data-add-member-btn="${set.id}">Add to set</button>
        </div>` : ""}
    </div>`;
}

function itemSetFormHtml(set) {
  return `
    <div class="dev-event-card">
      <div class="dev-form">
        <input class="item-set-edit-name" value="${escapeAttr(set.name)}" placeholder="Set name">
        <button class="btn-ghost" data-save-item-set="${set.id}">Save</button>
        <button class="btn-ghost" data-cancel-edit-item-set="${set.id}">Cancel</button>
      </div>
    </div>`;
}

function renderItemSets() {
  itemSetsList.innerHTML = itemSets.length
    ? itemSets.map(itemSetCardHtml).join("")
    : "<p class=\"dev-empty\">No item sets yet.</p>";
}

async function handleCreateItem() {
  const name = itemNameInput.value.trim();
  const photoUrl = itemPhotoInput.value.trim() || null;
  if (!name) return;

  createItemBtn.disabled = true;
  try {
    await createItem(supabase, { name, photoUrl });
    itemNameInput.value = "";
    itemPhotoInput.value = "";
    await loadDashboard();
  } finally {
    createItemBtn.disabled = false;
  }
}

async function handleItemsListClick(e) {
  const deleteItemId = e.target.dataset.deleteItem;
  if (deleteItemId) {
    if (confirm("Delete this item? It will be removed from any sets it belongs to.")) {
      await deleteItem(supabase, deleteItemId);
      await loadDashboard();
    }
    return;
  }

  const editItemId = e.target.dataset.editItem;
  if (editItemId) {
    editingItemId = editItemId;
    renderItems();
    return;
  }

  const cancelItemId = e.target.dataset.cancelEditItem;
  if (cancelItemId) {
    editingItemId = null;
    renderItems();
    return;
  }

  const saveItemId = e.target.dataset.saveItem;
  if (saveItemId) {
    const row = e.target.closest("li");
    const name = row.querySelector(".item-edit-name").value.trim();
    const photoUrl = row.querySelector(".item-edit-photo").value.trim() || null;
    if (!name) return;

    await updateItem(supabase, saveItemId, { name, photoUrl });
    editingItemId = null;
    await loadDashboard();
  }
}

async function handleCreateItemSet() {
  const name = itemSetNameInput.value.trim();
  if (!name) return;

  createItemSetBtn.disabled = true;
  try {
    await createItemSet(supabase, { name });
    itemSetNameInput.value = "";
    await loadDashboard();
  } finally {
    createItemSetBtn.disabled = false;
  }
}

async function handleItemSetsListClick(e) {
  const deleteSetId = e.target.dataset.deleteItemSet;
  if (deleteSetId) {
    if (confirm("Delete this item set? Any tiles referencing it will need to be updated separately.")) {
      await deleteItemSet(supabase, deleteSetId);
      await loadDashboard();
    }
    return;
  }

  const editSetId = e.target.dataset.editItemSet;
  if (editSetId) {
    editingItemSetId = editSetId;
    renderItemSets();
    return;
  }

  const cancelSetId = e.target.dataset.cancelEditItemSet;
  if (cancelSetId) {
    editingItemSetId = null;
    renderItemSets();
    return;
  }

  const saveSetId = e.target.dataset.saveItemSet;
  if (saveSetId) {
    const card = e.target.closest(".dev-event-card");
    const name = card.querySelector(".item-set-edit-name").value.trim();
    if (!name) return;

    await updateItemSet(supabase, saveSetId, { name });
    editingItemSetId = null;
    await loadDashboard();
    return;
  }

  const removeMemberItemId = e.target.dataset.removeMember;
  if (removeMemberItemId) {
    const setId = e.target.dataset.setId;
    await removeItemFromSet(supabase, setId, removeMemberItemId);
    await loadDashboard();
    return;
  }

  const addMemberSetId = e.target.dataset.addMemberBtn;
  if (addMemberSetId) {
    const select = itemSetsList.querySelector(`select[data-add-member-select="${addMemberSetId}"]`);
    if (select?.value) {
      await addItemToSet(supabase, addMemberSetId, select.value);
      await loadDashboard();
    }
  }
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
    return;
  }

  const renameClanId = e.target.dataset.renameClan;
  if (renameClanId) {
    const clan = clans.find((c) => c.clanId === renameClanId);
    const displayName = prompt("New clan name:", clan?.displayName ?? "");
    if (!displayName) return;
    const prefix = prompt("New prefix (optional):", clan?.prefix ?? "") || null;
    await updateClan(supabase, renameClanId, { displayName, prefix });
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

  const editEndEventId = e.target.dataset.editEnd;
  if (editEndEventId) {
    editingEndTimeFor.add(editEndEventId);
    renderDashboard();
    return;
  }

  const saveEndEventId = e.target.dataset.saveEnd;
  if (saveEndEventId) {
    const input = eventsList.querySelector(`input[data-end-input="${saveEndEventId}"]`);
    if (input?.value) {
      await updateEventEndTime(supabase, saveEndEventId, new Date(input.value).toISOString());
      editingEndTimeFor.delete(saveEndEventId);
      await loadDashboard();
    }
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
createItemBtn.addEventListener("click", handleCreateItem);
itemsList.addEventListener("click", handleItemsListClick);
createItemSetBtn.addEventListener("click", handleCreateItemSet);
itemSetsList.addEventListener("click", handleItemSetsListClick);

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
