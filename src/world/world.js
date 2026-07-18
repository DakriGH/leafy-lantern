// Il mondo: griglia sparsa di blocchi ORGANIZZATA A CHUNK 16×16 (in pianta),
// così il mesher ricostruisce solo i chunk sporchi — fondamento per la
// generazione procedurale. Ogni modifica emette un evento (pronto per il netcode).

import { BLOCCHI, defDi } from './blocks.js';

export const CHUNK = 16;

const chiave = (x, y, z) => x + ',' + y + ',' + z;
const chiaveChunk = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);

export class Mondo {
  constructor() {
    this.chunks = new Map();         // "cx,cz" → Map("x,y,z" → tipo)
    this.sporchi = new Set();        // chunk da rimeshare per intero
    this.sporchiAcqua = new Set();   // chunk dove è cambiata SOLO acqua (rebuild leggero)
    this.furni = new Map();          // "x,y,z" → istanza furni che occupa la cella
    this.contaBlocchi = 0;
    this.onEvento = null;
  }

  tipo(x, y, z) {
    const c = this.chunks.get(chiaveChunk(x, z));
    return c ? (c.get(chiave(x, y, z)) || null) : null;
  }

  /** Blocco pieno ai fini del culling/mira (acqua inclusa). */
  pieno(x, y, z) { return this.tipo(x, y, z) !== null; }

  /** Solido per la fisica: blocchi non-acqua + celle occupate da furni. */
  solido(x, y, z) {
    const t = this.tipo(x, y, z);
    if (t && defDi(t).solido) return true;
    return this.furni.has(chiave(x, y, z));
  }

  /** Ci si può stare in piedi: appoggio solido sotto, aria per piedi e testa. */
  calpestabile(x, y, z) {
    if (!this.solido(x, y - 1, z)) return false;
    if (this.solido(x, y, z) || this.solido(x, y + 1, z)) return false;
    const t = this.tipo(x, y, z);
    if (t && defDi(t).acqua) return false;
    return true;
  }

  /** Marca sporco il chunk della cella e, sui bordi, anche i vicini
   *  (i pezzi del supercubo dipendono dai blocchi adiacenti). */
  _sporca(x, z, dove = this.sporchi) {
    const lx = ((x % CHUNK) + CHUNK) % CHUNK;
    const lz = ((z % CHUNK) + CHUNK) % CHUNK;
    dove.add(chiaveChunk(x, z));
    if (lx === 0) dove.add(chiaveChunk(x - 1, z));
    if (lx === CHUNK - 1) dove.add(chiaveChunk(x + 1, z));
    if (lz === 0) dove.add(chiaveChunk(x, z - 1));
    if (lz === CHUNK - 1) dove.add(chiaveChunk(x, z + 1));
  }

  metti(x, y, z, tipo, silenzioso = false) {
    const kc = chiaveChunk(x, z);
    let c = this.chunks.get(kc);
    if (!c) { c = new Map(); this.chunks.set(kc, c); }
    const k = chiave(x, y, z);
    const prima = c.get(k);
    if (prima === undefined) this.contaBlocchi++;
    c.set(k, tipo);
    // acqua che rimpiazza acqua/vuoto: basta il rebuild leggero (solo liquido)
    const soloAcqua = tipo.charCodeAt(0) === 97 && tipo.startsWith('acqua')
      && (prima === undefined || prima.startsWith('acqua'));
    this._sporca(x, z, soloAcqua ? this.sporchiAcqua : this.sporchi);
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'metti', cella: [x, y, z], blocco: tipo });
  }

  togli(x, y, z, silenzioso = false) {
    const kc = chiaveChunk(x, z);
    const c = this.chunks.get(kc);
    if (!c) return false;
    const k = chiave(x, y, z);
    const prima = c.get(k);
    if (!c.delete(k)) return false;
    this.contaBlocchi--;
    if (c.size === 0) this.chunks.delete(kc);
    this._sporca(x, z, prima && prima.startsWith('acqua') ? this.sporchiAcqua : this.sporchi);
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'togli', cella: [x, y, z] });
    return true;
  }

  occupaFurni(celle, istanza) { for (const [x, y, z] of celle) this.furni.set(chiave(x, y, z), istanza); }
  liberaFurni(celle) { for (const [x, y, z] of celle) this.furni.delete(chiave(x, y, z)); }
  furniIn(x, y, z) { return this.furni.get(chiave(x, y, z)) || null; }

  appoggioInColonna(x, z, yDa, profondita = 8) {
    for (let y = yDa; y > yDa - profondita; y--) {
      if (this.calpestabile(x, y, z)) return y;
    }
    return null;
  }

  svuota() {
    this.chunks.clear();
    this.furni.clear();
    this.sporchi.clear();
    this.sporchiAcqua.clear();
    this.contaBlocchi = 0;
  }

  *tutti() {
    for (const c of this.chunks.values()) {
      for (const [k, tipo] of c) {
        const [x, y, z] = k.split(',').map(Number);
        yield { x, y, z, tipo };
      }
    }
  }

  *blocchiDelChunk(kc) {
    const c = this.chunks.get(kc);
    if (!c) return;
    for (const [k, tipo] of c) {
      const [x, y, z] = k.split(',').map(Number);
      yield { x, y, z, tipo };
    }
  }
}
