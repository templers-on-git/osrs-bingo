import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { login } from "./auth.js";
import {
  getEvent,
  listEventClans,
  listTiles,
  createTile,
  updateTile,
  deleteTile,
  createBracket,
  listBrackets,
  updateBracket,
  deleteBracket,
  listItemsByIds,
  listItemSets,
  listItemsInSet,
  createItemSet,
  updateItemSet,
  deleteItemSet,
  addItemToSet,
  removeItemFromSet,
  getClanLeaderboard,
} from "./admin.js";
import { loadWikiItemIndex, EQUIPMENT_SLOTS, groupBySlotBucket, slotBucketFor } from "./wikiItems.js";
import { searchPickableItems, resolvePickedItem } from "./itemPicker.js";
import { computeBracketBreakdown, computePointsOverTime } from "./analytics.js";
import {
  listClanTileProgress,
  collectItemForTile,
  uncollectItemForTile,
  markTileComplete,
  unmarkTileComplete,
  incrementTileProgress,
} from "./tileProgress.js";
import { signUpForTile, dropTileSignUp, listClanTileSignups } from "./tileSignups.js";

// The 3 tile types whose progress is tracked by collecting individual
// items (directly, or via item sets for n_sets) rather than a plain counter.
const ITEM_BASED_TYPES = ["collect_one_of_each", "collect_k_of_y", "n_sets"];

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
const eventClanDisplay = document.getElementById("event-clan-display");
const actingAsBanner = document.getElementById("acting-as-dev-banner");
const actingAsClanName = document.getElementById("acting-as-clan-name");

const adminTabs = document.getElementById("admin-tabs");
const viewTabBtn = document.getElementById("view-tab-btn");
const editTabBtn = document.getElementById("edit-tab-btn");
const progressTabBtn = document.getElementById("progress-tab-btn");
const analyticsTabBtn = document.getElementById("analytics-tab-btn");
const viewPane = document.getElementById("view-pane");
const editPane = document.getElementById("edit-pane");
const progressPane = document.getElementById("progress-pane");
const analyticsPane = document.getElementById("analytics-pane");
const leaderboardList = document.getElementById("leaderboard-list");
const breakdownList = document.getElementById("breakdown-list");
const pointsChart = document.getElementById("points-chart");
const pointsChartInfo = document.getElementById("points-chart-info");
const boardGrid = document.getElementById("board-grid");
const progressTilesList = document.getElementById("progress-tiles-list");
const viewHideCompletedToggle = document.getElementById("view-hide-completed-toggle");
const progressHideCompletedToggle = document.getElementById("progress-hide-completed-toggle");

const itemModalOverlay = document.getElementById("item-modal-overlay");
const itemModalTitle = document.getElementById("item-modal-title");
const itemModalBody = document.getElementById("item-modal-body");
const itemModalCloseBtn = document.getElementById("item-modal-close");

const bracketLabelInput = document.getElementById("bracket-label-input");
const bracketPointsInput = document.getElementById("bracket-points-input");
const createBracketBtn = document.getElementById("create-bracket-btn");
const bracketsList = document.getElementById("brackets-list");

const tileNameInput = document.getElementById("tile-name-input");
const tileBracketSelect = document.getElementById("tile-bracket-select");
const tileTypeSelect = document.getElementById("tile-type-select");
const tileTargetInput = document.getElementById("tile-target-input");
const tileItemsPicker = document.getElementById("tile-items-picker");
const tileItemsSearch = document.getElementById("tile-items-search");
const tileItemsSelect = document.getElementById("tile-items-select");
const tileItemsSelected = document.getElementById("tile-items-selected");
const tileItemsSelectedCount = document.getElementById("tile-items-selected-count");
const tileKInput = document.getElementById("tile-k-input");
const tileSetsPicker = document.getElementById("tile-sets-picker");
const tileSetsSearch = document.getElementById("tile-sets-search");
const tileSetsSelect = document.getElementById("tile-sets-select");
const tileSetsSelected = document.getElementById("tile-sets-selected");
const tileSetsSelectedCount = document.getElementById("tile-sets-selected-count");
const tileModeSelect = document.getElementById("tile-mode-select");
const createTileBtn = document.getElementById("create-tile-btn");
const noBracketsNote = document.getElementById("no-brackets-note");
const editTilesList = document.getElementById("edit-tiles-list");

const itemSetsLockedNote = document.getElementById("item-sets-locked-note");
const itemSetsCreateForm = document.getElementById("item-sets-create-form");
const itemSetNameInput = document.getElementById("item-set-name-input");
const createItemSetBtn = document.getElementById("create-item-set-btn");
const itemSetsManagementList = document.getElementById("item-sets-management-list");

let currentClanId = null;
let currentEventId = null;
let currentIgn = null;
// Set only when a Dev opened this page via dev.html's "Act as Admin" link
// (login.html?actAsClan=<id>&actAsEvent=<id>) — overrides the clan/event
// that would otherwise come from the session's own app_metadata, which for
// a pure Dev session has no clan_id/event_id at all. See loadBoard().
let actingAsDevClanId = null;
let actingAsDevEventId = null;
let tiles = [];
let brackets = [];
let resolvedItemsById = {}; // items.id -> row, populated for every item id referenced by a currently-loaded tile
let itemSets = [];

// Lazily loaded on first item-search interaction (a full pull of the OSRS
// Wiki's item index — see wikiItems.js), then cached for the rest of the
// session rather than reloaded per search.
let wikiIndex = null;
let wikiIndexLoading = null;

// Add-Tile form's item picker: selected ids and the item search box's last
// results (looked up by index when "Add" is clicked).
let addTileSelectedItemIds = [];
let addTileItemSearchResults = [];
let addTileItemSearchDebounceTimer = null;

// Inline tile-edit form's item picker — only one tile is ever in edit mode
// at a time, so module-level state (not per-card) is enough, same as
// editingTileId itself.
let editSelectedItemIds = [];
let editItemSearchResults = [];
let editItemSearchDebounceTimer = null;
let progressByTileId = {};
let signupsByTileId = {};
let leaderboard = [];
let bracketBreakdown = [];
let pointsOverTime = [];
let currentEventStartTime = null;
let currentEventEndTime = null;
let editingTileId = null; // tile currently showing its inline edit form, if any
let editingBracketId = null; // bracket currently showing its inline edit form, if any
let itemsBySetId = {}; // set id -> array of item rows currently in that set (admin Item Sets section)
let editingItemSetId = null; // item set currently showing its inline rename form, if any
let itemSetSearchResultsBySetId = {}; // last search results per (set id, doll slot) - { [setId]: { [slot]: results } }
let itemSetSearchDebounceTimer = null;
let isEventLocked = false; // event has started -> item_sets management is Dev-only (RLS-enforced; this just drives the UI)
let hideCompletedView = false; // independent per-pane, so a player can hide completed tiles on the board while an admin still sees them all on Progress
let hideCompletedProgress = false;

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tileTypeLabel(tileType) {
  return tileType
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

// Checkboxes (not a native <select multiple>) for item/set pickers — a
// plain click on <select multiple> options deselects everything else
// unless you hold ctrl/cmd, which isn't discoverable; checkboxes need no
// modifier key.
function getCheckedValues(containerEl) {
  return [...containerEl.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
}

async function ensureWikiIndexLoaded() {
  if (wikiIndex) return wikiIndex;
  if (!wikiIndexLoading) wikiIndexLoading = loadWikiItemIndex(fetch);
  wikiIndex = await wikiIndexLoading;
  return wikiIndex;
}

// Live wiki-search results for the item picker (replaces the old
// checkbox-per-item list — with ~16,500 wiki items, pre-rendering them all
// as checkboxes isn't viable). Already-selected local items are filtered
// out so a re-search doesn't offer to "Add" something already picked; a
// wiki-source result has no local id yet, so it's always shown.
function itemSearchResultsHtml(results, selectedIds) {
  const visible = results.filter((r) => !(r.source === "local" && selectedIds.includes(r.id)));
  if (!visible.length) return "<p class=\"dev-empty\">No matches</p>";
  return visible.map((r, i) => `
    <div class="checkbox-row">
      ${r.photoUrl ? `<img src="${escapeAttr(r.photoUrl)}" class="item-thumb" alt="" referrerpolicy="no-referrer">` : ""}
      <span>${escapeAttr(r.name)}${r.source === "wiki" ? " <em>(from wiki)</em>" : ""}</span>
      <button class="btn-ghost" data-pick-item-index="${i}">Add</button>
    </div>`).join("");
}

function setCheckboxesHtml(selectedIds = []) {
  return itemSets.map((s) => `
    <label class="checkbox-row">
      <input type="checkbox" value="${s.id}" ${selectedIds.includes(s.id) ? "checked" : ""}>
      ${escapeAttr(s.name)}
    </label>`).join("");
}

// "Selected" column — a live view of exactly what's checked in the "All"
// column, with a quick remove button. Matters once there are thousands of
// items/sets: scrolling a search-filtered "All" list to confirm what you've
// already picked doesn't scale, so Selected is shown separately.
function selectedItemsHtml(selectedIds) {
  if (!selectedIds.length) return "<p class=\"dev-empty\">None selected yet.</p>";
  return selectedIds.map((id) => {
    const item = resolvedItemsById[id];
    if (!item) return "";
    return `
      <div class="selected-chip">
        ${item.photo_url ? `<img src="${escapeAttr(item.photo_url)}" class="item-thumb" alt="" referrerpolicy="no-referrer">` : ""}
        <span>${escapeAttr(item.name)}</span>
        <button class="selected-remove" data-remove-selected="${id}">&times;</button>
      </div>`;
  }).join("");
}

function selectedSetsHtml(selectedIds) {
  if (!selectedIds.length) return "<p class=\"dev-empty\">None selected yet.</p>";
  return selectedIds.map((id) => {
    const set = itemSets.find((s) => s.id === id);
    if (!set) return "";
    return `
      <div class="selected-chip">
        <span>${escapeAttr(set.name)}</span>
        <button class="selected-remove" data-remove-selected="${id}">&times;</button>
      </div>`;
  }).join("");
}

// Builds a tile's config object from raw form field values, keyed by the
// selected tile type — mirrors the shapes isTileComplete() (tileProgress.js)
// expects for each type.
function buildTileConfig(tileType, { target, itemIds, k, setIds, mode }) {
  if (tileType === "complete_x_times") return { target: Number(target) || 1 };
  if (tileType === "collect_one_of_each") return { itemIds };
  if (tileType === "collect_k_of_y") return { itemIds, k: Number(k) || 1 };
  if (tileType === "n_sets") return { setIds, mode };
  return {};
}

function configSummaryText(tile) {
  if (tile.tile_type === "complete_x_times") return `Target: ${tile.config.target}`;
  if (tile.tile_type === "collect_one_of_each") return `${tile.config.itemIds.length} item(s) required`;
  if (tile.tile_type === "collect_k_of_y") return `${tile.config.k} of ${tile.config.itemIds.length} item(s)`;
  if (tile.tile_type === "n_sets") return `${tile.config.setIds.length} set(s), mode: ${tile.config.mode}`;
  return "";
}

function showLoggedIn(ign, role) {
  loginScreen.classList.add("hidden");
  loggedInScreen.classList.remove("hidden");
  currentIgn = ign;
  ignDisplay.textContent = ign;
  roleDisplay.textContent = role;
  adminTabs.classList.toggle("hidden", role !== "admin");
}

function signupsFor(tileId) {
  return signupsByTileId[tileId] ?? [];
}

function progressFor(tileId) {
  return progressByTileId[tileId] ?? {
    tileId,
    clanId: currentClanId,
    currentCount: 0,
    collectedItemIds: [],
    completed: false,
    completedAt: null,
  };
}

// tile_progress.completed is already kept correct by the write functions in
// tileProgress.js (they recompute it via isTileComplete before saving), so
// rendering can just trust the stored value instead of re-deriving it here.
function progressInfoText(tile, progress) {
  if (tile.tile_type === "complete_x_times") {
    return `${progress.currentCount} / ${tile.config.target}`;
  }
  if (["collect_one_of_each", "collect_k_of_y", "n_sets"].includes(tile.tile_type)) {
    return `${progress.collectedItemIds.length} item(s) collected`;
  }
  return "";
}

// Fraction (0-1) of a tile's own completion condition, used to fill its
// progress bar — separate from progress.completed itself so a tile can show
// partial fill (e.g. 3/5) rather than just an all-or-nothing bar.
function progressFraction(tile, progress) {
  if (progress.completed) return 1;
  if (tile.tile_type === "complete_x_times") {
    return Math.min(1, progress.currentCount / tile.config.target);
  }
  if (tile.tile_type === "collect_one_of_each") {
    return Math.min(1, progress.collectedItemIds.length / tile.config.itemIds.length);
  }
  if (tile.tile_type === "collect_k_of_y") {
    return Math.min(1, progress.collectedItemIds.length / tile.config.k);
  }
  return 0; // complete_once (not yet complete) or n_sets, no simple fraction without item-bank data
}

// Groups tiles by their (embedded) bracket, ordered highest points first —
// same visual grouping as v1's fixed 1-5 tiers, but with admin-defined
// brackets instead. Only brackets that actually have tiles are shown.
function groupTilesByBracket(tilesList) {
  const groups = new Map();
  for (const tile of tilesList) {
    const bracket = tile.point_brackets;
    if (!groups.has(bracket.id)) groups.set(bracket.id, { bracket, tiles: [] });
    groups.get(bracket.id).tiles.push(tile);
  }
  return [...groups.values()].sort((a, b) => b.bracket.points - a.bracket.points);
}

function claimantsHtml(tileId) {
  const igns = signupsFor(tileId);
  if (!igns.length) return "";
  return `
    <div class="claimants">
      ${igns.map((ign) => `<span class="claimant ${ign === currentIgn ? "me" : ""}">${escapeAttr(ign)}</span>`).join("")}
    </div>`;
}

function signupButtonHtml(tileId) {
  const signedUp = signupsFor(tileId).includes(currentIgn);
  return signedUp
    ? `<button class="btn-unclaim" data-drop-signup="${tileId}">Drop task</button>`
    : `<button class="btn-claim" data-signup="${tileId}">Work on this</button>`;
}

function tileCardHtml(tile) {
  const progress = progressFor(tile.id);
  const progressText = progressInfoText(tile, progress);
  const fillPct = Math.round(progressFraction(tile, progress) * 100);
  // Read-only from View — clicking to actually mark items collected only
  // happens from the Progress tab, kept separate from board browsing.
  const viewItemsBtn = ITEM_BASED_TYPES.includes(tile.tile_type)
    ? `<button class="btn-ghost" data-view-items="${tile.id}">View Items/Sets</button>`
    : "";

  return `
    <div class="tile-card ${progress.completed ? "complete" : signupsFor(tile.id).length ? "claimed" : ""}">
      <div class="tile-top">
        <span class="tile-task">${escapeAttr(tile.name)}</span>
        <span class="status-badge ${progress.completed ? "done" : "open"}">${progress.completed ? "Done" : "Open"}</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${fillPct}%"></div></div>
      ${progressText ? `<span class="progress-info">${progressText}</span>` : ""}
      ${claimantsHtml(tile.id)}
      ${viewItemsBtn}
      ${!progress.completed ? signupButtonHtml(tile.id) : ""}
    </div>`;
}

function tileGroupHtml(group, cardHtmlFn) {
  return `
    <section class="tile-group">
      <h2 class="group-header">
        <span class="pts-badge generic">${group.bracket.points} pts</span>
        ${escapeAttr(group.bracket.label)}
      </h2>
      <div class="tile-grid">${group.tiles.map(cardHtmlFn).join("")}</div>
    </section>`;
}

function visibleTiles(hideCompleted) {
  return hideCompleted ? tiles.filter((t) => !progressFor(t.id).completed) : tiles;
}

function renderBoard() {
  const groups = groupTilesByBracket(visibleTiles(hideCompletedView));
  boardGrid.innerHTML = groups.length
    ? groups.map((g) => tileGroupHtml(g, tileCardHtml)).join("")
    : "<p class=\"dev-empty\">No tiles to show.</p>";
}

// Same tile-card look as the View board, plus Edit/Delete — or, for the
// tile currently being edited, an inline form in place of the card.
function editTileCardHtml(tile) {
  if (tile.id === editingTileId) return editTileFormHtml(tile);

  const configSummary = configSummaryText(tile);
  return `
    <div class="tile-card">
      <div class="tile-top">
        <span class="tile-task">${escapeAttr(tile.name)}</span>
        <span class="status-badge open">${tileTypeLabel(tile.tile_type)}</span>
      </div>
      ${configSummary ? `<span class="progress-info">${configSummary}</span>` : ""}
      <span class="dev-row-actions">
        <button class="btn-ghost" data-edit-tile="${tile.id}">Edit</button>
        <button class="btn-ghost" data-delete-tile="${tile.id}">Delete</button>
      </span>
    </div>`;
}

function bracketOptionsHtml(selectedBracketId) {
  return [...brackets]
    .sort((a, b) => b.points - a.points)
    .map((b) => `<option value="${b.id}" ${b.id === selectedBracketId ? "selected" : ""}>${escapeAttr(b.label)} (${b.points} pts)</option>`)
    .join("");
}

function editTileFormHtml(tile) {
  const type = tile.tile_type;
  const isXTimes = type === "complete_x_times";
  const isCollectOne = type === "collect_one_of_each";
  const isCollectK = type === "collect_k_of_y";
  const isNSets = type === "n_sets";
  const selectedSetIds = isNSets ? tile.config.setIds : [];
  const mode = isNSets ? tile.config.mode : "one_of_each";

  return `
    <div class="tile-card editing">
      <div class="dev-form tile-edit-form">
        <input class="tile-edit-name" value="${escapeAttr(tile.name)}" placeholder="Tile name">
        <select class="tile-edit-bracket">${bracketOptionsHtml(tile.bracket_id)}</select>
        <select class="tile-edit-type">
          <option value="complete_once" ${type === "complete_once" ? "selected" : ""}>Complete Once</option>
          <option value="complete_x_times" ${isXTimes ? "selected" : ""}>Complete X Times</option>
          <option value="collect_one_of_each" ${isCollectOne ? "selected" : ""}>Collect One Of Each</option>
          <option value="collect_k_of_y" ${isCollectK ? "selected" : ""}>Collect K Of Y</option>
          <option value="n_sets" ${isNSets ? "selected" : ""}>N Sets</option>
        </select>
        <input
          class="tile-edit-target ${isXTimes ? "" : "hidden"}"
          type="number" min="1" placeholder="Target count"
          value="${isXTimes ? tile.config.target : ""}">
        <input
          class="tile-edit-k ${isCollectK ? "" : "hidden"}"
          type="number" min="1" placeholder="K (how many needed)"
          value="${isCollectK ? tile.config.k : ""}">
        <select class="tile-edit-mode ${isNSets ? "" : "hidden"}">
          <option value="one_of_each" ${mode === "one_of_each" ? "selected" : ""}>One of each set</option>
          <option value="full_set" ${mode === "full_set" ? "selected" : ""}>One full set</option>
          <option value="either" ${mode === "either" ? "selected" : ""}>Either</option>
        </select>
        <span class="dev-row-actions">
          <button class="btn-ghost" data-save-tile="${tile.id}">Save</button>
          <button class="btn-ghost" data-cancel-edit="${tile.id}">Cancel</button>
        </span>
      </div>
      <div class="tile-edit-items-picker picker-columns ${isCollectOne || isCollectK ? "" : "hidden"}">
        <div class="picker-column">
          <p class="dev-muted">Search items to add</p>
          <input type="text" class="checkbox-search item-wiki-search tile-edit-items-search" placeholder="Search the OSRS Wiki...">
          <div class="tile-edit-items checkbox-list"></div>
        </div>
        <div class="picker-column">
          <p class="dev-muted">Selected (<span class="tile-edit-items-count">${editSelectedItemIds.length}</span>)</p>
          <div class="tile-edit-items-selected selected-list">${selectedItemsHtml(editSelectedItemIds)}</div>
        </div>
      </div>
      <div class="tile-edit-sets-picker picker-columns ${isNSets ? "" : "hidden"}">
        <div class="picker-column">
          <p class="dev-muted">All Sets</p>
          <input type="text" class="checkbox-search tile-edit-sets-search" placeholder="Search sets...">
          <div class="tile-edit-sets checkbox-list">${setCheckboxesHtml(selectedSetIds)}</div>
        </div>
        <div class="picker-column">
          <p class="dev-muted">Selected (<span class="tile-edit-sets-count">${selectedSetIds.length}</span>)</p>
          <div class="tile-edit-sets-selected selected-list">${selectedSetsHtml(selectedSetIds)}</div>
        </div>
      </div>
    </div>`;
}

function renderEditTiles() {
  const groups = groupTilesByBracket(tiles);
  editTilesList.innerHTML = groups.length
    ? groups.map((g) => tileGroupHtml(g, editTileCardHtml)).join("")
    : "<p class=\"dev-empty\">No tiles yet.</p>";
}

// Admin-owned item sets, per Liel's request: admins can build sets while
// setting up (create/rename/delete, add/remove members via the same wiki
// search as the tile picker), but that stops once their event has started
// (isEventLocked, computed in loadBoard()) — only the Dev dashboard can
// still touch sets after that. RLS is the real enforcement (see
// item_sets_write/item_set_members_write in rls.sql); this only hides/
// disables the controls so a locked admin isn't shown buttons that would
// just fail server-side.
// Same idea as itemSearchResultsHtml, but scoped to a specific set — unlike
// the tile-edit form (only one ever open at a time), multiple item-set
// cards can be on screen at once, so the "Add" button needs to say which
// set it belongs to.
function slotLabel(slot) {
  return slot === "other" ? "Other (non-equipment)" : slot[0].toUpperCase() + slot.slice(1);
}

function itemSetSearchResultsHtml(results, existingMemberIds, setId, slot) {
  const visible = results.filter((r) => !(r.source === "local" && existingMemberIds.includes(r.id)));
  if (!visible.length) return "<p class=\"dev-empty\">No matches</p>";
  return visible.map((r, i) => `
    <div class="checkbox-row">
      ${r.photoUrl ? `<img src="${escapeAttr(r.photoUrl)}" alt="" class="item-thumb" referrerpolicy="no-referrer">` : ""}
      <span>${escapeAttr(r.name)}${r.equipmentSlot === "2h" ? " (2h)" : ""}${r.source === "wiki" ? " <em>(from wiki)</em>" : ""}</span>
      <button class="btn-ghost" data-pick-result-index="${i}" data-pick-set-id="${escapeAttr(setId)}" data-pick-slot="${slot}">Add</button>
    </div>`).join("");
}

// One equipment-doll cell — mirrors dev.js's dollSlotHtml, plus isEventLocked
// gating (no search box or remove buttons once the admin's event has
// started; see renderItemSetsManagement's note above).
function dollSlotHtml(setId, slot, members, extraClass = "") {
  return `
    <div class="doll-slot ${extraClass}" data-slot="${slot}">
      <p class="doll-slot-label">${slotLabel(slot)}</p>
      <div class="doll-slot-members">
        ${members.length
          ? members.map((m) => `
            <div class="selected-chip">
              ${m.photo_url ? `<img src="${escapeAttr(m.photo_url)}" alt="" class="item-thumb" referrerpolicy="no-referrer">` : ""}
              <span>${escapeAttr(m.name)}${m.equipment_slot === "2h" ? " (2h)" : ""}</span>
              ${isEventLocked ? "" : `<button class="selected-remove" data-remove-member="${m.id}" data-set-id="${setId}">&times;</button>`}
            </div>`).join("")
          : "<p class=\"dev-empty\">Empty</p>"}
      </div>
      ${isEventLocked ? "" : `
        <input type="text" class="checkbox-search item-set-add-search" data-set-id="${setId}" data-slot="${slot}" placeholder="Search ${slotLabel(slot).toLowerCase()}..." autocomplete="off">
        <div class="checkbox-list item-set-add-results" data-set-id="${setId}" data-slot="${slot}"></div>`}
    </div>`;
}

function itemSetManagementCardHtml(set) {
  if (set.id === editingItemSetId) return itemSetManagementFormHtml(set);

  const members = itemsBySetId[set.id] || [];
  const grouped = groupBySlotBucket(members, (m) => m.equipment_slot);

  return `
    <div class="dev-event-card">
      <h3>
        ${escapeAttr(set.name)}
        ${isEventLocked ? "" : `
          <button class="btn-ghost" data-edit-item-set="${set.id}">Rename</button>
          <button class="btn-ghost" data-delete-item-set="${set.id}">Delete</button>`}
      </h3>
      <div class="equipment-doll">
        ${EQUIPMENT_SLOTS.map((slot) => dollSlotHtml(set.id, slot, grouped[slot])).join("")}
      </div>
      ${dollSlotHtml(set.id, "other", grouped.other, "doll-slot-other")}
    </div>`;
}

function itemSetManagementFormHtml(set) {
  return `
    <div class="dev-event-card">
      <div class="dev-form">
        <input class="item-set-edit-name" value="${escapeAttr(set.name)}" placeholder="Set name">
        <button class="btn-ghost" data-save-item-set="${set.id}">Save</button>
        <button class="btn-ghost" data-cancel-edit-item-set="${set.id}">Cancel</button>
      </div>
    </div>`;
}

function renderItemSetsManagement() {
  itemSetsLockedNote.classList.toggle("hidden", !isEventLocked);
  itemSetsCreateForm.classList.toggle("hidden", isEventLocked);
  itemSetsManagementList.innerHTML = itemSets.length
    ? itemSets.map(itemSetManagementCardHtml).join("")
    : "<p class=\"dev-empty\">No item sets yet.</p>";
}

async function handleCreateItemSet() {
  const name = itemSetNameInput.value.trim();
  if (!name) return;

  createItemSetBtn.disabled = true;
  try {
    await createItemSet(supabase, { name });
    itemSetNameInput.value = "";
    await loadBoard();
  } finally {
    createItemSetBtn.disabled = false;
  }
}

// Debounced live wiki search for a set's add-member box — same approach as
// handleTileItemsSearchInput, scoped to the specific set card searched in
// (multiple set cards can exist at once, unlike the single tile-edit form).
function handleItemSetSearchInput(e) {
  if (!e.target.classList.contains("item-set-add-search")) return;
  const setId = e.target.dataset.setId;
  const slot = e.target.dataset.slot;
  const query = e.target.value;

  clearTimeout(itemSetSearchDebounceTimer);
  itemSetSearchDebounceTimer = setTimeout(async () => {
    const resultsEl = itemSetsManagementList.querySelector(`.item-set-add-results[data-set-id="${setId}"][data-slot="${slot}"]`);
    if (!resultsEl) return;

    (itemSetSearchResultsBySetId[setId] ??= {})[slot] = [];
    if (!query.trim()) {
      resultsEl.innerHTML = "";
      return;
    }

    resultsEl.innerHTML = wikiIndex ? "" : "<p class=\"dev-empty\">Loading wiki item index…</p>";
    await ensureWikiIndexLoaded();
    if (itemSetsManagementList.querySelector(`.item-set-add-search[data-set-id="${setId}"][data-slot="${slot}"]`)?.value !== query) return;

    const allResults = await searchPickableItems(supabase, wikiIndex, query);
    const results = allResults.filter((r) => slotBucketFor(r.equipmentSlot) === slot);
    itemSetSearchResultsBySetId[setId][slot] = results;
    resultsEl.innerHTML = itemSetSearchResultsHtml(results, (itemsBySetId[setId] || []).map((m) => m.id), setId, slot);
  }, 250);
}

async function handleItemSetsManagementListClick(e) {
  const deleteSetId = e.target.dataset.deleteItemSet;
  if (deleteSetId) {
    if (confirm("Delete this item set? Any tiles referencing it will need to be updated separately.")) {
      await deleteItemSet(supabase, deleteSetId);
      await loadBoard();
    }
    return;
  }

  const editSetId = e.target.dataset.editItemSet;
  if (editSetId) {
    editingItemSetId = editSetId;
    renderItemSetsManagement();
    return;
  }

  const cancelSetId = e.target.dataset.cancelEditItemSet;
  if (cancelSetId) {
    editingItemSetId = null;
    renderItemSetsManagement();
    return;
  }

  const saveSetId = e.target.dataset.saveItemSet;
  if (saveSetId) {
    const card = e.target.closest(".dev-event-card");
    const name = card.querySelector(".item-set-edit-name").value.trim();
    if (!name) return;

    await updateItemSet(supabase, saveSetId, { name });
    editingItemSetId = null;
    await loadBoard();
    return;
  }

  const removeMemberItemId = e.target.dataset.removeMember;
  if (removeMemberItemId) {
    const setId = e.target.dataset.setId;
    await removeItemFromSet(supabase, setId, removeMemberItemId);
    await loadBoard();
    return;
  }

  const pickSetId = e.target.dataset.pickSetId;
  if (pickSetId) {
    const slot = e.target.dataset.pickSlot;
    const result = (itemSetSearchResultsBySetId[pickSetId]?.[slot] || [])[Number(e.target.dataset.pickResultIndex)];
    if (!result) return;

    e.target.disabled = true;
    const item = await resolvePickedItem(supabase, result);
    await addItemToSet(supabase, pickSetId, item.id);
    await loadBoard();
  }
}

// Progress tab: only the item/set-based tiles, each with a "View Items/Sets"
// button that opens the modal in interactive (click-to-collect) mode.
// Progress tab now mirrors the full View board (all 5 tile types), each
// with the interaction appropriate to its type — a plain toggle/±1 button
// for the two counter types, the item/set modal for the other three.
function progressTileCardHtml(tile) {
  const progress = progressFor(tile.id);
  const progressText = progressInfoText(tile, progress);
  const fillPct = Math.round(progressFraction(tile, progress) * 100);

  let controls = "";
  if (tile.tile_type === "complete_once") {
    controls = progress.completed
      ? `<button class="btn-ghost" data-unmark-complete="${tile.id}">Mark Not Done</button>`
      : `<button class="btn-ghost" data-mark-complete="${tile.id}">Mark Done</button>`;
  } else if (tile.tile_type === "complete_x_times") {
    controls = `
      <span class="dev-row-actions">
        <button class="btn-ghost" data-decrement="${tile.id}" ${progress.currentCount <= 0 ? "disabled" : ""}>-1</button>
        <button class="btn-ghost" data-increment="${tile.id}">+1</button>
      </span>`;
  } else if (ITEM_BASED_TYPES.includes(tile.tile_type)) {
    controls = `<button class="btn-ghost" data-view-items="${tile.id}">View Items/Sets</button>`;
  }

  return `
    <div class="tile-card ${progress.completed ? "complete" : ""}">
      <div class="tile-top">
        <span class="tile-task">${escapeAttr(tile.name)}</span>
        <span class="status-badge ${progress.completed ? "done" : "open"}">${progress.completed ? "Done" : "Open"}</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${fillPct}%"></div></div>
      ${progressText ? `<span class="progress-info">${progressText}</span>` : ""}
      ${controls}
    </div>`;
}

function renderProgressTiles() {
  const groups = groupTilesByBracket(visibleTiles(hideCompletedProgress));
  progressTilesList.innerHTML = groups.length
    ? groups.map((g) => tileGroupHtml(g, progressTileCardHtml)).join("")
    : "<p class=\"dev-empty\">No tiles to show.</p>";
}

// Leaderboard is cross-clan (totals only, via the guarded clan_totals() RPC)
// — safe to show every clan's rank/points, just not their per-bracket detail.
function leaderboardItemHtml(entry, rank) {
  return `
    <li class="${entry.clanId === currentClanId ? "leaderboard-me" : ""}">
      <span>#${rank} ${escapeAttr(entry.displayName)}</span>
      <span>${entry.totalPoints} pts</span>
    </li>`;
}

function renderLeaderboard() {
  leaderboardList.innerHTML = leaderboard.length
    ? leaderboard.map((entry, i) => leaderboardItemHtml(entry, i + 1)).join("")
    : "<li class=\"dev-empty\">No clans yet.</li>";
}

function breakdownItemHtml(group) {
  const fillPct = group.totalCount ? Math.round((group.completedCount / group.totalCount) * 100) : 0;
  return `
    <li>
      <span>${escapeAttr(group.label)} (${group.points} pts) — ${group.completedCount}/${group.totalCount}</span>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${fillPct}%"></div></div>
    </li>`;
}

function renderBreakdown() {
  breakdownList.innerHTML = bracketBreakdown.length
    ? bracketBreakdown.map(breakdownItemHtml).join("")
    : "<li class=\"dev-empty\">No brackets yet.</li>";
}

// Rounds a raw per-tick step up to a "nice" number (1/2/5/10 x a power of
// ten) so the y-axis reads e.g. 0/20/40/60 instead of 0/17/34/51.
function niceStep(maxValue, targetTicks = 5) {
  if (maxValue <= 0) return 1;
  const rawStep = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}

function formatAxisTime(ms, spanMs) {
  const d = new Date(ms);
  return spanMs > 3 * 86400000
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatPointTime(ms) {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Hand-rolled SVG line chart -- no charting library, this project has no
// build tooling. The x-axis always spans domainStartMs -> domainEndMs (the
// event's start time -> now, capped at the event's end time) regardless of
// where the actual data stops, so the chart visibly spreads out as time
// passes rather than always stretching to fit whatever's been completed so
// far. Each point's exact value/time shows on click (handleChartPointClick),
// not hover -- hover just lights the dot up (see .chart-point:hover in
// style.css) as a visual cue that it's clickable.
function pointsChartSvg(series, domainStartMs, domainEndMs) {
  if (series.length < 2) return "<p class=\"dev-empty\">No completions yet.</p>";

  const width = 600;
  const height = 260;
  const padLeft = 46;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 40;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const timeSpan = domainEndMs - domainStartMs || 1;
  const rawMax = Math.max(...series.map((p) => p.cumulativePoints), 1);
  const yStep = niceStep(rawMax);
  const yMax = Math.max(Math.ceil(rawMax / yStep) * yStep, yStep);

  const x = (t) => padLeft + ((t - domainStartMs) / timeSpan) * plotWidth;
  const y = (p) => padTop + plotHeight - (p / yMax) * plotHeight;

  const yTickCount = Math.round(yMax / yStep);
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => i * yStep);
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => domainStartMs + (timeSpan * i) / xTickCount);

  const yGridlines = yTicks.map((v) => `
    <line x1="${padLeft}" y1="${y(v)}" x2="${width - padRight}" y2="${y(v)}" style="stroke:var(--border);stroke-width:1"></line>
    <text x="${padLeft - 8}" y="${y(v)}" text-anchor="end" dominant-baseline="middle" style="fill:var(--text-muted);font-size:11px">${v}</text>`).join("");

  const xLabels = xTicks.map((t) => `
    <text x="${x(t)}" y="${height - padBottom + 18}" text-anchor="middle" style="fill:var(--text-muted);font-size:11px">${escapeAttr(formatAxisTime(t, timeSpan))}</text>`).join("");

  const coords = series.map((p) => {
    const ms = new Date(p.time).getTime();
    return [x(ms), y(p.cumulativePoints), p.cumulativePoints, ms];
  });
  const polylinePoints = coords.map(([cx, cy]) => `${cx},${cy}`).join(" ");
  const circles = coords.map(([cx, cy, pts, ms]) => `
    <circle class="chart-point" cx="${cx}" cy="${cy}" r="4" data-pts="${pts}" data-time="${escapeAttr(formatPointTime(ms))}"></circle>`).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="points-chart-svg">
      <text x="${padLeft}" y="${padTop - 6}" style="fill:var(--text-muted);font-size:11px">Points</text>
      <text x="${width - padRight}" y="${height - 2}" text-anchor="end" style="fill:var(--text-muted);font-size:11px">Time</text>
      ${yGridlines}
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" style="stroke:var(--border);stroke-width:1"></line>
      <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" style="stroke:var(--border);stroke-width:1"></line>
      ${xLabels}
      <polyline points="${polylinePoints}" style="fill:none;stroke:var(--gold);stroke-width:2"></polyline>
      ${circles}
    </svg>`;
}

function renderPointsChart() {
  const domainStartMs = new Date(currentEventStartTime).getTime();
  const domainEndMs = Math.min(Date.now(), new Date(currentEventEndTime).getTime());
  pointsChart.innerHTML = pointsChartSvg(pointsOverTime, domainStartMs, domainEndMs);
  pointsChartInfo.textContent = "Click a point on the graph to see its exact points and time.";
}

function handleChartPointClick(e) {
  const point = e.target.closest(".chart-point");
  if (!point) return;
  pointsChartInfo.textContent = `${point.dataset.pts} pts — ${point.dataset.time}`;
}

function renderAnalytics() {
  renderLeaderboard();
  renderBreakdown();
  renderPointsChart();
}

async function handleProgressTilesListClick(e) {
  const viewItemsTileId = e.target.dataset.viewItems;
  if (viewItemsTileId) {
    openItemModal(viewItemsTileId, true);
    return;
  }

  const markCompleteTileId = e.target.dataset.markComplete;
  if (markCompleteTileId) {
    await markTileComplete(supabase, markCompleteTileId, currentClanId);
    await loadBoard();
    return;
  }

  const unmarkCompleteTileId = e.target.dataset.unmarkComplete;
  if (unmarkCompleteTileId) {
    await unmarkTileComplete(supabase, unmarkCompleteTileId, currentClanId);
    await loadBoard();
    return;
  }

  const incrementTileId = e.target.dataset.increment;
  if (incrementTileId) {
    const tile = tiles.find((t) => t.id === incrementTileId);
    if (!tile) return;
    await incrementTileProgress(supabase, toTileForLogic(tile), currentClanId, 1);
    await loadBoard();
    return;
  }

  const decrementTileId = e.target.dataset.decrement;
  if (decrementTileId) {
    const tile = tiles.find((t) => t.id === decrementTileId);
    if (!tile) return;
    await incrementTileProgress(supabase, toTileForLogic(tile), currentClanId, -1);
    await loadBoard();
  }
}

// tileProgress.js's functions expect {id, tileType, config} (camelCase) —
// raw tile rows from listTiles() are snake_case (tile_type).
function toTileForLogic(tile) {
  return { id: tile.id, tileType: tile.tile_type, config: tile.config };
}

// isTileComplete's n_sets branch needs setId -> itemId[] — resolved here
// from item_set_members rather than kept preloaded, since it's only needed
// while the modal for an n_sets tile is open.
async function buildItemsBySet(setIds) {
  const entries = await Promise.all(
    setIds.map(async (setId) => [setId, (await listItemsInSet(supabase, setId)).map((i) => i.id)]),
  );
  return Object.fromEntries(entries);
}

// Once a tile is complete, every collected item shows the same "confirmed"
// color — no attempt to single out exactly which items technically
// triggered it (e.g. exactly k of an over-collected set).
function itemChipHtml(item, progress, tileCompleted, interactive) {
  const isCollected = progress.collectedItemIds.includes(item.id);
  const stateClass = isCollected ? (tileCompleted ? "item-confirmed" : "item-collected") : "";
  return `
    <div class="item-chip ${stateClass} ${interactive ? "clickable" : ""}" ${interactive ? `data-toggle-item="${item.id}"` : ""}>
      ${item.photo_url ? `<img src="${escapeAttr(item.photo_url)}" class="item-thumb" alt="" referrerpolicy="no-referrer">` : ""}
      <span>${escapeAttr(item.name)}</span>
    </div>`;
}

async function openItemModal(tileId, interactive) {
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) return;
  const progress = progressFor(tileId);

  itemModalTitle.textContent = tile.name;
  itemModalOverlay.dataset.tileId = tileId;
  itemModalOverlay.dataset.interactive = interactive ? "true" : "false";

  if (tile.tile_type === "n_sets") {
    const sections = await Promise.all(tile.config.setIds.map(async (setId) => {
      const set = itemSets.find((s) => s.id === setId);
      const members = await listItemsInSet(supabase, setId);
      return { set, members };
    }));
    itemModalBody.innerHTML = sections.map(({ set, members }) => `
      <div class="modal-set-group">
        <h4>${escapeAttr(set?.name ?? "Unknown set")}</h4>
        <div class="item-chip-grid">${members.map((m) => itemChipHtml(m, progress, progress.completed, interactive)).join("")}</div>
      </div>`).join("");
  } else {
    const members = tile.config.itemIds.map((id) => resolvedItemsById[id]).filter(Boolean);
    itemModalBody.innerHTML = `<div class="item-chip-grid">${members.map((m) => itemChipHtml(m, progress, progress.completed, interactive)).join("")}</div>`;
  }

  itemModalOverlay.classList.remove("hidden");
}

function closeItemModal() {
  itemModalOverlay.classList.add("hidden");
}

async function handleItemChipClick(e) {
  if (itemModalOverlay.dataset.interactive !== "true") return;
  const chip = e.target.closest("[data-toggle-item]");
  if (!chip) return;

  const itemId = chip.dataset.toggleItem;
  const tileId = itemModalOverlay.dataset.tileId;
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) return;

  const progress = progressFor(tileId);
  const tileForLogic = toTileForLogic(tile);
  const itemsBySet = tile.tile_type === "n_sets" ? await buildItemsBySet(tile.config.setIds) : undefined;

  if (progress.collectedItemIds.includes(itemId)) {
    await uncollectItemForTile(supabase, tileForLogic, currentClanId, itemId, itemsBySet);
  } else {
    await collectItemForTile(supabase, tileForLogic, currentClanId, itemId, itemsBySet);
  }

  await loadBoard();
  await openItemModal(tileId, true);
}

function bracketRowHtml(bracket) {
  if (bracket.id === editingBracketId) return bracketFormHtml(bracket);

  return `
    <li>
      <span>${escapeAttr(bracket.label)} — ${bracket.points} pts</span>
      <span class="dev-row-actions">
        <button class="btn-ghost" data-edit-bracket="${bracket.id}">Edit</button>
        <button class="btn-ghost" data-delete-bracket="${bracket.id}">Delete</button>
      </span>
    </li>`;
}

function bracketFormHtml(bracket) {
  return `
    <li>
      <span class="dev-form">
        <input class="bracket-edit-label" value="${escapeAttr(bracket.label)}" placeholder="Label">
        <input class="bracket-edit-points" type="number" min="1" value="${bracket.points}" placeholder="Points">
        <button class="btn-ghost" data-save-bracket="${bracket.id}">Save</button>
        <button class="btn-ghost" data-cancel-edit-bracket="${bracket.id}">Cancel</button>
      </span>
    </li>`;
}

function renderBrackets() {
  bracketsList.innerHTML = brackets.length
    ? [...brackets].sort((a, b) => b.points - a.points).map(bracketRowHtml).join("")
    : "<li class=\"dev-empty\">No point brackets yet</li>";

  tileBracketSelect.innerHTML = bracketOptionsHtml(tileBracketSelect.value);
  const hasBrackets = brackets.length > 0;
  createTileBtn.disabled = !hasBrackets;
  noBracketsNote.classList.toggle("hidden", hasBrackets);
}

// Populates the Add Tile form's item/set pickers — preserves whatever was
// already selected across a loadBoard() refresh (e.g. after creating a
// tile fails validation) rather than always resetting them.
function renderItemPickers() {
  tileItemsSelect.innerHTML = itemSearchResultsHtml(addTileItemSearchResults, addTileSelectedItemIds);
  updateSelectedItemsPanel();
  tileSetsSelect.innerHTML = setCheckboxesHtml(getCheckedValues(tileSetsSelect));
  updateSelectedSetsPanel();
}

function updateSelectedItemsPanel() {
  tileItemsSelected.innerHTML = selectedItemsHtml(addTileSelectedItemIds);
  tileItemsSelectedCount.textContent = addTileSelectedItemIds.length;
}

// Live wiki search for the Add-Tile item picker — debounced (network-backed,
// unlike handleChecklistSearch's plain client-side filter for sets below).
function handleTileItemsSearchInput(e) {
  if (e.target !== tileItemsSearch) return;
  const query = e.target.value;

  clearTimeout(addTileItemSearchDebounceTimer);
  addTileItemSearchDebounceTimer = setTimeout(async () => {
    if (!query.trim()) {
      addTileItemSearchResults = [];
      tileItemsSelect.innerHTML = "";
      return;
    }

    tileItemsSelect.innerHTML = wikiIndex ? "" : "<p class=\"dev-empty\">Loading wiki item index…</p>";
    await ensureWikiIndexLoaded();
    if (tileItemsSearch.value !== query) return; // stale — the box moved on while the index (first time only) loaded

    addTileItemSearchResults = await searchPickableItems(supabase, wikiIndex, query);
    tileItemsSelect.innerHTML = itemSearchResultsHtml(addTileItemSearchResults, addTileSelectedItemIds);
  }, 250);
}

async function handleTileItemsSelectClick(e) {
  const index = e.target.dataset.pickItemIndex;
  if (index === undefined) return;
  const result = addTileItemSearchResults[Number(index)];
  if (!result) return;

  e.target.disabled = true;
  const item = await resolvePickedItem(supabase, result);
  resolvedItemsById[item.id] = item;
  if (!addTileSelectedItemIds.includes(item.id)) addTileSelectedItemIds.push(item.id);
  tileItemsSelect.innerHTML = itemSearchResultsHtml(addTileItemSearchResults, addTileSelectedItemIds);
  updateSelectedItemsPanel();
}

function updateSelectedSetsPanel() {
  const selectedIds = getCheckedValues(tileSetsSelect);
  tileSetsSelected.innerHTML = selectedSetsHtml(selectedIds);
  tileSetsSelectedCount.textContent = selectedIds.length;
}

// Toggle which Add Tile fields are visible for the currently selected type.
function updateTileFormFieldsVisibility() {
  const type = tileTypeSelect.value;
  const showItems = ["collect_one_of_each", "collect_k_of_y"].includes(type);
  const showSets = type === "n_sets";
  tileTargetInput.classList.toggle("hidden", type !== "complete_x_times");
  tileItemsPicker.classList.toggle("hidden", !showItems);
  tileKInput.classList.toggle("hidden", type !== "collect_k_of_y");
  tileSetsPicker.classList.toggle("hidden", !showSets);
  tileModeSelect.classList.toggle("hidden", !showSets);
}

// Filters a checkbox-list's visible rows by the paired search input's value
// — delegated on the document since inline tile-edit forms come and go.
function handleChecklistSearch(e) {
  // Item search boxes carry checkbox-search too (shared styling) but get
  // their own async, wiki-backed handler instead of this plain client-side
  // filter — see handleTileItemsSearchInput / handleEditItemsSearchInput.
  if (!e.target.classList.contains("checkbox-search") || e.target.classList.contains("item-wiki-search")) return;
  const query = e.target.value.trim().toLowerCase();
  const list = e.target.nextElementSibling;
  if (!list) return;
  list.querySelectorAll(".checkbox-row").forEach((row) => {
    row.classList.toggle("hidden", query.length > 0 && !row.textContent.trim().toLowerCase().includes(query));
  });
}

// Live wiki search for the inline tile-edit form's item picker — same
// approach as handleTileItemsSearchInput, scoped to whichever card is
// currently being edited (only one at a time, per editingTileId).
function handleEditItemsSearchInput(e) {
  if (!e.target.classList.contains("tile-edit-items-search")) return;
  const card = e.target.closest(".tile-card");
  const query = e.target.value;

  clearTimeout(editItemSearchDebounceTimer);
  editItemSearchDebounceTimer = setTimeout(async () => {
    const resultsEl = card.querySelector(".tile-edit-items");
    if (!resultsEl) return;

    if (!query.trim()) {
      editItemSearchResults = [];
      resultsEl.innerHTML = "";
      return;
    }

    resultsEl.innerHTML = wikiIndex ? "" : "<p class=\"dev-empty\">Loading wiki item index…</p>";
    await ensureWikiIndexLoaded();
    if (card.querySelector(".tile-edit-items-search")?.value !== query) return;

    editItemSearchResults = await searchPickableItems(supabase, wikiIndex, query);
    resultsEl.innerHTML = itemSearchResultsHtml(editItemSearchResults, editSelectedItemIds);
  }, 250);
}

function setViewMode(mode) {
  viewPane.classList.toggle("hidden", mode !== "view");
  editPane.classList.toggle("hidden", mode !== "edit");
  progressPane.classList.toggle("hidden", mode !== "progress");
  analyticsPane.classList.toggle("hidden", mode !== "analytics");
  viewTabBtn.classList.toggle("active", mode === "view");
  editTabBtn.classList.toggle("active", mode === "edit");
  progressTabBtn.classList.toggle("active", mode === "progress");
  analyticsTabBtn.classList.toggle("active", mode === "analytics");
}

async function loadBoard() {
  const { data: { session } } = await supabase.auth.getSession();
  const clan_id = actingAsDevClanId ?? session.user.app_metadata.clan_id;
  const event_id = actingAsDevEventId ?? session.user.app_metadata.event_id;
  currentClanId = clan_id;
  currentEventId = event_id;

  const [tileRows, bracketRows, progressRows, signupRows, event, eventClans, itemSetRows, leaderboardRows] = await Promise.all([
    listTiles(supabase, event_id),
    listBrackets(supabase, event_id),
    listClanTileProgress(supabase, clan_id),
    listClanTileSignups(supabase, clan_id),
    getEvent(supabase, event_id),
    listEventClans(supabase, event_id),
    listItemSets(supabase),
    getClanLeaderboard(supabase, event_id),
  ]);
  tiles = tileRows;
  brackets = bracketRows;
  itemSets = itemSetRows;

  // Items are no longer bulk-loaded (search-driven now, see itemPicker.js) —
  // instead, resolve just the ids any currently-loaded tile actually
  // references, so both the View/Progress item modal and the Edit tab's
  // "Selected" chips can always show a picked item's name/photo, even one
  // picked in a past session that isn't in this session's search results.
  const referencedItemIds = tileRows.flatMap((t) =>
    t.tile_type === "collect_one_of_each" || t.tile_type === "collect_k_of_y" ? t.config.itemIds : []
  );
  const resolvedItemRows = await listItemsByIds(supabase, [...new Set(referencedItemIds)]);
  resolvedItemsById = Object.fromEntries(resolvedItemRows.map((row) => [row.id, row]));
  progressByTileId = Object.fromEntries(progressRows.map((p) => [p.tileId, p]));
  signupsByTileId = {};
  for (const s of signupRows) {
    (signupsByTileId[s.tileId] ??= []).push(s.ign);
  }
  leaderboard = leaderboardRows;
  bracketBreakdown = computeBracketBreakdown(tiles, progressByTileId);
  currentEventStartTime = event.start_time_utc ?? event.created_at;
  currentEventEndTime = event.end_time_utc;
  pointsOverTime = computePointsOverTime(tiles, progressRows, currentEventStartTime);
  isEventLocked = new Date() >= new Date(currentEventStartTime);

  const memberLists = await Promise.all(itemSets.map((s) => listItemsInSet(supabase, s.id)));
  itemsBySetId = Object.fromEntries(itemSets.map((s, i) => [s.id, memberLists[i]]));

  const ownClan = eventClans.find((c) => c.clanId === clan_id);
  eventClanDisplay.textContent = ownClan ? `${event.name} — ${ownClan.displayName}` : event.name;

  renderBoard();
  renderBrackets();
  renderItemPickers();
  renderEditTiles();
  renderItemSetsManagement();
  renderProgressTiles();
  renderAnalytics();
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
    await loadBoard();
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

  const params = new URLSearchParams(location.search);
  const actAsClan = params.get("actAsClan");
  const actAsEvent = params.get("actAsEvent");
  if (session?.user?.app_metadata?.is_dev && actAsClan && actAsEvent) {
    actingAsDevClanId = actAsClan;
    actingAsDevEventId = actAsEvent;
    actingAsClanName.textContent = params.get("actAsLabel") ?? "this clan";
    actingAsBanner.classList.remove("hidden");
    logoutBtn.classList.add("hidden"); // signing out here would end the Dev's session in every tab, not just this one
    showLoggedIn("Dev", "admin");
    await loadBoard();
    return;
  }

  const clanRole = session?.user?.app_metadata?.clan_role;
  const ign = session?.user?.app_metadata?.ign;
  if (clanRole) {
    showLoggedIn(ign, clanRole);
    await loadBoard();
  } else {
    showLogin();
  }
}

async function handleCreateBracket() {
  const label = bracketLabelInput.value.trim();
  const points = Number(bracketPointsInput.value);
  if (!label || !points) return;

  createBracketBtn.disabled = true;
  try {
    await createBracket(supabase, currentEventId, { label, points });
    bracketLabelInput.value = "";
    bracketPointsInput.value = "";
    await loadBoard();
  } finally {
    createBracketBtn.disabled = false;
  }
}

async function handleBracketsListClick(e) {
  const deleteBracketId = e.target.dataset.deleteBracket;
  if (deleteBracketId) {
    if (confirm("Delete this point bracket? This only works if no tiles use it.")) {
      try {
        await deleteBracket(supabase, deleteBracketId);
        await loadBoard();
      } catch (err) {
        alert("Couldn't delete this bracket — make sure no tiles are assigned to it first.");
      }
    }
    return;
  }

  const editBracketId = e.target.dataset.editBracket;
  if (editBracketId) {
    editingBracketId = editBracketId;
    renderBrackets();
    return;
  }

  const cancelBracketId = e.target.dataset.cancelEditBracket;
  if (cancelBracketId) {
    editingBracketId = null;
    renderBrackets();
    return;
  }

  const saveBracketId = e.target.dataset.saveBracket;
  if (saveBracketId) {
    const row = e.target.closest("li");
    const label = row.querySelector(".bracket-edit-label").value.trim();
    const points = Number(row.querySelector(".bracket-edit-points").value);
    if (!label || !points) return;

    await updateBracket(supabase, saveBracketId, { label, points });
    editingBracketId = null;
    await loadBoard();
  }
}

async function handleCreateTile() {
  const name = tileNameInput.value.trim();
  const bracketId = tileBracketSelect.value;
  const tileType = tileTypeSelect.value;
  if (!name || !bracketId) return;

  const config = buildTileConfig(tileType, {
    target: tileTargetInput.value,
    itemIds: addTileSelectedItemIds,
    k: tileKInput.value,
    setIds: getCheckedValues(tileSetsSelect),
    mode: tileModeSelect.value,
  });

  createTileBtn.disabled = true;
  try {
    await createTile(supabase, currentEventId, { name, bracketId, tileType, config });
    tileNameInput.value = "";
    tileTargetInput.value = "";
    tileKInput.value = "";
    tileItemsSearch.value = "";
    tileSetsSearch.value = "";
    addTileSelectedItemIds = [];
    addTileItemSearchResults = [];
    tileItemsSelect.innerHTML = "";
    tileSetsSelect.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    await loadBoard();
  } finally {
    createTileBtn.disabled = false;
  }
}

function updateEditSelectedItemsPanel(card) {
  card.querySelector(".tile-edit-items-selected").innerHTML = selectedItemsHtml(editSelectedItemIds);
  card.querySelector(".tile-edit-items-count").textContent = editSelectedItemIds.length;
}

function updateEditSelectedSetsPanel(card) {
  const selectedIds = getCheckedValues(card.querySelector(".tile-edit-sets"));
  card.querySelector(".tile-edit-sets-selected").innerHTML = selectedSetsHtml(selectedIds);
  card.querySelector(".tile-edit-sets-count").textContent = selectedIds.length;
}

async function handleEditTilesListClick(e) {
  const removeSelectedId = e.target.dataset.removeSelected;
  if (removeSelectedId) {
    const card = e.target.closest(".tile-card");
    if (e.target.closest(".tile-edit-items-selected")) {
      editSelectedItemIds = editSelectedItemIds.filter((id) => id !== removeSelectedId);
      updateEditSelectedItemsPanel(card);
      card.querySelector(".tile-edit-items").innerHTML = itemSearchResultsHtml(editItemSearchResults, editSelectedItemIds);
    } else if (e.target.closest(".tile-edit-sets-selected")) {
      const checkbox = card.querySelector(`.tile-edit-sets input[value="${removeSelectedId}"]`);
      if (checkbox) checkbox.checked = false;
      updateEditSelectedSetsPanel(card);
    }
    return;
  }

  const deleteTileId = e.target.dataset.deleteTile;
  if (deleteTileId) {
    if (confirm("Delete this tile? Any progress clans have made on it will be lost.")) {
      await deleteTile(supabase, deleteTileId);
      await loadBoard();
    }
    return;
  }

  const editTileId = e.target.dataset.editTile;
  if (editTileId) {
    editingTileId = editTileId;
    const tile = tiles.find((t) => t.id === editTileId);
    editSelectedItemIds =
      tile?.tile_type === "collect_one_of_each" || tile?.tile_type === "collect_k_of_y" ? [...tile.config.itemIds] : [];
    editItemSearchResults = [];
    renderEditTiles();
    return;
  }

  const cancelTileId = e.target.dataset.cancelEdit;
  if (cancelTileId) {
    editingTileId = null;
    renderEditTiles();
    return;
  }

  const pickItemIndex = e.target.dataset.pickItemIndex;
  if (pickItemIndex !== undefined && e.target.closest(".tile-edit-items")) {
    const result = editItemSearchResults[Number(pickItemIndex)];
    if (!result) return;

    e.target.disabled = true;
    const item = await resolvePickedItem(supabase, result);
    resolvedItemsById[item.id] = item;
    if (!editSelectedItemIds.includes(item.id)) editSelectedItemIds.push(item.id);
    const card = e.target.closest(".tile-card");
    card.querySelector(".tile-edit-items").innerHTML = itemSearchResultsHtml(editItemSearchResults, editSelectedItemIds);
    updateEditSelectedItemsPanel(card);
    return;
  }

  const saveTileId = e.target.dataset.saveTile;
  if (saveTileId) {
    const card = e.target.closest(".tile-card");
    const name = card.querySelector(".tile-edit-name").value.trim();
    const bracketId = card.querySelector(".tile-edit-bracket").value;
    const tileType = card.querySelector(".tile-edit-type").value;
    if (!name || !bracketId) return;

    const config = buildTileConfig(tileType, {
      target: card.querySelector(".tile-edit-target").value,
      itemIds: editSelectedItemIds,
      k: card.querySelector(".tile-edit-k").value,
      setIds: getCheckedValues(card.querySelector(".tile-edit-sets")),
      mode: card.querySelector(".tile-edit-mode").value,
    });

    await updateTile(supabase, saveTileId, { name, bracketId, tileType, config });
    editingTileId = null;
    await loadBoard();
  }
}

// Toggle which fields are visible live as the type dropdown changes, inside
// whichever tile is currently being edited.
function handleEditTilesListChange(e) {
  const card = e.target.closest(".tile-card");
  if (!card) return;

  if (e.target.classList.contains("tile-edit-type")) {
    const type = e.target.value;
    const showItems = ["collect_one_of_each", "collect_k_of_y"].includes(type);
    const showSets = type === "n_sets";
    card.querySelector(".tile-edit-target").classList.toggle("hidden", type !== "complete_x_times");
    card.querySelector(".tile-edit-items-picker").classList.toggle("hidden", !showItems);
    card.querySelector(".tile-edit-k").classList.toggle("hidden", type !== "collect_k_of_y");
    card.querySelector(".tile-edit-sets-picker").classList.toggle("hidden", !showSets);
    card.querySelector(".tile-edit-mode").classList.toggle("hidden", !showSets);
    return;
  }

  // .tile-edit-items no longer contains checkboxes (it's a live search
  // results list now — picking updates state directly, see
  // handleEditTilesListClick's pickItemIndex branch), so no "change" event
  // to react to there. .tile-edit-sets is unchanged.
  if (e.target.closest(".tile-edit-sets")) {
    updateEditSelectedSetsPanel(card);
  }
}

loginBtn.addEventListener("click", handleLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
logoutBtn.addEventListener("click", handleLogout);

viewHideCompletedToggle.addEventListener("change", () => {
  hideCompletedView = viewHideCompletedToggle.checked;
  renderBoard();
});
progressHideCompletedToggle.addEventListener("change", () => {
  hideCompletedProgress = progressHideCompletedToggle.checked;
  renderProgressTiles();
});

viewTabBtn.addEventListener("click", () => setViewMode("view"));
editTabBtn.addEventListener("click", () => setViewMode("edit"));
progressTabBtn.addEventListener("click", () => setViewMode("progress"));
analyticsTabBtn.addEventListener("click", () => setViewMode("analytics"));
pointsChart.addEventListener("click", handleChartPointClick);
tileTypeSelect.addEventListener("change", updateTileFormFieldsVisibility);
tileItemsSearch.addEventListener("input", handleTileItemsSearchInput);
tileSetsSearch.addEventListener("input", handleChecklistSearch);
tileItemsSelect.addEventListener("click", handleTileItemsSelectClick);
tileSetsSelect.addEventListener("change", updateSelectedSetsPanel);
tileItemsSelected.addEventListener("click", (e) => {
  const id = e.target.dataset.removeSelected;
  if (!id) return;
  addTileSelectedItemIds = addTileSelectedItemIds.filter((i) => i !== id);
  updateSelectedItemsPanel();
  tileItemsSelect.innerHTML = itemSearchResultsHtml(addTileItemSearchResults, addTileSelectedItemIds);
});
tileSetsSelected.addEventListener("click", (e) => {
  const id = e.target.dataset.removeSelected;
  if (!id) return;
  const checkbox = tileSetsSelect.querySelector(`input[value="${id}"]`);
  if (checkbox) checkbox.checked = false;
  updateSelectedSetsPanel();
});
createBracketBtn.addEventListener("click", handleCreateBracket);
bracketsList.addEventListener("click", handleBracketsListClick);
createTileBtn.addEventListener("click", handleCreateTile);
editTilesList.addEventListener("click", handleEditTilesListClick);
editTilesList.addEventListener("change", handleEditTilesListChange);
editTilesList.addEventListener("input", handleChecklistSearch);
editTilesList.addEventListener("input", handleEditItemsSearchInput);

createItemSetBtn.addEventListener("click", handleCreateItemSet);
itemSetsManagementList.addEventListener("click", handleItemSetsManagementListClick);
itemSetsManagementList.addEventListener("input", handleItemSetSearchInput);

boardGrid.addEventListener("click", async (e) => {
  const viewItemsTileId = e.target.dataset.viewItems;
  if (viewItemsTileId) {
    openItemModal(viewItemsTileId, false);
    return;
  }

  const signupTileId = e.target.dataset.signup;
  if (signupTileId) {
    await signUpForTile(supabase, signupTileId, currentClanId, currentIgn);
    await loadBoard();
    return;
  }

  const dropSignupTileId = e.target.dataset.dropSignup;
  if (dropSignupTileId) {
    await dropTileSignUp(supabase, dropSignupTileId, currentClanId, currentIgn);
    await loadBoard();
  }
});
progressTilesList.addEventListener("click", handleProgressTilesListClick);
itemModalBody.addEventListener("click", handleItemChipClick);
itemModalCloseBtn.addEventListener("click", closeItemModal);
itemModalOverlay.addEventListener("click", (e) => {
  if (e.target === itemModalOverlay) closeItemModal();
});

setViewMode("view");
init();
