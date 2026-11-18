// Punto de entrada: escena, cámara, luces, rover y bucle de render
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain } from './terrain.js';
import { createSky, createMoons, SKY_HORIZON } from './sky.js';
import { createRocks } from './rocks.js';
import { createDust } from './dust.js';
import { createRover } from './rover.js';
import { createKeyboard } from './controls.js';
import { createTracks } from './tracks.js';
import { createMissionPanel } from './panel.js';
import { createCameraCards } from './cameraCards.js';
import { createPhotoViewer } from './photoViewer.js';

// Sol de tarde: bajo, delante a la izquierda de la cámara
const SUN_DIR = new THREE.Vector3(-0.42, 0.16, -0.89).normalize();
const SHADOW_EXTENT = 45;
// Rover: salida mirando hacia el sol y las lunas (-Z)
const ROVER_START = new THREE.Vector3(2, 0, 16);
const ROVER_HEADING = Math.PI;
// Cámara de seguimiento
const CHASE_DISTANCE = 9;   // m detrás del rover
const CHASE_HEIGHT = 3.2;   // m sobre el rover
const CHASE_PULL = 1.6;     // rapidez con la que vuelve detrás al conducir
const LOOK_AHEAD = 2;       // m delante del rover hacia donde mira la cámara
// Simulación
const SIM_STEP = 1 / 60;    // paso fijo de la física (s)
const MAX_FRAME_TIME = 1;   // tiempo máximo simulado por fotograma (s)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(SKY_HORIZON, 0.0042);

const terrain = createTerrain();
scene.add(terrain.mesh);
ROVER_START.y = terrain.heightAt(ROVER_START.x, ROVER_START.z);

// Cámara detrás del rover
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);
const startForward = new THREE.Vector3(Math.sin(ROVER_HEADING), 0, Math.cos(ROVER_HEADING));
camera.position.copy(ROVER_START).addScaledVector(startForward, -CHASE_DISTANCE);
camera.position.y = ROVER_START.y + CHASE_HEIGHT;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(ROVER_START).addScaledVector(startForward, LOOK_AHEAD);
controls.target.y += 1.2;
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.53;
controls.minDistance = 4;
controls.maxDistance = 60;

// Luces: luz del cielo + sol cálido con sombras suaves que siguen al rover
scene.add(new THREE.HemisphereLight(0xf2b787, 0x7a3a1e, 1.1));
const sun = new THREE.DirectionalLight(0xffb36b, 3.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.radius = 4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, {
  left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 600,
});
scene.add(sun, sun.target);
function placeSun(center) {
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(SUN_DIR, 250);
}
placeSun(ROVER_START);

scene.add(createSky(SUN_DIR));
scene.add(createMoons().group);
scene.add(createRocks(terrain.heightAt, [camera.position, ROVER_START]));
const dustCenter = ROVER_START.clone();
const dust = createDust(terrain.heightAt, dustCenter);
scene.add(dust.group);
const tracks = createTracks(terrain.heightAt);
scene.add(tracks.group);

const keyboard = createKeyboard();
// Panel de control de misión con telemetría real de Percy (tecla T para ocultar)
const missionPanel = createMissionPanel();
window.missionPanel = missionPanel;

// Cámaras del rover: tarjetas que iluminan la pieza y abren fotos reales de NASA
const photoViewer = createPhotoViewer({
  onOpenChange: (open) => {
    keyboard.paused = open;
    cameraCards.setVisible(!open);
  },
});
const cameraCards = createCameraCards({ scene, camera, onOpen: (cam, photos) => photoViewer.open(cam, photos) });
let rover = null;

createRover({ heightAt: terrain.heightAt, start: ROVER_START, heading: ROVER_HEADING })
  .then((r) => {
    rover = r;
    cameraCards.setRover(r);
    scene.add(rover.object);
    // Accesibles desde la consola para usarlas al final
    window.rover = rover;
    window.roverCameras = rover.cameras;
    console.log('[rover] Usa WASD o flechas para conducir. Cámaras disponibles en window.roverCameras');
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
  })
  .catch((err) => console.error('[rover] No se pudo cargar el modelo:', err));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const prevRoverPos = new THREE.Vector3();
const forward = new THREE.Vector3();
const desired = new THREE.Vector3();

function followRover(dt) {
  const pos = rover.state.position;
  // La cámara se mueve con el rover (se puede seguir orbitando con el ratón)
  camera.position.add(desired.subVectors(pos, prevRoverPos));
  rover.forward(forward);
  controls.target.copy(pos).addScaledVector(forward, LOOK_AHEAD);
  controls.target.y += 1.2;
  // Al conducir, la cámara vuelve suavemente detrás del rover
  if (Math.abs(rover.state.speed) > 0.05) {
    desired.copy(pos).addScaledVector(forward, -CHASE_DISTANCE);
    desired.y = pos.y + CHASE_HEIGHT;
    camera.position.lerp(desired, 1 - Math.exp(-CHASE_PULL * dt));
  }
}

// Información para `npm run check`
let frames = 0;
window.__checkInfo = () => rover && ({
  fps: +(frames / timer.getElapsed()).toFixed(1),
  distance: +rover.state.distance.toFixed(1),
  position: rover.state.position.toArray().map((v) => +v.toFixed(1)),
});

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // Tiempo real (máx. 1 s) dividido en pasos fijos: la física no depende de los fps
  const dt = Math.min(timer.getDelta(), MAX_FRAME_TIME);
  frames++;

  if (rover) {
    prevRoverPos.copy(rover.state.position);
    const steps = Math.max(1, Math.ceil(dt / SIM_STEP));
    for (let i = 0; i < steps; i++) {
      rover.update(dt / steps, keyboard);
      tracks.update(rover);
    }
    followRover(dt);
    placeSun(rover.state.position);
    dustCenter.set(rover.state.position.x, 0, rover.state.position.z);
  }

  controls.update();
  // No dejar que la cámara atraviese el suelo
  const ground = terrain.heightAt(camera.position.x, camera.position.z) + 1;
  if (camera.position.y < ground) camera.position.y = ground;
  dust.update(dt);
  cameraCards.update(time);
  renderer.render(scene, camera);
});
