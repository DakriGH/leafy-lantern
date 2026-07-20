// Sistemi — il REGISTRO ORDINATO dei sistemi della simulazione. Un "sistema" è
// una funzione fn(ctx) che, a ogni tick, legge/scrive i componenti dell'ECS. Qui
// si decide CHI gira PRIMA: l'ordine conta (input → comandi → fisica → …) e
// dev'essere STABILE e deterministico, perché da esso dipende lo stato finale.
//
// PERCHÉ UN REGISTRO E NON CHIAMATE A MANO NEL LOOP. Migrando un sistema per
// volta, il numero di sistemi cresce; tenerli in un elenco ordinato per "ordine"
// (con l'ordine d'inserimento come tie-break) rende ESPLICITO e testabile il
// loro susseguirsi, invece di affidarlo all'ordine delle righe sparse in passo().
// Aggiungere il prossimo sistema (creature, acqua…) diventa una riga, non una
// caccia al punto giusto del loop.
//
// PICCOLO E QUASI PURO: questo registro non importa three.js né tocca il DOM. Un
// SINGOLO sistema può toccare three (es. la resa che sposta i mesh), ma il
// registro no: si limita a chiamarli in ordine passando lo stesso ctx a tutti.

export class Sistemi {
  constructor() {
    this._lista = [];      // { nome, fn, ordine, seq }
    this._seq = 0;         // ordine d'inserimento: il tie-break deterministico
    this._ordinato = true; // pigrizia: si riordina solo quando serve davvero
  }

  /**
   * Registra un sistema. `ordine` (intero, default 0) decide la sequenza: più
   * BASSO = prima. A pari ordine vince chi è stato aggiunto prima (seq), così la
   * sequenza è TOTALMENTE deterministica e non dipende dall'algoritmo di sort.
   * Un nome già registrato LANCIA: far girare due volte lo stesso sistema per un
   * refuso è un baco, meglio scoprirlo all'avvio che a runtime.
   */
  aggiungiSistema(nome, fn, ordine = 0) {
    if (typeof fn !== 'function') throw new Error(`Sistemi: "${nome}" non è una funzione`);
    if (this._lista.some((s) => s.nome === nome)) throw new Error(`Sistemi: "${nome}" già registrato`);
    this._lista.push({ nome, fn, ordine: ordine | 0, seq: this._seq++ });
    this._ordinato = false;
    return this;
  }

  /** Toglie un sistema per nome. Torna true se c'era. */
  rimuovi(nome) {
    const i = this._lista.findIndex((s) => s.nome === nome);
    if (i < 0) return false;
    this._lista.splice(i, 1);
    return true;
  }

  /** Quanti sistemi registrati. */
  get dimensione() { return this._lista.length; }

  _riordina() {
    // sort per (ordine, seq). L'Array.sort di JS è stabile, ma metto il seq nel
    // confronto per non DIPENDERE da quel dettaglio: l'ordine è esplicito.
    this._lista.sort((a, b) => (a.ordine - b.ordine) || (a.seq - b.seq));
    this._ordinato = true;
  }

  /** I nomi dei sistemi NELL'ORDINE di esecuzione (per test e diagnostica). */
  get nomi() {
    if (!this._ordinato) this._riordina();
    return this._lista.map((s) => s.nome);
  }

  /** Esegue tutti i sistemi in ordine, passando lo STESSO `ctx` a ognuno. */
  esegui(ctx) {
    if (!this._ordinato) this._riordina();
    for (let i = 0; i < this._lista.length; i++) this._lista[i].fn(ctx);
  }
}
