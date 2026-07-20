// SCELTA — un elenchino che spunta accanto al pulsante che l'ha chiamato.
//
// Serve alle scelte rare: cinque voci, una la tocchi, si chiude. Niente angoli
// da mirare, niente tempi da azzeccare, niente velo che copre la scena.
//
// HA PRESO IL POSTO DELLA SECONDA RUOTA. Il selettore di DOVE costruire
// (davanti, sopra, sotto…) era un menu radiale come quello degli oggetti, e
// aveva gli stessi difetti con in più un'aggravante: lo si apre due volte in una
// partita, quindi nessuno fa in tempo a imparare a memoria dove stanno le voci —
// cioè l'unica cosa che un radiale sa fare meglio di un elenco. Per una scelta
// rara il radiale è tutto costo e zero guadagno.
//
// Il contrario vale per la tavolozza, che si tocca cento volte di seguito: là
// infatti non c'è nessun menu, ci sono otto posti sempre a schermo.

export class Scelta {
  constructor() {
    this.el = null;
    this._fuori = null;
  }

  /**
   * voci = [{emoji, nome, id}] · attivo = id di quella in corso
   * ancora = elemento accanto a cui aprirsi
   */
  apri(ancora, voci, attivo, onScegli) {
    this.chiudi();
    const el = this.el = document.createElement('div');
    el.className = 'scelta';
    el.innerHTML = voci.map((v) => `<button class="scelta-voce${v.id === attivo ? ' attivo' : ''}" data-id="${v.id}">`
      + `<span class="scelta-ico">${v.emoji}</span><span>${v.nome}</span></button>`).join('');
    document.body.appendChild(el);

    // accanto al pulsante, e SEMPRE dentro lo schermo: un elenco che esce dal
    // bordo è un elenco con delle voci che non si possono toccare
    const r = ancora.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = r.left + r.width / 2 - w / 2;
    el.style.left = `${Math.min(Math.max(x, 8), innerWidth - w - 8)}px`;
    el.style.top = `${Math.max(r.top - h - 10, 8)}px`;

    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      onScegli(b.dataset.id);
      this.chiudi();
    });
    // un tocco fuori chiude: nessun pulsante «annulla» da andare a cercare
    setTimeout(() => addEventListener('pointerdown', this._fuori = () => this.chiudi(), { once: true }), 0);
  }

  chiudi() {
    if (this.el) { this.el.remove(); this.el = null; }
    if (this._fuori) { removeEventListener('pointerdown', this._fuori); this._fuori = null; }
  }

  get aperta() { return !!this.el; }
}
