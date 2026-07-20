// Registro — lo STORE dell'ECS, a sparse-set. È il "database" delle entità del
// gioco: crea/distrugge entità e ci attacca/stacca componenti in O(1).
//
// PERCHÉ SPARSE-SET E NON AD ARCHETIPI. Un gioco sandbox/AR ha tante entità
// eterogenee create e distrutte di continuo (mobili unici, macchine, effetti,
// proiettili): con lo sparse-set add/remove di un componente è O(1) e non
// ricompone tabelle come farebbero gli archetipi. L'iterazione resta ottima
// perché i valori di un componente stanno in un array DENSO contiguo.
//
// I VALORI SONO OGGETTI JS LIBERI, non TypedArray: le nostre entità hanno stato
// ricco e vario (una macchina non è una particella). Per un domani con dati
// caldi e uniformi (posizioni di migliaia di particelle) si potrà aggiungere uno
// storage a TypedArray per singolo componente — ma NON adesso: sarebbe una
// micro-ottimizzazione che complica lo store senza un collo di bottiglia reale.
//
// L'IDENTITÀ DELLE ENTITÀ è un "generational index": un id impacchetta INDICE +
// VERSIONE. Quando un'entità muore il suo indice torna libero e verrà riciclato,
// ma la versione dello slot viene incrementata: così un handle vecchio che punta
// a un'entità morta ha una versione che non combacia più, e vivo() lo smaschera.
// È la difesa contro i "dangling id" — riferimenti a entità che non ci sono più.

// --- impacchettamento id -----------------------------------------------------
// id = indice + versione * SPOSTA. Uso l'ARITMETICA (non i bit-shift): i bitwise
// in JS lavorano a 32 bit con segno e con 20 bit d'indice + tanta versione l'id
// supererebbe presto i 2^31, corrompendosi. Con numeri interi normali resto nel
// sicuro fino a 2^53. 20 bit = fino a ~1,05 milioni di indici vivi insieme, più
// che abbondante per un diorama.
const BIT_INDICE = 20;
const SPOSTA = 2 ** BIT_INDICE;          // 1.048.576
const MASCHERA_INDICE = SPOSTA - 1;

export const ENTITA_NULLA = -1;          // "nessuna entità", distinguibile da id validi (>=0)

/** Scompone un id nel suo indice di slot. */
export function indiceDi(id) { return id & MASCHERA_INDICE; }
/** Scompone un id nella sua versione (generazione dello slot). */
export function versioneDi(id) { return Math.floor(id / SPOSTA); }
/** Ricompone un id da indice e versione. */
export function componiId(indice, versione) { return indice + versione * SPOSTA; }

// --- uno store sparse-set per singolo tipo di componente ---------------------
// denso[]  : i VALORI, contigui (per iterare veloce e cache-friendly).
// proprietari[] : l'id-entità che possiede denso[i] (serve alla swap-remove e a
//                 restituire l'entità durante le query).
// slotDenso[indiceEntita] : posizione nel denso, o undefined se assente. È lo
//                 "sparso": indicizzato per INDICE d'entità (non per id intero),
//                 perché alla morte togliamo tutti i componenti, quindi non
//                 restano mai voci di una versione vecchia.
class DepositoComponente {
  constructor(nome, opzioni = {}) {
    this.nome = nome;
    this.serializzabile = opzioni.serializzabile !== false;   // default: sì
    this.denso = [];
    this.proprietari = [];
    this.slotDenso = [];
  }
  get dimensione() { return this.denso.length; }
}

export class Registro {
  constructor() {
    this._generazioni = [];     // generazione corrente per ogni indice di slot
    this._vivo = [];            // lo slot indice è attualmente occupato?
    this._liberi = [];          // pila di indici riciclabili
    this._depositi = new Map(); // nome componente -> DepositoComponente
    this._numViventi = 0;
  }

  // --- ciclo di vita delle entità -------------------------------------------

  /** Crea un'entità e ne torna l'id (indice riciclato + versione aggiornata). */
  crea() {
    let indice;
    if (this._liberi.length > 0) {
      indice = this._liberi.pop();               // riciclo uno slot morto
    } else {
      indice = this._generazioni.length;         // slot nuovo di zecca
      this._generazioni.push(0);
      this._vivo.push(false);
      if (indice >= SPOSTA) throw new Error(`Registro: superato il tetto di ${SPOSTA} entità vive`);
    }
    this._vivo[indice] = true;
    this._numViventi++;
    return componiId(indice, this._generazioni[indice]);
  }

  /** True se l'id punta a un'entità ANCORA viva (smaschera gli handle stantii). */
  vivo(id) {
    if (id < 0) return false;
    const i = indiceDi(id);
    return i < this._vivo.length && this._vivo[i] === true && this._generazioni[i] === versioneDi(id);
  }

  /**
   * Distrugge l'entità: stacca tutti i suoi componenti, INCREMENTA la
   * generazione dello slot (così ogni handle vecchio diventa stantìo) e rende
   * l'indice riciclabile. Idempotente: su un id già morto non fa nulla.
   */
  distruggi(id) {
    if (!this.vivo(id)) return false;
    const i = indiceDi(id);
    for (const dep of this._depositi.values()) this._staccaDaDeposito(dep, id);
    this._vivo[i] = false;
    this._generazioni[i] = (this._generazioni[i] + 1) & 0x3fffffff;  // wrap prudente, non arriveremo mai qui
    this._liberi.push(i);
    this._numViventi--;
    return true;
  }

  /** Quante entità vive in questo momento. */
  get numViventi() { return this._numViventi; }

  /** Itera gli id di TUTTE le entità vive (ordine non garantito). */
  *viventi() {
    for (let i = 0; i < this._vivo.length; i++) {
      if (this._vivo[i]) yield componiId(i, this._generazioni[i]);
    }
  }

  // --- registrazione dei tipi di componente ----------------------------------

  /**
   * Registra un tipo di componente. `opzioni.serializzabile=false` per i dati
   * che NON vanno nel salvataggio (es. mesh three.js, handle GPU): l'esporta li
   * salta e il codice di gioco li ricostruisce al caricamento.
   */
  registra(nome, opzioni = {}) {
    if (this._depositi.has(nome)) throw new Error(`Registro: componente "${nome}" già registrato`);
    const dep = new DepositoComponente(nome, opzioni);
    this._depositi.set(nome, dep);
    return this;
  }

  _dep(nome) {
    const dep = this._depositi.get(nome);
    if (!dep) throw new Error(`Registro: componente "${nome}" non registrato (registralo con registra())`);
    return dep;
  }

  // --- componenti sulle entità (tutto O(1)) ----------------------------------

  /**
   * Attacca/aggiorna il componente `nome` con `valore` sull'entità. Se il
   * componente c'è già ne sovrascrive il valore in loco (nessuno spostamento).
   * Lancia se l'entità è morta: scrivere su un handle stantìo è un baco, meglio
   * scoprirlo subito che corrompere lo store di un'altra entità riciclata.
   */
  aggiungi(id, nome, valore) {
    if (!this.vivo(id)) throw new Error('Registro: aggiungi su entità morta/inesistente');
    const dep = this._dep(nome);
    const i = indiceDi(id);
    const pos = dep.slotDenso[i];
    if (pos !== undefined) { dep.denso[pos] = valore; return valore; }
    dep.slotDenso[i] = dep.denso.length;
    dep.denso.push(valore);
    dep.proprietari.push(id);
    return valore;
  }

  /** True se l'entità ha quel componente (e l'entità è viva). */
  ha(id, nome) {
    if (!this.vivo(id)) return false;
    return this._dep(nome).slotDenso[indiceDi(id)] !== undefined;
  }

  /** Il valore del componente, o undefined se assente. */
  leggi(id, nome) {
    const dep = this._dep(nome);
    const pos = dep.slotDenso[indiceDi(id)];
    return pos === undefined ? undefined : dep.denso[pos];
  }

  /** Stacca il componente. Torna true se c'era. Usa la swap-remove per O(1). */
  togli(id, nome) {
    return this._staccaDaDeposito(this._dep(nome), id);
  }

  // La swap-remove classica dello sparse-set: il valore da togliere viene
  // sovrascritto dall'ULTIMO del denso, poi si accorcia. Così il denso resta
  // compatto senza buchi. L'unica finezza è aggiornare lo slotDenso dell'entità
  // che è stata spostata in coda→buco.
  _staccaDaDeposito(dep, id) {
    const i = indiceDi(id);
    const pos = dep.slotDenso[i];
    if (pos === undefined) return false;
    const ultimo = dep.denso.length - 1;
    if (pos !== ultimo) {
      dep.denso[pos] = dep.denso[ultimo];
      const idSpostato = dep.proprietari[ultimo];
      dep.proprietari[pos] = idSpostato;
      dep.slotDenso[indiceDi(idSpostato)] = pos;
    }
    dep.denso.pop();
    dep.proprietari.pop();
    dep.slotDenso[i] = undefined;
    return true;
  }

  /** Quante entità hanno quel componente. */
  conta(nome) { return this._dep(nome).dimensione; }

  // --- query -----------------------------------------------------------------

  /**
   * Itera gli id delle entità che hanno TUTTI i componenti richiesti.
   *
   * Ottimizzazione sparse-set: si sceglie come BASE il deposito più PICCOLO e si
   * scorre quello, filtrando sugli altri con ha(). Iterare il set più piccolo
   * riduce al minimo i controlli.
   *
   * SICUREZZA DURANTE L'ITERAZIONE: si scorre su una COPIA (snapshot) degli id
   * della base presi all'inizio. Così il callback può aggiungere/togliere
   * componenti o distruggere entità senza corrompere l'iterazione:
   *  - un'entità distrutta a metà giro viene saltata (ricontrollo vivo()+ha());
   *  - una tolta dal componente base non fa "saltare" la successiva (che con la
   *    swap-remove finirebbe nel buco): la snapshot ci protegge;
   *  - le entità AGGIUNTE durante il giro non compaiono in questo passaggio
   *    (verranno viste al prossimo tick) — semantica deterministica e voluta.
   */
  *ognuna(...nomi) {
    if (nomi.length === 0) return;
    const depositi = nomi.map((n) => this._dep(n));
    // base = il deposito col denso più corto
    let base = depositi[0];
    for (let k = 1; k < depositi.length; k++) if (depositi[k].dimensione < base.dimensione) base = depositi[k];
    const altri = depositi.filter((d) => d !== base);
    const snapshot = base.proprietari.slice();   // la copia che ci mette al riparo
    for (let s = 0; s < snapshot.length; s++) {
      const id = snapshot[s];
      if (!this.vivo(id)) continue;
      const i = indiceDi(id);
      let tutti = true;
      for (let k = 0; k < altri.length; k++) {
        if (altri[k].slotDenso[i] === undefined) { tutti = false; break; }
      }
      if (tutti) yield id;
    }
  }

  // --- serializzazione (per salvataggio e join P2P futuri) -------------------

  /**
   * Esporta lo stato ECS in un oggetto piano pronto per JSON.stringify. Include
   * SOLO i componenti serializzabili; conserva indici+generazioni così che, al
   * reimport, gli id restino IDENTICI e i riferimenti fra entità (un id salvato
   * dentro un componente) continuino a puntare giusto.
   */
  esporta() {
    const attivi = [];
    for (let i = 0; i < this._vivo.length; i++) if (this._vivo[i]) attivi.push(i);
    const componenti = {};
    for (const [nome, dep] of this._depositi) {
      if (!dep.serializzabile) continue;
      const voci = [];
      for (let p = 0; p < dep.denso.length; p++) voci.push([dep.proprietari[p], dep.denso[p]]);
      componenti[nome] = voci;
    }
    return {
      v: 1,
      generazioni: this._generazioni.slice(),
      attivi,
      componenti,
    };
  }

  /**
   * Ricostruisce lo stato da un esporta(). Assume che i TIPI di componente siano
   * già stati registrati dal codice (lo schema vive nel codice, non nel save). I
   * componenti non-serializzabili restano vuoti: li ripopola il gioco.
   */
  importa(dati) {
    if (!dati || dati.v !== 1) throw new Error('Registro.importa: formato sconosciuto');
    this._generazioni = dati.generazioni.slice();
    const n = this._generazioni.length;
    this._vivo = new Array(n).fill(false);
    const attivi = new Set(dati.attivi);
    for (const i of attivi) this._vivo[i] = true;
    // liberi = tutti gli slot esistenti non attivi (ordine crescente: stabile)
    this._liberi = [];
    for (let i = n - 1; i >= 0; i--) if (!attivi.has(i)) this._liberi.push(i);
    this._numViventi = attivi.size;
    // svuota TUTTI i depositi, poi ripopola quelli presenti nel save
    for (const dep of this._depositi.values()) { dep.denso = []; dep.proprietari = []; dep.slotDenso = []; }
    for (const nome of Object.keys(dati.componenti || {})) {
      const dep = this._depositi.get(nome);
      if (!dep) continue;    // save con un componente che il codice non conosce più: si ignora
      for (const [id, valore] of dati.componenti[nome]) {
        dep.slotDenso[indiceDi(id)] = dep.denso.length;
        dep.denso.push(valore);
        dep.proprietari.push(id);
      }
    }
    return this;
  }
}
