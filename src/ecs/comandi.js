// Comandi — il bus di COMANDI/EVENTI, l'aggancio verso il multiplayer.
//
// DUE MECCANISMI in una classe:
//  1) EMITTER pub/sub multi-iscritto (ascolta/emetti): a differenza dell'attuale
//     onEvento a listener SINGOLO sparso nel gioco (world.onEvento, arredo.onEvento),
//     qui più sistemi possono ascoltare lo stesso tipo. Consegna sincrona.
//  2) CODA ordinata per tick (accoda/applicaFino): i comandi si accumulano e si
//     applicano in ordine deterministico (per tick, poi ordine d'arrivo) al tick
//     giusto. È il gancio per l'host autoritativo: si distribuiscono i COMANDI
//     numerati per tick, non lo stato grezzo — così ogni peer, applicandoli nello
//     stesso ordine allo stesso tick, arriva allo stesso stato. La rete NON è
//     implementata qui: qui c'è solo la struttura che la rende possibile.
//
// UN COMANDO è un dato PURO serializzabile: { tipo, ...campi, tick? }. Niente
// funzioni, niente oggetti three.js — dev'essere spedibile sul filo così com'è.
//
// WHITELIST DEI TIPI (come TIPI_VALIDI in net/lobby.js): un comando con `tipo`
// non in whitelist viene SCARTATO, non applicato. È sicurezza di base: un domani
// questi comandi arriveranno dalla rete, cioè da fonti non fidate, e non devono
// poter invocare azioni arbitrarie. Coerente con lobby.js, che già scarta in
// silenzio i messaggi con tipo sconosciuto.

export class BusComandi {
  /**
   * @param tipi   iterabile dei tipi validi (es. ['muovi','posa','togli']).
   *               Se omesso/null, la whitelist è DISATTIVA (tutti i tipi passano)
   *               — comodo in test; in produzione passala sempre.
   * @param severo se true, un tipo non valido LANCIA invece di essere scartato
   *               (utile in sviluppo per stanare i refusi). Default false, come
   *               il comportamento di rete "scarta e prosegui".
   */
  constructor({ tipi = null, severo = false } = {}) {
    this._tipi = tipi ? new Set(tipi) : null;
    this._severo = severo;
    this._ascoltatori = new Map();   // tipo -> Set<fn>  ('*' = qualsiasi tipo)
    this._coda = [];                 // min-heap (tick, seq) dei comandi accodati
    this._seq = 0;
    this.scartati = 0;               // quanti comandi buttati per tipo non valido
  }

  /** True se il tipo è ammesso (o se la whitelist è disattiva). */
  tipoValido(tipo) { return this._tipi === null ? true : this._tipi.has(tipo); }

  _controlla(comando) {
    if (!comando || typeof comando.tipo !== 'string') {
      if (this._severo) throw new Error('BusComandi: comando senza tipo');
      this.scartati++; return false;
    }
    if (!this.tipoValido(comando.tipo)) {
      if (this._severo) throw new Error(`BusComandi: tipo non valido "${comando.tipo}"`);
      this.scartati++; return false;
    }
    return true;
  }

  // --- emitter pub/sub multi-iscritto ----------------------------------------

  /**
   * Iscrive `fn` ai comandi di `tipo` ('*' per tutti). Torna una funzione di
   * disiscrizione (comoda da tenere e chiamare, niente riferimenti sparsi).
   */
  ascolta(tipo, fn) {
    let set = this._ascoltatori.get(tipo);
    if (!set) { set = new Set(); this._ascoltatori.set(tipo, set); }
    set.add(fn);
    return () => this.scollega(tipo, fn);
  }

  /** Disiscrive `fn` da `tipo`. Torna true se c'era. */
  scollega(tipo, fn) {
    const set = this._ascoltatori.get(tipo);
    if (!set) return false;
    const cera = set.delete(fn);      // true se era davvero iscritto
    if (set.size === 0) this._ascoltatori.delete(tipo);
    return cera;
  }

  /**
   * Consegna `comando` SUBITO a tutti gli iscritti al suo tipo e ai '*'. Scarta
   * (o lancia, se severo) i tipi non validi. Torna a quanti l'ha consegnato.
   *
   * Si itera su una COPIA degli iscritti: così un listener può iscriverne o
   * disiscriverne altri (o se stesso) durante la consegna senza rompere il giro.
   */
  emetti(comando) {
    if (!this._controlla(comando)) return 0;
    let consegnato = 0;
    const diretti = this._ascoltatori.get(comando.tipo);
    if (diretti) for (const fn of [...diretti]) { fn(comando); consegnato++; }
    const jolly = this._ascoltatori.get('*');
    if (jolly) for (const fn of [...jolly]) { fn(comando); consegnato++; }
    return consegnato;
  }

  // --- coda ordinata per tick (verso l'host autoritativo) --------------------

  /**
   * Accoda un comando da applicare a un tick. `comando.tick` è il tick bersaglio
   * (default 0 se assente). L'ordine d'arrivo (seq) è il tie-break a pari tick:
   * due comandi per lo stesso tick si applicano nell'ordine in cui sono arrivati
   * — deterministico. Torna true se accodato, false se scartato.
   */
  accoda(comando) {
    if (!this._controlla(comando)) return false;
    const tick = Number.isFinite(comando.tick) ? comando.tick : 0;
    this._push({ tick, seq: this._seq++, comando });
    return true;
  }

  /**
   * Applica in ordine (tick crescente, poi arrivo) TUTTI i comandi accodati con
   * tick <= `finoATick`, chiamando `applica(comando)` per ognuno. I comandi per
   * tick futuri restano in coda. Torna quanti ne ha applicati.
   */
  applicaFino(finoATick, applica) {
    let n = 0;
    while (this._coda.length > 0 && this._coda[0].tick <= finoATick) {
      applica(this._estrai().comando);
      n++;
    }
    return n;
  }

  /** Il tick del prossimo comando in coda, o null se vuota. */
  prossimoTick() { return this._coda.length ? this._coda[0].tick : null; }
  /** Quanti comandi ancora in coda. */
  get inCoda() { return this._coda.length; }
  /** Svuota la coda (non tocca gli iscritti). */
  svuota() { this._coda.length = 0; }

  // --- min-heap (tick, seq): stessa logica dell'agenda, in piccolo -----------
  // Tenuto qui e non condiviso con agenda.js apposta: comandi resta autonomo,
  // niente accoppiamento fra i due moduli del core.
  _precede(a, b) { return a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq; }

  _push(voce) {
    const h = this._coda;
    h.push(voce);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._precede(h[i], h[p]) < 0) { const t = h[i]; h[i] = h[p]; h[p] = t; i = p; }
      else break;
    }
  }

  _estrai() {
    const h = this._coda;
    const cima = h[0];
    const ultimo = h.pop();
    if (h.length > 0) {
      h[0] = ultimo;
      let i = 0;
      const n = h.length;
      for (;;) {
        let min = i;
        const sx = 2 * i + 1, dx = 2 * i + 2;
        if (sx < n && this._precede(h[sx], h[min]) < 0) min = sx;
        if (dx < n && this._precede(h[dx], h[min]) < 0) min = dx;
        if (min === i) break;
        const t = h[i]; h[i] = h[min]; h[min] = t; i = min;
      }
    }
    return cima;
  }
}
