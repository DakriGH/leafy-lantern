// PANNELLO DELLE MACCHINE — il volante che mancava ai macchinari.
//
// IL PROBLEMA CHE RISOLVE. Il gancio di gioco/macchine.js sa far vivere un
// macchinario, ma il giocatore non poteva né regolarlo né vedere cosa stesse
// facendo: si toccava e succedeva qualcosa, punto. Qui c'è il cruscotto —
// COSA STA FACENDO ADESSO (la riga di riepilogo) e LE MANOPOLE per cambiarlo.
//
// NIENTE UI SCRITTA A MANO. Il pannello non conosce nessuna macchina: legge
// `def.opzioni` e costruisce i comandi da sé. Inventare un macchinario nuovo
// significa scrivere il suo def — la sua interfaccia esiste già, gratis. È lo
// stesso patto dell'Officina (SCHEMI → form), applicato al gioco invece che
// all'editor.
//
// PERCHÉ UN FOGLIO IN BASSO E NON UN MODALE A TUTTO SCHERMO, come zaino e
// officina. Qui si gira una manopola per GUARDARE la macchina reagire: un velo
// su tutta la schermata coprirebbe proprio la cosa che si sta regolando. Il
// foglio occupa la fascia bassa, lascia la scena visibile e non ruba i tocchi
// alla parte alta — si può ancora orbitare la camera per inquadrare meglio il
// macchinario mentre lo si regola. Sul telefono è anche la forma che il pollice
// raggiunge senza spostare la presa.
//
// COME SI APRE (la regola tocco-vs-pannello, decisa e documentata qui perché è
// qui che si vede il perché — main.js la applica):
//
//   · macchina SENZA azione al tocco (Generatore, Idrovora): il tocco apre
//     direttamente il pannello. Non c'è niente con cui competere, e chiedere un
//     gesto speciale per l'unica cosa che quella macchina sa fare sarebbe
//     crudele.
//   · macchina CON azione al tocco (Trasmettitore, Campanello, Coltivatore…):
//     TOCCO BREVE = l'azione di sempre (l'onda parte, il frutto si raccoglie),
//     TOCCO LUNGO = il pannello. Il tocco breve non cambia comportamento: chi
//     giocava ieri non deve reimparare niente, e chi vuole le manopole usa il
//     gesto che su mobile significa da sempre "dimmi di più su questo".
//   · il pannello ha comunque il suo tasto AZIONA: una volta aperto non serve
//     chiuderlo per far agire la macchina, e chi ha scoperto il pannello prima
//     dell'azione trova anche quella.
//
// La scoperta del tocco lungo non si lascia al caso: la prima volta che tocchi
// una macchina che ha SIA azione SIA manopole, main mostra un toast che lo dice.

import { opzioniDi, riepilogoDi, impostaConfig } from '../gioco/macchine.js?v=mrt4nxiv';

export class PannelloMacchina {
  /** ctx = { servizi, onAziona(m), onCambio(m, chiave), toast } */
  constructor(ctx) {
    this.ctx = ctx;
    this.servizi = ctx.servizi;
    this.m = null;
    this._manopole = [];     // widget vivi: ognuno sa RILEGGERSI dalla config
    this._timer = 0;
    this._costruisci();
  }

  // ---- DOM (il modulo si costruisce il proprio, come l'Officina) ------------

  _costruisci() {
    const el = this.el = document.createElement('div');
    el.id = 'pannelloMacchina';
    el.className = 'hud';
    el.innerHTML = `
      <div class="pm-foglio pannello">
        <div class="pm-testa">
          <span class="pm-icona" data-el="icona">⚙️</span>
          <div class="pm-nomi">
            <b data-el="nome">Macchina</b>
            <span class="pm-vita" data-el="vita">—</span>
          </div>
          <button class="zaino-chiudi pm-chiudi" data-el="chiudi" title="Chiudi">×</button>
        </div>
        <div class="pm-riepilogo" data-el="riepilogo">—</div>
        <div class="pm-manopole" data-el="manopole"></div>
        <button class="pm-aziona" data-el="aziona" hidden>👆 Aziona</button>
      </div>`;
    document.body.appendChild(el);
    this.elIcona = el.querySelector('[data-el="icona"]');
    this.elNome = el.querySelector('[data-el="nome"]');
    this.elVita = el.querySelector('[data-el="vita"]');
    this.elRiepilogo = el.querySelector('[data-el="riepilogo"]');
    this.elManopole = el.querySelector('[data-el="manopole"]');
    this.elAziona = el.querySelector('[data-el="aziona"]');
    el.querySelector('[data-el="chiudi"]').addEventListener('click', () => this.chiudi());
    this.elAziona.addEventListener('click', () => {
      if (this.m && this.ctx.onAziona) this.ctx.onAziona(this.m);
      this.aggiorna();                      // l'azione cambia lo stato: si vede subito
    });
  }

  get aperto() { return this.el.classList.contains('aperto'); }

  /** Apre il pannello su quella macchina (il "cruscotto" di macchine.js). */
  apri(m) {
    this.m = m;
    const def = m.def;
    this.elIcona.textContent = def.icona || '⚙️';
    this.elNome.textContent = def.nome || def.id;
    this.elAziona.hidden = typeof def.onInteragisci !== 'function';

    this.elManopole.textContent = '';
    this._manopole = [];
    for (const op of opzioniDi(def)) {
      if (!op || typeof op.chiave !== 'string') continue;
      const w = this._manopola(op);
      if (w) { this.elManopole.appendChild(w.el); this._manopole.push(w); }
    }
    if (!this._manopole.length) {
      const vuoto = document.createElement('div');
      vuoto.className = 'pm-vuoto';
      vuoto.textContent = 'Questa macchina non ha manopole: fa quello che deve, e basta.';
      this.elManopole.appendChild(vuoto);
    }

    this.el.classList.add('aperto');
    // IL JOYSTICK FINISCE SOTTO IL FOGLIO, e non c'è altezza che lo eviti: sta
    // nell'angolo in basso, cioè dove un foglio in basso arriva sempre. Un
    // comando che si vede ma non si può premere è peggio di un comando assente,
    // quindi mentre il pannello è aperto i comandi touch si tolgono di mezzo.
    document.body.classList.add('macchina-aperta');
    this.aggiorna();
    // IL RIEPILOGO È VIVO: una macchina che lavora cambia da sola, e un pannello
    // che mostra una fotografia vecchia di dieci secondi è peggio di niente.
    // 5 volte al secondo bastano per leggere ("il gatto è a 3,2 celle") e non
    // pesano: gira solo mentre il pannello è APERTO e su UNA macchina sola.
    clearInterval(this._timer);
    this._timer = setInterval(() => this.aggiorna(), 200);
  }

  chiudi() {
    clearInterval(this._timer);
    this._timer = 0;
    this.el.classList.remove('aperto');
    document.body.classList.remove('macchina-aperta');
    this.m = null;
    if (this.ctx.onChiudi) this.ctx.onChiudi();
  }

  /** Rilegge tutto dalla macchina: riepilogo, dormienza, valori delle manopole. */
  aggiorna() {
    const m = this.m;
    if (!m) return;
    // IL FURNI PUÒ SPARIRE MENTRE IL PANNELLO È APERTO (lo rimuovi col tasto
    // destro, arriva un salvataggio, si rigenera il mondo). Si controlla anche
    // l'IDENTITÀ e non solo `vivo`: gli id delle entità si riciclano, e un
    // pannello agganciato a un id riusato regolerebbe la macchina sbagliata.
    const ecs = this.servizi.ecs;
    if (!ecs.vivo(m.id) || ecs.leggi(m.id, 'macchina') !== m) { this.chiudi(); return; }

    this.elRiepilogo.textContent = riepilogoDi(m, this.servizi) || 'Nessun riepilogo: questa macchina non racconta cosa sta facendo.';
    this.elVita.textContent = m.dormiente ? '⏾ dorme — costo zero' : '⏵ attiva';
    this.elVita.classList.toggle('dorme', !!m.dormiente);
    for (const w of this._manopole) w.sync();
  }

  // ---- LE MANOPOLE ----------------------------------------------------------
  // Un tipo nuovo si aggiunge QUI e in `normalizzaValore` di macchine.js: sono
  // i due soli punti del gioco che conoscono i tipi delle opzioni.

  _manopola(op) {
    if (op.tipo === 'interruttore') return this._interruttore(op);
    if (op.tipo === 'numero') return this._numero(op);
    if (op.tipo === 'scelta') return this._scelta(op);
    return null;                             // tipo sconosciuto: si salta, non si finge
  }

  _scrivi(op, valore) {
    if (!this.m) return;
    if (impostaConfig(this.servizi, this.m, op.chiave, valore) && this.ctx.onCambio) {
      this.ctx.onCambio(this.m, op.chiave);
    }
    this.aggiorna();                         // l'effetto della manopola si legge SUBITO nel riepilogo
  }

  /** Interruttore: un bottone grande, non una spunta da 13 px da centrare col dito. */
  _interruttore(op) {
    const el = document.createElement('div');
    el.className = 'pm-riga';
    const b = document.createElement('button');
    b.className = 'pm-tgl';
    b.innerHTML = `<span></span><i></i>`;
    const eti = b.querySelector('span'), val = b.querySelector('i');
    eti.textContent = op.etichetta || op.chiave;
    b.addEventListener('click', () => this._scrivi(op, !this.m.config[op.chiave]));
    el.appendChild(b);
    return {
      el,
      sync: () => {
        const v = !!this.m.config[op.chiave];
        b.classList.toggle('attivo', v);
        b.setAttribute('aria-pressed', v ? 'true' : 'false');
        val.textContent = v ? 'Sì' : 'No';
      },
    };
  }

  /** Numero: slider + due tasti da 44 px. Lo slider da solo, su un telefono,
   *  è impreciso di uno-due passi: i tasti sono il modo di arrivare al valore
   *  esatto senza bestemmiare. */
  _numero(op) {
    const el = document.createElement('div');
    el.className = 'pm-riga';
    el.innerHTML = `
      <div class="pm-eti"><span></span><em></em></div>
      <div class="pm-numero">
        <button class="pm-passo" data-d="-1" aria-label="meno">−</button>
        <input type="range">
        <button class="pm-passo" data-d="1" aria-label="più">+</button>
      </div>`;
    el.querySelector('span').textContent = op.etichetta || op.chiave;
    const val = el.querySelector('em');
    const inp = el.querySelector('input');
    const passo = Number.isFinite(op.passo) && op.passo > 0 ? op.passo : 1;
    inp.min = Number.isFinite(op.min) ? op.min : 0;
    inp.max = Number.isFinite(op.max) ? op.max : 100;
    inp.step = passo;

    // TRASCINAMENTO IN CORSO = NON TOCCARE IL CURSORE. Senza questo flag il
    // refresh a 5 Hz riscriverebbe `input.value` sotto il dito e lo slider
    // "tornerebbe indietro" mentre lo si muove.
    let inUso = false;
    for (const ev of ['pointerdown', 'focus']) inp.addEventListener(ev, () => { inUso = true; });
    for (const ev of ['pointerup', 'pointercancel', 'blur']) inp.addEventListener(ev, () => { inUso = false; });
    inp.addEventListener('input', () => { val.textContent = inp.value; this._scrivi(op, Number(inp.value)); });
    for (const b of el.querySelectorAll('.pm-passo')) {
      b.addEventListener('click', () => {
        const d = Number(b.getAttribute('data-d')) * passo;
        this._scrivi(op, Number(this.m.config[op.chiave]) + d);
      });
    }
    return {
      el,
      sync: () => {
        const v = this.m.config[op.chiave];
        val.textContent = v;
        if (!inUso) inp.value = v;
      },
    };
  }

  /** Scelta: pastiglie, una per valore. Un <select> su mobile apre una tendina
   *  di sistema (due tocchi e una lista che copre lo schermo): qui le opzioni
   *  sono tre o quattro, ci stanno tutte in fila e si scelgono con UN tocco. */
  _scelta(op) {
    const el = document.createElement('div');
    el.className = 'pm-riga';
    el.innerHTML = `<div class="pm-eti"><span></span></div><div class="pm-scelte"></div>`;
    el.querySelector('span').textContent = op.etichetta || op.chiave;
    const riga = el.querySelector('.pm-scelte');
    const bottoni = [];
    for (const v of Array.isArray(op.valori) ? op.valori : []) {
      if (!v) continue;
      const b = document.createElement('button');
      b.className = 'pm-scelta';
      b.textContent = v.testo || v.v;
      b.addEventListener('click', () => this._scrivi(op, v.v));
      riga.appendChild(b);
      bottoni.push([b, v.v]);
    }
    return {
      el,
      sync: () => {
        const attuale = this.m.config[op.chiave];
        for (const [b, v] of bottoni) b.classList.toggle('attivo', v === attuale);
      },
    };
  }
}
