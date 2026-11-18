// Comprobación automática: abre la página en Chrome invisible (el Chrome instalado),
// guarda una captura y lista los errores de consola.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.CHECK_URL || 'http://localhost:5173/';
const OUT = 'screenshots/check.png';
const OUT_HIDDEN = 'screenshots/check-panel-hidden.png';
const OUT_HOVER = 'screenshots/check-camera-hover.png';
const PHOTO_TIMEOUT = Number(process.env.CHECK_PHOTO_TIMEOUT || 30000);
const TELEMETRY_TIMEOUT = Number(process.env.CHECK_TELEMETRY_TIMEOUT || 20000);
const WAIT_MS = Number(process.env.CHECK_WAIT || 1500);
const READY_TIMEOUT = Number(process.env.CHECK_READY_TIMEOUT || 30000);
const KEYS = process.env.CHECK_KEYS ?? 'KeyW:5000,KeyW+KeyA:3000,KeyW:2000';

mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome', // usa el Google Chrome del sistema, no descarga navegadores
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
const logs = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
  else if (msg.type() === 'log' && msg.text().startsWith('[')) logs.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
} catch (e) {
  errors.push(`[goto] ${e.message}`);
}
// Esperar a que la escena (rover incluido) esté lista
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: READY_TIMEOUT });
} catch {
  errors.push(`[ready] la escena no marcó window.__ready en ${READY_TIMEOUT} ms`);
}
// Conducir: CHECK_KEYS="KeyW:4000,KeyA+KeyW:2000" (teclas a la vez con +, duración en ms)
for (const step of KEYS.split(',').filter(Boolean)) {
  const [combo, ms] = step.split(':');
  const keys = combo.split('+');
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(Number(ms));
  for (const k of keys) await page.keyboard.up(k);
}
await page.waitForTimeout(WAIT_MS);

// Telemetría: los 4 datos deben cargar con números reales
const POINTS = ['distance', 'elevation', 'slope', 'lightTime'];
try {
  await page.waitForFunction(
    (keys) => keys.every((k) => window.__telemetry?.[k]?.ok || window.__telemetry?.[k]?.error),
    POINTS, { timeout: TELEMETRY_TIMEOUT },
  );
} catch {
  errors.push(`[telemetry] los datos no terminaron de cargar en ${TELEMETRY_TIMEOUT} ms`);
}
const telemetry = await page.evaluate(() => window.__telemetry ?? {}).catch(() => ({}));
const telemetryRows = [];
for (const key of POINTS) {
  const t = telemetry[key];
  if (!t?.ok || !Number.isFinite(t.value)) {
    errors.push(`[telemetry] ${key}: sin dato (${t?.error ?? 'no cargó'})`);
    continue;
  }
  const src = t.source ? (t.source.mode === 'computed' ? t.source.label : `NASA ${t.source.mode}, updated ${t.source.updated}`) : '?';
  telemetryRows.push(`  ✓ ${t.name.padEnd(24)} ${String(t.value).padStart(10)} ${t.unit.padEnd(4)} sol ${t.sol}  · ${t.points} puntos · ${src}`);
}

// Tecla T: ocultar y volver a mostrar el panel
const panelVisible = () => page.evaluate(() => {
  const p = document.getElementById('mission-panel');
  return !!p && !p.hidden && getComputedStyle(p).display !== 'none';
});
if (!(await panelVisible())) errors.push('[panel] el panel no está visible al empezar');
await page.keyboard.press('KeyT');
await page.waitForTimeout(300);
if (await panelVisible()) errors.push('[panel] la tecla T no ocultó el panel');
else await page.screenshot({ path: OUT_HIDDEN });
await page.keyboard.press('KeyT');
await page.waitForTimeout(500);
if (!(await panelVisible())) errors.push('[panel] la tecla T no volvió a mostrar el panel');
const panelOk = !errors.some((e) => e.startsWith('[panel]'));

// Cámaras: pasar el ratón ilumina la pieza; clic abre una foto real de NASA
const photoRows = [];
const cards = await page.$$('.cam-card');
if (cards.length !== 4) errors.push(`[photos] se esperaban 4 tarjetas de cámara, hay ${cards.length}`);
if (cards[0]) {
  await cards[0].hover();
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT_HOVER });
}
const viewer = () => page.evaluate(() => ({ ...window.__photoViewer }));
for (const card of cards) {
  const key = await card.getAttribute('data-camera');
  await card.click();
  try {
    await page.waitForFunction(() => window.__photoViewer?.revealed === true, null, { timeout: PHOTO_TIMEOUT });
  } catch {
    errors.push(`[photos] ${key}: la foto no se reveló en ${PHOTO_TIMEOUT} ms`);
  }
  const v = await viewer();
  const real = v.loaded && v.naturalWidth > 0 && /^https:\/\/mars\.nasa\.gov\/mars2020-raw-images\//.test(v.src ?? '');
  if (!real) errors.push(`[photos] ${key}: no abrió una foto real (${v.src})`);
  const shot = `screenshots/check-photo-${key}.png`;
  await page.screenshot({ path: shot });
  // Flecha: siguiente foto de la misma cámara
  await page.keyboard.press('ArrowRight');
  try {
    await page.waitForFunction(() => window.__photoViewer?.index === 1 && window.__photoViewer?.loaded, null, { timeout: PHOTO_TIMEOUT });
  } catch {
    errors.push(`[photos] ${key}: la flecha no pasó a la siguiente foto`);
  }
  const v2 = await viewer();
  photoRows.push(`  ${real ? '✓' : '✗'} ${key.padEnd(9)} ${v.naturalWidth}px  ${(v.src ?? '').split('/').pop()}  → flecha: foto ${v2.index + 1}  · ${shot}`);
  await page.click('.pv-close');
  await page.waitForTimeout(300);
  if ((await viewer()).open) errors.push(`[photos] ${key}: el botón cerrar no volvió a la cuadrícula`);
}

const info = await page.evaluate(() => window.__checkInfo?.()).catch(() => null);
if (info) logs.push(`[check] ${JSON.stringify(info)}`);
await page.screenshot({ path: OUT });
await browser.close();

if (logs.length) console.log('Consola de la página:\n' + logs.map((l) => '  ' + l).join('\n') + '\n');
if (telemetryRows.length) console.log(`Telemetría (${telemetryRows.length}/4 datos):\n${telemetryRows.join('\n')}\n`);
console.log(`Panel con tecla T: ${panelOk ? 'se oculta y vuelve a aparecer ✓' : 'FALLA'}`);
if (photoRows.length) console.log(`Fotos de las cámaras (${photoRows.filter((r) => r.includes('✓')).length}/4 reales):\n${photoRows.join('\n')}\n`);
console.log(`Capturas: ${OUT}, ${OUT_HIDDEN}, ${OUT_HOVER}`);
if (errors.length) {
  console.log(`\n${errors.length} problema(s) en consola:`);
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
} else {
  console.log('Sin errores en consola.');
}
