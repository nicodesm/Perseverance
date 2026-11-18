// Panel de control de misión dentro del juego (vista, como un "view provider" de Open MCT)
// Cada dato muestra: nombre, valor con unidad, proveedor, gráfica de toda la misión y una frase sencilla.
import { createTelemetryAPI } from './telemetry/telemetryApi.js';
import { createNasaWaypointsProvider, NAMESPACE as NASA, PUBLIC_URL } from './telemetry/nasaWaypoints.js';
import { createLightTimeProvider, LIGHT_NAMESPACE } from './telemetry/lightTime.js';
import { currentSol } from './telemetry/mission.js';

const TOGGLE_KEY = 'KeyT';
const CHART_HEIGHT = 46; // px
const COLORS = { line: '#ffb36b', fill: 'rgba(255,179,107,0.22)', now: '#fff1e0', grid: 'rgba(255,220,190,0.12)', label: 'rgba(255,225,200,0.75)', labelBg: 'rgba(24,11,6,0.7)' };

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const minSec = (minutes) => {
  const total = Math.round(minutes * 60);
  return { m: Math.floor(total / 60), s: total % 60 };
};

// Objetos de telemetría (identificador + cómo mostrarlos)
const POINTS = [
  {
    identifier: { namespace: NASA, key: 'distance' },
    provider: 'NASA · rover waypoints',
    format: (v) => ({ main: v.toFixed(2), unit: 'km' }),
    axis: (v) => `${v.toFixed(0)} km`,
    say: (v) => `How far Percy has driven on Mars since landing in February 2021. That is about ${(v / 42.195).toFixed(1)} marathons, at a top speed of about 0.15 km/h.`,
  },
  {
    identifier: { namespace: NASA, key: 'elevation' },
    provider: 'NASA · rover waypoints',
    format: (v) => ({ main: (v < 0 ? '−' : '') + fmtInt.format(Math.abs(v)), unit: 'm' }),
    axis: (v) => `${fmtInt.format(v)} m`,
    say: (v, data) => {
      const climb = Math.round(v - data[0].value);
      return `Height of Percy's latest stop compared with Mars "sea level". Percy is ${fmtInt.format(climb)} m higher than where it landed: it has climbed the rim of Jezero Crater.`;
    },
  },
  {
    identifier: { namespace: NASA, key: 'slope' },
    provider: 'NASA · rover waypoints',
    format: (v) => ({ main: v.toFixed(1), unit: '°' }),
    axis: (v) => `${v.toFixed(0)}°`,
    say: (v, data) => `How tilted the ground was under Percy at its latest stop (0° is flat). The steepest stop of the whole trip was ${Math.max(...data.map((d) => d.value)).toFixed(1)}°.`,
  },
  {
    identifier: { namespace: LIGHT_NAMESPACE, key: 'lightTime' },
    provider: 'Earth → Mars · computed live',
    format: (v) => { const { m, s } = minSec(v); return { main: `${m}m ${String(s).padStart(2, '0')}s`, unit: 'one way' }; },
    axis: (v) => `${v.toFixed(0)} min`,
    say: (v) => { const { m, s } = minSec(v); return `A radio command from Earth takes ${m} min ${s} s to reach Percy right now, so drivers plan each day's drive in advance. There is no live joystick on Mars.`; },
  },
];

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// Gráfica de toda la misión: eje X = sol 0 … sol actual
function drawChart(canvas, data, xMax, axisLabel) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = CHART_HEIGHT;
  if (!w) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const values = data.map((d) => d.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const top = 6, bottom = h - 4, left = 2, right = w - 2;
  const x = (sol) => left + (sol / xMax) * (right - left);
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);

  // Rejilla y etiquetas mín./máx.
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  [top, (top + bottom) / 2, bottom].forEach((gy) => { ctx.beginPath(); ctx.moveTo(left, gy + 0.5); ctx.lineTo(right, gy + 0.5); ctx.stroke(); });

  // Área + línea
  ctx.beginPath();
  data.forEach((d, i) => (i ? ctx.lineTo(x(d.sol), y(d.value)) : ctx.moveTo(x(d.sol), y(d.value))));
  ctx.lineTo(x(data.at(-1).sol), bottom); ctx.lineTo(x(data[0].sol), bottom); ctx.closePath();
  ctx.fillStyle = COLORS.fill; ctx.fill();
  ctx.beginPath();
  data.forEach((d, i) => (i ? ctx.lineTo(x(d.sol), y(d.value)) : ctx.moveTo(x(d.sol), y(d.value))));
  ctx.strokeStyle = COLORS.line; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();

  // Último punto
  const last = data.at(-1);
  ctx.beginPath(); ctx.arc(x(last.sol), y(last.value), 3, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.now; ctx.fill();

  // Etiquetas mín./máx. encima de la línea, con fondo para que se lean
  ctx.font = '10px ui-monospace, "DejaVu Sans Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  [[axisLabel(hi - pad), top + 5], [axisLabel(lo + pad), bottom - 6]].forEach(([text, ly]) => {
    const tw = ctx.measureText(text).width + 6;
    ctx.fillStyle = COLORS.labelBg; ctx.fillRect(left, ly - 6, tw, 12);
    ctx.fillStyle = COLORS.label; ctx.fillText(text, left + 3, ly + 0.5);
  });
}

export function createMissionPanel(container = document.body) {
  const telemetry = createTelemetryAPI();
  telemetry.addProvider(createNasaWaypointsProvider());
  telemetry.addProvider(createLightTimeProvider());

  const status = {};
  window.__telemetry = status; // para `npm run check`

  // Estructura
  const panel = el('aside', 'mc');
  panel.id = 'mission-panel';
  panel.setAttribute('aria-label', 'Mission control telemetry');
  const header = el('header', 'mc-header');
  const title = el('div', 'mc-title');
  title.append(el('span', 'mc-brand', 'PERSEVERANCE'), el('span', 'mc-sub', 'Mission control · Jezero Crater'));
  const solBox = el('div', 'mc-sol');
  header.append(title, solBox);
  const clock = el('div', 'mc-clock');
  const list = el('div', 'mc-list');
  const footer = el('footer', 'mc-footer');
  panel.append(header, clock, list, footer);

  const tab = el('button', 'mc-tab');
  tab.type = 'button';
  tab.innerHTML = '<kbd>T</kbd> Mission control';
  tab.hidden = true;
  container.append(panel, tab);

  const cards = POINTS.map((point) => {
    const key = point.identifier.key;
    const meta = telemetry.getMetadata(point);
    const range = meta.values.find((v) => v.hints.range === 1);
    status[key] = { ok: false, name: range.name, unit: range.unit, provider: point.provider };

    const card = el('section', 'mc-point');
    card.dataset.key = key;
    const head = el('div', 'mc-head');
    head.append(el('h3', null, range.name), el('span', 'mc-prov', point.provider));
    const value = el('div', 'mc-value');
    const main = el('b', null, '···');
    const unit = el('span', null, range.unit);
    const when = el('span', 'mc-when', 'receiving…');
    value.append(main, unit, when);
    const canvas = el('canvas', 'mc-chart');
    canvas.style.height = `${CHART_HEIGHT}px`;
    const axis = el('div', 'mc-axis');
    const axisStart = el('span', null, 'Sol 0'), axisEnd = el('span', null, '');
    axis.append(axisStart, el('span', 'mc-axis-mid', 'whole mission'), axisEnd);
    const say = el('p', 'mc-say', '');
    card.append(head, value, canvas, axis, say);
    list.append(card);
    return { point, key, card, main, unit, when, canvas, axisEnd, say, data: [] };
  });

  function render(c) {
    if (!c.data.length) return;
    const last = c.data.at(-1);
    const { main, unit } = c.point.format(last.value);
    c.main.textContent = main;
    c.unit.textContent = unit;
    const nowSol = currentSol();
    c.when.textContent = c.point.identifier.namespace === NASA ? `latest stop · sol ${last.sol}` : 'live · now';
    c.axisEnd.textContent = `Sol ${nowSol}`;
    c.say.textContent = c.point.say(last.value, c.data);
    drawChart(c.canvas, c.data, Math.max(nowSol, last.sol), c.point.axis);
    Object.assign(status[c.key], { ok: true, value: +last.value.toFixed(3), sol: Math.round(last.sol), points: c.data.length });
  }

  // Historial de toda la misión + suscripción en vivo cuando el proveedor la ofrece
  for (const c of cards) {
    telemetry
      .request(c.point)
      .then((data) => {
        if (!data.length) throw new Error('sin datos');
        c.data = data;
        status[c.key].source = telemetry.getSource(c.point);
        render(c);
        telemetry.subscribe(c.point, (datum) => {
          c.data.push(datum);
          render(c);
        });
        renderFooter();
      })
      .catch((err) => {
        status[c.key].error = String(err);
        c.main.textContent = 'NO SIGNAL';
        c.when.textContent = '';
        c.card.classList.add('mc-error');
        console.error(`[telemetry] ${status[c.key].name}:`, err);
      });
  }

  function renderFooter() {
    const nasa = status.distance.source;
    footer.textContent = '';
    if (nasa) {
      const live = nasa.mode === 'live';
      const dot = el('span', `mc-dot ${live ? 'ok' : 'warn'}`);
      const link = el('a', null, 'M20_waypoints.json');
      link.href = PUBLIC_URL; link.target = '_blank'; link.rel = 'noopener';
      const updated = nasa.updated ? new Date(nasa.updated).toISOString().slice(0, 10) : '?';
      footer.append(dot, `NASA ${live ? 'live feed' : 'saved copy'} · `, link, ` · updated ${updated}`);
    }
  }

  // Reloj: sol de la misión y hora UTC en la Tierra
  function tick() {
    solBox.innerHTML = `<small>SOL</small>${currentSol()}`;
    clock.innerHTML = `Earth ${new Date().toISOString().slice(11, 19)} UTC <span><kbd>T</kbd> hide</span>`;
  }
  tick();
  setInterval(tick, 1000);

  // Tecla T: mostrar / ocultar
  function setVisible(visible) {
    panel.hidden = !visible;
    tab.hidden = visible;
    if (visible) cards.forEach(render); // redibujar al volver (el canvas no tenía tamaño)
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== TOGGLE_KEY || e.repeat || e.target.closest?.('input, textarea')) return;
    setVisible(panel.hidden);
  });
  tab.addEventListener('click', () => setVisible(true));
  window.addEventListener('resize', () => !panel.hidden && cards.forEach(render));

  return { telemetry, status, setVisible };
}
