// Inventario (M5): rompere raccoglie, piazzare consuma.
// Un conteggio per id (blocchi e furni) + ATTREZZI (il secchio con stato).
// La modalità ∞ (debug/creativa) ignora i conteggi.

export const ATTREZZI = {
  secchio: { id: 'secchio', nome: 'Secchio', emoji: '🪣' },
  // famiglia = i blocchi che rompono in UN colpo (a mano ne servono due)
  vanga:   { id: 'vanga',   nome: 'Vanga',   emoji: '♠️', famiglia: 'scavo' },
  piccone: { id: 'piccone', nome: 'Piccone', emoji: '⛏️', famiglia: 'mina' },
  ascia:   { id: 'ascia',   nome: 'Ascia',   emoji: '🪓', famiglia: 'taglia' },
};

const DOTAZIONE = {
  erba: 64, terra: 64, sabbia: 64, ghiaia: 64, neve: 64, roccia: 64,
  pietra: 64, mattoni: 64, legno: 64, tronco: 64, asse: 64,
  lanaBianca: 64, lanaRossa: 64, lanaBlu: 64, lanaGialla: 64, lanaVerde: 64,
  acqua: 64,
  albero: 10, panchina: 10, lampione: 10, generatore: 5,
  secchio: 1, vanga: 1, piccone: 1, ascia: 1,
};

export class Inventario {
  constructor() {
    this.conti = new Map(Object.entries(DOTAZIONE));
    this.infinito = false;
    this.secchioPieno = false;
    this.onCambio = null;
  }

  quanti(id) {
    if (ATTREZZI[id]) return this.conti.get(id) || 0;   // gli attrezzi non sono mai ∞
    return this.infinito ? Infinity : (this.conti.get(id) || 0);
  }

  aggiungi(id, n = 1) {
    this.conti.set(id, (this.conti.get(id) || 0) + n);
    if (this.onCambio) this.onCambio();
  }

  /** Toglie n unità (per il crafting). Con ∞ non consuma. */
  togli(id, n = 1) {
    if (this.infinito) return;
    this.conti.set(id, Math.max(0, (this.conti.get(id) || 0) - n));
    if (this.onCambio) this.onCambio();
  }

  /** true se si può piazzare (e scala 1). Con ∞ non consuma mai. */
  consuma(id) {
    if (this.infinito) return true;
    const n = this.conti.get(id) || 0;
    if (n <= 0) return false;
    this.conti.set(id, n - 1);
    if (this.onCambio) this.onCambio();
    return true;
  }

  impostaInfinito(attivo) {
    this.infinito = attivo;
    if (this.onCambio) this.onCambio();
  }

  impostaSecchio(pieno) {
    this.secchioPieno = pieno;
    if (this.onCambio) this.onCambio();
  }

  serializza() {
    return { conti: Object.fromEntries(this.conti), secchioPieno: this.secchioPieno };
  }

  applica(dati) {
    if (dati && dati.conti) {
      this.conti = new Map(Object.entries(dati.conti));
      this.secchioPieno = !!dati.secchioPieno;
    } else if (dati && typeof dati === 'object') {
      this.conti = new Map(Object.entries(dati));      // formato vecchio (solo conti)
      this.secchioPieno = false;
    } else {
      this.conti = new Map(Object.entries(DOTAZIONE));
      this.secchioPieno = false;
    }
    for (const [id, n] of Object.entries(DOTAZIONE)) {
      if (!this.conti.has(id)) this.conti.set(id, n);  // nuovi oggetti nelle vecchie partite
    }
    if (this.onCambio) this.onCambio();
  }
}
