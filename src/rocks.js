// Rocas dispersas (InstancedMesh) con formas irregulares
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './terrain.js';

const SMALL_COUNT = 1400;
const BOULDER_COUNT = 60;
const AREA = 220; // radio en metros
const CLEAR_RADIUS = 8; // zona sin rocas alrededor de los puntos excluidos (m)

function rockGeometry(seed) {
  const noise = createNoise3D(mulberry32(seed));
  let geo = new THREE.IcosahedronGeometry(1, 4);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo); // vértices compartidos → normales suaves
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = 1 + noise(v.x * 1.2, v.y * 1.2, v.z * 1.2) * 0.3 + noise(v.x * 4, v.y * 4, v.z * 4) * 0.08 + noise(v.x * 9, v.y * 9, v.z * 9) * 0.03;
    v.multiplyScalar(r);
    v.y *= 0.65; // rocas más planas
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3; // base aplanada
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createRocks(heightAt, exclude = []) {
  const group = new THREE.Group();
  const rand = mulberry32(99);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const geometries = [rockGeometry(1), rockGeometry(2), rockGeometry(3)];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tint = new THREE.Color();

  for (const [g, geo] of geometries.entries()) {
    const total = Math.floor((SMALL_COUNT + BOULDER_COUNT) / geometries.length);
    const mesh = new THREE.InstancedMesh(geo, material, total);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < total; i++) {
      const boulder = i < BOULDER_COUNT / geometries.length;
      // Más densidad cerca del centro
      const r = Math.pow(rand(), 0.7) * AREA;
      const a = rand() * Math.PI * 2;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      // Dejar libres las zonas indicadas (cámara inicial, salida del rover)
      if (exclude.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < CLEAR_RADIUS)) p.x += CLEAR_RADIUS * 2;
      const size = boulder ? 1.2 + rand() * 2.5 : 0.08 + Math.pow(rand(), 3) * 0.7;
      s.set(size * (0.8 + rand() * 0.5), size * (0.7 + rand() * 0.6), size * (0.8 + rand() * 0.5));
      p.y = heightAt(p.x, p.z) - s.y * 0.15;
      q.setFromEuler(e.set((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      tint.setHSL(0.03 + rand() * 0.04, 0.35 + rand() * 0.2, 0.3 + rand() * 0.15);
      mesh.setColorAt(i, tint);
    }
    mesh.name = `rocks-${g}`;
    group.add(mesh);
  }
  return group;
}
