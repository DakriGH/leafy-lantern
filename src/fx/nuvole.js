// Nuvole toon: cluster di scatole bianche in drift lento sopra il diorama.
// Le loro OMBRE sono l'unione dei RETTANGOLI delle scatole proiettati a terra
// (impostaOmbreNuvole): la forma dell'ombra è esattamente quella della nuvola
// — boxy, niente cerchi. Calcolo puramente analitico: nessun render-target,
// nessuno stato del renderer da sporcare. La heightmap del cielo (nel materiale)
// limita l'ombra alle superfici. Di notte le nuvole si tingono con l'ambiente.

import * as THREE from 'three';
import { NUVOLE } from '../config.js?v=mrt21mqg';
import { impostaOmbreNuvole, ambienteAttuale } from './materials.js?v=mrt21mqg';

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Nuvole {
  constructor(scena, numero = NUVOLE.numero) {
    this.gruppo = new THREE.Group();
    scena.add(this.gruppo);
    this.materiale = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.94 });
    this.nuvole = [];        // { mesh(group), vel, scatole:[{ox,oz,hw,hd}] }

    for (let i = 0; i < numero; i++) {
      const seme = i * 7.31 + 2;
      const nuvola = new THREE.Group();
      const pezzi = 2 + Math.floor(hash(seme) * 3);
      const scatole = [];
      for (let p = 0; p < pezzi; p++) {
        const w = 2.2 + hash(seme + p * 1.7) * 3.2;
        const d = 1.6 + hash(seme + p * 2.3) * 2.2;
        const h = 0.7 + hash(seme + p * 3.1) * 0.6;
        const ox = (p - (pezzi - 1) / 2) * w * 0.55;
        const oz = (hash(seme + p * 5) - 0.5) * 1.6;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.materiale);
        m.position.set(ox, hash(seme + p) * 0.5, oz);
        nuvola.add(m);
        scatole.push({ ox, oz, hw: w / 2, hd: d / 2 });
      }
      const angolo = hash(seme + 11) * Math.PI * 2;
      const raggio = 8 + hash(seme + 13) * (NUVOLE.raggio - 12);
      nuvola.position.set(
        Math.cos(angolo) * raggio,
        NUVOLE.quotaMin + hash(seme + 17) * (NUVOLE.quotaMax - NUVOLE.quotaMin),
        Math.sin(angolo) * raggio,
      );
      this.gruppo.add(nuvola);
      this.nuvole.push({ mesh: nuvola, vel: 0.25 + hash(seme + 19) * 0.35, scatole });
    }

    // buffer riutilizzato per i rettangoli d'ombra
    this._box = [];
    for (let i = 0; i < 40; i++) this._box.push(new THREE.Vector4());
    this._tOmbra = 0;   // maschera d'ombra a ~30 Hz: a 8 Hz i bordi netti SCATTAVANO
  }

  aggiorna(dt) {
    for (const nv of this.nuvole) {
      nv.mesh.position.x += nv.vel * dt;
      if (nv.mesh.position.x > NUVOLE.raggio) nv.mesh.position.x = -NUVOLE.raggio;
    }
    // le nuvole vanno a 0.25-0.6 unità/s: in 0.12s si spostano di ~0.05 unità,
    // ridisegnare la maschera più spesso sarebbe lavoro (e upload) buttato
    this._tOmbra -= dt;
    if (this._tOmbra <= 0) {
      this._tOmbra = this.intervalloOmbra || 0.033;   // mobile: 15Hz (main lo imposta)
      let n = 0;
      for (const nv of this.nuvole) {
        const cx = nv.mesh.position.x, cz = nv.mesh.position.z;
        for (const s of nv.scatole) {
          if (n >= this._box.length) break;
          const bx = cx + s.ox, bz = cz + s.oz;
          this._box[n++].set(bx - s.hw, bz - s.hd, bx + s.hw, bz + s.hd);
        }
      }
      impostaOmbreNuvole(this._box.slice(0, n), NUVOLE.ombra);
    }
    this.materiale.color.copy(ambienteAttuale());   // di notte le nuvole si spengono
  }
}
