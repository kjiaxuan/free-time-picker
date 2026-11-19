// Free Time Picker: one suggestion at a time, then a one-tap rating.
// History lives in localStorage only (no backend).

const KEY = 'ftp.slots.v1';
const FIVE_MIN = 5 * 60 * 1000;
const WEEK = 7 * 24 * 60 * 60 * 1000;

const $ = (s) => document.querySelector(s);
const card = $('#card');

// ---- storage ----
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(slots) {
  try { localStorage.setItem(KEY, JSON.stringify(slots)); } catch { /* storage blocked: app still works */ }
}

// ---- state ----
// A "slot" is one free-time moment: starts when the first suggestion is shown,
// ends when you rate it. Fields: id, openedAt, pickedAt, activity, type, rating.
let slot = null;      // current slot being worked on
let suggestion = null;
let phase = 'idle';   // idle | loading | suggest | doing | rate | error

// ---- API ----
async function fetchSuggestion() {
  const res = await fetch('/api/random');
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests, wait a minute.' : `API error ${res.status}`);
  return res.json();
}

async function next() {
  phase = 'loading'; render();
  try {
    suggestion = await fetchSuggestion();
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
  phase = 'doing'; render();
}
function finish() { phase = 'rate'; render(); }
function rate(r) {
  const slots = load();
  slots.push({ ...slot, rating: r, ratedAt: Date.now() });
  save(slots);
  slot = null; suggestion = null; phase = 'idle';
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
      <p class="meta">${esc(bits.filter(Boolean).join(' · '))}${suggestion.link ? ` · <a href="${esc(suggestion.link)}" target="_blank" rel="noopener">link</a>` : ''}</p>
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
}

function renderStats() {
  const since = Date.now() - WEEK;
  const recent = load().filter((s) => s.ratedAt >= since);
  const lag = $('#stat-lagging'), lagNote = $('#stat-lagging-note');
  const lead = $('#stat-leading'), leadNote = $('#stat-leading-note');
  if (!recent.length) {
    lag.textContent = '–'; lagNote.textContent = 'Rate your first slot to start.';
    lead.textContent = '–'; leadNote.textContent = '';
    return;
  }
  const well = recent.filter((s) => s.rating === 'well').length;
  lag.textContent = `${Math.round((well / recent.length) * 100)}%`;
  lagNote.textContent = `${well} of ${recent.length} slots. Goal: 75% within a month.`;
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

render();
renderStats();
