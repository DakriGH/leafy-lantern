// LA BOLLA — il tasto grosso sotto il pollice, e fa UNA COSA SOLA.
//
//   · TOCCO         → usa quello che hai in mano (posa, rompi, interagisci)
//   · TIENI PREMUTO → lo ripete, finché non stacchi il dito
//
// PERCHÉ SOLO QUESTE DUE. Prima questo pulsante ne faceva tre: il terzo era
// «trascina e si apre la ruota per scegliere un altro oggetto». Sembrava un
// risparmio — un pulsante invece di due — ed era il difetto peggiore
// dell'interfaccia. Tre gesti sullo stesso bersaglio vogliono dire che il gioco
// deve INDOVINARE quale hai fatto, e per indovinare servono soglie: quanti
// pixel sono «un trascinamento», quanti millisecondi sono «tenuto premuto».
// Ogni soglia è un punto in cui, ogni tanto, esce la cosa che non volevi. Con
// due soli gesti la domanda si riduce a «il dito si è fermato o no»: nessun
// angolo da mirare, nessun tempo da azzeccare per scegliere.
//
// E LA SCELTA DOVE È FINITA? Sulla tavolozza, che adesso sta sempre a schermo
// (ui/tavolozza.js): un tocco sul posto che vuoi. Un tocco su un bersaglio che
// vedi batte una frustata in una direzione che devi ricordarti — sul touch è
// misurato, non è un'opinione: le griglie ferme battono i menu radiali, e le
// direzioni diagonali si sbagliano quattro-cinque volte più di quelle sugli
// assi. La ruota risolveva il problema di una barra che non si poteva guardare.
// Adesso la barra si guarda, e la ruota non serve più a niente.
//
// LA RIPETIZIONE SI FERMA DA SOLA quando l'azione non produce più niente
// (`onUsa()` rende false). Stando fermi si posa un blocco e poi la cella è
// occupata: senza questa regola il gioco sputerebbe «lì è già occupato» cinque
// volte al secondo finché non stacchi il dito.

const RIPETI_DOPO = 400;   // ms fermo prima che l'azione cominci a ripetersi
const RIPETI_OGNI = 175;   // ms fra un colpo e l'altro
const SCARTO = 14;         // px oltre cui il dito «è scivolato»: non era un tocco

export class Bolla {
  /**
   * onUsa()       usa quel che hai in mano; renda false se non è successo niente
   * ripetibile()  → bool: si può tenere premuto per ripetere? (falso a mani
   *                libere: ripetere «interagisci» accenderebbe e spegnerebbe la
   *                stessa lampada cinque volte al secondo)
   */
  constructor({ onUsa, ripetibile, id = 'btnStrumenti' } = {}) {
    this.onUsa = onUsa;
    this.ripetibile = ripetibile || (() => false);
    const b = this.btn = document.createElement('button');
    b.id = id;
    b.className = 'gel';
    b.innerHTML = '<span class="bolla-icona"></span>';
    document.body.appendChild(b);
    this.icona = b.querySelector('.bolla-icona');

    b.addEventListener('pointerdown', (e) => this._giu(e));
    addEventListener('pointerup', (e) => this._su(e));
    addEventListener('pointercancel', () => this._fine());
    addEventListener('pointermove', (e) => this._muovi(e));
  }

  /** La faccia di ciò che si ha in mano. `voce` null = mani libere. */
  mostra(voce) {
    this.icona.textContent = '';
    this.icona.className = 'bolla-icona';
    this.icona.style.background = '';
    if (!voce) { this.icona.textContent = '🐾'; return; }
    if (voce.emoji) { this.icona.textContent = voce.emoji; return; }
    this.icona.classList.add('cubo');
    this.icona.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
  }

  // ---- il gesto ---------------------------------------------------------------

  _giu(e) {
    e.preventDefault();
    this._idp = e.pointerId;
    this._premuto = true;
    this._agito = false;
    this._sx = e.clientX; this._sy = e.clientY;
    this.btn.classList.add('giu');
    this._tRipeti = setTimeout(() => this._avviaRipetizione(), RIPETI_DOPO);
  }

  /** Il dito è scivolato via dal pulsante: non era un tocco, e non si fa niente.
   *  Serve solo a non far partire un'azione per sbaglio mentre si orbita la
   *  camera passando col dito sopra la bolla. */
  _muovi(e) {
    if (!this._premuto || e.pointerId !== this._idp) return;
    if (Math.hypot(e.clientX - this._sx, e.clientY - this._sy) < SCARTO) return;
    this._agito = true;                    // «già gestito»: il rilascio non usi
    this._fermaRipetizione();
  }

  _avviaRipetizione() {
    this._tRipeti = null;
    if (!this._premuto || this._agito || !this.ripetibile()) return;
    // alzata SUBITO, prima di sapere se l'azione riesce: da qui in poi il
    // rilascio del dito non deve rifarla una seconda volta
    this._agito = true;
    this.btn.classList.add('ripete');
    if (this.onUsa && this.onUsa() === false) { this.btn.classList.remove('ripete'); return; }
    this._intRipeti = setInterval(() => {
      if (!this._premuto) return this._fermaRipetizione();
      if (this.onUsa && this.onUsa() === false) this._fermaRipetizione();
    }, RIPETI_OGNI);
  }

  _fermaRipetizione() {
    clearTimeout(this._tRipeti); this._tRipeti = null;
    clearInterval(this._intRipeti); this._intRipeti = null;
    this.btn.classList.remove('ripete');
  }

  _su(e) {
    if (!this._premuto || (this._idp !== undefined && e.pointerId !== this._idp)) return;
    const agito = this._agito;
    this._fine();
    if (agito) return;                     // il tieni-premuto ha già fatto la sua parte
    if (this.onUsa) this.onUsa();
  }

  _fine() {
    this._fermaRipetizione();
    this._premuto = false; this._agito = false; this._idp = undefined;
    this.btn.classList.remove('giu');
  }
}

const css = (n) => '#' + (n === undefined ? 0 : n).toString(16).padStart(6, '0');
