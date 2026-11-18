// Visor de fotos reales de Perseverance: obturador que se cierra, destello,
// y la foto aparece poco a poco (como si bajara línea a línea desde Marte).
const SHUTTER_MS = 420;   // cierre del obturador
const FLASH_MS = 160;     // destello
const REVEAL_MS = 2600;   // revelado gradual
const BLADES = 8;

const DAY_MS = 86400000;
function daysAgo(utc) {
  const d = Math.floor((Date.now() - Date.parse(utc)) / DAY_MS);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html != null) e.innerHTML = html;
  return e;
}

export function createPhotoViewer({ onOpenChange } = {}) {
  const root = el('div', 'pv');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Rover photo');

  const stage = el('div', 'pv-stage');
  const img = el('img', 'pv-img');
  img.alt = '';
  img.decoding = 'async';
  const scan = el('div', 'pv-scan');
  const status = el('div', 'pv-status');
  stage.append(img, scan, status);

  const shutter = el('div', 'pv-shutter');
  for (let i = 0; i < BLADES; i++) {
    const b = el('i');
    b.style.setProperty('--r', `${(360 / BLADES) * i}deg`);
    shutter.append(b);
  }
  const flash = el('div', 'pv-flash');

  const info = el('div', 'pv-info');
  const close = el('button', 'pv-close', '<span aria-hidden="true">✕</span>');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close and return to cameras');
  const prev = el('button', 'pv-nav pv-prev', '<span aria-hidden="true">‹</span>');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous photo');
  const next = el('button', 'pv-nav pv-next', '<span aria-hidden="true">›</span>');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next photo');

  root.append(stage, shutter, flash, info, prev, next, close);
  document.body.append(root);

  let cam = null, list = [], index = 0, token = 0;
  const state = { open: false, camera: null, index: 0, loaded: false, revealed: false, src: null, naturalWidth: 0 };
  window.__photoViewer = state;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.decoding = 'async';
      probe.onload = () => resolve(probe);
      probe.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      probe.src = src;
    });
  }

  function renderInfo(photo) {
    const taken = new Date(photo.takenUtc);
    info.innerHTML = `
      <div class="pv-cam">${cam.name} <span>${photo.instrument.replaceAll('_', ' ')}</span></div>
      <div class="pv-title">${photo.title}</div>
      <div class="pv-meta">
        <span><small>SOL</small>${photo.sol}</span>
        <span><small>TAKEN</small>${daysAgo(photo.takenUtc)}</span>
        <span><small>EARTH DATE</small>${taken.toISOString().slice(0, 10)}</span>
        <span><small>PHOTO</small>${index + 1} / ${list.length}</span>
      </div>
      <a class="pv-link" href="${photo.page}" target="_blank" rel="noopener">NASA raw image ${photo.id.slice(0, 22)}…</a>`;
  }

  // Secuencia: obturador cierra → destello → la foto se revela poco a poco
  async function show(i, { full = true } = {}) {
    const my = ++token;
    index = (i + list.length) % list.length;
    const photo = list[index];
    Object.assign(state, { camera: cam.key, index, loaded: false, revealed: false, src: photo.image, naturalWidth: 0 });
    root.classList.remove('is-revealing', 'is-shown');
    root.classList.add('is-closing');
    status.textContent = 'Receiving from Mars…';
    const loading = loadImage(photo.image);
    await wait(full ? SHUTTER_MS : SHUTTER_MS * 0.6);
    if (my !== token) return;
    root.classList.add('is-flash');
    await wait(FLASH_MS);
    root.classList.remove('is-flash');
    let probe;
    try {
      probe = await loading;
    } catch (err) {
      if (my !== token) return;
      status.textContent = 'No signal from Mars. Try the next photo.';
      root.classList.remove('is-closing');
      console.error('[photos]', err);
      return;
    }
    if (my !== token) return;
    img.src = probe.src;
    img.alt = `${cam.name}, sol ${photo.sol}: ${photo.title}`;
    Object.assign(state, { loaded: true, naturalWidth: probe.naturalWidth });
    renderInfo(photo);
    root.classList.remove('is-closing');
    root.classList.add('is-revealing');
    await wait(REVEAL_MS);
    if (my !== token) return;
    root.classList.replace('is-revealing', 'is-shown');
    state.revealed = true;
    status.textContent = '';
  }

  function open(camera, photos) {
    cam = camera;
    list = photos;
    root.hidden = false;
    state.open = true;
    onOpenChange?.(true);
    close.focus({ preventScroll: true });
    show(0);
  }

  function hide() {
    token++;
    root.hidden = true;
    root.classList.remove('is-closing', 'is-revealing', 'is-shown', 'is-flash');
    Object.assign(state, { open: false, revealed: false });
    onOpenChange?.(false);
  }

  close.addEventListener('click', hide);
  prev.addEventListener('click', () => show(index - 1, { full: false }));
  next.addEventListener('click', () => show(index + 1, { full: false }));
  window.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.code === 'Escape') hide();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') show(index + 1, { full: false });
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') show(index - 1, { full: false });
    else return;
    e.preventDefault();
  });

  return { open, hide, state };
}
