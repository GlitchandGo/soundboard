// Extracted JS from index.html and adjusted to reference sounds/ and handle data URLs

// Elements
const slider   = document.getElementById('volume-slider');
const volInput = document.getElementById('volume-input');
const container= document.querySelector('.buttons');
const chaosBtn = document.getElementById('chaos-btn');
const loopBtn  = document.getElementById('loop-btn');
const stopBtn  = document.getElementById('stop-btn');

// Search / filter elements
const searchInput = document.getElementById('search');
const filterRow = document.querySelector('.filter-row');

// AudioContext & Gain for volume (0–1000%)
const context = new (window.AudioContext||window.webkitAudioContext)();
const gainNode = context.createGain();
gainNode.gain.value = 1;
gainNode.connect(context.destination);

// State
let chaosMode = false;
let loopMode  = false;
let playing   = []; // array of HTMLAudioElements

// Reorder (drag/drop) storage keys
const ORDER_KEY = 'soundboardButtonOrderV1';

// Hotkeys storage keys
const HOTKEYS_KEY = 'soundboardHotkeysV1';
const RESERVED_KEYS = new Set(['c','l','s']); // existing functionality
let keyCapture = null; // { buttonId, triggerEl, pillEl }

// Helpers
function resolveSoundPath(ds) {
  if (!ds) return ds;
  // data URLs or absolute http(s)
  if (ds.startsWith('data:') || ds.startsWith('http://') || ds.startsWith('https://')) return ds;
  // remove any leading slashes
  let path = ds.replace(/^\/+/, '');
  // if already points into sounds/ keep it
  if (!path.startsWith('sounds/')) path = 'sounds/' + path;
  return path;
}

// Fix: ensure background image paths always point into images/
// - supports already-prefixed "images/..."
// - supports "../images/..." from background page
// - supports bare filename like "city.jpg"
function resolveImagePath(p) {
  if (!p) return p;
  if (p.startsWith('data:') || p.startsWith('http://') || p.startsWith('https://')) return p;

  let path = p.replace(/^\/+/, ''); // remove leading slashes
  // Normalize "../images/..." -> "images/..."
  path = path.replace(/^(\.\.\/)+images\//, 'images/');
  // If it already starts with images/, keep it
  if (path.startsWith('images/')) return path;

  // If it's just a filename, assume images/
  return 'images/' + path;
}

// Core playback logic
function playSound(soundIdentifier) {
  context.resume();
  if (!chaosMode) stopAll();
  const src = resolveSoundPath(soundIdentifier);
  const audio = new Audio(src);
  audio.loop = loopMode;
  // route through gainNode
  try {
    const srcNode = context.createMediaElementSource(audio);
    srcNode.connect(gainNode);
  } catch (e) {
    // createMediaElementSource will throw if context state doesn't allow (e.g. already closed)
    console.warn('Could not route audio through AudioContext:', e);
  }
  audio.play();
  playing.push(audio);
}

function stopAll() {
  playing.forEach(a => {
    try { a.pause(); } catch(e){}
  });
  playing = [];
}

function toggleChaos() {
  chaosMode = !chaosMode;
  chaosBtn.classList.toggle('active', chaosMode);
}

function toggleLoop() {
  loopMode = !loopMode;
  loopBtn.classList.toggle('active', loopMode);
}

// Volume control ↔ gain
slider.addEventListener('input', () => {
  const pct = parseInt(slider.value,10);
  volInput.value = pct;
  gainNode.gain.value = pct/100;
});
volInput.addEventListener('input', () => {
  let v = parseFloat(volInput.value);
  if (isNaN(v)||v<0) v=0;
  if (v>1000) v=1000;
  volInput.value = v;
  gainNode.gain.value = v/100;
  slider.value = v>100?100:v;
});

// ---- Drag & drop reorder ---------------------------------------------------
function loadOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveOrderFromDOM() {
  const ids = Array.from(container.querySelectorAll('.sound-button'))
    .map(b => b.dataset.id)
    .filter(Boolean);
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch (e) {}
}

function applyOrderToDOM(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return;

  const byId = new Map();
  Array.from(container.querySelectorAll('.sound-button')).forEach(btn => {
    if (btn.dataset.id) byId.set(btn.dataset.id, btn.closest('.sound-item') || btn);
  });

  orderIds.forEach(id => {
    const el = byId.get(id);
    if (el) container.appendChild(el);
  });
}

let draggingEl = null;

function setDragEnabled(btn) {
  btn.draggable = true;

  btn.addEventListener('dragstart', (e) => {
    draggingEl = btn.closest('.sound-item') || btn;
    btn.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', btn.dataset.id || ''); } catch (_) {}
    e.dataTransfer.effectAllowed = 'move';
  });

  btn.addEventListener('dragend', () => {
    btn.classList.remove('dragging');
    draggingEl = null;
    saveOrderFromDOM();
  });

  btn.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  btn.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggingEl) return;

    const target = btn.closest('.sound-item') || btn;
    if (draggingEl === target) return;

    const rect = target.getBoundingClientRect();
    const isAfter = (e.clientY - rect.top) > (rect.height / 2);

    if (isAfter) {
      container.insertBefore(draggingEl, target.nextSibling);
    } else {
      container.insertBefore(draggingEl, target);
    }

    saveOrderFromDOM();
  });
}

// ---- Hotkeys ---------------------------------------------------------------
function loadHotkeys() {
  try {
    const raw = localStorage.getItem(HOTKEYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function saveHotkeys(map) {
  try { localStorage.setItem(HOTKEYS_KEY, JSON.stringify(map || {})); } catch (e) {}
}
function normalizeKey(k) {
  if (!k) return '';
  if (k.length === 1) return k.toLowerCase();
  const lower = k.toLowerCase();
  if (lower === ' ') return 'space';
  return lower;
}
function isValidAssignableKey(key) {
  if (!key) return false;
  const k = normalizeKey(key);
  if (RESERVED_KEYS.has(k)) return false;

  const blocked = new Set(['shift','control','alt','meta','capslock','tab','escape','esc']);
  if (blocked.has(k)) return false;

  if (k.length === 1) return true;
  const allowedSpecial = new Set(['enter','backspace','space','arrowup','arrowdown','arrowleft','arrowright']);
  return allowedSpecial.has(k);
}
function invertHotkeys(map) {
  const inv = {};
  Object.keys(map || {}).forEach(btnId => {
    const k = map[btnId];
    if (k) inv[k] = btnId;
  });
  return inv;
}
function setButtonHotkey(btn, key) {
  const k = key ? normalizeKey(key) : '';
  btn.dataset.hotkey = k;

  const wrap = btn.closest('.sound-item');
  if (!wrap) return;
  const pill = wrap.querySelector('.keymap-pill');
  if (!pill) return;

  pill.textContent = k ? `Key: ${k}` : 'Key: —';
}
function startKeyCaptureFor(btn) {
  const wrap = btn.closest('.sound-item');
  if (!wrap) return;
  const pill = wrap.querySelector('.keymap-pill');
  if (!pill) return;

  keyCapture = { buttonId: btn.dataset.id };
  pill.textContent = 'Press a key... (Esc to cancel)';
}
function stopKeyCapture() {
  if (!keyCapture) return;
  const { buttonId } = keyCapture;
  keyCapture = null;

  const map = loadHotkeys();
  const key = map[buttonId] || '';
  const btn = document.querySelector(`.sound-button[data-id="${CSS.escape(buttonId)}"]`);
  if (btn) setButtonHotkey(btn, key);
}

// Wrap each sound button in a .sound-item and add the map icon + label pill
function ensureHotkeyUIForButton(btn) {
  if (btn.closest('.sound-item')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'sound-item';

  const parent = btn.parentNode;
  parent.insertBefore(wrapper, btn);
  wrapper.appendChild(btn);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexDirection = 'column';
  row.style.alignItems = 'center';
  row.style.gap = '6px';

  const mapBtn = document.createElement('button');
  mapBtn.className = 'keymap-btn';
  mapBtn.type = 'button';
  mapBtn.title = 'Assign hotkey';
  mapBtn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 3.5l-6.2 6.2a5.5 5.5 0 11-1.4-1.4l6.2-6.2a1 1 0 011.4 0l0 0a1 1 0 010 1.4zM9 11.5a2.5 2.5 0 102.5 2.5A2.5 2.5 0 009 11.5z"/>
    </svg>
  `;

  const pill = document.createElement('div');
  pill.className = 'keymap-pill';
  pill.textContent = 'Key: —';

  mapBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startKeyCaptureFor(btn);
  });

  row.appendChild(mapBtn);
  row.appendChild(pill);
  wrapper.appendChild(row);
}

// Bind existing & custom buttons
function bindSoundButton(btn) {
  btn.addEventListener('click', () => {
    playSound(btn.dataset.sound);
  });
  setDragEnabled(btn);
  ensureHotkeyUIForButton(btn);
}

function ensureBuiltInIds() {
  document.querySelectorAll('.sound-button').forEach(btn => {
    if (!btn.dataset.id) {
      const s = btn.dataset.sound || '';
      btn.dataset.id = 'builtin:' + s;
    }
  });
}

// Ensure every button has a color (default green)
function ensureColors() {
  document.querySelectorAll('.sound-button').forEach(btn => {
    if (!btn.dataset.color) btn.dataset.color = 'green';
  });
}

function makeId() {
  return 'cs:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ---- Search + filter -------------------------------------------------------
function getEnabledColors() {
  if (!filterRow) return new Set(['green','red','yellow','orange']);
  const checks = Array.from(filterRow.querySelectorAll('input[type="checkbox"]'));
  const enabled = checks.filter(c => c.checked).map(c => c.value);
  return new Set(enabled);
}

function applySearchAndFilter() {
  const q = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const enabledColors = getEnabledColors();

  document.querySelectorAll('.sound-item').forEach(item => {
    const btn = item.querySelector('.sound-button');
    if (!btn) return;

    const label = (btn.textContent || '').toLowerCase();
    const color = (btn.dataset.color || 'green').toLowerCase();

    const matchesText = !q || label.includes(q);
    const matchesColor = enabledColors.has(color);

    item.classList.toggle('hidden', !(matchesText && matchesColor));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // built-in ids + binding
  ensureBuiltInIds();
  ensureColors();
  document.querySelectorAll('.sound-button').forEach(bindSoundButton);

  // load user-uploaded
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('customSounds')||'[]'); } catch(e){ custom = []; }

  // ensure every custom sound has a stable id; persist back if we add any
  let mutated = false;
  custom.forEach(item => {
    if (!item || typeof item !== 'object') return;
    if (!item.id) { item.id = makeId(); mutated = true; }
  });
  if (mutated) {
    try { localStorage.setItem('customSounds', JSON.stringify(custom)); } catch(e){}
  }

  custom.forEach(item => {
    const btn = document.createElement('button');
    btn.className   = 'sound-button';
    btn.textContent = item.label;
    btn.dataset.sound = item.dataUrl;
    btn.dataset.id = item.id;
    btn.dataset.color = item.color || 'green'; // default green for uploaded too
    container.appendChild(btn);
    bindSoundButton(btn);
  });

  // apply saved order after all buttons exist
  const order = loadOrder();
  if (order) applyOrderToDOM(order);

  // hydrate hotkey labels
  const hotkeys = loadHotkeys();
  document.querySelectorAll('.sound-button').forEach(btn => {
    const k = hotkeys[btn.dataset.id] || '';
    setButtonHotkey(btn, k);
  });

  // wire search/filter
  if (searchInput) {
    searchInput.addEventListener('input', applySearchAndFilter);
  }
  if (filterRow) {
    filterRow.addEventListener('change', applySearchAndFilter);
  }
  applySearchAndFilter();
});

// Keyboard shortcuts (including user-assigned hotkeys)
document.addEventListener('keydown', e => {
  const kRaw = e.key;

  // If user is assigning a key, capture it and stop
  if (keyCapture) {
    const normalized = normalizeKey(kRaw);

    if (normalized === 'escape' || normalized === 'esc') {
      stopKeyCapture();
      return;
    }

    if (!isValidAssignableKey(kRaw)) {
      alert('That key cannot be assigned. Please choose another key (not C, L, or S).');
      stopKeyCapture();
      return;
    }

    const map = loadHotkeys();
    const inv = invertHotkeys(map);

    // unassign this key from any other button
    const otherBtnId = inv[normalizeKey(kRaw)];
    if (otherBtnId && otherBtnId !== keyCapture.buttonId) {
      delete map[otherBtnId];
    }

    map[keyCapture.buttonId] = normalizeKey(kRaw);
    saveHotkeys(map);

    const btn = document.querySelector(`.sound-button[data-id="${CSS.escape(keyCapture.buttonId)}"]`);
    if (btn) setButtonHotkey(btn, map[keyCapture.buttonId]);

    if (otherBtnId && otherBtnId !== keyCapture.buttonId) {
      const otherBtn = document.querySelector(`.sound-button[data-id="${CSS.escape(otherBtnId)}"]`);
      if (otherBtn) setButtonHotkey(otherBtn, '');
    }

    keyCapture = null;
    return;
  }

  // Don’t trigger hotkeys while typing in an input
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea') return;

  const k = normalizeKey(kRaw);

  // existing mode hotkeys
  if (k === 'c') { toggleChaos(); return; }
  if (k === 'l') { toggleLoop(); return; }
  if (k === 's') { stopAll(); return; }

  // user assigned hotkeys
  const map = loadHotkeys();
  const inv = invertHotkeys(map);
  const btnId = inv[k];
  if (btnId) {
    const btn = document.querySelector(`.sound-button[data-id="${CSS.escape(btnId)}"]`);
    if (btn) {
      playSound(btn.dataset.sound);
    }
  }
});

// Mode-bar buttons
chaosBtn.addEventListener('click', toggleChaos);
loopBtn.addEventListener('click', toggleLoop);
stopBtn.addEventListener('click', stopAll);

// Apply stored background on load
(function applyStoredBackground(){
  try {
    const bg = JSON.parse(localStorage.getItem('soundboardBackground') || 'null');
    if(!bg) return;

    const body = document.body;
    if(bg.type === 'color'){
      body.style.background = bg.value;
      body.style.backgroundSize = 'cover';
      body.style.animation = 'none';
    } else if(bg.type === 'image'){
      const img = resolveImagePath(bg.value);
      body.style.background = `url('${img}') center/cover no-repeat, #0f0f12`;
      body.style.animation = 'none';
    }
  } catch (e) {
    console.warn("Could not apply background:", e);
  }
})();
