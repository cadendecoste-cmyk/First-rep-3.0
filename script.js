// =======================
// FirstRep - Clean v2
// - rotating program
// - history + PRs
// - delete, export/import, clear all
// - validation + safer rendering
// =======================

// ---------- Storage keys
const STORE = {
  dayIndex: "firstrep_dayIndex",
  history: "firstrep_history",
  prs: "firstrep_prs"
};

// ---------- Workout database
const WORKOUTS = {
  push: ["Chest Press", "Shoulder Press", "Incline Dumbbell Press", "Tricep Pushdown"],
  pull: ["Lat Pulldown", "Seated Row", "Face Pull", "Bicep Curl"],
  legs: ["Leg Press", "Goblet Squat", "Hamstring Curl", "Calf Raises"],
  upper: ["Chest Press", "Lat Pulldown", "Shoulder Press", "Seated Row"],
  lower: ["Leg Press", "Goblet Squat", "Hamstring Curl", "Calf Raises"],
  full: ["Chest Press", "Lat Pulldown", "Leg Press", "Plank"],
  arms: ["Bicep Curl", "Hammer Curl", "Tricep Pushdown", "Overhead Tricep Extension"]
};

function getSplit(days) {
  if (days === 6) return ["push", "pull", "legs"];      // repeating 3-day cycle
  if (days === 5) return ["upper", "lower", "arms"];    // repeating 3-day cycle
  if (days === 4) return ["upper", "lower"];            // repeating 2-day cycle
  return ["full"];                                      // 1–3 days/week => full body
}

// ---------- DOM
const form = document.getElementById("workoutForm");
const outputEl = document.getElementById("output");
const historyEl = document.getElementById("history");
const prsEl = document.getElementById("prs");

const statusEl = document.getElementById("status");
const rotationHintEl = document.getElementById("rotationHint");

const resetRotationBtn = document.getElementById("resetRotationBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const exportBtn = document.getElementById("exportBtn");
const importFile = document.getElementById("importFile");

// ---------- Utilities
function setStatus(message = "", type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getDayIndex() {
  const v = Number(localStorage.getItem(STORE.dayIndex));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function setDayIndex(v) {
  localStorage.setItem(STORE.dayIndex, String(v));
}

function nowISO() {
  return new Date().toISOString();
}

function prettyDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function setsForTime(minutes) {
  if (minutes <= 30) return 2;
  if (minutes <= 45) return 3;
  return 4;
}

function uid() {
  return `w_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidDays(d) {
  return Number.isFinite(d) && d >= 1 && d <= 6;
}

function isValidTime(t) {
  return Number.isFinite(t) && t >= 20 && t <= 180;
}

function sanitizeNumberOrNull(raw) {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return n;
}

// ---------- Rotation hint
function renderRotationHint(days) {
  const cycle = getSplit(days);
  const idx = getDayIndex();
  const next = cycle[idx % cycle.length];
  rotationHintEl.textContent = `Next in rotation: ${next.toUpperCase()}`;
}

// =======================
// Generate workout
// =======================
form.addEventListener("submit", (e) => {
  e.preventDefault();
  setStatus("");

  const days = Number(document.getElementById("days").value);
  const time = Number(document.getElementById("time").value);

  if (!isValidDays(days)) {
    setStatus("Days per week must be between 1 and 6.", "err");
    return;
  }
  if (!isValidTime(time)) {
    setStatus("Time must be at least 20 minutes (max 180).", "err");
    return;
  }

  const cycle = getSplit(days);
  const dayIndex = getDayIndex();

  const split = cycle[dayIndex % cycle.length];
  const exercises = WORKOUTS[split] ?? [];
  const sets = setsForTime(time);

  // Advance rotation immediately (app behavior)
  setDayIndex(dayIndex + 1);
  renderRotationHint(days);

  // Render workout card
  const workoutId = uid();

  outputEl.innerHTML = `
    <h2>Today's Workout (${escapeHtml(split).toUpperCase()})</h2>
    <p class="mini">Enter weight + reps for at least one exercise, then Save.</p>
    <div id="exerciseList"></div>
    <div class="row">
      <button type="button" id="saveBtn">Save Workout</button>
      <button type="button" id="clearWorkoutBtn" class="secondary">Clear</button>
    </div>
  `;

  const list = document.getElementById("exerciseList");
  list.innerHTML = exercises.map((name, i) => `
    <div class="exercise" data-name="${escapeHtml(name)}" data-i="${i}">
      <div class="exercise-title">
        <strong>${escapeHtml(name)}</strong>
        <small>${sets} sets × 8–12 reps</small>
      </div>
      <div class="inputs">
        <label>
          Weight (lbs)
          <input type="number" min="0" step="0.5" inputmode="decimal" data-weight />
        </label>
        <label>
          Reps
          <input type="number" min="0" step="1" inputmode="numeric" data-reps />
        </label>
      </div>
    </div>
  `).join("");

  document.getElementById("saveBtn").addEventListener("click", () => {
    saveWorkout({ id: workoutId, split, sets });
  });

  document.getElementById("clearWorkoutBtn").addEventListener("click", () => {
    outputEl.innerHTML = "";
    setStatus("Workout cleared (not saved).", "ok");
  });

  setStatus("Workout generated. Rotation advanced.", "ok");
});

// =======================
// Save workout + PR update
// =======================
function saveWorkout({ id, split, sets }) {
  setStatus("");

  const cards = Array.from(document.querySelectorAll(".exercise"));
  if (cards.length === 0) {
    setStatus("No workout to save. Generate a workout first.", "err");
    return;
  }

  const history = readJSON(STORE.history, []);
  const prs = readJSON(STORE.prs, {});
  const exercises = [];

  let hasAnyEntry = false;

  for (const card of cards) {
    const name = card.getAttribute("data-name") || "Exercise";
    const wRaw = card.querySelector("[data-weight]").value;
    const rRaw = card.querySelector("[data-reps]").value;

    const weight = sanitizeNumberOrNull(wRaw);
    const reps = sanitizeNumberOrNull(rRaw);

    const hasWeight = weight !== null;
    const hasReps = reps !== null;

    if (hasWeight || hasReps) hasAnyEntry = true;

    exercises.push({ name, weight, reps, sets });

    // PR logic: only update if both are present
    if (hasWeight && hasReps) {
      const current = prs[name];
      const candidate = { weight, reps };

      if (
        !current ||
        candidate.weight > current.weight ||
        (candidate.weight === current.weight && candidate.reps > current.reps)
      ) {
        prs[name] = candidate;
      }
    }
  }

  if (!hasAnyEntry) {
    setStatus("Enter weight/reps for at least one exercise before saving.", "err");
    return;
  }

  const workout = {
    id,
    createdAt: nowISO(),
    split,
    sets,
    exercises
  };

  history.unshift(workout); // newest first

  writeJSON(STORE.history, history);
  writeJSON(STORE.prs, prs);

  renderHistory();
  renderPRs();

  setStatus("Saved. History and PRs updated.", "ok");
}

// =======================
// Render history (newest first)
// =======================
function renderHistory() {
  const history = readJSON(STORE.history, []);

  if (!Array.isArray(history) || history.length === 0) {
    historyEl.innerHTML = `<p class="mini">No workouts saved yet.</p>`;
    return;
  }

  historyEl.innerHTML = history.map((w) => {
    const lines = (w.exercises || []).map(ex => {
      const wt = ex.weight === null ? "—" : `${ex.weight} lbs`;
      const rp = ex.reps === null ? "—" : `${ex.reps} reps`;
      return `${escapeHtml(ex.name)}: ${wt} × ${rp} (${ex.sets} sets)`;
    }).join("<br>");

    return `
      <div class="history-item">
        <div class="row space-between">
          <div>
            <strong>${prettyDate(w.createdAt)}</strong> — ${escapeHtml(w.split).toUpperCase()}
            <div class="mini">Workout ID: ${escapeHtml(w.id)}</div>
          </div>
          <button class="secondary danger" data-del="${escapeHtml(w.id)}">Delete</button>
        </div>
        <hr class="sep" />
        <div class="mini">${lines}</div>
      </div>
    `;
  }).join("");

  historyEl.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      deleteWorkout(id);
    });
  });
}

function deleteWorkout(id) {
  const history = readJSON(STORE.history, []);
  const next = history.filter(w => w.id !== id);
  writeJSON(STORE.history, next);
  renderHistory();
  setStatus("Workout deleted. (PRs are not recalculated automatically.)", "ok");
}

// =======================
// Render PRs
// =======================
function renderPRs() {
  const prs = readJSON(STORE.prs, {});
  const keys = Object.keys(prs);

  if (keys.length === 0) {
    prsEl.innerHTML = `<p class="mini">No PRs yet. Save workouts with weight + reps.</p>`;
    return;
  }

  keys.sort((a, b) => a.localeCompare(b));

  prsEl.innerHTML = keys.map((name) => `
    <div class="pr-item">
      <strong>${escapeHtml(name)}</strong><br />
      Best: ${prs[name].weight} lbs × ${prs[name].reps} reps
    </div>
  `).join("");
}

// =======================
// Reset rotation
// =======================
resetRotationBtn.addEventListener("click", () => {
  setDayIndex(0);
  const days = Number(document.getElementById("days").value) || 3;
  renderRotationHint(days);
  setStatus("Rotation reset to the start.", "ok");
});

// =======================
// Clear all data
// =======================
clearAllBtn.addEventListener("click", () => {
  const ok = confirm("This will delete ALL FirstRep history, PRs, and rotation. Continue?");
  if (!ok) return;

  localStorage.removeItem(STORE.history);
  localStorage.removeItem(STORE.prs);
  localStorage.removeItem(STORE.dayIndex);

  outputEl.innerHTML = "";
  renderHistory();
  renderPRs();
  renderRotationHint(Number(document.getElementById("days").value) || 3);
  setStatus("All data cleared.", "ok");
});

// =======================
// Export / Import
// =======================
exportBtn.addEventListener("click", () => {
  const payload = {
    version: "firstrep-v2",
    exportedAt: nowISO(),
    dayIndex: getDayIndex(),
    history: readJSON(STORE.history, []),
    prs: readJSON(STORE.prs, {})
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "firstrep-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  setStatus("Export downloaded.", "ok");
});

importFile.addEventListener("change", async (e) => {
  setStatus("");

  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (typeof data.dayIndex === "number") setDayIndex(data.dayIndex);
    if (Array.isArray(data.history)) writeJSON(STORE.history, data.history);
    if (data.prs && typeof data.prs === "object") writeJSON(STORE.prs, data.prs);

    renderHistory();
    renderPRs();

    const days = Number(document.getElementById("days").value) || 3;
    renderRotationHint(days);

    setStatus("Import complete.", "ok");
  } catch {
    setStatus("Import failed. Please upload a valid firstrep-export.json file.", "err");
  } finally {
    e.target.value = "";
  }
});

// =======================
// Initial render
// =======================
renderHistory();
renderPRs();
renderRotationHint(Number(document.getElementById("days").value) || 3);
