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

// Only allow http(s) links from the API; anything else (e.g. javascript:) is dropped.
function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch { return ''; }
}

// ---- API ----
async function fetchSuggestion() {
  const res = await fetch('/api/random');
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests, wait a minute.' : `API error ${res.status}`);
  return res.json();
}

async function next() {
  if (phase === 'loading') return; // ignore overlapping requests
  const previous = suggestion && suggestion.activity;
  phase = 'loading'; render();
  try {
    let s = await fetchSuggestion();
    // "Another" should look different: retry a few times if the API repeats itself.
    for (let i = 0; i < 3 && previous && s.activity === previous; i++) s = await fetchSuggestion();
    suggestion = s;
    if (!slot) slot = { id: Date.now(), openedAt: Date.now() };
    phase = 'suggest';
  } catch (e) {
    phase = 'error';
    suggestion = { error: e.message || 'Could not reach the Bored API.' };
  }
  render();
}

// ---- actions ----
function doIt() {
  slot.pickedAt = Date.now();
  slot.activity = suggestion.activity;
  slot.type = suggestion.type;
  saveCurrent();
  phase = 'doing'; render();
}
function finish() { phase = 'rate'; render(); }
function rate(r) {
  const slots = load();
  slots.push({ ...slot, rating: r, ratedAt: Date.now() });
  saveFailed = !save(slots);
  slot = null; suggestion = null; phase = 'idle';
  saveCurrent();
  render(); renderStats();
}

// ---- rendering ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  if (phase === 'idle') {
    card.innerHTML = `<p class="tag">Free time</p><p class="activity">Got a free slot?</p>
      <div class="row"><button class="solid" id="start">Give me something to do</button></div>`;
    $('#start').onclick = next;
  } else if (phase === 'loading') {
    card.innerHTML = `<p class="tag">Finding something</p><p class="activity">…</p>`;
  } else if (phase === 'error') {
    card.innerHTML = `<p class="tag">Problem</p><p class="activity error">${esc(suggestion.error)}</p>
      <div class="row"><button class="solid" id="retry">Try again</button></div>`;
    $('#retry').onclick = next;
  } else if (phase === 'suggest') {
    const bits = [suggestion.type, suggestion.duration, suggestion.participants > 1 ? `${suggestion.participants} people` : 'solo'];
    card.innerHTML = `<p class="tag">Try this</p><p class="activity">${esc(suggestion.activity)}</p>
      <p class="meta">${esc(bits.filter(Boolean).join(' · '))}${safeLink(suggestion.link) ? ` · <a href="${esc(safeLink(suggestion.link))}" target="_blank" rel="noopener noreferrer">link</a>` : ''}</p>
      <div class="row"><button class="solid" id="do">Do it</button><button id="another">Another</button></div>`;
    $('#do').onclick = doIt; $('#another').onclick = next;
  } else if (phase === 'doing') {
    card.innerHTML = `<p class="tag">In progress</p><p class="activity">${esc(slot.activity)}</p>
      <div class="row"><button class="solid" id="done">I'm done</button></div>`;
    $('#done').onclick = finish;
  } else if (phase === 'rate') {
    card.innerHTML = `<p class="tag">How was it?</p><p class="activity">${esc(slot.activity)}</p>
      <div class="row">
        <button class="good" data-r="well">Time well spent</button>
        <button class="warn" data-r="meh">Meh</button>
        <button class="bad" data-r="wasted">Wasted</button>
      </div>`;
    card.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => rate(b.dataset.r)));
  }
  // Re-rendering destroys the focused button; put focus on the new first button
  // (but don't steal focus on the very first page load).
  if (phase !== 'idle') interacted = true;
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
