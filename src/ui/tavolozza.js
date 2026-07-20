// LA STRISCIA DELLA TAVOLOZZA — gli otto posti, finalmente VISIBILI.
//
// COSA RIPARA. Prima esisteva una barra di nove posti che nessuno poteva
// guardare: il #hotbar stava sotto un `display:none` dal giorno in cui è
// arrivata la ruota, ma la logica dei nove posti era rimasta al suo posto,
// invisibile e viva. Il giocatore doveva ricordarsi a memoria una cosa che il
// gioco non gli faceva vedere, e quando lo zaino ne sovrascriveva uno non c'era
// nemmeno il modo di accorgersene. Questa striscia è la risposta più corta a
// "l'inventario è difficile": far vedere la verità.
//
// LA TAVOLOZZA È IL SELETTORE, non un promemoria. C'era una ruota che si apriva
// trascinando la bolla, e adesso non c'è più: un tocco su un bersaglio che vedi
// batte una frustata in una direzione che devi ricordarti. Non è un'opinione —
// sul touch le griglie ferme battono i menu radiali in misurazioni indipendenti,
// e in un radiale da otto le quattro DIAGONALI si sbagliano quattro-cinque volte
// più delle quattro sugli assi. La ruota serviva a rimediare a una barra che non
// si poteva guardare: adesso la barra si guarda, e quindi si tocca.
//
// I TRE GESTI, tutti sullo stesso posto e senza modalità da attivare:
//   · TOCCO           → lo prendi in mano
//   · PREMI E SPOSTA  → riordini (il posto sotto il dito ci si scambia)
//   · TIENI PREMUTO   → il foglietto del posto: 📌 fissa · 🚫 svuota
// Il riordino per trascinamento è l'idioma della schermata di casa di ogni
// telefono degli ultimi quindici anni: non va spiegato, si prova e funziona.
//
// STA SEMPRE ACCESA, anche sul telefono, e la prima stesura faceva il
// contrario: compariva a ogni cambio e sfumava dopo due secondi, per non rubare
// vetro allo schermo piccolo. Sembrava buon senso; è sbagliato. Sul touch una
// griglia FERMA batte il menu radiale in due misurazioni indipendenti, e non
// per un pelo — perché è la stabilità spaziale a costruire la memoria del
// posto. Una striscia che sfuma non insegna niente e va rincorsa col dito.
// Nasconderla era comodo per me, non per chi gioca.
//
// IL NUMERO IN ALTO A SINISTRA c'è solo dove c'è una tastiera che lo usa. Col
// dito è rumore, e per un attimo ci sono state al suo posto delle FRECCE (↑ ↗ →)
// che insegnavano in che direzione frustare sulla ruota. Sono sparite con lei:
// una scorciatoia disegnata per un gesto che non esiste più è peggio di niente.

const SOGLIA_TRASCINA = 8;     // px oltre cui premere diventa trascinare (la soglia
                               // di sistema è 8-10 su Android come su iOS)
const TIENI_PREMUTO = 450;     // ms per il foglietto: dentro la finestra 400-600 in cui
                               // il gesto si distingue dal tocco senza sembrare rotto

export class StriscaTavolozza {
  /** ctx = { el?, tavolozza, voceDa, quanti, onScegli(i), onCambio(), toast(msg) }
   *  `el` permette DUE strisce sulla stessa tavolozza: quella della barra bassa
   *  e quella in fondo allo zaino, dove si sistemano i posti a mente fredda.
   *  Leggono lo stesso modello, quindi non possono raccontare cose diverse. */
  constructor(ctx) {
    this.ctx = ctx;
    this.el = ctx.el || document.getElementById('tavolozza');
    this.numeri = false;
    this._posti = [];
    this._costruisci();
  }

  _costruisci() {
    this.el.innerHTML = '';
    const n = this.ctx.tavolozza.posti.length;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'tv-posto';
      s.dataset.i = i;
      s.innerHTML = '<span class="tv-tasto"></span><span class="tv-icona"></span>'
        + '<span class="tv-conta"></span><span class="tv-spillo">📌</span>';
      this._gesti(s, i);
      this.el.appendChild(s);
      this._posti.push(s);
    }
  }

  /** Su desktop i posti hanno il numero del tasto; su telefono no (non c'è
   *  tastiera, e un numero che non serve è rumore). */
  mostraNumeri(v) {
    this.numeri = !!v;
    this.el.classList.toggle('con-numeri', this.numeri);
    this.aggiorna();
  }

  /** Un lampo su un posto: serve a dire «la cosa che hai preso è finita QUI»
   *  senza scrivere una frase. */
  lampeggia(i) {
    const s = this._posti[i];
    if (!s) return;
    s.classList.remove('lampo');
    void s.offsetWidth;              // riavvia l'animazione anche se già in corso
    s.classList.add('lampo');
  }

  aggiorna() {
    const { tavolozza: tv, voceDa, quanti } = this.ctx;
    for (let i = 0; i < this._posti.length; i++) {
      const s = this._posti[i];
      const id = tv.id(i);
      const voce = id ? voceDa(id) : null;
      s.classList.toggle('pieno', !!voce);
      s.classList.toggle('attivo', i === tv.attivo);
      s.classList.toggle('fissato', tv.fissato(i) && id !== 'zampa');
      s.title = voce ? (this.numeri ? `${voce.nome} — tasto ${i + 1}` : voce.nome) : 'posto libero';
      s.querySelector('.tv-tasto').textContent = this.numeri ? String(i + 1) : '';
      const ico = s.querySelector('.tv-icona');
      const cnt = s.querySelector('.tv-conta');
      ico.className = 'tv-icona';
      ico.style.background = '';
      ico.textContent = '';
      cnt.textContent = '';
      if (!voce) continue;
      if (voce.emoji) ico.textContent = voce.emoji;
      else {
        ico.classList.add('cubo');
        ico.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
      }
      const n = quanti(voce.id);
      if (typeof n === 'string') cnt.textContent = n;
      else if (n !== Infinity) {
        cnt.textContent = String(Math.min(n, 999));
        s.classList.toggle('esaurito', n <= 0);
      } else { cnt.textContent = '∞'; s.classList.remove('esaurito'); }
    }
  }

  // ---- i gesti su un posto -----------------------------------------------------

  _gesti(s, i) {
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let fantasma = null, mosso = false, lungo = false;
      const tLungo = setTimeout(() => {
        if (mosso) return;
        lungo = true;
        this._foglietto(i);
      }, TIENI_PREMUTO);

      const muovi = (ev) => {
        if (lungo) return;
        if (!mosso && Math.hypot(ev.clientX - x0, ev.clientY - y0) > SOGLIA_TRASCINA) {
          mosso = true;
          clearTimeout(tLungo);
          fantasma = this._fantasma(i);
          s.classList.add('in-viaggio');
        }
        if (!fantasma) return;
        fantasma.style.left = `${ev.clientX}px`;
        fantasma.style.top = `${ev.clientY}px`;
        const sotto = this._postoSotto(ev.clientX, ev.clientY);
        for (const p of this._posti) p.classList.toggle('bersaglio', p === sotto && p !== s);
      };

      const fine = (ev) => {
        removeEventListener('pointermove', muovi);
        removeEventListener('pointerup', fine);
        removeEventListener('pointercancel', fine);
        clearTimeout(tLungo);
        s.classList.remove('in-viaggio');
        for (const p of this._posti) p.classList.remove('bersaglio');
        if (fantasma) fantasma.remove();
        if (lungo) return;                               // ha già fatto il foglietto
        if (!mosso) { this.ctx.onScegli(i); return; }    // tocco secco = prendi in mano
        const sotto = this._postoSotto(ev.clientX, ev.clientY);
        if (!sotto || sotto === s) return;
        this.ctx.tavolozza.scambia(i, Number(sotto.dataset.i));
        this.ctx.onCambio();
      };

      addEventListener('pointermove', muovi);
      addEventListener('pointerup', fine);
      addEventListener('pointercancel', fine);
    });
  }

  _postoSotto(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('.tv-posto') : null;
  }

  _fantasma(i) {
    const voce = this.ctx.voceDa(this.ctx.tavolozza.id(i));
    const g = document.createElement('div');
    g.className = 'tv-fantasma';
    if (!voce) g.textContent = '·';
    else if (voce.emoji) g.textContent = voce.emoji;
    else g.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
    document.body.appendChild(g);
    return g;
  }

  /** Il foglietto del posto: due sole azioni, grandi, sopra il posto stesso. */
  _foglietto(i) {
    this._chiudiFoglietto();
    const tv = this.ctx.tavolozza;
    const id = tv.id(i);
    if (!id) return;
    const voce = this.ctx.voceDa(id) || { nome: id };
    if (id === 'zampa') { this.ctx.toast('🐾 Le mani libere restano sempre con te'); return; }
    if (navigator.vibrate) navigator.vibrate(12);

    const f = this._fogl = document.createElement('div');
    f.className = 'tv-foglietto';
    const fissato = tv.fissato(i);
    // LE FRECCE NON SONO UN DI PIÙ. Riordinare si può trascinando, ma il
    // trascinamento non può essere l'UNICA strada: le regole di accessibilità
    // (WCAG 2.2, criterio 2.5.7, livello AA) chiedono che tutto ciò che si fa
    // trascinando si possa fare anche con un tocco solo. Chi ha poca precisione
    // — o gioca su un telefono ballonzolando in autobus — sistema la tavolozza
    // lo stesso.
    f.innerHTML = `<div class="tv-f-nome">${voce.emoji || ''} ${voce.nome}</div>`
      + '<div class="tv-f-sposta">'
      + '<button class="tv-f-az" data-az="sx" title="Sposta a sinistra">◀</button>'
      + '<span>sposta</span>'
      + '<button class="tv-f-az" data-az="dx" title="Sposta a destra">▶</button>'
      + '</div>'
      + `<button class="tv-f-az" data-az="fissa">${fissato ? '📌 Non fissare più' : '📌 Fissa qui'}</button>`
      + '<button class="tv-f-az" data-az="svuota">🚫 Svuota il posto</button>';
    document.body.appendChild(f);
    // sopra il posto, senza uscire dallo schermo
    const r = this._posti[i].getBoundingClientRect();
    const w = f.offsetWidth;
    f.style.left = `${Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), innerWidth - w - 8)}px`;
    f.style.top = `${r.top - f.offsetHeight - 10}px`;

    f.addEventListener('pointerdown', (e) => e.stopPropagation());
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-az]');
      if (!b) return;
      const n = this._posti.length;
      const az = b.dataset.az;
      if (az === 'sx' || az === 'dx') {
        const dove = ((az === 'dx' ? i + 1 : i - 1) + n) % n;
        tv.scambia(i, dove);
        this.ctx.onCambio();
        this._chiudiFoglietto();
        this._foglietto(dove);            // il foglietto segue l'oggetto: si sposta più volte di fila
        this.lampeggia(dove);
        return;
      }
      if (az === 'fissa') {
        tv.fissa(i);
        this.ctx.toast(tv.fissato(i)
          ? `📌 ${voce.nome} resta qui: niente lo sposterà`
          : `${voce.nome} non è più fissato`);
      } else {
        tv.svuota(i);
        this.ctx.toast(`Posto libero. ${voce.nome} è al sicuro nello zaino 🎒`);
      }
      this.ctx.onCambio();
      this._chiudiFoglietto();
    });
    // un tocco fuori chiude: nessun pulsante "annulla" da cercare
    setTimeout(() => addEventListener('pointerdown', this._fuori = () => this._chiudiFoglietto(), { once: true }), 0);
  }

  _chiudiFoglietto() {
    if (this._fogl) { this._fogl.remove(); this._fogl = null; }
    if (this._fuori) { removeEventListener('pointerdown', this._fuori); this._fuori = null; }
  }
}

const css = (n) => '#' + (n === undefined ? 0 : n).toString(16).padStart(6, '0');
