// Extracted JS from index.html and adjusted to reference sounds/ and handle data URLs

// Elements
const slider   = document.getElementById('volume-slider');
const volInput = document.getElementById('volume-input');
const container= document.querySelector('.buttons');
const chaosBtn = document.getElementById('chaos-btn');
const loopBtn  = document.getElementById('loop-btn');
const stopBtn  = document.getElementById('stop-btn');

// AudioContext & Gain for volume (0–1000%)
const context = new (window.AudioContext||window.webkitAudioContext)();
const gainNode = context.createGain();
gainNode.gain.value = 1;
gainNode.connect(context.destination);

// State
let chaosMode = false;
let loopMode  = false;
let playing   = []; // array of HTMLAudioElements

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

// Bind existing & custom buttons
function bindSoundButton(btn) {
  btn.addEventListener('click', () => {
    playSound(btn.dataset.sound);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // bind existing buttons
  document.querySelectorAll('.sound-button').forEach(bindSoundButton);

  // load user-uploaded
  const custom = JSON.parse(localStorage.getItem('customSounds')||'[]');
  custom.forEach(item => {
    const btn = document.createElement('button');
    btn.className   = 'sound-button';
    btn.textContent = item.label;
    // stored item.dataUrl is already a data URL — leave as-is so resolveSoundPath will not alter it
    btn.dataset.sound = item.dataUrl;
    container.appendChild(btn);
    bindSoundButton(btn);
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k==='c') toggleChaos();
  if (k==='l') toggleLoop();
  if (k==='s') stopAll();
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
      body.style.animation = 'none'; // disable animated gradient
    } else if(bg.type === 'image'){
      body.style.background = `url('${bg.value}') center/cover no-repeat, #0f0f12`;
      body.style.animation = 'none';
    }
  } catch (e) {
    console.warn("Could not apply background:", e);
  }
})();
