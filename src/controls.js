// Entrada de teclado: WASD / flechas → acelerador y dirección
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

export function createKeyboard() {
  const pressed = new Set();
  const handled = new Set(Object.values(KEYS).flat());

  window.addEventListener('keydown', (e) => {
    if (!handled.has(e.code)) return;
    pressed.add(e.code);
    if (keyboard.paused) return;
    e.preventDefault(); // evita que las flechas hagan scroll
  });
  window.addEventListener('keyup', (e) => pressed.delete(e.code));
  window.addEventListener('blur', () => pressed.clear());

  let keyboard;
  const any = (codes) => codes.some((c) => pressed.has(c));

  // throttle: -1 (atrás) … 1 (adelante); steer: -1 (derecha) … 1 (izquierda)
  // paused: con el visor de fotos abierto el rover no se mueve (las flechas pasan fotos)
  keyboard = {
    paused: false,
    get throttle() { return this.paused ? 0 : (any(KEYS.forward) ? 1 : 0) - (any(KEYS.back) ? 1 : 0); },
    get steer() { return this.paused ? 0 : (any(KEYS.left) ? 1 : 0) - (any(KEYS.right) ? 1 : 0); },
  };
  return keyboard;
}
