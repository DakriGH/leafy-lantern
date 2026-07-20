// Salute dei blocchi e attrezzi (M5): rompere richiede più colpi.
// A mano 2 colpi (50 danni), con l'attrezzo della famiglia giusta 1 colpo
// (100 danni, come i toolModifiers ×2 delle tue BlockDefinition). In creativa
// (∞) è istantaneo. Overlay "crepa": un guscio scuro che si infittisce.

import * as THREE from 'three';
import { SCAVO } from '../config.js?v=mrt21mqg';
import { defDi } from '../world/blocks.js?v=mrt21mqg';
import { ATTREZZI } from './inventario.js?v=mrt21mqg';

const chiave = (x, y, z) => x + ',' + y + ',' + z;

// Quanto "costa" rompere: scelta dell'utente dalle Impostazioni.
// creativa = come prima (un tocco e via) · normale = il default di sempre ·
// dura = i blocchi resistono davvero e l'attrezzo giusto conta.
export const DUREZZE = {
  creativa: { nome: '✨ Creativa', scala: 0 },
  normale:  { nome: '⛏ Normale',  scala: 1 },
  dura:     { nome: '🪨 Dura',     scala: 3 },
};

export class Scavo {
  constructor(scena) {
    this.scala = 1;                  // moltiplicatore di resistenza
    this.danni = new Map();          // "x,y,z" → { hp, t }
    this.crepa = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({ color: 0x100c08, transparent: true, opacity: 0, depthWrite: false, wireframe: true }),
    );
    this.crepa.visible = false;
    this.crepa.renderOrder = 5;
    scena.add(this.crepa);
  }

  dannoDi(tipoBloccoDef, attrezzoId) {
    const att = ATTREZZI[attrezzoId];
    const giusto = att && att.famiglia && att.famiglia === tipoBloccoDef.fam;
    return giusto ? SCAVO.attrezzoDanno : SCAVO.manoDanno;
  }

  /** Imposta la durezza scelta (chiave di DUREZZE). */
  impostaDurezza(id) {
    const d = DUREZZE[id] || DUREZZE.normale;
    this.scala = d.scala;
    this.danni.clear();              // niente danni "vecchi" con la scala nuova
    this._nascondiCrepa();
  }

  /** Frazione di rottura del blocco puntato (0..1), per l'indicatore. */
  progresso(x, y, z) {
    const s = this.danni.get(chiave(x, y, z));
    return s ? 1 - s.hp / s.max : 0;
  }

  /** Applica un colpo. Ritorna true quando il blocco va rotto ORA. */
  colpisci(x, y, z, tipoDef, attrezzoId, adesso) {
    if (this.scala <= 0) { this._nascondiCrepa(); return true; }   // creativa
    const k = chiave(x, y, z);
    // la resistenza può essere per-blocco (def.salute: blocchi dell'Officina)
    const saluteMax = (tipoDef.salute || SCAVO.salute) * this.scala;
    let stato = this.danni.get(k);
    if (!stato || adesso - stato.t > SCAVO.resetMs) {
      stato = { hp: saluteMax, max: saluteMax, t: adesso };
      this.danni.set(k, stato);
    }
    stato.hp -= this.dannoDi(tipoDef, attrezzoId);
    stato.t = adesso;
    if (stato.hp <= 0) {
      this.danni.delete(k);
      this._nascondiCrepa();
      return true;
    }
    this._mostraCrepa(x, y, z, stato.hp, stato.max);
    return false;
  }

  _mostraCrepa(x, y, z, hp, max = SCAVO.salute) {
    this.crepa.position.set(x + 0.5, y + 0.5, z + 0.5);
    const rotto = 1 - hp / max;                       // 0 intatto → 1 quasi a pezzi
    this.crepa.material.opacity = 0.18 + rotto * 0.62;
    // il blocco "incassa": un guizzo di scala a ogni colpo che si riassorbe
    this._pop = 1;
    this.crepa.visible = true;
    this._cella = [x, y, z];
  }

  _nascondiCrepa() {
    this.crepa.visible = false;
    this._cella = null;
  }

  /** La crepa scompare da sola se non colpisci più (o se quel blocco sparisce). */
  aggiorna(adesso, mondo) {
    if (!this.crepa.visible) return;
    // riassorbe il guizzo del colpo (feedback tattile del "sta cedendo")
    if (this._pop > 0) {
      this._pop = Math.max(0, this._pop - 0.09);
      const s = 1 + this._pop * 0.14;
      this.crepa.scale.set(s, s, s);
    }
    const [x, y, z] = this._cella;
    const stato = this.danni.get(chiave(x, y, z));
    if (!stato || adesso - stato.t > SCAVO.resetMs || !mondo.pieno(x, y, z)) {
      this.danni.delete(chiave(x, y, z));
      this._nascondiCrepa();
    }
  }

  scordaCella(x, y, z) { this.danni.delete(chiave(x, y, z)); if (this._cella && this._cella[0] === x && this._cella[1] === y && this._cella[2] === z) this._nascondiCrepa(); }
}
