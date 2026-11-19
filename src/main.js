// Free Time Picker: one suggestion at a time, then a one-tap rating.
// History lives in localStorage only (no backend).

const KEY = 'ftp.slots.v1';
const FIVE_MIN = 5 * 60 * 1000;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const CURRENT_KEY = 'ftp.current.v1';

const $ = (s) => document.querySelector(s);
const card = $('#card');

// ---- storage ----
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(slots) {
  try { localStorage.setItem(KEY, JSON.stringify(slots)); return true; } catch { return false; }
}
// The in-progress slot is persisted so a reload does not lose it.
function saveCurrent() {
  try {
    if (slot && slot.pickedAt) localStorage.setItem(CURRENT_KEY, JSON.stringify(slot));
    else localStorage.removeItem(CURRENT_KEY);
  } catch { /* storage blocked: app still works, slot just won't survive a reload */ }
}
function loadCurrent() {
  try { return JSON.parse(localStorage.getItem(CURRENT_KEY)); } catch { return null; }
}

// ---- state ----
// A "slot" is one free-time moment: starts when the first suggestion is shown,
// ends when you rate it. Fields: id, openedAt, pickedAt, activity, type, rating.
let slot = null;      // current slot being worked on
let suggestion = null;
let phase = 'idle';   // idle | loading | suggest | doing | rate | error
let saveFailed = false;
let interacted = false;
let history = [];     // suggestions already seen in this slot, for "Back"
let lastRated = null; // the most recently saved slot, for "Undo"
let errorMsg = '';

// Only allow http(s) links from the API; anything else (e.g. javascript:) is dropped.
function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch { return ''; }
}

// ---- API ----
// Two sources, switchable with the toggle:
// - games: FreeToGame (~70 free browser games in one call, fetched once, picked at random).
// - activities: the Bored API's general things to do. It sends no CORS headers, so the browser
//   can't call it. scripts/fetch-activities.mjs downloads it at build time into
//   public/activities.json, and the app reads that static file.
const MODE_KEY = 'ftp.mode.v1';
const GAMES_API = 'https://www.freetogame.com/api/games?platform=browser';
const ACTIVITIES_URL = `${import.meta.env.BASE_URL}activities.json`;
let games = null;
let activities = null;

function loadMode() {
  try {
    if (localStorage.getItem(MODE_KEY) === 'activities') return 'activities';
  } catch { /* ignore */ }
  return 'games';
}
let mode = loadMode();

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests, wait a minute.' : `API error ${res.status}`);
  return res.json();
}

async function fetchSuggestion() {
  if (mode === 'activities') {
    if (!activities) activities = await getJson(ACTIVITIES_URL);
    if (!Array.isArray(activities) || !activities.length) { activities = null; throw new Error('No activities found.'); }
    const a = activities[Math.floor(Math.random() * activities.length)];
    const who = a.participants > 1 ? `${a.participants} people` : 'solo';
    return { activity: a.activity, type: a.type, description: '', link: a.link, meta: [a.type, a.duration, who] };
  }
  if (!games) games = await getJson(GAMES_API);
  if (!Array.isArray(games) || !games.length) { games = null; throw new Error('No games came back from the API.'); }
  const g = games[Math.floor(Math.random() * games.length)];
  return { activity: g.title, type: g.genre, description: g.short_description, link: g.game_url, meta: [g.genre, 'free browser game'] };
}

function setMode(m) {
  if (m === mode) return;
  mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  if (phase === 'suggest' || phase === 'error') next();
  else renderMode();
}

function renderMode() {
  const locked = phase === 'loading' || phase === 'doing' || phase === 'rate';
  document.querySelectorAll('#mode button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    b.disabled = locked;
  });
}
document.querySelectorAll('#mode button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

async function next() {
  if (phase === 'loading') return; // ignore overlapping requests
  // Only compare against the current suggestion if it came from the same source.
  const previous = suggestion && suggestion.source === mode ? suggestion.activity : null;
  phase = 'loading'; render();
  try {
    let s = await fetchSuggestion();
    // "Another" should look different: retry a few times if the API repeats itself.
    for (let i = 0; i < 3 && previous && s.activity === previous; i++) s = await fetchSuggestion();
    s.source = mode;
    if (suggestion) history.push(suggestion); // keep it so "Back" can return to it
    suggestion = s;
    lastRated = null;
    if (!slot) slot = { id: Date.now(), openedAt: Date.now() };
    phase = 'suggest';
  } catch (e) {
    phase = 'error';
    errorMsg = e.message || 'Could not reach the API.';
  }
  render();
}

// ---- going back ----
function back() { // previous suggestion
  if (!history.length) return;
  suggestion = history.pop();
  if (suggestion.source && suggestion.source !== mode) {
    mode = suggestion.source;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }
  phase = 'suggest'; render();
}
function unpick() { // from "in progress" back to the suggestion
  suggestion = slot.suggestion || { activity: slot.activity, type: slot.type, meta: [slot.type], source: slot.source || mode };
  delete slot.pickedAt; delete slot.activity; delete slot.type; delete slot.source; delete slot.suggestion;
  saveCurrent();
  phase = 'suggest'; render();
}
function unfinish() { phase = 'doing'; render(); } // from rating back to "in progress"
function undoRating() { // take back the rating that was just saved
  if (!lastRated) return;
  const entry = lastRated; lastRated = null;
  saveFailed = !save(load().filter((s) => s.id !== entry.id));
  const { rating, ratedAt, ...rest } = entry;
  slot = rest;
  suggestion = slot.suggestion || null;
  saveCurrent();
  phase = 'rate'; render(); renderStats();
}

// ---- actions ----
function doIt() {
  slot.pickedAt = Date.now();
  slot.activity = suggestion.activity;
  slot.type = suggestion.type;
  slot.source = suggestion.source || mode;
  slot.suggestion = suggestion; // so we can go back to it, even after a reload
  saveCurrent();
  phase = 'doing'; render();
}
function finish() { phase = 'rate'; render(); }
function rate(r) {
  const slots = load();
  const entry = { ...slot, rating: r, ratedAt: Date.now() };
  slots.push(entry);
  saveFailed = !save(slots);
  lastRated = entry;
  slot = null; suggestion = null; history = []; phase = 'idle';
  saveCurrent();
  render(); renderStats();
}

// ---- rendering ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  if (phase === 'idle') {
    card.innerHTML = `<p class="tag">Free time</p><p class="activity">Got a free slot?</p>
      <div class="row"><button class="solid" id="start">Give me something to do</button></div>
      ${lastRated ? `<p class="meta">Rated "${esc(lastRated.activity)}". <button type="button" class="link" id="undo">Undo</button></p>` : ''}`;
    $('#start').onclick = next;
    if (lastRated) $('#undo').onclick = undoRating;
  } else if (phase === 'loading') {
    card.innerHTML = `<p class="tag">Finding something</p><p class="activity">…</p>`;
  } else if (phase === 'error') {
    card.innerHTML = `<p class="tag">Problem</p><p class="activity error">${esc(errorMsg)}</p>
      <div class="row"><button class="solid" id="retry">Try again</button>${history.length || suggestion ? '<button id="back">Back</button>' : ''}</div>`;
    $('#retry').onclick = next;
    if ($('#back')) $('#back').onclick = () => { if (suggestion) { phase = 'suggest'; render(); } else back(); };
  } else if (phase === 'suggest') {
    const bits = suggestion.meta || [suggestion.type];
    const linkLabel = mode === 'games' ? 'play' : 'link';
    card.innerHTML = `<p class="tag">Try this</p><p class="activity">${esc(suggestion.activity)}</p>
      ${suggestion.description ? `<p>${esc(suggestion.description)}</p>` : ''}
      <p class="meta">${esc(bits.filter(Boolean).join(' · '))}${safeLink(suggestion.link) ? ` · <a href="${esc(safeLink(suggestion.link))}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>` : ''}</p>
      <div class="row"><button class="solid" id="do">Do it</button><button id="another">Another</button>${history.length ? '<button id="back">← Previous</button>' : ''}</div>`;
    $('#do').onclick = doIt; $('#another').onclick = next;
    if (history.length) $('#back').onclick = back;
  } else if (phase === 'doing') {
    card.innerHTML = `<p class="tag">In progress</p><p class="activity">${esc(slot.activity)}</p>
      <div class="row"><button class="solid" id="done">I'm done</button><button id="unpick">← Pick something else</button></div>`;
    $('#done').onclick = finish; $('#unpick').onclick = unpick;
  } else if (phase === 'rate') {
    card.innerHTML = `<p class="tag">How was it?</p><p class="activity">${esc(slot.activity)}</p>
      <div class="row">
        <button class="good" data-r="well">Time well spent</button>
        <button class="warn" data-r="meh">Meh</button>
        <button class="bad" data-r="wasted">Wasted</button>
      </div>
      <p class="meta"><button type="button" class="link" id="unfinish">← Not done yet</button></p>`;
    $('#unfinish').onclick = unfinish;
    card.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => rate(b.dataset.r)));
  }
  // Re-rendering destroys the focused button; put focus on the new first button
  // (but don't steal focus on the very first page load).
  if (phase !== 'idle') interacted = true;
  renderMode();
  const first = card.querySelector('button');
  if (interacted && first) first.focus();
}

function renderStats() {
  const since = Date.now() - WEEK;
  const recent = load().filter((s) => s.ratedAt >= since);
  const lag = $('#stat-lagging'), lagNote = $('#stat-lagging-note');
  const lead = $('#stat-leading'), leadNote = $('#stat-leading-note');
  if (!recent.length) {
    lag.textContent = '–';
    lagNote.textContent = saveFailed
      ? "Couldn't save your rating: browser storage is blocked (private window?)."
      : 'Rate your first slot to start.';
    lead.textContent = '–'; leadNote.textContent = '';
    return;
  }
  const well = recent.filter((s) => s.rating === 'well').length;
  lag.textContent = `${Math.round((well / recent.length) * 100)}%`;
  lagNote.textContent = `${well} of ${recent.length} slots. Goal: 75% within a month.${saveFailed ? " Last rating wasn't saved (storage blocked)." : ''}`;
  const fast = recent.filter((s) => s.pickedAt - s.openedAt <= FIVE_MIN).length;
  lead.textContent = `${Math.round((fast / recent.length) * 100)}%`;
  leadNote.textContent = `${fast} of ${recent.length} slots`;
}

$('#clear').onclick = () => {
  if (confirm('Delete all your saved history in this browser?')) {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    renderStats();
  }
};

// Resume a slot that was in progress when the page was closed or reloaded.
const resumed = loadCurrent();
if (resumed && resumed.pickedAt && resumed.activity) {
  slot = resumed;
  phase = 'doing';
}
render();
renderStats();
