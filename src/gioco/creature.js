// Creature ambientali: piccole vite che rendono viva l'isola.
//  · FARFALLE di giorno: svolazzano sopra l'erba, ali che battono, scappano
//    piano dal gatto;
//  · LUCCIOLE di notte: puntini che brillano e vagano lenti.
// Un pool piccolo attorno al gatto (cap ridotto su mobile): nascono su terreno
// solido, muoiono quando ti allontani. Unlit come tutto il resto.

import * as THREE from 'three';
import { patchLuci } from '../fx/materials.js';

const RAGGIO = 22;                 // entro quanto vivono attorno al gatto
const COLORI_FARFALLA = [0xffd36e, 0xff8fb3, 0x8fd0ff, 0xc79bff, 0xa6ff9b];

function meshFarfalla(colore) {
  const g = new THREE.Group();
  const mat = patchLuci(new THREE.MeshBasicMaterial({ color: colore, side: THREE.DoubleSide }));
  const ala = new THREE.Shape();
  ala.moveTo(0, 0); ala.quadraticCurveTo(0.12, 0.12, 0.16, 0); ala.quadraticCurveTo(0.12, -0.1, 0, 0);
  const geo = new THREE.ShapeGeometry(ala);
  const sx = new THREE.Mesh(geo, mat), dx = new THREE.Mesh(geo, mat);
  dx.scale.x = -1;
  g.add(sx, dx);
  g.userData = { sx, dx };
  return g;
}

export class Creature {
  constructor(scena, mondo, mobile = false) {
    this.scena = scena;
    this.mondo = mondo;
    this.max = mobile ? 6 : 12;
    this.list = [];
    // lucciole: un solo Points additivo (cheap)
    const N = this.max;
    this._lucPos = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this._lucPos, 3));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.lucciole = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xbfff8a, size: 0.13, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.lucciole.frustumCulled = false;
    this.lucciole.visible = false;
    scena.add(this.lucciole);
  }

  /** Via tutte (prima dell'AR: il mondo trasloca nel pivot scalato). */
  svuota() {
    for (const c of this.list) if (c.mesh) this.scena.remove(c.mesh);
    this.list.length = 0;
    this.lucciole.visible = false;
  }

  _colonna(x, z) {
    return this.mondo.appoggioInColonna ? this.mondo.appoggioInColonna(x, z, 30, 40) : null;
  }

  _nascita(fuoco) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (RAGGIO - 6);
    const x = Math.round(fuoco.x + Math.cos(a) * r), z = Math.round(fuoco.z + Math.sin(a) * r);
    const y = this._colonna(x, z);
    if (y === null) return null;
    return { x: x + 0.5, y: y + 0.8 + Math.random() * 1.2, z: z + 0.5,
      vx: 0, vz: 0, vy: 0, fase: Math.random() * 6, colore: COLORI_FARFALLA[Math.random() * COLORI_FARFALLA.length | 0] };
  }

  aggiorna(dt, fuoco, notte) {
    const lucciolaNotte = notte;
    // popolazione: mira a `max`, ricicla i lontani
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const d2 = (c.x - fuoco.x) ** 2 + (c.z - fuoco.z) ** 2;
      if (d2 > (RAGGIO + 8) ** 2) { if (c.mesh) this.scena.remove(c.mesh); this.list.splice(i, 1); }
    }
    while (this.list.length < this.max) {
      const c = this._nascita(fuoco);
      if (!c) break;
      if (!lucciolaNotte) { c.mesh = meshFarfalla(c.colore); this.scena.add(c.mesh); }
      this.list.push(c);
    }

    let nLuc = 0;
    for (const c of this.list) {
      c.fase += dt * (lucciolaNotte ? 2 : 9);
      // vagabondaggio dolce (rumore) + leggera fuga dal gatto
      c.vx += (Math.sin(c.fase * 0.7) - c.vx) * dt * 2;
      c.vz += (Math.cos(c.fase * 0.9) - c.vz) * dt * 2;
      const dx = c.x - fuoco.x, dz = c.z - fuoco.z, dm = Math.hypot(dx, dz);
      if (dm < 2.5) { c.vx += (dx / (dm || 1)) * dt * 6; c.vz += (dz / (dm || 1)) * dt * 6; }
      const vel = lucciolaNotte ? 0.5 : 1.4;
      c.x += c.vx * vel * dt; c.z += c.vz * vel * dt;
      // altezza: ondeggia attorno a una quota comoda sopra il terreno
      const suolo = this._colonna(Math.floor(c.x), Math.floor(c.z));
      const target = (suolo !== null ? suolo : c.y - 1) + (lucciolaNotte ? 1.0 : 1.4) + Math.sin(c.fase) * 0.3;
      c.y += (target - c.y) * dt * 2.5;

      if (lucciolaNotte) {
        this._lucPos[nLuc * 3] = c.x; this._lucPos[nLuc * 3 + 1] = c.y; this._lucPos[nLuc * 3 + 2] = c.z;
        nLuc++;
        if (c.mesh) { this.scena.remove(c.mesh); c.mesh = null; }   // di notte niente farfalle
      } else if (c.mesh) {
        c.mesh.position.set(c.x, c.y, c.z);
        c.mesh.rotation.y = Math.atan2(c.vx, c.vz);
        const flap = Math.sin(c.fase) * 0.9 + 0.5;
        c.mesh.userData.sx.rotation.y = flap;
        c.mesh.userData.dx.rotation.y = -flap;
      }
    }
    // lucciole
    this.lucciole.visible = lucciolaNotte && nLuc > 0;
    if (this.lucciole.visible) {
      this.lucciole.geometry.setDrawRange(0, nLuc);
      this.lucciole.geometry.attributes.position.needsUpdate = true;
      this.lucciole.material.opacity = 0.5 + Math.sin(performance.now() * 0.003) * 0.35;
    }
  }
}
