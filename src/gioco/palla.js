// Palla di prova (dal furni Generatore): un oggetto FISICO per collaudare
// l'acqua — cade, rimbalza, GALLEGGIA sul pelo, viene trascinata dalla
// corrente, il gatto la spinge. Se si allontana troppo dal suo generatore
// (o cade nel vuoto) sparisce e rinasce lì sopra.

import * as THREE from 'three';
import { defDi, livelloAcqua } from '../world/blocks.js';
import { patchLuci } from '../fx/materials.js';

const RAGGIO = 0.3;
const GRAVITA = 26;

export class Palla {
  constructor(scena, casa, raggioMax = 12) {
    this.scena = scena;
    this.casa = casa;                 // [x,y,z] cella del generatore
    this.raggioMax = raggioMax;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(RAGGIO, 14, 12),
      patchLuci(new THREE.MeshBasicMaterial({ color: 0xff6f61 })),
    );
    scena.add(this.mesh);   // l'ombra-cono la disegna lo shader (impostaOmbrePg in main)
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.eraInAcqua = false;
    this._aTerra = false;
    this.respawn();
  }

  respawn() {
    this.pos.set(this.casa[0] + 0.5, this.casa[1] + 1.4, this.casa[2] + 0.5);
    this.vel.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
  }

  rimuovi() {
    this.scena.remove(this.mesh);
  }

  /** Calcio: una spinta netta nella direzione data (interazione col tasto). */
  spingi(dx, dz, forza = 5.5) {
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * forza;
    this.vel.z = (dz / d) * forza;
    this.vel.y = Math.max(this.vel.y, 2.6);
  }

  aggiorna(dt, mondo, player, particelle) {
    const cx = Math.floor(this.pos.x), cy = Math.floor(this.pos.y), cz = Math.floor(this.pos.z);
    const t = mondo.tipo(cx, cy, cz);
    const inAcqua = !!(t && defDi(t).acqua);

    if (inAcqua) {
      const L = livelloAcqua(t) || 0;
      const pelo = cy + (15 - 2 * L) / 16;
      const sommersa = Math.max(0, Math.min(1, (pelo - this.pos.y + RAGGIO) * 2.2));
      this.vel.y += sommersa * 42 * dt - GRAVITA * 0.3 * dt;     // spinta di Archimede toon
      this.vel.multiplyScalar(1 - Math.min(1, dt * 1.8));        // resistenza dell'acqua
      // CORRENTE: stesso gradiente dei livelli usato dal mesher
      let fx = 0, fz = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tv = mondo.tipo(cx + dx, cy, cz + dz);
        if (tv && defDi(tv).acqua) { const dL = livelloAcqua(tv) - L; fx += dL * dx; fz += dL * dz; }
        else if (!mondo.pieno(cx + dx, cy, cz + dz) && !mondo.pieno(cx + dx, cy - 1, cz + dz)) { fx += 1.5 * dx; fz += 1.5 * dz; }
      }
      const lg = Math.hypot(fx, fz);
      if (lg > 0.01) { this.vel.x += (fx / lg) * 3.4 * dt; this.vel.z += (fz / lg) * 3.4 * dt; }
      // tuffo: goccioline (la schiuma attorno la fa lo shader dell'acqua)
      if (!this.eraInAcqua && Math.abs(this.vel.y) > 1.2 && particelle) {
        for (let k = 0; k < 7; k++) {
          const a = Math.random() * Math.PI * 2, vr = 0.6 + Math.random() * 0.9;
          particelle.emetti(this.pos.x, pelo + 0.03, this.pos.z, Math.cos(a) * vr, 1.6 + Math.random(), Math.sin(a) * vr, 0.45, 0.55, 0);
        }
      }
    } else {
      this.vel.y -= GRAVITA * dt;
    }
    this.eraInAcqua = inAcqua;

    // spinta del gatto (contatto)
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.45 && Math.abs(this.pos.y - player.pos.y) < 1.1) {
      const d = Math.max(0.12, Math.sqrt(d2));
      this.vel.x = (dx / d) * 2.6 + player.vel.x * 0.6;
      this.vel.z = (dz / d) * 2.6 + player.vel.z * 0.6;
      if (this._aTerra) this.vel.y = Math.max(this.vel.y, 2.2);
    }

    this._aTerra = false;
    this._muovi(mondo, 0, this.vel.x * dt);
    this._muovi(mondo, 2, this.vel.z * dt);
    this._muovi(mondo, 1, this.vel.y * dt);
    if (this._aTerra) {
      this.vel.x *= 1 - Math.min(1, dt * 2.6);   // attrito che la fa rotolare via piano
      this.vel.z *= 1 - Math.min(1, dt * 2.6);
    }

    // troppo lontana da casa o caduta nel vuoto: rinasce sul generatore
    const lontano = Math.hypot(this.pos.x - (this.casa[0] + 0.5), this.pos.z - (this.casa[2] + 0.5));
    if (lontano > this.raggioMax || this.pos.y < -8) this.respawn();

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.vel.z * dt * 3;   // rotolamento fake
    this.mesh.rotation.z -= this.vel.x * dt * 3;
  }

  _muovi(mondo, asse, delta) {
    if (!delta) return;
    const p = this.pos;
    p.setComponent(asse, p.getComponent(asse) + delta);
    const s = Math.sign(delta);
    const punta = p.getComponent(asse) + s * RAGGIO;
    const cx = asse === 0 ? Math.floor(punta) : Math.floor(p.x);
    const cy = asse === 1 ? Math.floor(punta) : Math.floor(p.y);
    const cz = asse === 2 ? Math.floor(punta) : Math.floor(p.z);
    if (!mondo.solido(cx, cy, cz)) return;
    const cella = asse === 0 ? cx : asse === 1 ? cy : cz;
    p.setComponent(asse, s > 0 ? cella - RAGGIO - 0.001 : cella + 1 + RAGGIO + 0.001);
    if (asse === 1) {
      if (s < 0) {
        this._aTerra = true;
        this.vel.y = Math.abs(this.vel.y) > 1.6 ? -this.vel.y * 0.38 : 0;   // rimbalzello
      } else {
        this.vel.y = 0;
      }
    } else {
      this.vel.setComponent(asse, this.vel.getComponent(asse) * -0.32);      // sponda
    }
  }
}
