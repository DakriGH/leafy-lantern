// HUD: hotbar, pillola modalità, orologio col cursore del tempo, toast, aiuto.

export class HUD {
  constructor() {
    this.elHotbar = document.getElementById('hotbar');
    this.elPilla = document.getElementById('pillaModo');
    this.elOrologio = document.getElementById('orologio');
    this.elFase = document.getElementById('fase');
    this.elBarra = document.getElementById('barraTempo');
    this.elToast = document.getElementById('toast');
    this.elAiuto = document.getElementById('aiuto');
    this.elFps = document.getElementById('fps');
    this.elSuggerimento = document.getElementById('suggerimento');

    this.onSeleziona = null;
    this.onModo = null;
    this.onTempo = null;         // (t 0..1) mentre l'utente trascina
    this.trascinandoTempo = false;
    this._timerToast = null;
    this.slots = [];

    this.elPilla.addEventListener('click', () => this.onModo && this.onModo());
    this.elBarra.addEventListener('input', () => {
      this.trascinandoTempo = true;
      if (this.onTempo) this.onTempo(this.elBarra.value / 1000);
    });
    const fineTrascino = () => { this.trascinandoTempo = false; };
    this.elBarra.addEventListener('change', fineTrascino);
    this.elBarra.addEventListener('pointerup', fineTrascino);

    document.getElementById('btnChiudiAiuto').addEventListener('click', () => this.mostraAiuto(false));
  }

  costruisciHotbar(voci) {
    this.elHotbar.innerHTML = '';
    this.slots = voci;
    voci.forEach((voce, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.title = voce.nome;
      const icona = document.createElement('div');
      icona.className = 'icona';
      if (voce.emoji) {
        icona.textContent = voce.emoji;
      } else {
        icona.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
        icona.style.border = '1px solid rgba(255,255,255,.25)';
      }
      const nome = document.createElement('div');
      nome.className = 'nome';
      nome.textContent = voce.nome;
      const tasto = document.createElement('div');
      tasto.className = 'tasto';
      tasto.textContent = i + 1;
      const conta = document.createElement('div');
      conta.className = 'conta';
      slot.append(tasto, icona, nome, conta);
      slot.addEventListener('click', () => this.onSeleziona && this.onSeleziona(i));
      this.elHotbar.appendChild(slot);
    });
  }

  /** Aggiorna i contatori dell'inventario sugli slot.
   *  quanti(id) → numero, Infinity, o stringa (badge libero, es. 💧 del secchio). */
  aggiornaConteggi(quanti) {
    [...this.elHotbar.children].forEach((el, i) => {
      const voce = this.slots[i];
      if (!voce) return;
      const n = quanti(voce.id);
      const conta = el.querySelector('.conta');
      if (typeof n === 'string') {
        conta.textContent = n;
        el.classList.remove('esaurito');
      } else {
        conta.textContent = n === Infinity ? '∞' : String(Math.min(n, 999));
        el.classList.toggle('esaurito', n !== Infinity && n <= 0);
      }
    });
  }

  /** Menu creativa a tab (stile Minecraft): categorie, filtro, click → slot,
   *  e la BARRA in basso dove trascinare/riordinare gli oggetti. */
  costruisciInventario(sezioni, quanti, slotAttivo, hotbarIds = null, onSlot = null, voceDa = null) {
    const el = document.getElementById('zaino');
    el.querySelector('.zaino-slot').textContent = `→ slot ${slotAttivo + 1}`;
    this._zaino = { sezioni, quanti };
    this._slotAttivo = slotAttivo;
    if (hotbarIds) { this._hotbarIds = hotbarIds; this._onSlot = onSlot; this._voceDa = voceDa; }
    if (!this._tabZaino || !sezioni.some((s) => s.id === this._tabZaino)) this._tabZaino = sezioni[0].id;

    const tabs = el.querySelector('.zaino-tabs');
    tabs.innerHTML = '';
    for (const s of sezioni) {
      const b = document.createElement('button');
      b.className = 'zaino-tab' + (s.id === this._tabZaino ? ' attivo' : '');
      b.textContent = `${s.emoji} ${s.nome}`;
      b.addEventListener('click', () => {
        this._tabZaino = s.id;
        [...tabs.children].forEach((t) => t.classList.toggle('attivo', t === b));
        this._riempiZaino();
      });
      tabs.appendChild(b);
    }
    const filtro = el.querySelector('.zaino-filtro');
    filtro.value = '';
    filtro.oninput = () => this._riempiZaino();
    this._riempiZaino();
    this._riempiBanco();
  }

  /** La barra dentro lo zaino: slot droppabili e trascinabili tra loro. */
  _riempiBanco() {
    const banco = document.getElementById('zaino').querySelector('.zaino-banco');
    if (!banco || !this._hotbarIds) return;
    banco.innerHTML = '';
    const { quanti } = this._zaino;
    this._hotbarIds.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'zaino-bslot' + (id ? ' pieno' : '') + (i === this._slotAttivo ? ' attivo' : '');
      slot.dataset.bslot = i;
      const tasto = document.createElement('div'); tasto.className = 'tasto'; tasto.textContent = i + 1;
      slot.appendChild(tasto);
      const voce = id && this._voceDa ? this._voceDa(id) : null;
      if (voce) {
        const icona = document.createElement('div'); icona.className = 'icona';
        if (voce.emoji) icona.textContent = voce.emoji;
        else { icona.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`; icona.style.border = '1px solid rgba(255,255,255,.25)'; }
        const conta = document.createElement('div'); conta.className = 'conta';
        const n = quanti(voce.id);
        conta.textContent = typeof n === 'string' ? n : (n === Infinity ? '∞' : String(Math.min(n, 999)));
        slot.append(icona, conta);
        // ✕ per SVUOTARE lo slot: prima non c'era modo di togliere un oggetto
        const via = document.createElement('button');
        via.className = 'bslot-via'; via.textContent = '✕';
        via.title = `Togli ${voce.nome} dalla barra`;
        via.addEventListener('pointerdown', (e) => e.stopPropagation());   // non avviare il trascinamento
        via.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onSlot) this._onSlot(i, null);
          this._riempiBanco();
        });
        slot.append(via);
        this._trascinabile(slot, voce, i);        // trascina VIA da questo slot
      }
      slot.addEventListener('click', () => { if (!this._dragMosso) { this._slotAttivo = i; this._riempiBanco(); } });
      banco.appendChild(slot);
    });
  }

  _riempiZaino() {
    const el = document.getElementById('zaino');
    const corpo = el.querySelector('.zaino-corpo');
    const { sezioni, quanti } = this._zaino;
    const filtro = el.querySelector('.zaino-filtro').value.trim().toLowerCase();
    const sez = sezioni.find((s) => s.id === this._tabZaino) || sezioni[0];
    corpo.innerHTML = '';
    const griglia = document.createElement('div');
    griglia.className = 'zaino-griglia';
    const voci = filtro
      ? sezioni.flatMap((s) => s.voci).filter((v) => v.nome.toLowerCase().includes(filtro))
      : sez.voci;
    for (const voce of voci) {
      const carta = document.createElement('div');
      carta.className = 'zaino-carta';
      const icona = document.createElement('div');
      icona.className = 'icona';
      if (voce.emoji) icona.textContent = voce.emoji;
      else {
        icona.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
        icona.style.border = '1px solid rgba(255,255,255,.25)';
      }
      const nome = document.createElement('div');
      nome.className = 'nome';
      nome.textContent = voce.nome;
      const conta = document.createElement('div');
      conta.className = 'conta';
      const n = quanti(voce.id);
      conta.textContent = typeof n === 'string' ? n : (n === Infinity ? '∞' : String(Math.min(n, 999)));
      // RICETTA (sezione Crea): mostra gli ingredienti e lo stato "fattibile"
      if (voce.ricetta) {
        const ingr = document.createElement('div'); ingr.className = 'zaino-ingr';
        ingr.textContent = '🔨 ' + voce.ingredienti;
        const ok = this.onPuoiCraftare ? this.onPuoiCraftare(voce.ricetta) : true;
        carta.classList.toggle('esaurito', !ok);
        carta.append(icona, nome, ingr);
        carta.addEventListener('click', () => this.onCraft && this.onCraft(voce.ricetta));
        griglia.appendChild(carta);
        continue;
      }
      const n2 = quanti(voce.id);
      if (typeof n2 === 'number' && n2 !== Infinity && n2 <= 0) carta.classList.add('esaurito');
      carta.append(icona, nome, conta);
      carta.addEventListener('click', () => { if (!this._dragMosso) this.onScegli && this.onScegli(voce.id); });
      this._trascinabile(carta, voce);
      griglia.appendChild(carta);
    }
    // SLOT VUOTI tratteggiati SOLO nell'inventario "Tuoi" (nei cataloghi non
    // hanno senso): capienza a vista, si capisce subito cosa è pieno e cosa no
    if (sez.slotVuoti && !filtro) {
      const totale = Math.max(24, Math.ceil((voci.length + 4) / 6) * 6);
      for (let i = voci.length; i < totale; i++) {
        const vuota = document.createElement('div');
        vuota.className = 'zaino-carta zaino-vuota';
        vuota.innerHTML = '<span class="zaino-vuota-eti">libero</span>';
        griglia.appendChild(vuota);
      }
    }
    corpo.appendChild(griglia);
  }

  /** Trascinamento (mouse e touch): tieni premuto e porta l'oggetto su uno
   *  slot della BARRA nello zaino. `daSlot` = indice se trascini VIA da uno
   *  slot (per riordinare o svuotare), null se dalla griglia. */
  _trascinabile(carta, voce, daSlot = null) {
    const bslot = () => [...document.querySelectorAll('.zaino-bslot')];
    const slotSotto = (x, y) => {
      const s = document.elementFromPoint(x, y);
      return s && s.closest ? s.closest('.zaino-bslot') : null;
    };
    carta.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost = null;
      this._dragMosso = false;
      const muovi = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) {
          ghost = document.createElement('div');
          ghost.className = 'drag-ghost';
          ghost.textContent = voce.emoji || voce.nome[0];
          if (!voce.emoji) ghost.style.background = `linear-gradient(135deg, ${css(voce.cima)} 0 52%, ${css(voce.lato)} 52%)`;
          document.body.appendChild(ghost);
          this._dragMosso = true;
        }
        if (!ghost) return;
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        const t = slotSotto(ev.clientX, ev.clientY);
        bslot().forEach((s) => s.classList.toggle('drop-qui', s === t));
      };
      const fine = (ev) => {
        removeEventListener('pointermove', muovi);
        removeEventListener('pointerup', fine);
        if (!ghost) return;
        ghost.remove();
        const t = slotSotto(ev.clientX, ev.clientY);
        if (t && this._onSlot) {
          const target = Number(t.dataset.bslot);
          if (daSlot !== null && daSlot !== target) {
            // riordino: SCAMBIA i due slot (restano sempre pieni: niente buchi)
            const altro = this._hotbarIds[target];
            this._onSlot(target, voce.id);
            if (altro) this._onSlot(daSlot, altro);
          } else if (daSlot === null) {
            this._onSlot(target, voce.id);           // dalla griglia → assegna
          }
        }
        bslot().forEach((s) => s.classList.remove('drop-qui'));
        this._riempiBanco();
        setTimeout(() => { this._dragMosso = false; }, 0);
      };
      addEventListener('pointermove', muovi);
      addEventListener('pointerup', fine);
    });
  }

  mostraZaino(apri = !document.getElementById('zaino').classList.contains('aperto')) {
    document.getElementById('zaino').classList.toggle('aperto', apri);
    return document.getElementById('zaino').classList.contains('aperto');
  }

  seleziona(i) {
    [...this.elHotbar.children].forEach((el, j) => el.classList.toggle('attivo', j === i));
  }

  setModo(costruisci) {
    this.elPilla.textContent = costruisci ? '🔨 COSTRUISCI' : '🐾 ESPLORA';
    this.elPilla.classList.toggle('costruisci', costruisci);
    this.elSuggerimento.textContent = costruisci
      ? '1‑9 scegli · R ruota · click dx rimuovi · B esplora'
      : 'B costruisci · H aiuto';
  }

  // Le scritture DOM costano (specie su WebView): si tocca il DOM solo al cambio.
  orologio(testo, emoji, t) {
    if (testo !== this._uTesto) { this._uTesto = testo; this.elOrologio.textContent = testo; }
    if (emoji !== this._uFase) { this._uFase = emoji; this.elFase.textContent = emoji; }
    const v = Math.round(t * 1000);
    if (!this.trascinandoTempo && v !== this._uBarra) { this._uBarra = v; this.elBarra.value = v; }
  }

  fps(n) {
    if (n !== this._uFps) { this._uFps = n; this.elFps.textContent = `${n} fps`; }
  }

  toast(msg, durata = 2200) {
    this.elToast.textContent = msg;
    this.elToast.classList.add('visibile');
    clearTimeout(this._timerToast);
    this._timerToast = setTimeout(() => this.elToast.classList.remove('visibile'), durata);
  }

  mostraAiuto(apri = !this.elAiuto.classList.contains('aperto')) {
    this.elAiuto.classList.toggle('aperto', apri);
  }
}

function css(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
