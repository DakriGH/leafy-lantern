// ZAINO stile Animal Crossing: le tue cose, e TOCCHI QUELLA CHE VUOI IN MANO.
// Fine. Nessuno slot da scegliere, nessun numero, nessun trascinamento,
// nessun foglietto di opzioni: su mobile ogni passo in più è un passo di
// troppo. La ruota si gestisce da sola dietro le quinte.
//
//   · TASCHE: solo ciò che possiedi · un tocco = ce l'hai in mano, e si chiude
//   · CREA:   le ricette, un tocco = fabbricata
//
// Modulo autonomo: costruisce il proprio DOM e parla col gioco solo tramite i
// callback passati al costruttore (nessun accesso a variabili globali).

export class Zaino {
  /** ctx = { voceDa, quanti, onPrendi(id), onCraft(ricetta), puoiCraftare(ricetta) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('zaino');
    this.scheda = this.el.querySelector('.scheda');
    this.tab = 'tasche';
    this.inMano = null;          // id di ciò che si ha in mano (solo per l'evidenza)
    this.posseduti = [];
    this.ricette = [];
    this._costruisci();
  }

  _costruisci() {
    this.scheda.innerHTML = `
      <div class="zaino-testa">
        <h2>🎒 Le tue cose</h2>
        <button class="zaino-chiudi" id="btnChiudiZaino" title="Chiudi">×</button>
      </div>
      <div class="zn-tabs">
        <button class="zaino-tab attivo" data-tab="tasche">🎒 Tasche</button>
        <button class="zaino-tab" data-tab="crea">🔨 Crea</button>
      </div>
      <div class="zn-aiuto">Tocca una cosa per prenderla in mano</div>
      <div class="zn-corpo"></div>`;
    this.elCorpo = this.scheda.querySelector('.zn-corpo');
    this.elAiuto = this.scheda.querySelector('.zn-aiuto');

    for (const b of this.scheda.querySelectorAll('[data-tab]')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab;
        for (const x of this.scheda.querySelectorAll('[data-tab]')) x.classList.toggle('attivo', x === b);
        this.elAiuto.textContent = this.tab === 'crea'
          ? 'Tocca una ricetta per fabbricarla' : 'Tocca una cosa per prenderla in mano';
        this._disegnaCorpo();
      });
    }
  }

  /** Dati freschi dal gioco. */
  imposta({ posseduti, ricette, inMano }) {
    if (posseduti) this.posseduti = posseduti;
    if (ricette) this.ricette = ricette;
    if (inMano !== undefined) this.inMano = inMano;
    this.aggiorna();
  }

  aggiorna() { this._disegnaCorpo(); }

  apri(v) { this.el.classList.toggle('aperto', v); }
  get aperto() { return this.el.classList.contains('aperto'); }

  // ---- tasche / ricette -------------------------------------------------------
  _disegnaCorpo() {
    this.elCorpo.innerHTML = '';
    const g = document.createElement('div');
    g.className = 'zn-griglia';
    if (this.tab === 'tasche') {
      if (!this.posseduti.length) {
        this.elCorpo.innerHTML = '<div class="zn-vuoto">Le tasche sono vuote 🐾<br>Rompi qualcosa per raccoglierlo.</div>';
        return;
      }
      for (const voce of this.posseduti) g.appendChild(this._carta(voce));
    } else {
      for (const r of this.ricette) g.appendChild(this._cartaRicetta(r));
    }
    this.elCorpo.appendChild(g);
  }

  _carta(voce) {
    const c = document.createElement('button');
    const mia = voce.id === this.inMano;
    c.className = 'zn-carta' + (mia ? ' in-mano' : '');
    c.appendChild(this._icona(voce, 34));
    const n = document.createElement('span'); n.className = 'zn-nome'; n.textContent = voce.nome;
    const q = document.createElement('span'); q.className = 'zn-q';
    q.textContent = this._testoConta(this.ctx.quanti(voce.id));
    c.append(n, q);
    // solo un segno di "questa ce l'hai in mano": nessun numero da decifrare
    if (mia) { const b = document.createElement('span'); b.className = 'zn-bollino'; b.textContent = '✋'; c.appendChild(b); }
    c.addEventListener('click', () => this.ctx.onPrendi(voce.id));   // UN tocco, basta
    return c;
  }

  _cartaRicetta(r) {
    // NB: si passa r.ricetta (quella VERA), non l'involucro: puoiCraftare
    // legge `.in` e sull'involucro lanciava, lasciando la griglia vuota
    const puo = this.ctx.puoiCraftare(r.ricetta);
    const c = document.createElement('button');
    c.className = 'zn-carta zn-ricetta' + (puo ? '' : ' spenta');
    c.appendChild(this._icona(r.voce, 34));
    const n = document.createElement('span'); n.className = 'zn-nome'; n.textContent = `${r.voce.nome} ×${r.n}`;
    const i = document.createElement('span'); i.className = 'zn-ingr'; i.textContent = r.ingredienti;
    c.append(n, i);
    c.addEventListener('click', () => this.ctx.onCraft(r.ricetta));
    return c;
  }

  _testoConta(n) {
    if (typeof n === 'string') return n;
    return n === Infinity ? '∞' : String(Math.min(n, 999));
  }

  /** Icona: emoji oppure cubetto bicolore col colore vero del blocco. */
  _icona(voce, px) {
    const e = document.createElement('span');
    e.className = 'zn-icona';
    e.style.width = e.style.height = `${px}px`;
    if (!voce) return e;
    if (voce.emoji) { e.textContent = voce.emoji; e.style.fontSize = `${Math.round(px * 0.82)}px`; }
    else {
      e.classList.add('cubo');
      e.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
    }
    return e;
  }
}

const css = (n) => '#' + (n === undefined ? 0 : n).toString(16).padStart(6, '0');
