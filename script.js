// Elements
const slider   = document.getElementById('volume-slider');
const volInput = document.getElementById('volume-input');
const container= document.querySelector('.buttons');
const chaosBtn = document.getElementById('chaos-btn');
const loopBtn  = document.getElementById('loop-btn');
const stopBtn  = document.getElementById('stop-btn');
const searchInput = document.getElementById('search');
const filterGroup = document.querySelector('.filter-group');

// State
let chaosMode = false;
let loopMode  = false;
let playing   = []; 
let keyCapture = null;

// Audio Setup
const context = new (window.AudioContext||window.webkitAudioContext)();
const gainNode = context.createGain();
gainNode.gain.value = 1;
gainNode.connect(context.destination);

// Storage Keys
const ORDER_KEY = 'sb_order';
const HOTKEYS_KEY = 'sb_keys';

// Helpers
function resolveSoundPath(ds) {
  if (!ds || ds.startsWith('data:') || ds.startsWith('http')) return ds;
  let p = ds.replace(/^\/+/, '');
  return p.startsWith('sounds/') ? p : 'sounds/' + p;
}

function resolveImagePath(p) {
  if (!p || p.startsWith('data:') || p.startsWith('http')) return p;
  let path = p.replace(/^\/+/, '').replace(/^(\.\.\/)+images\//, 'images/');
  return path.startsWith('images/') ? path : 'images/' + path;
}

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function setVolumeFromUI() {
  // SLIDER IS 0-100 (PERCENT SHOWN), INPUT IS 0-1000 (ALLOWS BOOST)
  const sliderVal = clamp(slider.value, 0, 100);
  const inputVal  = clamp(volInput.value, 0, 1000);

  // IF USER MOVES SLIDER, KEEP INPUT IN SYNC UP TO 100
  // (INPUT CAN STILL BE TYPED ABOVE 100 MANUALLY)
  if (document.activeElement === slider) {
    volInput.value = String(sliderVal);
  }

  // IF USER TYPES, KEEP SLIDER IN SYNC BUT CLAMPED TO 0-100
  if (document.activeElement === volInput) {
    slider.value = String(clamp(inputVal, 0, 100));
  }

  // MAP 0-1000 -> 0.0-10.0 GAIN
  gainNode.gain.value = inputVal / 100;
}

function playSound(srcIdentifier) {
  context.resume();
  if (!chaosMode) stopAll();
  const audio = new Audio(resolveSoundPath(srcIdentifier));
  audio.loop = loopMode;
  try { context.createMediaElementSource(audio).connect(gainNode); } catch(e){}
  audio.play();
  playing.push(audio);
}

function stopAll() {
  playing.forEach(a => { try { a.pause(); } catch(e){} });
  playing = [];
}

// ---- Search & Filter Logic (FIXED) ----
function applyFilters() {
  const query = searchInput.value.toLowerCase().trim();
  const activeColors = Array.from(filterGroup.querySelectorAll('input:checked')).map(i => i.value);

  document.querySelectorAll('.sound-item').forEach(item => {
    const btn = item.querySelector('.sound-button');
    const label = btn.textContent.toLowerCase();
    const color = btn.dataset.color || 'green';

    const matchesSearch = !query || label.includes(query);
    const matchesColor = activeColors.includes(color);

    item.classList.toggle('hidden', !(matchesSearch && matchesColor));
  });
}

// ---- Hotkeys ----
function loadKeys() { return JSON.parse(localStorage.getItem(HOTKEYS_KEY) || '{}'); }
function saveKeys(map) { localStorage.setItem(HOTKEYS_KEY, JSON.stringify(map)); }

function setHotkeyLabel(btn, key) {
  const pill = btn.closest('.sound-item').querySelector('.keymap-pill');
  pill.textContent = key ? `[${key.toUpperCase()}]` : '---';
}

// ---- UI Builder ----
function wrapButton(btn) {
  if (btn.closest('.sound-item')) return;
  const item = document.createElement('div');
  item.className = 'sound-item';
  btn.parentNode.insertBefore(item, btn);

  const row = document.createElement('div');
  row.className = 'keymap-row';
  
  const mapBtn = document.createElement('button');
  mapBtn.className = 'keymap-btn';
  mapBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20.5 3.5l-6.2 6.2a5.5 5.5 0 11-1.4-1.4l6.2-6.2a1 1 0 011.4 0l0 0a1 1 0 010 1.4z"/></svg>';
  mapBtn.onclick = () => {
    keyCapture = btn.dataset.id;
    item.querySelector('.keymap-pill').textContent = '???';
  };

  const pill = document.createElement('span');
  pill.className = 'keymap-pill';
  pill.textContent = '---';

  row.append(mapBtn, pill);
  item.append(btn, row);

  // Drag functionality
  btn.draggable = true;
  btn.ondragstart = (e) => { btn.classList.add('dragging'); e.dataTransfer.setData('text/plain', btn.dataset.id); };
  btn.ondragend = () => { btn.classList.remove('dragging'); saveOrder(); };
}

function saveOrder() {
  const ids = Array.from(container.querySelectorAll('.sound-button')).map(b => b.dataset.id);
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

function initButton(btn) {
  if (!btn.dataset.id) btn.dataset.id = 'b_' + btn.dataset.sound;
  if (!btn.dataset.color) btn.dataset.color = 'green';
  btn.onclick = () => playSound(btn.dataset.sound);
  wrapButton(btn);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sound-button').forEach(initButton);

  // INIT VOLUME UI + EVENTS
  setVolumeFromUI();
  slider.addEventListener('input', setVolumeFromUI);
  volInput.addEventListener('input', setVolumeFromUI);
  volInput.addEventListener('change', () => {
    // HARD CLAMP TYPED VALUE ON BLUR/ENTER
    volInput.value = String(clamp(volInput.value, 0, 1000));
    slider.value = String(clamp(volInput.value, 0, 100));
    setVolumeFromUI();
  });

  // Load Custom
  const custom = JSON.parse(localStorage.getItem('customSounds') || '[]');
  custom.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sound-button';
    b.textContent = c.label;
    b.dataset.sound = c.dataUrl;
    b.dataset.color = c.color || 'green';
    b.dataset.id = 'c_' + Date.now() + Math.random();
    container.append(b);
    initButton(b);
  });

  // Reorder
  const order = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  order.forEach(id => {
    const b = container.querySelector(`[data-id="${id}"]`);
    if (b) container.append(b.closest('.sound-item'));
  });

  // Hydrate Hotkeys
  const keys = loadKeys();
  Object.entries(keys).forEach(([id, key]) => {
    const b = container.querySelector(`[data-id="${id}"]`);
    if (b) setHotkeyLabel(b, key);
  });

  // Search/Filter events
  searchInput.oninput = applyFilters;
  filterGroup.onchange = applyFilters;
  
  // Drag over
  container.ondragover = (e) => {
    e.preventDefault();
    const dragging = document.querySelector('.dragging').closest('.sound-item');
    const target = e.target.closest('.sound-item');
    if (target && target !== dragging) container.insertBefore(dragging, target);
  };
});

// Key Handling
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  
  if (keyCapture) {
    if (['c','l','s','escape'].includes(k)) { keyCapture = null; applyFilters(); return; }
    const keys = loadKeys();
    keys[keyCapture] = k;
    saveKeys(keys);
    setHotkeyLabel(container.querySelector(`[data-id="${keyCapture}"]`), k);
    keyCapture = null;
    return;
  }

  if (e.target.tagName === 'INPUT') return;

  if (k === 'c') { chaosMode = !chaosMode; chaosBtn.classList.toggle('active', chaosMode); }
  if (k === 'l') { loopMode = !loopMode; loopBtn.classList.toggle('active', loopMode); }
  if (k === 's') stopAll();

  const map = loadKeys();
  const id = Object.keys(map).find(id => map[id] === k);
  if (id) container.querySelector(`[data-id="${id}"]`)?.click();
});

// Controls
chaosBtn.onclick = () => { chaosMode = !chaosMode; chaosBtn.classList.toggle('active', chaosMode); };
loopBtn.onclick = () => { loopMode = !loopMode; loopBtn.classList.toggle('active', loopMode); };
stopBtn.onclick = stopAll;

// Background
(function(){
  const bg = JSON.parse(localStorage.getItem('soundboardBackground') || 'null');
  if (!bg) return;
  if (bg.type === 'color') document.body.style.background = bg.value;
  else if (bg.type === 'image') document.body.style.background = `url('${resolveImagePath(bg.value)}') center/cover no-repeat`;
  document.body.style.animation = 'none';
})();
