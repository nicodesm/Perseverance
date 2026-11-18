// Terreno marciano: campo de dunas en el centro, colinas y cordilleras en el horizonte
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

const SIZE = 900; // metros
const SEGMENTS = 512;

// Paleta de colores del suelo
const COLOR_SAND = new THREE.Color(0xc0612f);
const COLOR_CREST = new THREE.Color(0xd98a4e);
const COLOR_TROUGH = new THREE.Color(0x7c3218);
const COLOR_ROCKY = new THREE.Color(0x5a2615);

// Generador pseudoaleatorio con semilla para que el paisaje sea siempre igual
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function createTerrain(seed = 7) {
  const noise = createNoise2D(mulberry32(seed));

  // Altura en metros para un punto (x, z)
  function heightAt(x, z) {
    // Deformación del dominio para que las dunas no sean rectas
    const wx = x + noise(x * 0.01, z * 0.01) * 18;
    const wz = z + noise(x * 0.01 + 50, z * 0.01) * 18;
    // Dunas transversales con cresta marcada (ruido "ridged")
    const ridge = 1 - Math.abs(noise(wx * 0.018, wz * 0.006));
    const dunes = ridge * ridge * 4.5;
    const small = (1 - Math.abs(noise(wx * 0.07, wz * 0.03))) * 0.5;
    // Colinas suaves que crecen con la distancia
    const dist = Math.hypot(x, z);
    const hills = (noise(x * 0.004, z * 0.004) * 0.5 + 0.5) * 22 * smoothstep(60, 260, dist);
    // Cordillera lejana (borde de cráter) para un horizonte dramático
    const rim = smoothstep(260, 420, dist) * (35 + noise(x * 0.008, z * 0.008) * 25);
    return dunes + small + hills + rim;
  }

  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geometry.computeVertexNormals();

  // Color por vértice según altura relativa, pendiente y ruido
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const slope = 1 - normals.getY(i);
    const local = y - (heightAt(x + 6, z) + heightAt(x - 6, z) + heightAt(x, z + 6) + heightAt(x, z - 6)) / 4;
    c.copy(COLOR_SAND);
    c.lerp(COLOR_CREST, smoothstep(0, 0.8, local) * 0.7);
    c.lerp(COLOR_TROUGH, smoothstep(0, -0.8, local) * 0.5);
    c.lerp(COLOR_ROCKY, smoothstep(0.12, 0.35, slope));
    const n = noise(x * 0.05, z * 0.05) * 0.06 + noise(x * 0.4, z * 0.4) * 0.03;
    c.offsetHSL(0, 0, n);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // Altura exacta sobre la malla (interpolando el mismo triángulo que se dibuja),
  // para que rover y huellas no floten ni se hundan entre vértices
  const step = SIZE / SEGMENTS;
  const row = SEGMENTS + 1;
  function surfaceHeightAt(x, z) {
    const gx = (x + SIZE / 2) / step;
    const gz = (z + SIZE / 2) / step;
    if (gx < 0 || gz < 0 || gx >= SEGMENTS || gz >= SEGMENTS) return heightAt(x, z);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const ha = pos.getY(iz * row + ix);           // (ix,   iz)
    const hb = pos.getY((iz + 1) * row + ix);     // (ix,   iz+1)
    const hc = pos.getY((iz + 1) * row + ix + 1); // (ix+1, iz+1)
    const hd = pos.getY(iz * row + ix + 1);       // (ix+1, iz)
    // PlaneGeometry divide cada celda por la diagonal b–d
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  return { mesh, heightAt: surfaceHeightAt, size: SIZE };
}
