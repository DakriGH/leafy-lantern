// RUOTA degli strumenti (stile Animal Crossing). UN SOLO tasto fa tutto, così
// non servono pulsanti separati per rompere/piazzare:
//   · TOCCO (o tieni premuto senza spostare) → USA quello che hai in mano
//   · TRASCINI come un joystick              → si apre la ruota, molli = scegli
// La prima voce è "Esplora": sceglierla torna in esplorazione, scegliere un
// blocco/attrezzo entra in costruzione — la modalità è una conseguenza di cosa
// hai in mano, non un comando a parte. Cosa faccia "usa" lo decide lo strumento
// (blocco = piazza, attrezzo = rompe, zampa = interagisci).

const RAGGIO = 118;        // distanza delle voci dal centro
const MORTA = 38;          // zona morta centrale = annulla
const APRI = 16;           // px di trascinamento oltre cui la ruota si apre

export class Ruota {
  /** id = id del pulsante · conEsplora = false per una ruota di sole azioni
   *  (es. il selettore del bersaglio: solo icone, nessun oggetto) */
  constructor({ onScegli, onEsplora, onUsa, ancora, id = 'btnStrumenti', conEsplora = true } = {}) {
    this.idBtn = id;
    this.conEsplora = conEsplora;
    this.ancora = ancora;          // () → {x,y} in pixel: dove aprire la ruota
    this.onScegli = onScegli;      // (indice voce)
    this.onEsplora = onEsplora;
    this.onUsa = onUsa;            // tocco senza trascinare = usa lo strumento
    this.voci = [];
    this.quanti = () => 0;
    this.aperta = false;
    this.sel = -2;                 // -2 nessuna · >=0 posizione nell'elenco
    this.attivo = -1;              // cosa si ha in mano ora
    this._costruisci();
  }

  // ---- costruzione DOM -------------------------------------------------------
  _costruisci() {
    const root = this.root = document.createElement('div');
    // CLASSE, non id: di ruote ce n'è più d'una (strumenti, bersaglio) e due
    // elementi con lo stesso id si pestano i piedi (già successo con btnRuota)
    root.className = 'ruota';
    root.id = 'ruota-' + this.idBtn;
    root.innerHTML = '<div class="ruota-velo"></div><div class="ruota-perno"><div class="ruota-centro"></div></div>';
    document.body.appendChild(root);
    this.perno = root.querySelector('.ruota-perno');
    this.centro = root.querySelector('.ruota-centro');

    // pulsante sotto il pollice
    const b = this.btn = document.createElement('button');
    b.id = this.idBtn;           // NB: 'btnRuota' è già preso (ruota il mobile)
    b.className = 'gel';
    b.innerHTML = '<span class="ruota-icona"></span>';
    document.body.appendChild(b);
    this.icona = b.querySelector('.ruota-icona');

    b.addEventListener('pointerdown', (e) => this._giu(e));
    addEventListener('pointermove', (e) => this._muovi(e));
    addEventListener('pointerup', (e) => this._su(e));
    addEventListener('pointercancel', () => this._chiudi(false));
  }

  /** voci = [{id, nome, emoji|cima/lato}] · quanti(id) → numero/∞/stringa
   *  azioni = [{emoji, nome, fn}] — scorciatoie (zaino, officina…) nella ruota */
  imposta(voci, quanti, azioni = null) {
    this.voci = voci || [];
    if (quanti) this.quanti = quanti;
    if (azioni) this.azioni = azioni;
    const az = this.azioni || [];
    this.perno.querySelectorAll('.ruota-voce').forEach((e) => e.remove());
    // elenco unico: la posizione sul cerchio è l'indice qui dentro
    this.elenco = (this.conEsplora ? [{ tipo: 'esplora' }] : [])
      .concat(this.voci.map((v, i) => ({ tipo: 'voce', v, i })))
      .concat(az.map((a) => ({ tipo: 'azione', a })));
    const tot = this.elenco.length;
    this.elenco.forEach((e, p) => {
      if (e.tipo === 'esplora') this._creaVoce(p, '🐾', 'Esplora', p, tot, null, 'e-esplora');
      else if (e.tipo === 'voce') this._creaVoce(p, e.v.emoji || null, e.v.nome, p, tot, e.v);
      else this._creaVoce(p, e.a.emoji, e.a.nome, p, tot, null, 'e-azione');
    });
    this.aggiornaConteggi(this.quanti);
    this.segnaAttivo(this.attivo);
  }

  _creaVoce(indice, emoji, nome, posto, tot, voce = null, extra = '') {
    const ang = (posto / tot) * Math.PI * 2 - Math.PI / 2;   // parte in alto
    const el = document.createElement('div');
    el.className = 'ruota-voce' + (extra ? ' ' + extra : '');
    el.dataset.i = indice;
    el.style.setProperty('--x', `${Math.cos(ang) * RAGGIO}px`);
    el.style.setProperty('--y', `${Math.sin(ang) * RAGGIO}px`);
    el.style.transitionDelay = `${posto * 18}ms`;            // apertura a cascata
    const ico = document.createElement('span');
    ico.className = 'rv-icona';
    if (emoji) ico.textContent = emoji;
    else if (voce) {
      ico.classList.add('rv-cubo');
      ico.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
    }
    const eti = document.createElement('span'); eti.className = 'rv-nome'; eti.textContent = nome;
    const cnt = document.createElement('span'); cnt.className = 'rv-conta';
    el.append(ico, eti, cnt);
    el.addEventListener('pointerup', (e) => {                // scelta col tocco diretto
      if (!this._appiccicata) return;
      e.stopPropagation();
      this.sel = indice; this._chiudi(true);
    });
    this.perno.appendChild(el);
  }

  aggiornaConteggi(quanti) {
    if (quanti) this.quanti = quanti;
    this.perno.querySelectorAll('.ruota-voce').forEach((el) => {
      const e = (this.elenco || [])[Number(el.dataset.i)];
      if (!e || e.tipo !== 'voce') return;
      const v = e.v;
      const n = this.quanti(v.id);
      const c = el.querySelector('.rv-conta');
      if (typeof n === 'string') { c.textContent = n; el.classList.remove('vuoto'); }
      else {
        c.textContent = n === Infinity ? '∞' : String(Math.min(n, 999));
        el.classList.toggle('vuoto', n !== Infinity && n <= 0);
      }
    });
  }

  /** Mostra un'icona fissa sul pulsante (ruote di sole azioni). */
  mostraIcona(emoji) {
    this.icona.textContent = emoji;
    this.icona.className = 'ruota-icona';
    this.icona.style.background = '';
  }

  /** i = indice voce in mano, oppure -1 = Esplora (aggiorna il pulsante) */
  segnaAttivo(i) {
    this.attivo = i;
    const v = i >= 0 ? this.voci[i] : null;
    this.icona.textContent = '';
    this.icona.className = 'ruota-icona';
    this.icona.style.background = '';
    if (!v) { this.icona.textContent = '🐾'; }
    else if (v.emoji) { this.icona.textContent = v.emoji; }
    else {
      this.icona.classList.add('rv-cubo');
      this.icona.style.background = `linear-gradient(135deg, ${css(v.cima)} 0 52%, ${css(v.lato)} 52%)`;
    }
    this.perno.querySelectorAll('.ruota-voce').forEach((el) => {
      const e = (this.elenco || [])[Number(el.dataset.i)];
      el.classList.toggle('in-mano', !!e && e.tipo === 'voce' && e.i === i);
    });
  }

  // ---- interazione: tocco = usa · trascinamento = ruota -----------------------
  _giu(e) {
    e.preventDefault();
    this._idp = e.pointerId;
    this._premuto = true;
    // ORIGINE del gesto = dove hai messo il dito. Tutto si misura da QUI: il
    // perno viene ricentrato per non uscire dallo schermo e finirebbe lontano
    // dal dito, facendo scegliere una voce a caso.
    this.sx = e.clientX; this.sy = e.clientY;
    const r = this.btn.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.btn.classList.add('giu');
    // NB: la ruota NON si apre qui — si apre solo se il dito si sposta
  }

  _apri() {
    // La ruota si apre SUL GATTO (come il menu di Animal Crossing), non sotto
    // il pollice: si guarda il personaggio, non l'angolo dello schermo.
    // `ancora()` la fornisce il gioco proiettando il player; se manca, si
    // ripiega sul pulsante. Il clamp evita che le voci escano dallo schermo.
    const a = this.ancora ? this.ancora() : null;
    const m = RAGGIO + 54;
    const x = Math.min(Math.max(a ? a.x : this.cx, m), innerWidth - m);
    const y = Math.min(Math.max(a ? a.y : this.cy, m), innerHeight - m);
    this.px = x; this.py = y;
    this.perno.style.left = `${x}px`;
    this.perno.style.top = `${y}px`;
    this.root.classList.add('aperta');
    this.aperta = true;
  }

  _muovi(e) {
    if (!this._premuto || e.pointerId !== this._idp) return;
    // oltre la soglia il gesto diventa "joystick": la ruota si apre
    if (!this.aperta) {
      if (Math.hypot(e.clientX - this.sx, e.clientY - this.sy) < APRI) return;
      this._apri();
    }
    this._evidenzia(e.clientX, e.clientY);
  }

  _evidenzia(x, y) {
    // scarto dal punto in cui è iniziato il gesto: a dito fermo è 0 ⇒ nessuna
    // voce mirata, quindi il tocco breve apre la ruota invece di scegliere
    const dx = x - this.sx, dy = y - this.sy;
    const d = Math.hypot(dx, dy);
    let sel = -2;
    const tot = (this.elenco || []).length;
    if (d > MORTA && tot) {
      let a = Math.atan2(dy, dx) + Math.PI / 2;             // 0 = in alto
      if (a < 0) a += Math.PI * 2;
      sel = Math.round((a / (Math.PI * 2)) * tot) % tot;
    }
    if (sel === this.sel) return;
    this.sel = sel;
    this.perno.querySelectorAll('.ruota-voce').forEach((el) => {
      el.classList.toggle('mirata', Number(el.dataset.i) === sel);
    });
    const e = sel >= 0 ? this.elenco[sel] : null;
    this.centro.textContent = !e ? 'annulla'
      : e.tipo === 'esplora' ? 'Esplora' : e.tipo === 'azione' ? e.a.nome : e.v.nome;
  }

  _su(e) {
    if (!this._premuto || (this._idp !== undefined && e.pointerId !== this._idp)) return;
    this._premuto = false;
    this.btn.classList.remove('giu');
    // mai trascinato ⇒ era un tocco: USA quello che hai in mano
    if (!this.aperta) { this._idp = undefined; if (this.onUsa) this.onUsa(); return; }
    this._chiudi(true);
  }

  _chiudi(conferma) {
    const sel = this.sel;
    this.aperta = false; this._premuto = false; this.sel = -2; this._idp = undefined;
    this.btn.classList.remove('giu');
    this.root.classList.remove('aperta');
    this.perno.querySelectorAll('.ruota-voce').forEach((el) => el.classList.remove('mirata'));
    if (!conferma || sel < 0) return;
    const e = (this.elenco || [])[sel];
    if (!e) return;
    if (e.tipo === 'esplora') { if (this.onEsplora) this.onEsplora(); }
    else if (e.tipo === 'azione') { if (e.a.fn) e.a.fn(); }
    else if (this.onScegli) this.onScegli(e.i);
  }
}

const css = (n) => '#' + (n === undefined ? 0 : n).toString(16).padStart(6, '0');
