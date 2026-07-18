import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { initTheme } from "./theme.js";

initTheme(document.getElementById("theme-toggle-btn"));

// ── Config ──────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAeTs0WSiJz3i9_RcH06LvTnZd9zn_GVFs",
  authDomain: "bingo-week.firebaseapp.com",
  databaseURL: "https://bingo-week-default-rtdb.firebaseio.com",
  projectId: "bingo-week",
  storageBucket: "bingo-week.firebasestorage.app",
  messagingSenderId: "1089855709883",
  appId: "1:1089855709883:web:8deb5fee15178792bbbf9e",
};

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRE3vPvX3elTPwdcTPDTwftQy6r6VW9cccf9Cc5oTWFyHqyyZFdo3S613V6G3U8ZzNRzG_lxvAE-8z1/pub?output=csv&gid=0";

const REFRESH_MS = 3 * 60 * 1000; // poll sheet every 3 minutes

// ── State ────────────────────────────────────────────────────────────────────

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(firebaseApp);

let currentUser = null;
let tiles = [];
let claims = {};
let prevComplete = {}; // tracks complete state between polls for auto-wipe
let hideCompleted = false;

// ── Name Screen ───────────────────────────────────────────────────────────────

function init() {
  const saved = localStorage.getItem("bingo-rsn");
  if (saved) {
    enterApp(saved);
  } else {
    document.getElementById("name-screen").classList.remove("hidden");
  }
}

function enterApp(name) {
  currentUser = name;
  localStorage.setItem("bingo-rsn", name);
  document.getElementById("name-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("username-display").textContent = name;
  listenToClaims();
  loadSheet();
  setInterval(loadSheet, REFRESH_MS);
}

document.getElementById("name-btn").addEventListener("click", () => {
  const val = document.getElementById("name-input").value.trim();
  if (val) enterApp(val);
});

document.getElementById("name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("name-btn").click();
});

document.getElementById("toggle-completed-btn").addEventListener("click", () => {
  hideCompleted = !hideCompleted;
  document.getElementById("toggle-completed-btn").textContent = hideCompleted ? "Show Completed" : "Hide Completed";
  renderTiles();
});

document.getElementById("change-name-btn").addEventListener("click", () => {
  localStorage.removeItem("bingo-rsn");
  currentUser = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("name-screen").classList.remove("hidden");
  document.getElementById("name-input").value = "";
});

// ── Google Sheet ──────────────────────────────────────────────────────────────

async function loadSheet() {
  setRefreshLabel("Refreshing...");
  try {
    // Cache-bust so browsers always fetch fresh data
    const res = await fetch(SHEET_CSV_URL + "&t=" + Date.now());
    const text = await res.text();
    const newTiles = parseCSV(text);

    // Auto-wipe Firebase claims for tiles that just flipped to complete
    newTiles.forEach((tile) => {
      if (!prevComplete[tile.id] && tile.complete) {
        remove(ref(db, `claims/${tile.id}`));
      }
      prevComplete[tile.id] = tile.complete;
    });

    tiles = newTiles;
    renderAll();

    const t = new Date();
    setRefreshLabel(`Updated ${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`);
  } catch {
    setRefreshLabel("Sheet unavailable");
  }
}

function setRefreshLabel(text) {
  document.getElementById("refresh-info").textContent = text;
}

// Converts a task name into a safe Firebase key (no special chars)
function toId(task) {
  return task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseCSV(text) {
  const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
  // Row 0 is the header; skip it
  return rows
    .slice(1)
    .map((row) => {
      const cols = splitCSVRow(row);
      const complete = cols[0]?.trim().toUpperCase() === "TRUE";
      const leftRaw = cols[1]?.trim() ?? "";
      const points = parseInt(cols[2]) || 0;
      const task = cols[3]?.trim() ?? "";

      if (!task || !points) return null;

      // Accumulative tile = "# left" column holds a plain integer
      const remaining = parseInt(leftRaw);
      const isAccumulative = !isNaN(remaining) && remaining > 0;

      return {
        id: toId(task),
        task,
        points,
        complete,
        accumulative: isAccumulative,
        remaining: isAccumulative ? remaining : null,
      };
    })
    .filter(Boolean);
}

// Handles quoted fields that may contain commas
function splitCSVRow(row) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

// ── Firebase Claims ───────────────────────────────────────────────────────────

function listenToClaims() {
  onValue(ref(db, "claims"), (snapshot) => {
    claims = snapshot.val() ?? {};
    renderAll();
  });
}

// Player names are stored as Firebase keys; spaces → underscores
function nameKey(name) {
  return name.replace(/ /g, "_");
}

function claimTile(tileId) {
  set(ref(db, `claims/${tileId}/${nameKey(currentUser)}`), true);
}

function unclaimTile(tileId) {
  remove(ref(db, `claims/${tileId}/${nameKey(currentUser)}`));
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderAll() {
  updateStats();
  renderTiles();
}

function updateStats() {
  const earned = tiles.filter((t) => t.complete).reduce((s, t) => s + t.points, 0);
  const total = tiles.reduce((s, t) => s + t.points, 0);
  const done = tiles.filter((t) => t.complete).length;
  const pct = total ? Math.round((earned / total) * 100) : 0;

  document.getElementById("stat-points").textContent = earned;
  document.getElementById("stat-completed").textContent = `${done}/${tiles.length}`;
  document.getElementById("stat-percent").textContent = `${pct}%`;
}

function renderTiles() {
  if (!tiles.length) return;
  const container = document.getElementById("tiles-container");
  container.innerHTML = "";

  const GROUP_LABELS = { 5: "High Value", 4: "Hard", 3: "Medium", 2: "Easy", 1: "Beginner" };

  [5, 4, 3, 2, 1].forEach((pts) => {
    const group = tiles.filter((t) => t.points === pts && !(hideCompleted && t.complete));
    if (!group.length) return;

    const section = document.createElement("section");
    section.className = "tile-group";
    section.innerHTML = `<h2 class="group-header"><span class="pts-badge pts-${pts}">${pts} pts</span>${GROUP_LABELS[pts]}</h2>`;

    const grid = document.createElement("div");
    grid.className = "tile-grid";

    group.forEach((tile) => {
      const tileClaims = claims[tile.id] ? Object.keys(claims[tile.id]) : [];
      const isMine = tileClaims.includes(nameKey(currentUser));

      const card = document.createElement("div");
      card.className = `tile-card${tile.complete ? " complete" : tileClaims.length ? " claimed" : ""}`;

      const statusLabel = tile.complete ? "done" : tileClaims.length ? "active" : "open";
      const statusText  = tile.complete ? "✓ Complete" : tileClaims.length ? "In Progress" : "Available";

      card.innerHTML = `
        <div class="tile-top">
          <span class="tile-task">${tile.task}</span>
          <span class="status-badge ${statusLabel}">${statusText}</span>
        </div>
        ${tile.accumulative && !tile.complete
          ? `<div class="progress-info">🔄 ${tile.remaining} more needed</div>`
          : ""}
        ${tileClaims.length
          ? `<div class="claimants">${tileClaims
              .map((n) => `<span class="claimant${n === nameKey(currentUser) ? " me" : ""}">${n.replace(/_/g, " ")}</span>`)
              .join("")}</div>`
          : ""}
        ${!tile.complete
          ? isMine
            ? `<button class="btn-unclaim" data-id="${tile.id}">Drop task</button>`
            : `<button class="btn-claim" data-id="${tile.id}">Work on this</button>`
          : ""}
      `;

      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  // Event delegation — attach once after render
  container.querySelectorAll(".btn-claim").forEach((btn) =>
    btn.addEventListener("click", () => claimTile(btn.dataset.id))
  );
  container.querySelectorAll(".btn-unclaim").forEach((btn) =>
    btn.addEventListener("click", () => unclaimTile(btn.dataset.id))
  );
}

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
