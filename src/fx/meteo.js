// Meteo automatico: il cielo del diorama VIVE da solo. Stati semplici
// (sereno → rovescio → sereno…) con durate casuali e transizioni morbide;
// d'inverno la pioggia diventa NEVE (pioggia.js, uniform uNeve). Il toggle
// manuale della pioggia (Impostazioni/F3) mette il meteo in pausa: comandi tu.

export class Meteo {
  constructor(pioggia) {
    this.pioggia = pioggia;
    this.auto = true;
    this.stato = 'sereno';
    this._timer = this._durata('sereno');
  }

  _durata(stato) {
    // secondi di permanenza: sereno a lungo, rovesci più brevi
    return stato === 'sereno' ? 90 + Math.random() * 150 : 35 + Math.random() * 55;
  }

  /** Da chiamare nel loop. `inverno` decide pioggia o neve. */
  aggiorna(dt, inverno) {
    this.pioggia.neve(inverno ? 1 : 0);
    if (!this.auto) return null;
    this._timer -= dt;
    if (this._timer > 0) return null;
    this.stato = this.stato === 'sereno' ? 'rovescio' : 'sereno';
    this._timer = this._durata(this.stato);
    const piove = this.stato === 'rovescio';
    this.pioggia.imposta(piove);       // il fade morbido lo fa pioggia.aggiorna
    if (!piove) return '☀️ Torna il sereno';
    return inverno ? '❄️ Nevica!' : '🌧 Arriva un rovescio…';
  }

  /** L'utente tocca la pioggia a mano: il meteo automatico si fa da parte. */
  manuale() { this.auto = false; }

  attivaAuto(on) {
    this.auto = on;
    if (on) { this.stato = this.pioggia.attiva ? 'rovescio' : 'sereno'; this._timer = this._durata(this.stato); }
  }
}
