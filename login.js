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
} from "./admin.js";
import { listClanTileProgress } from "./tileProgress.js";

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
const viewPane = document.getElementById("view-pane");
const editPane = document.getElementById("edit-pane");
const boardGrid = document.getElementById("board-grid");

const bracketLabelInput = document.getElementById("bracket-label-input");
const bracketPointsInput = document.getElementById("bracket-points-input");
const createBracketBtn = document.getElementById("create-bracket-btn");
const bracketsList = document.getElementById("brackets-list");

const tileNameInput = document.getElementById("tile-name-input");
const tileBracketSelect = document.getElementById("tile-bracket-select");
const tileTypeSelect = document.getElementById("tile-type-select");
const tileTargetInput = document.getElementById("tile-target-input");
const createTileBtn = document.getElementById("create-tile-btn");
const noBracketsNote = document.getElementById("no-brackets-note");
const editTilesList = document.getElementById("edit-tiles-list");

let currentClanId = null;
let currentEventId = null;
let tiles = [];
let brackets = [];
let progressByTileId = {};
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

function showLoggedIn(ign, role) {
  loginScreen.classList.add("hidden");
  loggedInScreen.classList.remove("hidden");
  ignDisplay.textContent = ign;
  roleDisplay.textContent = role;
  adminTabs.classList.toggle("hidden", role !== "admin");
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

function tileCardHtml(tile) {
  const progress = progressFor(tile.id);
  const progressText = progressInfoText(tile, progress);
  const fillPct = Math.round(progressFraction(tile, progress) * 100);

  return `
    <div class="tile-card ${progress.completed ? "complete" : ""}">
      <div class="tile-top">
        <span class="tile-task">${escapeAttr(tile.name)}</span>
        <span class="status-badge ${progress.completed ? "done" : "open"}">${progress.completed ? "Done" : "Open"}</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${fillPct}%"></div></div>
      ${progressText ? `<span class="progress-info">${progressText}</span>` : ""}
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

  const configSummary = tile.tile_type === "complete_x_times" ? `Target: ${tile.config.target}` : "";
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
  const isXTimes = tile.tile_type === "complete_x_times";
  return `
    <div class="tile-card editing">
      <div class="dev-form tile-edit-form">
        <input class="tile-edit-name" value="${escapeAttr(tile.name)}" placeholder="Tile name">
        <select class="tile-edit-bracket">${bracketOptionsHtml(tile.bracket_id)}</select>
        <select class="tile-edit-type">
          <option value="complete_once" ${isXTimes ? "" : "selected"}>Complete Once</option>
          <option value="complete_x_times" ${isXTimes ? "selected" : ""}>Complete X Times</option>
        </select>
        <input
          class="tile-edit-target ${isXTimes ? "" : "hidden"}"
          type="number" min="1" placeholder="Target count"
          value="${isXTimes ? tile.config.target : ""}">
        <span class="dev-row-actions">
          <button class="btn-ghost" data-save-tile="${tile.id}">Save</button>
          <button class="btn-ghost" data-cancel-edit="${tile.id}">Cancel</button>
        </span>
      </div>
    </div>`;
}

function renderEditTiles() {
  const groups = groupTilesByBracket(tiles);
  editTilesList.innerHTML = groups.length
    ? groups.map((g) => tileGroupHtml(g, editTileCardHtml)).join("")
    : "<p class=\"dev-empty\">No tiles yet.</p>";
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

function setViewMode(mode) {
  viewPane.classList.toggle("hidden", mode !== "view");
  editPane.classList.toggle("hidden", mode !== "edit");
  viewTabBtn.classList.toggle("active", mode === "view");
  editTabBtn.classList.toggle("active", mode === "edit");
}

async function loadBoard() {
  const { data: { session } } = await supabase.auth.getSession();
  const { clan_id, event_id } = session.user.app_metadata;
  currentClanId = clan_id;
  currentEventId = event_id;

  const [tileRows, bracketRows, progressRows, event, eventClans] = await Promise.all([
    listTiles(supabase, event_id),
    listBrackets(supabase, event_id),
    listClanTileProgress(supabase, clan_id),
    getEvent(supabase, event_id),
    listEventClans(supabase, event_id),
  ]);
  tiles = tileRows;
  brackets = bracketRows;
  progressByTileId = Object.fromEntries(progressRows.map((p) => [p.tileId, p]));

  const ownClan = eventClans.find((c) => c.clanId === clan_id);
  eventClanDisplay.textContent = ownClan ? `${event.name} — ${ownClan.displayName}` : event.name;

  renderBoard();
  renderBrackets();
  renderEditTiles();
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

  const config = tileType === "complete_x_times" ? { target: Number(tileTargetInput.value) || 1 } : {};

  createTileBtn.disabled = true;
  try {
    await createTile(supabase, currentEventId, { name, bracketId, tileType, config });
    tileNameInput.value = "";
    tileTargetInput.value = "";
    await loadBoard();
  } finally {
    createTileBtn.disabled = false;
  }
}

async function handleEditTilesListClick(e) {
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

    const config = tileType === "complete_x_times"
      ? { target: Number(card.querySelector(".tile-edit-target").value) || 1 }
      : {};

    await updateTile(supabase, saveTileId, { name, bracketId, tileType, config });
    editingTileId = null;
    await loadBoard();
  }
}

// Toggle the target field's visibility live as the type dropdown changes,
// inside whichever tile is currently being edited.
function handleEditTilesListChange(e) {
  if (!e.target.classList.contains("tile-edit-type")) return;
  const card = e.target.closest(".tile-card");
  card.querySelector(".tile-edit-target").classList.toggle("hidden", e.target.value !== "complete_x_times");
}

loginBtn.addEventListener("click", handleLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
logoutBtn.addEventListener("click", handleLogout);

viewTabBtn.addEventListener("click", () => setViewMode("view"));
editTabBtn.addEventListener("click", () => setViewMode("edit"));
tileTypeSelect.addEventListener("change", () => {
  tileTargetInput.classList.toggle("hidden", tileTypeSelect.value !== "complete_x_times");
});
createBracketBtn.addEventListener("click", handleCreateBracket);
bracketsList.addEventListener("click", handleBracketsListClick);
createTileBtn.addEventListener("click", handleCreateTile);
editTilesList.addEventListener("click", handleEditTilesListClick);
editTilesList.addEventListener("change", handleEditTilesListChange);

setViewMode("view");
init();
