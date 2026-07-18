import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  elevateToDev,
  createEvent,
  listEvents,
  deleteEvent,
  setEventStatus,
  updateEventEndTime,
  updateEventStartTime,
  createClan,
  assignClanToEvent,
  listClans,
  deleteClan,
  updateClan,
  regenerateClanPassword,
  createItemSet,
  listItemSets,
  updateItemSet,
  deleteItemSet,
  addItemToSet,
  removeItemFromSet,
  listItemsInSet,
} from "./admin.js";
import { loadWikiItemIndex, EQUIPMENT_SLOTS, groupBySlotBucket, slotBucketFor } from "./wikiItems.js";
import { searchPickableItems, resolvePickedItem } from "./itemPicker.js";

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

const itemSetNameInput = document.getElementById("item-set-name-input");
const createItemSetBtn = document.getElementById("create-item-set-btn");
const itemSetsList = document.getElementById("item-sets-list");

let events = [];
let clans = [];
let itemSets = [];
let itemsBySetId = {}; // set id -> array of item rows currently in that set
let editingItemSetId = null;
let expandedSetIds = new Set(); // opt-in: sets currently showing their doll (default collapsed, name only — that's the whole point)
let selectedSlotBySetId = {}; // set id -> the doll slot (or "other") currently shown in that set's detail panel, if any

// Lazily loaded on first search-box interaction (a full pull of the OSRS
// Wiki's item index — see wikiItems.js), then cached for the rest of the
// Dev session rather than reloaded per set card.
let wikiIndex = null;
let wikiIndexLoading = null;

// Last search results per (set id, doll slot), so a click on "Add" can look
// the picked result back up without round-tripping it through a DOM
// attribute. Nested by slot since each equipment-doll cell searches/caches
// independently — shape: { [setId]: { [slot]: results } }.
let searchResultsBySetId = {};
let searchDebounceTimer = null;
const editingEndTimeFor = new Set(); // event ids currently showing the end-time editor
const editingStartTimeFor = new Set(); // event ids currently showing the start-time editor

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
  [events, clans, itemSets] = await Promise.all([listEvents(supabase), listClans(supabase), listItemSets(supabase)]);
  const memberLists = await Promise.all(itemSets.map((s) => listItemsInSet(supabase, s.id)));
  itemsBySetId = Object.fromEntries(itemSets.map((s, i) => [s.id, memberLists[i]]));

  renderDashboard();
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
function clanRowHtml(c, { showRemove, eventId }) {
  const actAsLink = eventId
    ? `<a class="btn-ghost" href="login.html?actAsClan=${encodeURIComponent(c.clanId)}&actAsEvent=${encodeURIComponent(eventId)}" target="_blank" rel="noopener">Act as Admin</a>`
    : "";
  return `
    <li>
      <span>${c.displayName}${c.prefix ? ` (${c.prefix})` : ""}</span>
      <span class="dev-row-actions">
        ${actAsLink}
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
          Starts: ${new Date(event.start_time_utc ?? event.created_at).toLocaleString()}${event.start_time_utc ? "" : " (auto, when the event was created)"}
          ${editingStartTimeFor.has(event.id) ? `
            <input type="datetime-local" data-start-input="${event.id}" value="${toDatetimeLocalValue(event.start_time_utc ?? event.created_at)}">
            <button class="btn-ghost" data-save-start="${event.id}">Save</button>
          ` : `
            <button class="btn-ghost" data-edit-start="${event.id}">${event.start_time_utc ? "Change start time" : "Set start time"}</button>
          `}
        </p>
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
            ? assigned.map((c) => clanRowHtml(c, { showRemove: true, eventId: event.id })).join("")
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

function slotLabel(slot) {
  return slot === "other" ? "Other (non-equipment)" : slot[0].toUpperCase() + slot.slice(1);
}

function searchResultRowHtml(result, index, setId, slot) {
  // In global search mode the row isn't already scoped to one slot's
  // section, so show which slot it'll actually land in.
  const slotBadge = slot === GLOBAL_SEARCH_SLOT ? ` <em>(${slotLabel(slotBucketFor(result.equipmentSlot))})</em>` : "";
  return `
    <div class="checkbox-row">
      ${result.photoUrl ? `<img src="${escapeAttr(result.photoUrl)}" alt="" class="item-thumb" referrerpolicy="no-referrer">` : ""}
      <span>${escapeAttr(result.name)}${result.equipmentSlot === "2h" ? " (2h)" : ""}${slotBadge}${result.source === "wiki" ? " <em>(from wiki)</em>" : ""}</span>
      <button class="btn-ghost" data-pick-result-index="${index}" data-pick-set-id="${escapeAttr(setId)}" data-pick-slot="${slot}">Add</button>
    </div>`;
}

// One compact doll cell: just an icon (first item, if any) plus a count
// badge if the set holds more than one item in that slot — clicking selects
// the slot, which is what actually shows/searches its members (see
// dollDetailPanelHtml below). Kept deliberately tiny; this is what replaces
// the old per-cell inline list+search that made the doll "way too big".
function dollSlotButtonHtml(setId, slot, members, isSelected) {
  const first = members[0];
  return `
    <button type="button" class="doll-slot ${isSelected ? "active" : ""}" data-select-slot="${setId}" data-slot="${slot}" title="${slotLabel(slot)}">
      ${first?.photo_url ? `<img src="${escapeAttr(first.photo_url)}" alt="" class="doll-slot-icon" referrerpolicy="no-referrer">` : ""}
      ${members.length > 1 ? `<span class="doll-slot-badge">${members.length}</span>` : ""}
    </button>`;
}

// "Other" isn't a real equipment slot (no doll position for it), but stays
// part of the same click-to-select interaction as every doll cell.
function otherRowButtonHtml(setId, members, isSelected) {
  return `
    <button type="button" class="doll-other-btn ${isSelected ? "active" : ""}" data-select-slot="${setId}" data-slot="other">
      ${slotLabel("other")}${members.length ? ` (${members.length})` : ""}
    </button>`;
}

// Sentinel "slot" for the global search button (GearScape-style): not a
// real doll position, just another value of the same selectedSlotBySetId
// state, so it rides the existing [data-select-slot] click handling for
// free. Search results aren't filtered to a slot in this mode; picking a
// result still auto-lands in the right doll cell on the next render since
// item_set_members carries no slot of its own — slot is always derived
// from the item's own equipment_slot in groupBySlotBucket, regardless of
// which UI path (a specific slot's search, or this global one) added it.
const GLOBAL_SEARCH_SLOT = "__all__";

function globalSearchButtonHtml(setId, isSelected) {
  return `
    <button type="button" class="btn-ghost doll-global-search-btn ${isSelected ? "active" : ""}" data-select-slot="${setId}" data-slot="${GLOBAL_SEARCH_SLOT}" title="Search all items — picks land in the right slot automatically">
      🔍 Search all
    </button>`;
}

// The right-hand panel for whichever slot is currently selected on a set's
// doll: its current members (with remove buttons) plus a search box scoped
// to that slot. Nothing selected yet -> a plain placeholder, no panel UI.
// GLOBAL_SEARCH_SLOT is the one exception — no single slot's members to
// show, just an unfiltered search box (see handleItemSetSearchInput).
function dollDetailPanelHtml(setId, selectedSlot, grouped) {
  if (!selectedSlot) {
    return `<div class="doll-detail-panel"><p class="dev-empty">Click a slot to view or search items.</p></div>`;
  }

  if (selectedSlot === GLOBAL_SEARCH_SLOT) {
    return `
      <div class="doll-detail-panel">
        <p class="doll-detail-label">Search all items</p>
        <input type="text" class="checkbox-search item-set-add-search" data-set-id="${setId}" data-slot="${GLOBAL_SEARCH_SLOT}" placeholder="Search any item..." autocomplete="off">
        <div class="checkbox-list item-set-add-results" data-set-id="${setId}" data-slot="${GLOBAL_SEARCH_SLOT}"></div>
      </div>`;
  }

  const members = grouped[selectedSlot] || [];
  return `
    <div class="doll-detail-panel">
      <p class="doll-detail-label">${slotLabel(selectedSlot)}</p>
      <div class="doll-slot-members">
        ${members.length
          ? members.map((m) => `
            <div class="selected-chip">
              ${m.photo_url ? `<img src="${escapeAttr(m.photo_url)}" alt="" class="item-thumb" referrerpolicy="no-referrer">` : ""}
              <span>${escapeAttr(m.name)}${m.equipment_slot === "2h" ? " (2h)" : ""}</span>
              <button class="selected-remove" data-remove-member="${m.id}" data-set-id="${setId}">&times;</button>
            </div>`).join("")
          : "<p class=\"dev-empty\">Empty</p>"}
      </div>
      <input type="text" class="checkbox-search item-set-add-search" data-set-id="${setId}" data-slot="${selectedSlot}" placeholder="Search ${slotLabel(selectedSlot).toLowerCase()}..." autocomplete="off">
      <div class="checkbox-list item-set-add-results" data-set-id="${setId}" data-slot="${selectedSlot}"></div>
    </div>`;
}

function itemSetCardHtml(set) {
  if (set.id === editingItemSetId) return itemSetFormHtml(set);

  const isExpanded = expandedSetIds.has(set.id);
  const members = itemsBySetId[set.id] || [];
  const grouped = groupBySlotBucket(members, (m) => m.equipment_slot);
  const selectedSlot = selectedSlotBySetId[set.id];

  return `
    <div class="dev-event-card" data-set-card="${set.id}">
      <h3>
        <button class="btn-ghost doll-collapse-toggle" data-toggle-expand="${set.id}">${isExpanded ? "▾" : "▸"}</button>
        ${escapeAttr(set.name)}
        <button class="btn-ghost" data-edit-item-set="${set.id}">Rename</button>
        <button class="btn-ghost" data-delete-item-set="${set.id}">Delete</button>
      </h3>
      ${isExpanded ? `
        ${globalSearchButtonHtml(set.id, selectedSlot === GLOBAL_SEARCH_SLOT)}
        <div class="doll-layout">
          <div class="equipment-doll">
            ${EQUIPMENT_SLOTS.map((slot) => dollSlotButtonHtml(set.id, slot, grouped[slot], slot === selectedSlot)).join("")}
          </div>
          ${dollDetailPanelHtml(set.id, selectedSlot, grouped)}
        </div>
        <div class="doll-other-row">
          ${otherRowButtonHtml(set.id, grouped.other, selectedSlot === "other")}
        </div>` : ""}
    </div>`;
}

// Rebuilds just one set's card in place (used by expand/collapse) — never
// call renderItemSets() for this, since a full-list re-render tears down
// and recreates every OTHER expanded set's <img> elements too, which was
// the actual cause of the sluggishness/"pictures break" symptom: repeatedly
// destroying and recreating already-loaded wiki images on every click.
function rerenderItemSetCard(setId) {
  const set = itemSets.find((s) => s.id === setId);
  if (!set) return;
  const cardEl = itemSetsList.querySelector(`[data-set-card="${setId}"]`);
  if (cardEl) cardEl.outerHTML = itemSetCardHtml(set);
}

// After adding/removing a member, only that one set's membership actually
// changed — re-fetching everything via loadDashboard() (events, clans, every
// other set) and re-rendering the whole list would be the same unnecessary
// churn rerenderItemSetCard was introduced to avoid above.
async function refreshItemSetMembers(setId) {
  itemsBySetId[setId] = await listItemsInSet(supabase, setId);
  rerenderItemSetCard(setId);
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

async function ensureWikiIndexLoaded() {
  if (wikiIndex) return wikiIndex;
  if (!wikiIndexLoading) wikiIndexLoading = loadWikiItemIndex(fetch);
  wikiIndex = await wikiIndexLoading;
  return wikiIndex;
}

// Delegated on itemSetsList (not attached per-input, since cards are
// recreated on every render) — debounced so typing doesn't hit the DB and
// re-filter the wiki index on every keystroke. Renders straight into this
// one set's results container rather than going through loadDashboard()/
// renderItemSets(), so the input keeps focus and other cards' in-progress
// searches aren't disturbed.
function handleItemSetSearchInput(e) {
  if (!e.target.classList.contains("item-set-add-search")) return;
  const setId = e.target.dataset.setId;
  const slot = e.target.dataset.slot;
  const query = e.target.value;

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    const resultsEl = itemSetsList.querySelector(`.item-set-add-results[data-set-id="${setId}"][data-slot="${slot}"]`);
    if (!resultsEl) return;

    (searchResultsBySetId[setId] ??= {})[slot] = [];
    if (!query.trim()) {
      resultsEl.innerHTML = "";
      return;
    }

    resultsEl.innerHTML = wikiIndex ? "" : "<p class=\"dev-empty\">Loading wiki item index…</p>";
    await ensureWikiIndexLoaded();

    // The debounced query may be stale by the time the (possibly slow,
    // first-ever) wiki index load resolves — bail if the box moved on.
    if (itemSetsList.querySelector(`.item-set-add-search[data-set-id="${setId}"][data-slot="${slot}"]`)?.value !== query) return;

    // Search across everything, then narrow to just this cell's slot —
    // reuses the same itemPicker.js orchestration as every other search box.
    // GLOBAL_SEARCH_SLOT is the one exception: show every result, unfiltered
    // — whichever one gets picked still lands in its own correct slot on
    // the next render regardless (see GLOBAL_SEARCH_SLOT's comment).
    const allResults = await searchPickableItems(supabase, wikiIndex, query);
    const results = slot === GLOBAL_SEARCH_SLOT ? allResults : allResults.filter((r) => slotBucketFor(r.equipmentSlot) === slot);
    searchResultsBySetId[setId][slot] = results;
    resultsEl.innerHTML = results.length
      ? results.map((r, i) => searchResultRowHtml(r, i, setId, slot)).join("")
      : "<p class=\"dev-empty\">No matches</p>";
  }, 250);
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
  const toggleExpandId = e.target.dataset.toggleExpand;
  if (toggleExpandId) {
    if (expandedSetIds.has(toggleExpandId)) expandedSetIds.delete(toggleExpandId);
    else expandedSetIds.add(toggleExpandId);
    rerenderItemSetCard(toggleExpandId); // only this card, not renderItemSets() — see its comment
    return;
  }

  // .closest() (not e.target.dataset directly) since a click can land on
  // the icon <img>/badge <span> inside a doll-slot button, not the button
  // itself. Clicking an already-selected slot again deselects it.
  //
  // Deliberately NOT a re-render of any kind (not even rerenderItemSetCard)
  // — this is pure DOM surgery (toggle .active, swap the detail panel's
  // innerHTML) so the doll's own <img> elements are never touched just for
  // browsing between slots, which is the actual frequent interaction.
  const selectSlotBtn = e.target.closest("[data-select-slot]");
  if (selectSlotBtn) {
    const setId = selectSlotBtn.dataset.selectSlot;
    const slot = selectSlotBtn.dataset.slot;
    const newSlot = selectedSlotBySetId[setId] === slot ? null : slot;
    selectedSlotBySetId[setId] = newSlot;

    const card = selectSlotBtn.closest("[data-set-card]");
    card.querySelectorAll("[data-select-slot].active").forEach((btn) => btn.classList.remove("active"));
    if (newSlot) card.querySelector(`[data-select-slot="${setId}"][data-slot="${newSlot}"]`)?.classList.add("active");

    const grouped = groupBySlotBucket(itemsBySetId[setId] || [], (m) => m.equipment_slot);
    card.querySelector(".doll-detail-panel").outerHTML = dollDetailPanelHtml(setId, newSlot, grouped);
    return;
  }

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
    await refreshItemSetMembers(setId);
    return;
  }

  const pickSetId = e.target.dataset.pickSetId;
  if (pickSetId) {
    const slot = e.target.dataset.pickSlot;
    const result = (searchResultsBySetId[pickSetId]?.[slot] || [])[Number(e.target.dataset.pickResultIndex)];
    if (!result) return;

    e.target.disabled = true;
    const item = await resolvePickedItem(supabase, result);
    await addItemToSet(supabase, pickSetId, item.id);
    await refreshItemSetMembers(pickSetId);
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

  const editStartEventId = e.target.dataset.editStart;
  if (editStartEventId) {
    editingStartTimeFor.add(editStartEventId);
    renderDashboard();
    return;
  }

  const saveStartEventId = e.target.dataset.saveStart;
  if (saveStartEventId) {
    const input = eventsList.querySelector(`input[data-start-input="${saveStartEventId}"]`);
    if (input?.value) {
      await updateEventStartTime(supabase, saveStartEventId, new Date(input.value).toISOString());
      editingStartTimeFor.delete(saveStartEventId);
      await loadDashboard();
    }
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
createItemSetBtn.addEventListener("click", handleCreateItemSet);
itemSetsList.addEventListener("click", handleItemSetsListClick);
itemSetsList.addEventListener("input", handleItemSetSearchInput);

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
