// Rover Perseverance: modelo oficial de la NASA (GLB) a escala real, conducción y adaptación al terreno
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_URL = '/models/perseverance.glb';
const MAX_SPEED = 2.5;   // m/s (el real va a ~0.04 m/s; aquí más rápido para que sea jugable)
const ACCEL = 1.6;       // m/s²
const FRICTION = 2.4;    // m/s² al soltar el acelerador
const TURN_RATE = 0.7;   // rad/s (puede girar sobre sí mismo como el real)
const TILT_SMOOTH = 8;   // suavizado de cabeceo/alabeo
const WHEEL_X = 1.15;    // distancia lateral del centro a la línea de ruedas (m)
const WHEEL_Z = 1.25;    // distancia longitudinal a las ruedas delanteras/traseras (m)
// Animaciones del GLB que mueven el mástil (Remote Sensing Mast) y el instante de la pose desplegada
const MAST_CLIPS = ['CylinderAction', 'bottomAction', 'Empty.001Action.003', 'topAction', 'Cylinder.002Action'];
const MAST_POSE_TIME = 7; // la animación despliega en 1.25–13.75 s y luego lo vuelve a plegar

// Piezas del modelo que son cámaras (nombre del nodo → descripción)
const CAMERA_PARTS = {
  Mastcam_Z_cams: 'Mastcam-Z: par estéreo con zoom en el mástil',
  NavCams: 'Navcams: cámaras de navegación estéreo en el mástil',
  lens: 'SuperCam: lente del Remote Micro-Imager en la cabeza del mástil',
  hazcams_front: 'Hazcams delanteras: cámaras de peligro (estéreo)',
  hazcams_rear: 'Hazcams traseras: cámaras de peligro (estéreo)',
  Up_Look_Camera: 'EDL Up-Look: grabó el paracaídas durante el aterrizaje',
  Down_Look_Camera: 'EDL Rover Down-Look: grabó el suelo durante el aterrizaje',
  WATSON: 'SHERLOC/WATSON: cámara de primer plano en la torreta del brazo',
  PIXL: 'PIXL: incluye la Micro Context Camera (torreta del brazo)',
};

function loadModel() {
  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  return loader.loadAsync(MODEL_URL);
}

export async function createRover({ heightAt, start, heading = 0 }) {
  const gltf = await loadModel();
  const model = gltf.scene;

  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // El GLB ya está en metros: solo centramos sobre las ruedas y apoyamos en y = 0
  model.updateMatrixWorld(true);
  const wheels = model.getObjectByName('Wheels_objs');
  const wheelBox = new THREE.Box3().setFromObject(wheels ?? model);
  const center = wheelBox.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -wheelBox.min.y, -center.z);

  const root = new THREE.Group(); // origen = centro de las ruedas a nivel del suelo; +Z = adelante
  root.name = 'Perseverance';
  root.add(model);
  root.updateMatrixWorld(true);

  // El mástil viene plegado: usamos sus animaciones originales para desplegarlo
  const mixer = new THREE.AnimationMixer(model);
  const mastClips = gltf.animations.filter((c) => MAST_CLIPS.includes(c.name));
  for (const clip of mastClips) {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
  }
  function setMastTime(t) {
    mixer.setTime(t);
    model.updateMatrixWorld(true);
  }
  setMastTime(MAST_POSE_TIME);

  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());

  // Cámaras del rover: guardadas para usarlas más adelante
  const cameras = {};
  for (const [name, description] of Object.entries(CAMERA_PARTS)) {
    const node = model.getObjectByName(name);
    if (node) cameras[name] = { node, description };
  }
  logCameras(cameras, root, size);

  // Estado de conducción
  const state = {
    position: start.clone(),
    heading,
    speed: 0,
    distance: 0, // distancia total recorrida (m)
  };
  const targetQuat = new THREE.Quaternion();
  const tmp = {
    fl: new THREE.Vector3(), fr: new THREE.Vector3(), rl: new THREE.Vector3(), rr: new THREE.Vector3(),
    x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(),
  };

  // Punto del suelo bajo una posición local (x lateral, z longitudinal) del rover
  function groundPoint(out, lx, lz) {
    const s = Math.sin(state.heading), c = Math.cos(state.heading);
    out.x = state.position.x + lx * c + lz * s;
    out.z = state.position.z - lx * s + lz * c;
    out.y = heightAt(out.x, out.z);
    return out;
  }

  // Orienta el rover según el terreno bajo sus cuatro ruedas de las esquinas
  function fitToTerrain(dt) {
    const { fl, fr, rl, rr, x, y, z, m } = tmp;
    groundPoint(fl, WHEEL_X, WHEEL_Z);
    groundPoint(fr, -WHEEL_X, WHEEL_Z);
    groundPoint(rl, WHEEL_X, -WHEEL_Z);
    groundPoint(rr, -WHEEL_X, -WHEEL_Z);
    // Eje Z = de atrás hacia adelante; eje X = de derecha a izquierda (+X local es la izquierda)
    z.copy(fl).add(fr).sub(rl).sub(rr).normalize();
    x.copy(fl).add(rl).sub(fr).sub(rr);
    y.crossVectors(z, x).normalize();
    x.crossVectors(y, z).normalize();
    m.makeBasis(x, y, z);
    targetQuat.setFromRotationMatrix(m);
    const k = dt > 0 ? 1 - Math.exp(-TILT_SMOOTH * dt) : 1;
    root.quaternion.slerp(targetQuat, k);
    state.position.y = (fl.y + fr.y + rl.y + rr.y) / 4;
    root.position.copy(state.position);
  }

  function update(dt, input) {
    // Acelerador con inercia
    if (input.throttle !== 0) {
      state.speed += input.throttle * ACCEL * dt;
    } else {
      const drop = FRICTION * dt;
      state.speed = Math.abs(state.speed) <= drop ? 0 : state.speed - Math.sign(state.speed) * drop;
    }
    state.speed = THREE.MathUtils.clamp(state.speed, -MAX_SPEED * 0.5, MAX_SPEED);

    // Giro (también en parado, como el rover real)
    state.heading += input.steer * TURN_RATE * dt;

    const step = state.speed * dt;
    state.position.x += Math.sin(state.heading) * step;
    state.position.z += Math.cos(state.heading) * step;
    state.distance += Math.abs(step);

    fitToTerrain(dt);
  }

  fitToTerrain(0);

  return {
    object: root,
    state,
    cameras,
    size,
    update,
    setMastTime,
    // Vector "adelante" horizontal del rover
    forward: (out = new THREE.Vector3()) => out.set(Math.sin(state.heading), 0, Math.cos(state.heading)),
    // Posición en el suelo bajo una línea de ruedas (lado: +1 izquierda, -1 derecha)
    wheelTrackPoint: (out, side, lz = 0) => groundPoint(out, side * WHEEL_X, lz),
  };
}

function logCameras(cameras, root, size) {
  const p = new THREE.Vector3();
  const rows = Object.entries(cameras).map(([name, { node, description }]) => {
    node.getWorldPosition(p);
    root.worldToLocal(p);
    return { pieza: name, descripcion: description, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
  });
  console.log(
    `[rover] Modelo cargado: ${size.x.toFixed(2)} m ancho × ${size.y.toFixed(2)} m alto × ${size.z.toFixed(2)} m largo`,
  );
  console.log(`[rover] Piezas que son cámaras (${rows.length}), posición local en metros (+Z adelante, +X izquierda):`);
  for (const r of rows) console.log(`[rover]   ${r.pieza.padEnd(17)} (${r.x}, ${r.y}, ${r.z})  ${r.descripcion}`);
  console.table(rows);
}
