// Tarjetas de cámaras: al pasar el ratón iluminan la pieza del rover (foco + brillo + línea guía)
// y muestran el nombre de la cámara. Al hacer clic abren el visor de fotos.
import * as THREE from 'three';
import photos from './data/photos.json';

// Cámaras mostradas: clave en photos.json → pieza del GLB (ver rover.js CAMERA_PARTS)
export const CAMERAS = [
  { key: 'mastcamz', node: 'Mastcam_Z_cams', code: 'MCZ', name: 'Mastcam-Z', where: 'Top of the mast · zoom color eyes' },
  { key: 'navcam', node: 'NavCams', code: 'NAV', name: 'NavCams', where: 'Mast head · driving eyes' },
  { key: 'hazcam', node: 'hazcams_front', code: 'HAZ', name: 'Front HazCams', where: 'Front of the body · hazard watch' },
  { key: 'watson', node: 'WATSON', code: 'WAT', name: 'WATSON', where: 'End of the arm · close-up lens' },
];

const SPOT_COLOR = 0xfff1d6;
const SPOT_INTENSITY = 60;
const SPOT_DISTANCE = 3.2; // m desde la pieza hacia la cámara del jugador
const GLOW_SIZE = 0.9;     // m
const EMISSIVE = new THREE.Color(0xffc27a);

function glowTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,245,225,1)');
  grad.addColorStop(0.25, 'rgba(255,200,130,0.55)');
  grad.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCameraCards({ scene, camera, onOpen }) {
  let rover = null;
  let active = null; // cámara iluminada ahora

  // Luz y brillo compartidos: se mueven a la pieza activa
  const spot = new THREE.SpotLight(SPOT_COLOR, 0, 8, 0.32, 0.6, 1.2);
  spot.visible = false;
  scene.add(spot, spot.target);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  glow.renderOrder = 10;
  glow.visible = false;
  scene.add(glow);

  // Capa HTML: tarjetas + línea guía hacia la pieza
  const bar = document.createElement('nav');
  bar.className = 'cam-bar';
  bar.setAttribute('aria-label', 'Rover cameras');
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  guide.classList.add('cam-guide');
  guide.innerHTML = '<line /><circle r="14" /><circle r="3" class="dot" />';
  const tag = document.createElement('div');
  tag.className = 'cam-tag';
  document.body.append(guide, tag, bar);

  const cards = CAMERAS.map((cam, i) => {
    const list = photos.cameras[cam.key] ?? [];
    const newest = Math.max(...list.map((p) => p.sol));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cam-card';
    btn.dataset.camera = cam.key;
    btn.setAttribute('aria-label', `${cam.name}: open ${list.length} photos`);
    btn.innerHTML = `
      <span class="cam-lens" aria-hidden="true"><i></i></span>
      <span class="cam-code">CAM ${String(i + 1).padStart(2, '0')} · ${cam.code}</span>
      <span class="cam-name">${cam.name}</span>
      <span class="cam-where">${cam.where}</span>
      <span class="cam-count">${list.length} photos · up to sol ${newest}</span>`;
    btn.addEventListener('pointerenter', () => setActive(cam));
    btn.addEventListener('focus', () => setActive(cam));
    btn.addEventListener('pointerleave', () => setActive(null));
    btn.addEventListener('blur', () => setActive(null));
    btn.addEventListener('click', () => onOpen(cam, list));
    bar.append(btn);
    return { cam, btn };
  });

  // Materiales propios para poder hacer brillar solo esa pieza
  const partMeshes = new Map();
  function meshesOf(cam) {
    if (!partMeshes.has(cam.key)) {
      const node = rover?.cameras[cam.node]?.node;
      const meshes = [];
      node?.traverse((o) => {
        if (o.isMesh && o.material?.emissive) {
          o.material = o.material.clone();
          o.userData.baseEmissive = o.material.emissive.clone();
          o.userData.baseEmissiveIntensity = o.material.emissiveIntensity;
          meshes.push(o);
        }
      });
      partMeshes.set(cam.key, meshes);
    }
    return partMeshes.get(cam.key);
  }

  function setActive(cam) {
    if (active === cam) return;
    if (active) for (const m of meshesOf(active)) {
      m.material.emissive.copy(m.userData.baseEmissive);
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity;
    }
    active = cam;
    cards.forEach((c) => c.btn.classList.toggle('is-active', c.cam === cam));
    const on = !!(cam && rover?.cameras[cam.node]);
    spot.visible = glow.visible = on;
    guide.classList.toggle('on', on);
    tag.classList.toggle('on', on);
    if (on) tag.innerHTML = `<b>${cam.name}</b><span>${cam.where}</span>`;
  }

  const partPos = new THREE.Vector3();
  const toViewer = new THREE.Vector3();
  const screen = new THREE.Vector3();

  function update(time) {
    if (!active || !rover) return;
    const node = rover.cameras[active.node]?.node;
    if (!node) return;
    node.getWorldPosition(partPos);
    const pulse = 0.75 + 0.25 * Math.sin(time * 0.006);

    // Foco desde el lado del jugador y desde arriba
    toViewer.subVectors(camera.position, partPos).normalize();
    spot.position.copy(partPos).addScaledVector(toViewer, SPOT_DISTANCE);
    spot.position.y += 1.6;
    spot.target.position.copy(partPos);
    spot.intensity = SPOT_INTENSITY * pulse;
    glow.position.copy(partPos);
    glow.scale.setScalar(GLOW_SIZE * (0.9 + 0.2 * pulse));
    for (const m of meshesOf(active)) {
      m.material.emissive.copy(EMISSIVE);
      m.material.emissiveIntensity = 0.55 * pulse;
    }

    // Línea guía de la tarjeta a la pieza (en pantalla)
    screen.copy(partPos).project(camera);
    const px = (screen.x * 0.5 + 0.5) * window.innerWidth;
    const py = (-screen.y * 0.5 + 0.5) * window.innerHeight;
    const card = cards.find((c) => c.cam === active).btn.getBoundingClientRect();
    const [line, ring, dot] = guide.children;
    line.setAttribute('x1', card.left + card.width / 2); line.setAttribute('y1', card.top);
    line.setAttribute('x2', px); line.setAttribute('y2', py + 14);
    ring.setAttribute('cx', px); ring.setAttribute('cy', py);
    dot.setAttribute('cx', px); dot.setAttribute('cy', py);
    tag.style.transform = `translate(${px + 22}px, ${py - 30}px)`;
  }

  return {
    update,
    setRover(r) { rover = r; },
    setVisible(v) { bar.hidden = !v; if (!v) setActive(null); },
  };
}
