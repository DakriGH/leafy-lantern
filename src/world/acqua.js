// Simulazione dell'acqua con le regole di Minecraft:
//  · una SORGENTE ('acqua') è stabile finché non la rimuovi;
//  · l'acqua scende se può ('acqua~1' = caduta), altrimenti si sparge in
//    orizzontale perdendo un livello per cella fino a `portata`;
//  · senza donatori un flusso decade a onde e sparisce;
//  · una cella con ≥2 sorgenti orizzontali e un appoggio (solido o sorgente)
//    diventa SORGENTE: è la regola dell'acqua infinita.
// Modello "pull": ogni cella pianificata ricalcola cosa DOVREBBE essere
// guardando i vicini — robusto rispetto all'ordine degli aggiornamenti.
// La sim scrive silenziosa (niente eventi): in multiplayer si sincronizzano
// solo le azioni sulle sorgenti, il resto è deterministico.

import { ACQUA } from '../config.js?v=mrt21mqg';
import { defDi, livelloAcqua } from './blocks.js?v=mrt21mqg';

const LATI = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const chiave = (x, y, z) => x + ',' + y + ',' + z;

export class SimAcqua {
  constructor(mondo) {
    this.mondo = mondo;
    this.coda = new Map();       // chiave → [x,y,z]
    this.attiva = true;
  }

  pianifica(x, y, z) { this.coda.set(chiave(x, y, z), [x, y, z]); }

  /** Bonifica una tantum (boot): via l'acqua finita nel vuoto nei vecchi salvataggi. */
  bonifica() {
    const via = [];
    for (const b of this.mondo.tutti()) {
      if (b.y < ACQUA.yMin && b.tipo.startsWith('acqua')) via.push([b.x, b.y, b.z]);
    }
    for (const [x, y, z] of via) this.mondo.togli(x, y, z, true);
    return via.length;
  }

  /** Da chiamare quando una cella cambia (blocco piazzato/rimosso, sorgente...). */
  pianificaAttorno([x, y, z]) {
    this.pianifica(x, y, z);
    this.pianifica(x, y - 1, z);
    this.pianifica(x, y + 1, z);
    for (const [dx, dz] of LATI) this.pianifica(x + dx, y, z + dz);
  }

  tick() {
    if (!this.attiva || this.coda.size === 0) return 0;
    const daFare = [...this.coda.values()].slice(0, ACQUA.budget);
    for (const [x, y, z] of daFare) this.coda.delete(chiave(x, y, z));
    let cambi = 0;
    for (const [x, y, z] of daFare) cambi += this._riesamina(x, y, z) ? 1 : 0;
    return cambi;
  }

  _riesamina(x, y, z) {
    const m = this.mondo;
    const t = m.tipo(x, y, z);
    if (t && !defDi(t).acqua) return false;             // cella solida: niente da fare
    // fondo del mondo: l'acqua che cade oltre il diorama svanisce nel vuoto
    if (y < ACQUA.yMin) {
      if (t) { m.togli(x, y, z, true); return true; }
      return false;
    }
    const attuale = t ? livelloAcqua(t) : null;
    if (attuale === 0) {
      // le sorgenti restano; assicurati solo che sotto scorra
      if (!m.tipo(x, y - 1, z)) this.pianifica(x, y - 1, z);
      return false;
    }

    // cosa dovrebbe esserci qui?
    const sopra = m.tipo(x, y + 1, z);
    const sopraAcqua = !!(sopra && defDi(sopra).acqua);
    const sotto = m.tipo(x, y - 1, z);
    const sottoAcqua = !!(sotto && defDi(sotto).acqua);
    const sottoSolido = !!(sotto && !defDi(sotto).acqua);

    let sorgentiVicine = 0;
    let minDonatori = Infinity;
    for (const [dx, dz] of LATI) {
      const vt = m.tipo(x + dx, y, z + dz);
      const L = vt ? livelloAcqua(vt) : null;
      if (L === null) continue;
      if (L === 0) sorgentiVicine++;
      // Chi DONA in orizzontale? Come in Minecraft:
      //  · le SORGENTI, sempre (sono corpi d'acqua stabili);
      //  · i flussi ATTERRATI SU SOLIDO, e basta.
      // Un flusso sospeso, in caduta o posato su ALTRA ACQUA non si sparge:
      // senza, le cascate generavano figlie a mezz'aria (bloom) e chi cadeva
      // in un lago SCORREVA SOPRA il pelo con teli bianchi — in MC si fonde.
      if (L !== 0) {
        const vSotto = m.tipo(x + dx, y - 1, z + dz);
        if (!vSotto || defDi(vSotto).acqua) continue;         // sospeso o su acqua
      }
      if (L < minDonatori) minDonatori = L;
    }

    let voluto = null;
    if (sorgentiVicine >= 2 && (sottoSolido || (sottoAcqua && livelloAcqua(sotto) === 0))) {
      voluto = 0;                                        // ACQUA INFINITA
    } else if (sopraAcqua) {
      voluto = 1;                                        // caduta
    } else if (minDonatori + 1 <= ACQUA.portata) {
      voluto = minDonatori + 1;                          // spread (anche sull'orlo)
    }

    if (voluto === attuale) {
      if (attuale !== null && !m.tipo(x, y - 1, z)) this.pianifica(x, y - 1, z);
      return false;
    }

    if (voluto === null) m.togli(x, y, z, true);
    else m.metti(x, y, z, voluto === 0 ? 'acqua' : 'acqua~' + voluto, true);
    this.pianificaAttorno([x, y, z]);
    return true;
  }
}
