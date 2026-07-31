// Meteo automatico: il cielo del diorama VIVE da solo.
//
// PRIMA ERA UN INTERRUTTORE: sereno o rovescio, e il rovescio era sempre lo
// stesso rovescio. Adesso i tipi di precipitazione sono QUATTRO e si distinguono
// per intensità, non per colore: una pioggerella e una tempesta hanno gocce di
// lunghezza, velocità e inclinazione diverse (fx/pioggia.js, uForza).
//
// LA SCALA È ORDINATA E LE TRANSIZIONI LA RISPETTANO: dal sereno non si passa
// mai dritti alla tempesta, si passa dalla pioggia. Un temporale che scoppia dal
// cielo azzurro in un fotogramma non è drammatico, è rotto — e il committente lo
// noterebbe subito, perché è il genere di cosa che si vede giocando e non in uno
// screenshot.
//
// D'inverno la pioggia diventa NEVE (pioggia.js, uniform uNeve). Il toggle
// manuale della pioggia (Impostazioni/F3) mette il meteo in pausa: comandi tu.

// nome interno, forza 0..1 passata alla pioggia, etichetta per il toast
export const TIPI = {
  sereno: { forza: 0, emoji: '☀️', testo: 'Torna il sereno' },
  pioggerella: { forza: 0.22, emoji: '🌦', testo: 'Comincia a piovigginare…' },
  rovescio: { forza: 0.55, emoji: '🌧', testo: 'Arriva un rovescio…' },
  temporale: { forza: 0.82, emoji: '⛈', testo: 'Temporale!' },
  tempesta: { forza: 1.0, emoji: '🌪', testo: 'Tempesta!' },
};
// la scala, in ordine: si sale e si scende di UN gradino alla volta
const SCALA = ['sereno', 'pioggerella', 'rovescio', 'temporale', 'tempesta'];

export class Meteo {
  constructor(pioggia) {
    this.pioggia = pioggia;
    this.auto = true;
    this.stato = 'sereno';
    this._timer = this._durata('sereno');
    this._meta = 'sereno';     // dove sta andando (può servire più di un passo)
    this.lampo = 0;            // 0..1: il bagliore del fulmine, lo legge main
    this._tLampo = 3;
  }

  _durata(stato) {
    // secondi di permanenza: sereno a lungo, il brutto tempo più breve —
    // e più è forte, meno dura: le tempeste passano
    if (stato === 'sereno') return 90 + Math.random() * 150;
    const i = SCALA.indexOf(stato);
    return (50 - i * 8) + Math.random() * 40;
  }

  /** Quanto è forte la precipitazione adesso (0..1). */
  get forza() { return TIPI[this.stato].forza; }
  /** true se sta precipitando in qualche forma. */
  get piove() { return this.stato !== 'sereno'; }

  _vaiA(stato) {
    this.stato = stato;
    this._timer = this._durata(stato);
    this.pioggia.imposta(this.piove);      // il fade morbido lo fa pioggia.aggiorna
    this.pioggia.intensita(this.forza);
    const t = TIPI[stato];
    return `${t.emoji} ${t.testo}`;
  }

  /** Da chiamare nel loop. `inverno` decide pioggia o neve. */
  aggiorna(dt, inverno) {
    this.pioggia.neve(inverno ? 1 : 0);

    // IL LAMPO. Solo da temporale in su, e non è solo un flash: è un bagliore
    // che sale in un fotogramma e scende in un terzo di secondo, perché un
    // lampo che si spegne linearmente sembra una lampadina.
    if (this.lampo > 0) this.lampo = Math.max(0, this.lampo - dt * 3.2);
    if (this.forza >= TIPI.temporale.forza) {
      this._tLampo -= dt;
      if (this._tLampo <= 0) {
        this.lampo = 1;
        // più è forte la tempesta, più spesso lampeggia
        this._tLampo = (this.stato === 'tempesta' ? 2.5 : 5) + Math.random() * 6;
      }
    } else {
      this._tLampo = 3 + Math.random() * 4;
    }

    if (!this.auto) return null;
    this._timer -= dt;
    if (this._timer > 0) return null;

    // scelta della prossima meta, poi ci si arriva UN GRADINO alla volta
    if (this.stato === this._meta) {
      this._meta = this.stato === 'sereno'
        ? SCALA[1 + Math.floor(Math.random() * (SCALA.length - 1))]
        : 'sereno';
    }
    const qui = SCALA.indexOf(this.stato), la = SCALA.indexOf(this._meta);
    return this._vaiA(SCALA[qui + Math.sign(la - qui)]);
  }

  /** L'utente tocca la pioggia a mano: il meteo automatico si fa da parte. */
  manuale() { this.auto = false; }

  attivaAuto(on) {
    this.auto = on;
    if (on) {
      this.stato = this.pioggia.attiva ? 'rovescio' : 'sereno';
      this._meta = this.stato;
      this._timer = this._durata(this.stato);
      this.pioggia.intensita(this.forza);
    }
  }
}
