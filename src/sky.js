// Cielo marciano (gradiente + halo del sol) y las lunas Phobos y Deimos
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './terrain.js';

export const SKY_HORIZON = new THREE.Color(0xdba57a);
const SKY_ZENITH = new THREE.Color(0x8f5a40);
const SUN_GLOW = new THREE.Color(0xffd6a0);

export function createSky(sunDir) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
      horizon: { value: SKY_HORIZON },
      zenith: { value: SKY_ZENITH },
      glow: { value: SUN_GLOW },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // siempre al fondo
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, horizon, zenith, glow;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        col += glow * (pow(s, 6.0) * 0.45 + pow(s, 60.0) * 0.6);   // halo amplio
        col += vec3(1.0, 0.9, 0.7) * smoothstep(0.9993, 0.9997, s) * 4.0; // disco solar
        col += vec3(1.0, 0.75, 0.45) * pow(s, 400.0) * 1.2;           // corona cálida
        // Bruma de polvo sobre el horizonte
        col = mix(col, horizon * 1.05, smoothstep(0.25, 0.0, d.y) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// Luna irregular con forma de patata y cráteres
function createMoon(radius, seed, stretch) {
  const rand = mulberry32(seed);
  let geo = new THREE.IcosahedronGeometry(radius, 5);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo); // vértices compartidos → normales suaves
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const craters = Array.from({ length: 14 }, () => ({
    dir: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    size: 0.15 + rand() * 0.35,
  }));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let r = 1 + Math.sin(n.x * 3.1 + seed) * 0.06 + Math.sin(n.y * 4.3) * 0.05;
    for (const c of craters) {
      const d = n.angleTo(c.dir) / c.size;
      if (d < 1.2) r -= (d < 1 ? (1 - d * d) * 0.08 : 0) - (d > 0.9 ? (1.2 - d) * 0.1 : 0);
    }
    v.copy(n).multiplyScalar(radius * r);
    v.x *= stretch.x; v.y *= stretch.y; v.z *= stretch.z;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc2ad9a,
    roughness: 1,
    emissive: 0x8a6048, // dispersión de la atmósfera sobre la luna
    emissiveIntensity: 0.55,
    fog: false,
  });
  return new THREE.Mesh(geo, mat);
}

export function createMoons() {
  const group = new THREE.Group();
  // Tamaños exagerados para un plano cinematográfico
  const phobos = createMoon(26, 11, new THREE.Vector3(1.25, 0.9, 1));
  phobos.position.set(300, 215, -820);
  phobos.rotation.set(0.4, 1.2, 0.2);
  const deimos = createMoon(10, 23, new THREE.Vector3(1.15, 0.95, 1));
  deimos.position.set(-20, 270, -900);
  group.add(phobos, deimos);
  return { group, phobos, deimos };
}
