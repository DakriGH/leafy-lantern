// COSA IL GATTO HA IN MANO + animazioni d'uso.
// Regge sia gli ATTREZZI (modelli procedurali manico+testa) sia i BLOCCHI
// (mini-cubo coi colori veri del blocco) sia i MOBILI (cassetta).
//   mano.mostra(voce)   voce = {id, genere, cima, lato, emoji} · null = mani vuote
//   mano.usa()          → colpo ad arco (rompere)
//   mano.posa()         → gesto di appoggio (piazzare): il braccio si allunga
//   mano.aggiorna(dt)   → nel loop
// Vale sia per il gatto locale che per i REMOTI (multiplayer).
//
// OTTIMIZZAZIONE: una sola BoxGeometry condivisa da TUTTI i mini-cubi (cambia
// solo il materiale, in cache per colore) e modelli creati una volta e riusati.
// Nel loop non si alloca nulla: si scrivono solo rotazioni e posizioni.

import * as THREE from 'three';
import { patchLuci } from '../fx/materials.js?v=mrt9jcee';

const GEO_CUBO = new THREE.BoxGeometry(0.19, 0.19, 0.19);   // condivisa
const _materiali = new Map();                               // colore → materiale

function mat(colore) {
  let m = _materiali.get(colore);
  if (!m) { m = patchLuci(new THREE.MeshBasicMaterial({ color: colore })); _materiali.set(colore, m); }
  return m;
}

function modelloAttrezzo(id) {
  const g = new THREE.Group();
  const manico = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), mat(0x8a6238));
  manico.position.y = 0.17;
  g.add(manico);
  let testa = null;
  if (id === 'vanga') testa = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.03), mat(0xb9c1cc));
  else if (id === 'piccone') testa = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.05), mat(0x9aa3b0));
  else if (id === 'ascia') { testa = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.04), mat(0xaab3bf)); testa.position.x = 0.07; }
  else if (id === 'secchio') { testa = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), mat(0x4a7fd4)); testa.position.y = -0.1; }
  if (testa) { testa.position.y += 0.34; g.add(testa); }
  return g;
}

/** Mini-cubo del blocco: facce laterali + cima col colore giusto. */
function modelloBlocco(cima, lato) {
  const l = mat(lato), c = mat(cima);
  const m = new THREE.Mesh(GEO_CUBO, [l, l, c, mat(lato), l, l]);   // +x -x +y -y +z -z
  m.position.y = 0.24;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export class ManoStrumento {
  constructor(gruppoGatto) {
    this.perno = new THREE.Group();               // spalla destra del gatto
    this.perno.position.set(0.26, 0.42, 0.12);
    this._riposoZ = -0.5;
    this.perno.rotation.z = this._riposoZ;
    gruppoGatto.add(this.perno);
    this._modelli = new Map();                    // chiave → Group (creati una volta)
    this._attuale = null;
    this._swing = 0;                              // colpo: 1 → 0
    this._posa = 0;                               // appoggio: 1 → 0
  }

  /** voce = {id, genere, cima, lato} · null/undefined = mani vuote */
  mostra(voce) {
    // la chiave distingue anche i colori: due blocchi diversi = due modelli
    const chiave = !voce ? null
      : voce.genere === 'blocco' ? `b:${voce.cima}:${voce.lato}`
        : voce.genere === 'furni' ? 'f' : `a:${voce.id}`;
    if (chiave === this._attuale) return;
    if (this._attuale && this._modelli.has(this._attuale)) this._modelli.get(this._attuale).visible = false;
    this._attuale = chiave;
    if (!chiave) return;
    let m = this._modelli.get(chiave);
    if (!m) {
      m = voce.genere === 'blocco' ? modelloBlocco(voce.cima, voce.lato)
        : voce.genere === 'furni' ? modelloBlocco(0xb07a42, 0x8a5f33)
          : modelloAttrezzo(voce.id);
      this._modelli.set(chiave, m);
      this.perno.add(m);
    }
    m.visible = true;
  }

  /** compatibilità con la vecchia API (solo attrezzi) */
  imposta(id) { this.mostra(id ? { id, genere: 'attrezzo' } : null); }

  usa() { this._swing = 1; this._posa = 0; }
  posa() { this._posa = 1; this._swing = 0; }

  aggiorna(dt) {
    const p = this.perno;
    if (this._swing > 0) {
      this._swing = Math.max(0, this._swing - dt / 0.28);
      const t = 1 - this._swing;                   // colpo ad arco, overshoot morbido
      p.rotation.x = -Math.sin(t * Math.PI) * 1.5;
      p.rotation.z = this._riposoZ;
    } else if (this._posa > 0) {
      this._posa = Math.max(0, this._posa - dt / 0.34);
      const t = 1 - this._posa;
      // appoggio: il braccio si stende in avanti e in basso, poi rientra
      const curva = Math.sin(t * Math.PI);
      p.rotation.x = -curva * 0.85;
      p.rotation.z = this._riposoZ + curva * 0.42;
    } else {
      p.rotation.x *= 0.8;                         // rientro a riposo
      p.rotation.z += (this._riposoZ - p.rotation.z) * 0.2;
    }
  }
}
