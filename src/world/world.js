// Il mondo: griglia sparsa di blocchi ORGANIZZATA A CHUNK 16×16 (in pianta),
// così il mesher ricostruisce solo i chunk sporchi — fondamento per la
// generazione procedurale. Ogni modifica emette un evento (pronto per il netcode).

import { BLOCCHI, defDi } from './blocks.js?v=mtavac71';

export const CHUNK = 16;
// Celle oltre le quali conviene il ricalcolo pieno della luce.
// PERCHÉ 256: questo elenco esiste solo per alimentare la rilluminazione LOCALE
// del mesher, che si arrende comunque a CAMBI_MAX_LOCALI = 96 (vedi mesher.js).
// Tenerne quasi il triplo è la cintura: copre il caso in cui più sorgenti di
// cambiamento si sommino nello stesso frame senza che l'elenco cresca a
// dismisura, e visto che il consumatore molla molto prima, tutto ciò che sta
// oltre 96 serve solo a far scattare il flag `troppiCambi` — non a essere letto.
// Il costo per cella qui è di due numeri in un array: 256 sono 3 KB.
const TETTO_CAMBI = 256;

// LA CHIAVE DI CELLA È UN NUMERO, e questa riga sola vale più di mezza giornata
// di ottimizzazioni altrove. `tipo()` è la funzione più calda del gioco — la
// chiamano fisica, mesher, sim dell'acqua, mira e A* — e ognuna delle sue
// chiamate costruiva DUE stringhe («x,y,z» e «cx,cz») da dare in pasto a due
// Map, cioè due allocazioni e due hash di stringa per una domanda che è
// aritmetica pura. Un clic di cammino a ottanta blocchi ne faceva duecentomila.
//
// L'IMPACCHETTAMENTO: x e z in [−2048, 2047] (12 bit), y in [−64, 191] (8 bit).
// Il totale sta sotto 2^32, cioè dentro gli interi ESATTI del double: nessuna
// perdita, e le Map diventano numeriche. Chi sfora quei limiti sta costruendo
// un mondo più largo di quattromila blocchi, e a quel punto il problema è un
// altro (vedi `dentroLimiti`).
const OFF_XZ = 2048, OFF_Y = 64;
const chiave = (x, y, z) => ((x + OFF_XZ) * 4096 + (z + OFF_XZ)) * 256 + (y + OFF_Y);
const dax = (k) => Math.floor(k / (256 * 4096)) - OFF_XZ;
const daz = (k) => Math.floor(k / 256) % 4096 - OFF_XZ;
const day = (k) => k % 256 - OFF_Y;
/** Le coordinate ci stanno nella chiave? Fuori da qui l'impacchettamento mente. */
export const dentroLimiti = (x, y, z) =>
  x >= -OFF_XZ && x < OFF_XZ && z >= -OFF_XZ && z < OFF_XZ && y >= -OFF_Y && y < 256 - OFF_Y;

// La chiave di CHUNK resta una stringa: la leggono altri moduli (mesher, debug)
// e si costruisce una volta per chunk, non una per blocco.
const chiaveChunk = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);

export class Mondo {
  constructor() {
    this.chunks = new Map();         // "cx,cz" → Map("x,y,z" → tipo)
    this.sporchi = new Set();        // chunk da rimeshare per intero
    this.sporchiAcqua = new Set();   // chunk dove è cambiata SOLO acqua (rebuild leggero)
    this._rev = new Map();           // kc → quante volte è cambiato (vedi revisione)
    this.furni = new Map();          // "x,y,z" → istanza furni che occupa la cella
    // L'INGOMBRO CHE FA OMBRA AL SOLE, che NON è la stessa cosa di `furni`:
    // quello è la hitbox (il tronco dell'albero, 1×1×3), questo è il volume del
    // MODELLO (la chioma, che sborda). Un albero che proiettasse l'ombra del suo
    // tronco sarebbe più strano che non proiettarne affatto.
    // Il valore è un CONTATORE: due furni vicini possono coprire la stessa cella,
    // e togliere il primo non deve cancellare l'ombra del secondo.
    this.ombreFurni = new Map();     // "x,y,z" → {x, y, z, n}
    this.contaBlocchi = 0;
    this.onEvento = null;
    // CELLE cambiate (x,y,z appiattiti), non chunk: la maschera d'occlusione si aggiorna
    // in modo incrementale e ha bisogno di sapere DOVE, non solo dove rimeshare.
    // L'acqua non entra qui: non ferma la luce e non ne emette, e la sua
    // simulazione tocca celle di continuo.
    this.cambiate = [];
    this.troppiCambi = false;
    this._memoCx = 0; this._memoCz = 0; this._memoChunk = null;        // oltre il tetto conviene rifare tutto
  }

  // Tetto: una generazione di mondo passa di qui decine di migliaia di volte, e
  // un elenco che cresce all'infinito sarebbe peggio del problema che risolve.
  // Oltre il tetto il mesher rifà la griglia intera, che a quel punto costa meno.
  _cambiata(x, y, z) {
    if (this.cambiate.length >= 3 * TETTO_CAMBI) { this.troppiCambi = true; return; }
    this.cambiate.push(x, y, z);
  }

  /** Il mesher ha assorbito i cambi: si riparte da zero. */
  scordaCambi() { this.cambiate.length = 0; this.troppiCambi = false; }

  /** IL MEMO DEL CHUNK: chi interroga il mondo lo fa quasi sempre nello stesso
   *  posto due volte di fila (i sei vicini di una cella, i passi di un raggio,
   *  l'intorno del gatto). Ricordare l'ultimo chunk risparmia la costruzione
   *  della sua chiave-stringa e la ricerca nella Map. Si azzera a ogni cambio
   *  STRUTTURALE (chunk creato o cancellato): il contenuto può cambiare quanto
   *  vuole, la mappa del chunk resta quella. */
  _scordaMemo() { this._memoKc = null; this._memoChunk = null; }

  _chunkDi(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    if (this._memoChunk !== null && this._memoCx === cx && this._memoCz === cz) return this._memoChunk;
    const c = this.chunks.get(cx + ',' + cz) || null;
    this._memoCx = cx; this._memoCz = cz; this._memoChunk = c;
    return c;
  }

  tipo(x, y, z) {
    const c = this._chunkDi(x, z);
    return c ? (c.get(chiave(x, y, z)) || null) : null;
  }

  /** Blocco pieno ai fini del culling/mira (acqua inclusa). */
  pieno(x, y, z) { return this.tipo(x, y, z) !== null; }

  /** Solido per la fisica: blocchi non-acqua + celle occupate da furni.
   *
   *  ⚠ UN FURNI PUÒ ESSERE CALPESTABILE, e serve alle decorazioni: un ciuffo
   *  d'erba, una manciata di petali o di foglie secche occupano la cella (così
   *  non ci si piazza dentro un'altra cosa) ma NON fermano chi cammina. Senza
   *  questa distinzione ogni fiore diventerebbe un muro alto un blocco, che è
   *  esattamente il contrario di quello che sembra guardandolo. */
  solido(x, y, z) {
    const t = this.tipo(x, y, z);
    if (t && defDi(t).solido) return true;
    const f = this.furni.get(chiave(x, y, z));
    return !!f && !(f.def && f.def.calpestabile);
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
    this._tocca(chiaveChunk(x, z), dove);
    if (lx === 0) this._tocca(chiaveChunk(x - 1, z), dove);
    if (lx === CHUNK - 1) this._tocca(chiaveChunk(x + 1, z), dove);
    if (lz === 0) this._tocca(chiaveChunk(x, z - 1), dove);
    if (lz === CHUNK - 1) this._tocca(chiaveChunk(x, z + 1), dove);
  }

  _tocca(kc, dove) {
    dove.add(kc);
    this._rev.set(kc, (this._rev.get(kc) || 0) + 1);
  }

  /**
   * QUANTE VOLTE QUESTO CHUNK È CAMBIATO. Serve a chi tiene una cache DERIVATA
   * dal contenuto — l'erba e le foglie tengono i ciuffi già seminati — per
   * invalidarsi da sola: appende questo numero alla propria chiave e una cella
   * scavata basta a rendere la voce vecchia irraggiungibile. Il mondo non sa chi
   * siano quelle cache e non deve saperlo: `sporchi` invece è un elenco che
   * qualcuno consuma e svuota, quindi non va bene per due lettori diversi.
   */
  revisione(kc) { return this._rev.get(kc) || 0; }

  metti(x, y, z, tipo, silenzioso = false) {
    const kc = chiaveChunk(x, z);
    let c = this.chunks.get(kc);
    if (!c) { c = new Map(); this.chunks.set(kc, c); this._scordaMemo(); }
    const k = chiave(x, y, z);
    const prima = c.get(k);
    if (prima === undefined) this.contaBlocchi++;
    c.set(k, tipo);
    // acqua che rimpiazza acqua/vuoto: basta il rebuild leggero (solo liquido)
    const soloAcqua = tipo.charCodeAt(0) === 97 && tipo.startsWith('acqua')
      && (prima === undefined || prima.startsWith('acqua'));
    this._sporca(x, z, soloAcqua ? this.sporchiAcqua : this.sporchi);
    if (!soloAcqua) this._cambiata(x, y, z);
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
    if (c.size === 0) { this.chunks.delete(kc); this._scordaMemo(); }
    const eraAcqua = !!(prima && prima.startsWith('acqua'));
    this._sporca(x, z, eraAcqua ? this.sporchiAcqua : this.sporchi);
    if (!eraAcqua) this._cambiata(x, y, z);
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'togli', cella: [x, y, z] });
    return true;
  }

  occupaFurni(celle, istanza) { for (const [x, y, z] of celle) this.furni.set(chiave(x, y, z), istanza); }
  liberaFurni(celle) { for (const [x, y, z] of celle) this.furni.delete(chiave(x, y, z)); }
  furniIn(x, y, z) { return this.furni.get(chiave(x, y, z)) || null; }

  /** Accende l'ombra su queste celle. Le segna anche CAMBIATE, così il giro
   *  incrementale del mesher le ricarica in GPU senza rifare la griglia.
   *
   *  `opaca` = il furni NON porta una sorgente di luce, quindi il suo ingombro
   *  ferma anche le lampade (un albero fa ombra alla luce del lampione accanto).
   *  Chi la luce ce l'ha addosso resta trasparente, se no si spegne da solo.
   *  Il conto è DOPPIO perché le celle si sovrappongono: finché almeno un furni
   *  opaco insiste sulla cella, la cella resta opaca. */
  occupaOmbra(celle, opaca = false) {
    for (const [x, y, z] of celle) {
      const k = chiave(x, y, z);
      const v = this.ombreFurni.get(k);
      if (v) {
        v.n++;
        if (opaca && v.op++ === 0) this._cambiata(x, y, z);   // da trasparente a opaca
        continue;
      }
      this.ombreFurni.set(k, { x, y, z, n: 1, op: opaca ? 1 : 0 });
      this._cambiata(x, y, z);
    }
  }

  liberaOmbra(celle, opaca = false) {
    for (const [x, y, z] of celle) {
      const k = chiave(x, y, z);
      const v = this.ombreFurni.get(k);
      if (!v) continue;
      if (opaca && v.op > 0 && --v.op === 0 && v.n > 1) this._cambiata(x, y, z);
      if (--v.n > 0) continue;
      this.ombreFurni.delete(k);
      this._cambiata(x, y, z);
    }
  }

  /** Questa cella ferma il sole per via di un furni? 0 = no · 1 = ingombro di un
   *  furni luminoso (ferma il sole e basta) · 2 = ingombro opaco (ferma anche le
   *  lampade). I valori sono quelli che si aspetta luce.applicaCambi. */
  ombraFurniIn(x, y, z) {
    const v = this.ombreFurni.get(chiave(x, y, z));
    return v ? (v.op > 0 ? 2 : 1) : 0;
  }

  appoggioInColonna(x, z, yDa, profondita = 8) {
    for (let y = yDa; y > yDa - profondita; y--) {
      if (this.calpestabile(x, y, z)) return y;
    }
    return null;
  }

  svuota() {
    this.chunks.clear();
    this._scordaMemo();
    this.furni.clear();
    this.sporchi.clear();
    this.sporchiAcqua.clear();
    // NON si azzera: le revisioni devono solo CRESCERE. Azzerandole, una cache
    // che ha in mano «chunk 3,4 revisione 7» tornerebbe valida su un mondo nuovo
    // dove quel chunk è tutt'altra cosa — e si vedrebbero i ciuffi del mondo di
    // prima. Un contatore che sale e basta non ha questo problema.
    for (const kc of this._rev.keys()) this._rev.set(kc, this._rev.get(kc) + 1);
    this.scordaCambi();
    this.contaBlocchi = 0;
  }

  *tutti() {
    for (const c of this.chunks.values()) {
      for (const [k, tipo] of c) {
        yield { x: dax(k), y: day(k), z: daz(k), tipo };
      }
    }
  }

  /** Scorre TUTTI i blocchi chiamando cb(x, y, z, tipo), senza allocare nulla.
   *  tutti() è più comodo ma per ogni blocco fa split + map + un oggetto nuovo:
   *  misurato su 73k blocchi, 34 ms contro 8. Per chi deve attraversare il
   *  mondo intero (la griglia di luce) la differenza è tutto il costo. */
  perOgni(cb) {
    for (const c of this.chunks.values()) {
      for (const [k, tipo] of c) cb(dax(k), day(k), daz(k), tipo);
    }
  }

  *blocchiDelChunk(kc) {
    const c = this.chunks.get(kc);
    if (!c) return;
    for (const [k, tipo] of c) yield { x: dax(k), y: day(k), z: daz(k), tipo };
  }
}
