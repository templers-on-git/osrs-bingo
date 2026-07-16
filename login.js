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
  listItems,
  listItemSets,
  listItemsInSet,
} from "./admin.js";
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

const adminTabs = document.getElementById("admin-tabs");
const viewTabBtn = document.getElementById("view-tab-btn");
const editTabBtn = document.getElementById("edit-tab-btn");
const progressTabBtn = document.getElementById("progress-tab-btn");
const viewPane = document.getElementById("view-pane");
const editPane = document.getElementById("edit-pane");
const progressPane = document.getElementById("progress-pane");
const boardGrid = document.getElementById("board-grid");
const progressTilesList = document.getElementById("progress-tiles-list");

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

let currentClanId = null;
let currentEventId = null;
let currentIgn = null;
let tiles = [];
let brackets = [];
let items = [];
let itemSets = [];
let progressByTileId = {};
let signupsByTileId = {};
let editingTileId = null; // tile currently showing its inline edit form, if any
let editingBracketId = null; // bracket currently showing its inline edit form, if any

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

function itemCheckboxesHtml(selectedIds = []) {
  return items.map((i) => `
    <label class="checkbox-row">
      <input type="checkbox" value="${i.id}" ${selectedIds.includes(i.id) ? "checked" : ""}>
      ${escapeAttr(i.name)}
    </label>`).join("");
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
    const item = items.find((i) => i.id === id);
    if (!item) return "";
    return `
      <div class="selected-chip">
        ${item.photo_url ? `<img src="${escapeAttr(item.photo_url)}" class="item-thumb" alt="">` : ""}
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

function renderBoard() {
  const groups = groupTilesByBracket(tiles);
  boardGrid.innerHTML = groups.length
    ? groups.map((g) => tileGroupHtml(g, tileCardHtml)).join("")
    : "<p class=\"dev-empty\">No tiles yet.</p>";
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
  const selectedItemIds = isCollectOne || isCollectK ? tile.config.itemIds : [];
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
          <p class="dev-muted">All Items</p>
          <input type="text" class="checkbox-search tile-edit-items-search" placeholder="Search items...">
          <div class="tile-edit-items checkbox-list">${itemCheckboxesHtml(selectedItemIds)}</div>
        </div>
        <div class="picker-column">
          <p class="dev-muted">Selected (<span class="tile-edit-items-count">${selectedItemIds.length}</span>)</p>
          <div class="tile-edit-items-selected selected-list">${selectedItemsHtml(selectedItemIds)}</div>
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
  const groups = groupTilesByBracket(tiles);
  progressTilesList.innerHTML = groups.length
    ? groups.map((g) => tileGroupHtml(g, progressTileCardHtml)).join("")
    : "<p class=\"dev-empty\">No tiles yet.</p>";
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
      ${item.photo_url ? `<img src="${escapeAttr(item.photo_url)}" class="item-thumb" alt="">` : ""}
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
    const members = tile.config.itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean);
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
  tileItemsSelect.innerHTML = itemCheckboxesHtml(getCheckedValues(tileItemsSelect));
  updateSelectedItemsPanel();
  tileSetsSelect.innerHTML = setCheckboxesHtml(getCheckedValues(tileSetsSelect));
  updateSelectedSetsPanel();
}

function updateSelectedItemsPanel() {
  const selectedIds = getCheckedValues(tileItemsSelect);
  tileItemsSelected.innerHTML = selectedItemsHtml(selectedIds);
  tileItemsSelectedCount.textContent = selectedIds.length;
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
  if (!e.target.classList.contains("checkbox-search")) return;
  const query = e.target.value.trim().toLowerCase();
  const list = e.target.nextElementSibling;
  if (!list) return;
  list.querySelectorAll(".checkbox-row").forEach((row) => {
    row.classList.toggle("hidden", query.length > 0 && !row.textContent.trim().toLowerCase().includes(query));
  });
}

function setViewMode(mode) {
  viewPane.classList.toggle("hidden", mode !== "view");
  editPane.classList.toggle("hidden", mode !== "edit");
  progressPane.classList.toggle("hidden", mode !== "progress");
  viewTabBtn.classList.toggle("active", mode === "view");
  editTabBtn.classList.toggle("active", mode === "edit");
  progressTabBtn.classList.toggle("active", mode === "progress");
}

async function loadBoard() {
  const { data: { session } } = await supabase.auth.getSession();
  const { clan_id, event_id } = session.user.app_metadata;
  currentClanId = clan_id;
  currentEventId = event_id;

  const [tileRows, bracketRows, progressRows, signupRows, event, eventClans, itemRows, itemSetRows] = await Promise.all([
    listTiles(supabase, event_id),
    listBrackets(supabase, event_id),
    listClanTileProgress(supabase, clan_id),
    listClanTileSignups(supabase, clan_id),
    getEvent(supabase, event_id),
    listEventClans(supabase, event_id),
    listItems(supabase),
    listItemSets(supabase),
  ]);
  tiles = tileRows;
  brackets = bracketRows;
  items = itemRows;
  itemSets = itemSetRows;
  progressByTileId = Object.fromEntries(progressRows.map((p) => [p.tileId, p]));
  signupsByTileId = {};
  for (const s of signupRows) {
    (signupsByTileId[s.tileId] ??= []).push(s.ign);
  }

  const ownClan = eventClans.find((c) => c.clanId === clan_id);
  eventClanDisplay.textContent = ownClan ? `${event.name} — ${ownClan.displayName}` : event.name;

  renderBoard();
  renderBrackets();
  renderItemPickers();
  renderEditTiles();
  renderProgressTiles();
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
    itemIds: getCheckedValues(tileItemsSelect),
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
    tileItemsSelect.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    tileSetsSelect.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    await loadBoard();
  } finally {
    createTileBtn.disabled = false;
  }
}

function updateEditSelectedItemsPanel(card) {
  const selectedIds = getCheckedValues(card.querySelector(".tile-edit-items"));
  card.querySelector(".tile-edit-items-selected").innerHTML = selectedItemsHtml(selectedIds);
  card.querySelector(".tile-edit-items-count").textContent = selectedIds.length;
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
      const checkbox = card.querySelector(`.tile-edit-items input[value="${removeSelectedId}"]`);
      if (checkbox) checkbox.checked = false;
      updateEditSelectedItemsPanel(card);
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
    renderEditTiles();
    return;
  }

  const cancelTileId = e.target.dataset.cancelEdit;
  if (cancelTileId) {
    editingTileId = null;
    renderEditTiles();
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
      itemIds: getCheckedValues(card.querySelector(".tile-edit-items")),
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

  if (e.target.closest(".tile-edit-items")) {
    updateEditSelectedItemsPanel(card);
    return;
  }
  if (e.target.closest(".tile-edit-sets")) {
    updateEditSelectedSetsPanel(card);
  }
}

loginBtn.addEventListener("click", handleLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
logoutBtn.addEventListener("click", handleLogout);

viewTabBtn.addEventListener("click", () => setViewMode("view"));
editTabBtn.addEventListener("click", () => setViewMode("edit"));
progressTabBtn.addEventListener("click", () => setViewMode("progress"));
tileTypeSelect.addEventListener("change", updateTileFormFieldsVisibility);
tileItemsSearch.addEventListener("input", handleChecklistSearch);
tileSetsSearch.addEventListener("input", handleChecklistSearch);
tileItemsSelect.addEventListener("change", updateSelectedItemsPanel);
tileSetsSelect.addEventListener("change", updateSelectedSetsPanel);
tileItemsSelected.addEventListener("click", (e) => {
  const id = e.target.dataset.removeSelected;
  if (!id) return;
  const checkbox = tileItemsSelect.querySelector(`input[value="${id}"]`);
  if (checkbox) checkbox.checked = false;
  updateSelectedItemsPanel();
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
