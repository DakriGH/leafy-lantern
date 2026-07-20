// Agenda — i TICK PROGRAMMATI, stile Minecraft. Un'entità/macchina PRENOTA il
// suo prossimo tick con una priorità; il loop scarica solo i tick scaduti.
//
// PERCHÉ. Un diorama può avere migliaia di macchine ferme: se ognuna venisse
// interrogata a ogni tick "hai qualcosa da fare?", mille macchine inerti
// costerebbero mille controlli a vuoto per tick. Con i tick programmati, una
// macchina che non ha nulla da fare NON è in agenda e costa ZERO; quando serve,
// prenota `programma(traQuantiTick, ...)` e ricompare solo al momento giusto.
//
// STRUTTURA: min-heap binario su array, fatto a mano. La radice è sempre la voce
// "più imminente" secondo l'ordine (tickBersaglio, poi priorità, poi ordine di
// inserimento) — lo STESSO ordinamento delle block-tick di Minecraft, così due
// prenotazioni per lo stesso tick escono deterministicamente (prima la priorità
// più bassa, a pari priorità la più vecchia). L'ordine d'inserimento (seq) è il
// tie-break finale: garantisce determinismo totale, indispensabile per host
// autoritativo e replay.
//
// NIENTE ALLOCAZIONI PER SCARICO: l'array dell'heap è riusato tra una scarica e
// l'altra (si accorcia con pop(), non si ricrea). Si alloca un piccolo oggetto
// voce solo al momento di programma(); lo scarico non alloca nulla.

export class Agenda {
  /**
   * @param budgetPerScarico tetto di voci eseguite in una singola scarica()
   *        (default Infinito). Serve da paracadute se una voce ne riprogramma
   *        altre a 0 tick creando un loop nello stesso tick: col budget la
   *        scarica non va mai in stallo. Le voci non eseguite restano in coda.
   */
  constructor(budgetPerScarico = Infinity) {
    this._heap = [];      // array riusato: qui vive il min-heap
    this._seq = 0;        // contatore d'inserimento, il tie-break deterministico
    this._ora = 0;        // ultimo tickCorrente visto: base per i "traQuantiTick"
    this.budgetPerScarico = budgetPerScarico;
  }

  get dimensione() { return this._heap.length; }

  /** Il tick della voce più imminente, o null se l'agenda è vuota. */
  prossimoBersaglio() { return this._heap.length ? this._heap[0].bersaglio : null; }

  /**
   * Prenota qualcosa fra `traQuantiTick` tick (relativo all'ULTIMO tick visto da
   * scarica(); durante un callback di scarica() è il tick in corso — così una
   * macchina che si auto-riprogramma calcola giusto). priorità: intero, più
   * basso = prima. `cosa` è ciò che verrà passato a esegui() (un id-entità, una
   * stringa-azione, una callback...), `dato` un payload facoltativo.
   * @returns la voce inserita (utile per test/diagnostica).
   */
  programma(traQuantiTick, priorita, cosa, dato = null) {
    const bersaglio = this._ora + Math.max(0, traQuantiTick | 0);
    const voce = { bersaglio, priorita: priorita | 0, seq: this._seq++, cosa, dato };
    const h = this._heap;
    h.push(voce);
    this._su(h.length - 1);
    return voce;
  }

  /**
   * Esegue TUTTE le voci con bersaglio <= tickCorrente, in ordine (bersaglio,
   * priorità, seq). Chiama `esegui(cosa, dato, bersaglio)` per ognuna. Rispetta
   * il budget: se lo supera, si ferma e le restanti attendono la prossima
   * scarica. Torna quante voci ha eseguito.
   *
   * Riprogrammazione durante lo scarico: una voce può chiamare programma() dal
   * suo esegui(); se prenota per un tick futuro finisce nell'heap e sarà vista
   * dopo; se prenota a 0 tick (stesso tick) verrà ripresa in QUESTA scarica —
   * ecco perché serve il budget come paracadute.
   */
  scarica(tickCorrente, esegui) {
    this._ora = tickCorrente;
    const h = this._heap;
    let n = 0;
    while (h.length > 0 && h[0].bersaglio <= tickCorrente) {
      if (n >= this.budgetPerScarico) break;
      const voce = this._estrai();
      esegui(voce.cosa, voce.dato, voce.bersaglio);
      n++;
    }
    return n;
  }

  /** Svuota l'agenda (l'array resta allocato e riusabile). */
  svuota() { this._heap.length = 0; }

  // --- serializzazione -------------------------------------------------------
  // Esporta solo le voci con `cosa` SERIALIZZABILE (non funzioni): un callback
  // non si salva su disco. Chi vuole voci salvabili usa un descrittore piano
  // (id-entità + stringa) come `cosa`, non una closure.
  esporta() {
    const voci = [];
    for (const v of this._heap) {
      if (typeof v.cosa === 'function' || typeof v.dato === 'function') continue;
      voci.push({ bersaglio: v.bersaglio, priorita: v.priorita, seq: v.seq, cosa: v.cosa, dato: v.dato });
    }
    return { v: 1, seq: this._seq, ora: this._ora, voci };
  }

  importa(dati) {
    if (!dati || dati.v !== 1) throw new Error('Agenda.importa: formato sconosciuto');
    this._heap.length = 0;
    this._seq = dati.seq | 0;
    this._ora = dati.ora | 0;
    for (const v of dati.voci || []) {
      this._heap.push({ bersaglio: v.bersaglio, priorita: v.priorita, seq: v.seq, cosa: v.cosa, dato: v.dato });
    }
    this._costruisciHeap();   // ricostruisce l'invariante in O(n)
    return this;
  }

  // --- min-heap binario, a mano ----------------------------------------------
  // Ordine totale fra due voci: prima bersaglio, poi priorità, poi seq. Torna
  // <0 se a precede b.
  _precede(a, b) {
    if (a.bersaglio !== b.bersaglio) return a.bersaglio - b.bersaglio;
    if (a.priorita !== b.priorita) return a.priorita - b.priorita;
    return a.seq - b.seq;
  }

  _su(i) {
    const h = this._heap;
    const voce = h[i];
    while (i > 0) {
      const padre = (i - 1) >> 1;
      if (this._precede(voce, h[padre]) < 0) { h[i] = h[padre]; i = padre; }
      else break;
    }
    h[i] = voce;
  }

  _giu(i) {
    const h = this._heap;
    const n = h.length;
    const voce = h[i];   // l'elemento che scende: lo si confronta SEMPRE con lui,
    // non con h[i] (che a metà discesa contiene già il figlio promosso). È il
    // baco classico del sift-down "a buco": confrontare col valore stantìo in
    // h[i] rompe l'heap oltre il primo livello.
    for (;;) {
      let figlio = 2 * i + 1;
      if (figlio >= n) break;
      const dx = figlio + 1;
      if (dx < n && this._precede(h[dx], h[figlio]) < 0) figlio = dx;   // il minore dei due figli
      if (this._precede(h[figlio], voce) < 0) { h[i] = h[figlio]; i = figlio; }
      else break;
    }
    h[i] = voce;
  }

  // Estrae la radice (la più imminente) e riequilibra. NON alloca: sposta
  // l'ultimo in cima e fa sift-down; l'array si accorcia con pop().
  _estrai() {
    const h = this._heap;
    const cima = h[0];
    const ultimo = h.pop();
    if (h.length > 0) { h[0] = ultimo; this._giu(0); }
    return cima;
  }

  // Ricostruzione heap in O(n) (heapify di Floyd), usata dall'import.
  _costruisciHeap() {
    for (let i = (this._heap.length >> 1) - 1; i >= 0; i--) this._giu(i);
  }
}
