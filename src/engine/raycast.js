// DDA sulla griglia (Amanatides–Woo): mira esatta su celle, indipendente dalla mesh.

import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _orig = new THREE.Vector3();

/**
 * Lancia un raggio nella griglia. `colpisce(x,y,z)` decide cosa conta come pieno.
 * Ritorna { cella:[x,y,z], normale:[nx,ny,nz], dist } oppure null.
 */
export function raggioGriglia(origine, direzione, maxDist, colpisce) {
  _orig.copy(origine);
  _dir.copy(direzione).normalize();

  let x = Math.floor(_orig.x), y = Math.floor(_orig.y), z = Math.floor(_orig.z);
  const passoX = Math.sign(_dir.x) || 1, passoY = Math.sign(_dir.y) || 1, passoZ = Math.sign(_dir.z) || 1;

  const dtX = _dir.x !== 0 ? Math.abs(1 / _dir.x) : Infinity;
  const dtY = _dir.y !== 0 ? Math.abs(1 / _dir.y) : Infinity;
  const dtZ = _dir.z !== 0 ? Math.abs(1 / _dir.z) : Infinity;

  const bordo = (o, p) => (p > 0 ? Math.floor(o) + 1 - o : o - Math.floor(o));
  let tX = _dir.x !== 0 ? bordo(_orig.x, passoX) * dtX : Infinity;
  let tY = _dir.y !== 0 ? bordo(_orig.y, passoY) * dtY : Infinity;
  let tZ = _dir.z !== 0 ? bordo(_orig.z, passoZ) * dtZ : Infinity;

  let normale = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < 512 && t <= maxDist; i++) {
    if (colpisce(x, y, z)) return { cella: [x, y, z], normale, dist: t };
    if (tX <= tY && tX <= tZ) { x += passoX; t = tX; tX += dtX; normale = [-passoX, 0, 0]; }
    else if (tY <= tZ)        { y += passoY; t = tY; tY += dtY; normale = [0, -passoY, 0]; }
    else                      { z += passoZ; t = tZ; tZ += dtZ; normale = [0, 0, -passoZ]; }
  }
  return null;
}

const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

/** Raggio {origine, direzione} dalla camera attraverso un punto schermo. */
export function raggioDaSchermo(camera, sx, sy) {
  _ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  return { origine: _ray.ray.origin, direzione: _ray.ray.direction, raycaster: _ray };
}
