// Polvo en suspensión: partículas finas que flotan con el viento y nubes de polvo bajas
import * as THREE from 'three';
import { mulberry32 } from './terrain.js';

const PARTICLES = 4000;
const BOX = new THREE.Vector3(160, 25, 160);
const WIND = new THREE.Vector3(2.2, 0.15, 0.8); // m/s
const CLOUDS = 60;

function softTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDust(heightAt, center) {
  const rand = mulberry32(5);
  const texture = softTexture();
  const group = new THREE.Group();

  // Partículas finas
  const positions = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i++) {
    const x = center.x + (rand() - 0.5) * BOX.x;
    const z = center.z + (rand() - 0.5) * BOX.z;
    positions.set([x, heightAt(x, z) + Math.pow(rand(), 2) * BOX.y, z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const fine = new THREE.Points(geo, new THREE.PointsMaterial({
    map: texture, color: 0xf0b98a, size: 0.4, transparent: true, opacity: 0.7,
    depthWrite: false, sizeAttenuation: true,
  }));
  fine.frustumCulled = false;
  group.add(fine);

  // Nubes de polvo bajas (sprites grandes muy transparentes)
  const clouds = [];
  for (let i = 0; i < CLOUDS; i++) {
    const mat = new THREE.SpriteMaterial({
      map: texture, color: 0xe2a674, transparent: true, opacity: 0.18 + rand() * 0.17, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const x = center.x + (rand() - 0.5) * 300;
    const z = center.z + 20 - rand() * 220;
    const scale = 20 + rand() * 40;
    sprite.scale.set(scale * 2, scale * 0.6, 1);
    sprite.position.set(x, heightAt(x, z) + scale * 0.15, z);
    sprite.userData.speed = 0.5 + rand();
    clouds.push(sprite);
    group.add(sprite);
  }

  function update(dt) {
    const p = geo.attributes.position;
    for (let i = 0; i < PARTICLES; i++) {
      let x = p.getX(i) + WIND.x * dt, y = p.getY(i) + WIND.y * dt * Math.sin(i), z = p.getZ(i) + WIND.z * dt;
      // Reaparecer al otro lado de la caja
      if (x > center.x + BOX.x / 2) x -= BOX.x; else if (x < center.x - BOX.x / 2) x += BOX.x;
      if (z > center.z + BOX.z / 2) z -= BOX.z; else if (z < center.z - BOX.z / 2) z += BOX.z;
      const ground = heightAt(x, z);
      if (y < ground || y > ground + BOX.y) y = ground + rand() * BOX.y * 0.5;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    for (const c of clouds) {
      c.position.x += WIND.x * c.userData.speed * dt;
      if (c.position.x > center.x + 150) c.position.x -= 300; else if (c.position.x < center.x - 150) c.position.x += 300;
      if (c.position.z > center.z + 150) c.position.z -= 300; else if (c.position.z < center.z - 150) c.position.z += 300;
      c.position.y = heightAt(c.position.x, c.position.z) + c.scale.y * 0.25;
    }
  }

  return { group, update };
}
