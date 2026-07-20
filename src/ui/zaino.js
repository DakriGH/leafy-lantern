// LO ZAINO — la scatola dei colori: tutto quello che esiste, sempre lì.
//
// LA DIVISIONE DI MESTIERE con la tavolozza è l'idea che regge tutto il
// sistema. Lo zaino È il magazzino: niente ci entra e niente ne esce quando
// sistemi la tavolozza, e per questo spostare roba fra gli otto posti non può
// mai farti perdere niente. La tavolozza è solo la scelta di cosa tenere fuori.
// Detto una volta bene, non c'è più bisogno di spiegarlo.
//
// COS'ERA PRIMA. Un elenco piatto di tutto ciò che possedevi: nessuna
// categoria, nessuna ricerca, e un tocco che prendeva l'oggetto sovrascrivendo
// in silenzio un posto della barra invisibile. Con quaranta oggetti — e
// l'Officina che ne fa inventare altri a piacere — cercare voleva dire
// scorrere a occhio una griglia sempre più lunga.
//
// COSA C'È ADESSO:
//   · 🎒 LE TUE COSE, che è la scheda d'apertura: solo ciò che hai davvero.
//   · LE CATEGORIE, che sono un CATALOGO: mostrano anche ciò che NON hai
//     ancora, spento. In un gioco di costruzione sapere cosa esiste è metà del
//     divertimento, e una cosa spenta è un invito, non un errore.
//   · LA RICERCA, che è l'acceleratore vero: con la tastiera batti qualunque
//     categoria, e trova in tutte le schede insieme.
//   · LA TAVOLOZZA IN FONDO, così l'assegnazione è a vista: tocchi una carta e
//     VEDI in quale posto è finita; oppure la trascini nel posto che vuoi tu.
//
// NIENTE ORDINAMENTO, ed è una scelta: l'ordine in cui le cose sono dichiarate
// (world/blocks.js, furniture/registry.js) è già un ordine scelto da chi ha
// disegnato il gioco — terra vicino a erba, le lane in fila di colore. Un menu
// "ordina per nome" lo distruggerebbe in cambio di niente, visto che le
// categorie sono corte e la ricerca è immediata.

export class Zaino {
  /**
   * ctx = {
   *   quanti(id), voceDa(id),
   *   onPrendi(id),                 un tocco: mettilo in mano
   *   onMetti(posto, id),           trascinato dritto in un posto
   *   onCraft(ricetta), puoiCraftare(ricetta),
   *   strisca                       la StriscaTavolozza da mostrare in fondo
   * }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('zaino');
    this.scheda = this.el.querySelector('.scheda');
    this.sezioni = [];
    this.ricette = [];
    this.scheda_attiva = 'mie';
    this.cerca = '';
    this.conTastiera = false;
    this._costruisci();
  }

  _costruisci() {
    this.scheda.innerHTML = `
      <div class="zn-testa">
        <h2>🎒 Zaino</h2>
        <button class="zn-chiudi" id="btnChiudiZaino" title="Chiudi">×</button>
      </div>
      <div class="zn-cerca-riga">
        <span class="zn-lente">🔎</span>
        <input class="zn-cerca" type="search" placeholder="Cerca una cosa…" spellcheck="false" autocomplete="off">
        <button class="zn-pulisci" title="Pulisci">×</button>
      </div>
      <div class="zn-chips"></div>
      <div class="zn-corpo"></div>
      <div class="zn-piede">
        <div class="zn-piede-tit">La tua tavolozza · tocca una cosa per prenderla, o trascinala nel posto che vuoi</div>
        <div class="tv-striscia con-numeri" id="tavolozzaZaino"></div>
      </div>`;
    this.elChips = this.scheda.querySelector('.zn-chips');
    this.elCorpo = this.scheda.querySelector('.zn-corpo');
    this.elCerca = this.scheda.querySelector('.zn-cerca');

    this.elCerca.addEventListener('input', () => {
      this.cerca = this.elCerca.value.trim();
      this._disegnaCorpo();
    });
    this.scheda.querySelector('.zn-pulisci').addEventListener('click', () => {
      this.elCerca.value = ''; this.cerca = ''; this.elCerca.focus(); this._disegnaCorpo();
    });
  }

  /** Dati freschi dal gioco.
   *  sezioni = [{id, nome, emoji, voci:[voce]}] — l'ordine è quello del catalogo. */
  imposta({ sezioni, ricette }) {
    if (sezioni) this.sezioni = sezioni;
    if (ricette) this.ricette = ricette;
    this.aggiorna();
  }

  aggiorna() {
    this._disegnaChips();
    this._disegnaCorpo();
    if (this.ctx.strisca) this.ctx.strisca.aggiorna();
  }

  apri(v) {
    this.el.classList.toggle('aperto', v);
    if (!v) return;
    this.aggiorna();
    // La tastiera si apre da sola SOLO dove ce n'è una vera. Su telefono far
    // saltare su la tastiera virtuale coprirebbe metà zaino a ogni apertura.
    if (this.conTastiera) setTimeout(() => this.elCerca.focus(), 60);
  }

  get aperto() { return this.el.classList.contains('aperto'); }

  // ---- schede -----------------------------------------------------------------

  _schede() {
    return [
      { id: 'mie', nome: 'Le tue cose', emoji: '🎒' },
      ...this.sezioni.map((s) => ({ id: s.id, nome: s.nome, emoji: s.emoji })),
      { id: 'crea', nome: 'Crea', emoji: '🔨' },
    ];
  }

  _disegnaChips() {
    const schede = this._schede();
    if (!schede.some((s) => s.id === this.scheda_attiva)) this.scheda_attiva = 'mie';
    this.elChips.innerHTML = '';
    for (const s of schede) {
      const b = document.createElement('button');
      b.className = 'zn-chip' + (s.id === this.scheda_attiva ? ' attivo' : '');
      b.textContent = `${s.emoji} ${s.nome}`;
      b.addEventListener('click', () => {
        this.scheda_attiva = s.id;
        this.cerca = ''; this.elCerca.value = '';
        this._disegnaChips();
        this._disegnaCorpo();
        this.elCorpo.scrollTop = 0;
      });
      this.elChips.appendChild(b);
    }
  }

  // ---- corpo ------------------------------------------------------------------

  /** Le voci da mostrare adesso, e se vanno mostrate anche quelle che non hai. */
  _daMostrare() {
    const tutte = this.sezioni.flatMap((s) => s.voci);
    if (this.cerca) {
      const q = pulisci(this.cerca);
      // la ricerca ignora le schede: cerchi «lampada» e trovi le lampade,
      // punto — sapere in che categoria stanno è un problema del gioco
      return { voci: tutte.filter((v) => pulisci(v.nome).includes(q)), catalogo: true, ricerca: true };
    }
    if (this.scheda_attiva === 'mie') {
      return { voci: tutte.filter((v) => this._posseduta(v.id)), catalogo: false };
    }
    const sez = this.sezioni.find((s) => s.id === this.scheda_attiva);
    return { voci: sez ? sez.voci : [], catalogo: true };
  }

  _posseduta(id) {
    const n = this.ctx.quanti(id);
    return n === Infinity || typeof n === 'string' || n > 0;
  }

  _disegnaCorpo() {
    this.elCorpo.innerHTML = '';
    if (this.scheda_attiva === 'crea' && !this.cerca) return this._disegnaRicette();

    const { voci, ricerca } = this._daMostrare();
    if (!voci.length) {
      this.elCorpo.innerHTML = ricerca
        ? `<div class="zn-vuoto">Nessuna cosa si chiama «${scappa(this.cerca)}» 🔎<br>Prova con meno lettere.</div>`
        : '<div class="zn-vuoto">Qui non c\'è ancora niente 🐾<br>Rompi qualcosa per raccoglierlo.</div>';
      return;
    }
    const g = document.createElement('div');
    g.className = 'zn-griglia';
    for (const v of voci) g.appendChild(this._carta(v));
    this.elCorpo.appendChild(g);
  }

  _disegnaRicette() {
    if (!this.ricette.length) {
      this.elCorpo.innerHTML = '<div class="zn-vuoto">Nessuna ricetta, per ora 🔨</div>';
      return;
    }
    const g = document.createElement('div');
    g.className = 'zn-griglia';
    for (const r of this.ricette) g.appendChild(this._cartaRicetta(r));
    this.elCorpo.appendChild(g);
  }

  _carta(voce) {
    const tv = this.ctx.strisca ? this.ctx.strisca.ctx.tavolozza : null;
    const posto = tv ? tv.postoDi(voce.id) : -1;
    const ho = this._posseduta(voce.id);
    const c = document.createElement('button');
    c.className = 'zn-carta' + (ho ? '' : ' spenta') + (posto >= 0 ? ' fuori' : '');
    c.appendChild(this._icona(voce, 34));
    const n = document.createElement('span'); n.className = 'zn-nome'; n.textContent = voce.nome;
    const q = document.createElement('span'); q.className = 'zn-q';
    q.textContent = this._testoConta(this.ctx.quanti(voce.id));
    c.append(n, q);
    // «questa ce l'hai già fuori, al posto N»: evita di andarla a ripescare
    if (posto >= 0) {
      const b = document.createElement('span');
      b.className = 'zn-posto';
      b.textContent = tv.attivo === posto ? '✋' : String(posto + 1);
      c.appendChild(b);
    }
    if (ho) {
      c.addEventListener('click', () => { if (!this._trascinato) this.ctx.onPrendi(voce.id); });
      this._trascinabile(c, voce);
    }
    return c;
  }

  _cartaRicetta(r) {
    // NB: si passa r.ricetta (quella VERA), non l'involucro: puoiCraftare legge
    // `.in` e sull'involucro lanciava, lasciando la griglia vuota
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

  /** Trascina una carta dritta in un posto della tavolozza qui sotto: è la
   *  strada per chi vuole decidere DOVE, invece di accettare il posto che il
   *  gioco sceglie da solo. */
  _trascinabile(carta, voce) {
    carta.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const x0 = e.clientX, y0 = e.clientY;
      let g = null;
      this._trascinato = false;
      const posti = () => [...this.scheda.querySelectorAll('.tv-posto')];
      const sotto = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('.tv-posto') : null;
      };
      const muovi = (ev) => {
        if (!g && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) {
          g = document.createElement('div');
          g.className = 'tv-fantasma';
          if (voce.emoji) g.textContent = voce.emoji;
          else g.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
          document.body.appendChild(g);
          this._trascinato = true;
        }
        if (!g) return;
        g.style.left = `${ev.clientX}px`; g.style.top = `${ev.clientY}px`;
        const t = sotto(ev.clientX, ev.clientY);
        for (const p of posti()) p.classList.toggle('bersaglio', p === t);
      };
      const fine = (ev) => {
        removeEventListener('pointermove', muovi);
        removeEventListener('pointerup', fine);
        removeEventListener('pointercancel', fine);
        for (const p of posti()) p.classList.remove('bersaglio');
        if (!g) return;
        g.remove();
        const t = sotto(ev.clientX, ev.clientY);
        if (t) this.ctx.onMetti(Number(t.dataset.i), voce.id);
        setTimeout(() => { this._trascinato = false; }, 0);
      };
      addEventListener('pointermove', muovi);
      addEventListener('pointerup', fine);
      addEventListener('pointercancel', fine);
    });
  }

  _testoConta(n) {
    if (typeof n === 'string') return n;
    if (n === Infinity) return '∞';
    return n > 0 ? String(Math.min(n, 999)) : 'non ce l\'hai';
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
/** Minuscolo e senza accenti: «Lanterna» trova «lanterna», «però» trova «pero». */
const pulisci = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const scappa = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
