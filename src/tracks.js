// Huellas de las ruedas: dos cintas sobre el terreno con el dibujo de las garras de la rueda
import * as THREE from 'three';

const TRACK_WIDTH = 0.42;   // ancho de la rueda (m)
const SEGMENT_LENGTH = 0.2; // nueva sección cada 20 cm
const MAX_SEGMENTS = 6000;  // por cinta; al llenarse se reutilizan las más antiguas
const LIFT = 0.025;         // separación del suelo para evitar parpadeo (m)
const TREAD_REPEAT = 0.35;  // metros por repetición del dibujo

// Dibujo de la banda de rodadura: surco oscuro con garras en "V"
function treadTexture() {
  const w = 64, h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(90,30,12,0.22)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(55,16,5,0.5)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(4, 8); ctx.lineTo(w / 2, 26); ctx.lineTo(w - 4, 8);
  ctx.moveTo(4, 40); ctx.lineTo(w / 2, 58); ctx.lineTo(w - 4, 40);
  ctx.stroke();
  // Bordes suaves
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.12, 'rgba(0,0,0,0)');
  g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function createRibbon(material) {
  const verts = MAX_SEGMENTS * 6;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3).fill(0), 3));
  const normals = geo.attributes.normal;
  for (let i = 0; i < verts; i++) normals.setY(i, 1);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return { mesh, geo, count: 0, last: null };
}

export function createTracks(heightAt) {
  const material = new THREE.MeshStandardMaterial({
    map: treadTexture(), transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const group = new THREE.Group();
  group.name = 'tracks';
  const ribbons = [createRibbon(material), createRibbon(material)];
  ribbons.forEach((r) => group.add(r.mesh));

  const side = new THREE.Vector3();
  const center = new THREE.Vector3();

  function edges(c, dir) {
    // Borde izquierdo/derecho perpendicular a la marcha
    side.set(dir.z, 0, -dir.x).multiplyScalar(TRACK_WIDTH / 2);
    const a = new THREE.Vector3(c.x + side.x, 0, c.z + side.z);
    const b = new THREE.Vector3(c.x - side.x, 0, c.z - side.z);
    a.y = heightAt(a.x, a.z) + LIFT;
    b.y = heightAt(b.x, b.z) + LIFT;
    return { a, b, center: c.clone() };
  }

  function pushQuad(r, prev, next, v0, v1) {
    const i = (r.count % MAX_SEGMENTS) * 6;
    const pos = r.geo.attributes.position, uv = r.geo.attributes.uv;
    // Dos triángulos por sección (material a doble cara: el orden no importa)
    const order = [0, 2, 1, 1, 2, 3];
    const pts = [prev.a, prev.b, next.a, next.b];
    const uvp = [[0, v0], [1, v0], [0, v1], [1, v1]];
    order.forEach((k, j) => {
      pos.setXYZ(i + j, pts[k].x, pts[k].y, pts[k].z);
      uv.setXY(i + j, uvp[k][0], uvp[k][1]);
    });
    r.count++;
    r.geo.setDrawRange(0, Math.min(r.count, MAX_SEGMENTS) * 6);
    pos.needsUpdate = true;
    uv.needsUpdate = true;
  }

  // Llamar cada fotograma con el rover; añade secciones al avanzar
  function update(rover) {
    const dir = rover.forward(new THREE.Vector3());
    ribbons.forEach((r, k) => {
      rover.wheelTrackPoint(center, k === 0 ? 1 : -1);
      if (!r.last) {
        r.last = { ...edges(center, dir), v: 0 };
        return;
      }
      const d = Math.hypot(center.x - r.last.center.x, center.z - r.last.center.z);
      if (d < SEGMENT_LENGTH) return;
      const next = { ...edges(center, dir), v: r.last.v + d / TREAD_REPEAT };
      pushQuad(r, r.last, next, r.last.v, next.v);
      r.last = next;
    });
  }

  return { group, update };
}
