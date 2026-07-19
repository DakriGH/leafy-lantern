// OFFICINA — l'inizio dell'"editor alla Unity" dentro il gioco: qui si
// DEFINISCONO nuovi contenuti con form generate da uno SCHEMA, senza codice.
// Oggi: BLOCCHI (nome, colori, attrezzo giusto, resistenza). Le altre schede
// (Furni, Strumenti, NPC, Veicoli) sono già nel telaio: aggiungere un tipo
// = scrivere il suo schema + la fabbrica che lo registra nel gioco.
// Persistenza in localStorage; in P2P le definizioni viaggiano nel benvenuto
// così l'ospite vede i blocchi custom dell'host.

import { BLOCCHI, registraBlocco, rimuoviBlocco } from '../world/blocks.js?v=mrsac3y8';
import { SCHEMI, LATI_BLOCCO, FABBRICHE, valoriDefault, campiVisibili,
         hexInt, intHex } from '../officina/schemi.js?v=mrsac3y8';

const CHIAVE = 'lantern.officina.v1';


/** Registra un contenuto dell'Officina nel gioco (fabbrica per tipo). */
function fabbrica(tipo, d) { const f = FABBRICHE[tipo]; if (f) f(d); }
const fabbricaBlocco = (d) => fabbrica('blocco', d);

// i blocchi di BASE si possono RITOCCARE: l'override si applica sopra la def
// originale (salvata per il ripristino) — l'editor tocca anche il "vanilla"
const _originali = {};
function applicaOverride(id, o) {
  if (!_originali[id]) _originali[id] = { ...BLOCCHI[id] };
  const def = BLOCCHI[id];
  def.nome = o.nome; def.cima = hexInt(o.cima); def.lato = hexInt(o.lato); def.fondo = hexInt(o.fondo);
  def.fam = o.fam; def.salute = o.salute;
  def.override = true;    // scavalca la rampa stagionale (erba): il colore scelto si VEDE
  if (o.luceRaggio > 0) def.luce = { colore: hexInt(o.luceColore || '#7dffa0'), raggio: o.luceRaggio, intensita: 1.1 };
  else delete def.luce;
}
function ripristinaOriginale(id) {
  if (_originali[id]) Object.assign(BLOCCHI[id], _originali[id]);
  delete BLOCCHI[id].override;
  if (_originali[id] && !_originali[id].luce) delete BLOCCHI[id].luce;
}

/** Da chiamare al BOOT, prima di caricare il mondo: i salvataggi possono
 *  contenere blocchi custom. Ritorna i dati per l'istanza dell'Officina. */
export function caricaOfficina() {
  let dati = { blocchi: [], override: {} };
  try { dati = Object.assign(dati, JSON.parse(localStorage.getItem(CHIAVE) || '{}')); }
  catch { /* storage corrotto: si riparte vuoti */ }
  if (!dati.override) dati.override = {};
  for (const b of dati.blocchi) fabbricaBlocco(b);
  for (const a of (dati.attrezzi || [])) fabbrica('attrezzo', a);
  for (const [id, o] of Object.entries(dati.override)) if (BLOCCHI[id]) applicaOverride(id, o);
  return dati;
}

// definizioni arrivate dalla RETE (P2P): dell'host, non nostre — via all'uscita
let _idRete = [];
export function registraDaRete(blocchi) {
  rimuoviDaRete();
  for (const b of blocchi || []) {
    if (typeof b.id !== 'string' || !b.id.startsWith('off:')) continue;
    fabbricaBlocco(b);
    _idRete.push(b.id);
  }
}
export function rimuoviDaRete() {
  for (const id of _idRete) rimuoviBlocco(id);
  _idRete = [];
}

export class Officina {
  constructor({ dati, onCambio, toast }) {
    this.dati = dati;
    this.onCambio = onCambio;
    this.toast = toast;
    this.scheda = 'blocco';
    this._inModifica = null;    // def in modifica, o null (lista)
    this._costruisci();
  }

  salva() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(this.dati)); }
    catch { this.toast('Officina: salvataggio pieno 😿'); }
  }

  apri(v = true) {
    this.el.classList.toggle('aperto', v);
    if (v) { this._inModifica = null; this._render(); }
  }

  // ---- DOM -----------------------------------------------------------------

  _costruisci() {
    const el = this.el = document.createElement('div');
    el.id = 'officina';
    el.className = 'hud';
    el.innerHTML = `
      <div class="scheda pannello">
        <div class="zaino-testa">
          <h2>🛠️ Officina</h2>
          <span class="officina-sotto">definisci i contenuti del TUO gioco</span>
          <button class="zaino-chiudi" data-el="chiudi">×</button>
        </div>
        <div class="officina-corpo">
          <div class="officina-tipi" data-el="tipi"></div>
          <div class="officina-pagina" data-el="pagina"></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-el="chiudi"]').addEventListener('click', () => this.apri(false));
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.apri(false); });

    const tipi = el.querySelector('[data-el="tipi"]');
    for (const [id, s] of Object.entries(SCHEMI)) {
      const b = document.createElement('button');
      b.className = 'officina-tipo' + (id === this.scheda ? ' attivo' : '');
      b.innerHTML = `${s.emoji} ${s.nome}` + (s.presto ? ' <small>presto</small>' : '');
      b.disabled = !!s.presto;
      b.addEventListener('click', () => {
        this.scheda = id;
        [...tipi.children].forEach((t) => t.classList.toggle('attivo', t === b));
        this._inModifica = null;
        this._render();
      });
      tipi.appendChild(b);
    }
    this.pagina = el.querySelector('[data-el="pagina"]');
  }

  _render() {
    if (this._inModifica !== null) return this._renderForm(this._inModifica);
    this._renderLista();
  }

  _renderLista() {
    if (this.scheda !== 'blocco') return this._renderListaSemplice();
    const p = this.pagina;
    p.innerHTML = '';
    const nuovo = document.createElement('button');
    nuovo.className = 'officina-nuovo';
    nuovo.textContent = '+ Nuovo blocco';
    nuovo.addEventListener('click', () => { this._inModifica = {}; this._render(); });
    p.appendChild(nuovo);

    // i blocchi di BASE: modificabili (override) e ripristinabili
    const titBase = document.createElement('div');
    titBase.className = 'officina-vuoto';
    titBase.textContent = 'Blocchi di base (modificali pure: si può sempre tornare indietro):';
    p.appendChild(titBase);
    for (const [id, def] of Object.entries(BLOCCHI)) {
      if (def.officina || def.acqua) continue;
      const riga = document.createElement('div');
      riga.className = 'officina-riga';
      const toccato = !!this.dati.override[id];
      riga.innerHTML = `
        <span class="officina-cubo" style="background:linear-gradient(135deg, ${intHex(def.cima)} 0 52%, ${intHex(def.lato)} 52%)"></span>
        <b>${def.nome}${toccato ? ' ✏️' : ''}</b>
        <button data-az="modifica">✏️</button>
        ${toccato ? '<button data-az="ripristina" title="Torna all’originale">↩️</button>' : ''}`;
      riga.querySelector('[data-az="modifica"]').addEventListener('click', () => {
        this._inModifica = {
          id, base: true, nome: def.nome,
          cima: intHex(def.cima), lato: intHex(def.lato), fondo: intHex(def.fondo),
          fam: def.fam || 'scavo', salute: def.salute || 100,
          luceRaggio: def.luce ? def.luce.raggio : 0,
          luceColore: def.luce ? intHex(def.luce.colore) : '#7dffa0',
        };
        this._render();
      });
      const rip = riga.querySelector('[data-az="ripristina"]');
      if (rip) rip.addEventListener('click', () => {
        delete this.dati.override[id];
        ripristinaOriginale(id);
        this.salva(); this.onCambio(true);
        this.toast(`↩️ «${BLOCCHI[id].nome}» tornato originale`);
        this._render();
      });
      p.appendChild(riga);
    }

    const titTuoi = document.createElement('div');
    titTuoi.className = 'officina-vuoto';
    titTuoi.textContent = this.dati.blocchi.length ? 'I tuoi blocchi:' : 'Ancora nessun blocco tuo: creane uno con il bottone qui sopra.';
    p.appendChild(titTuoi);
    for (const d of this.dati.blocchi) {
      const riga = document.createElement('div');
      riga.className = 'officina-riga';
      riga.innerHTML = `
        <span class="officina-cubo" style="background:linear-gradient(135deg, ${d.cima} 0 52%, ${d.lato} 52%)"></span>
        <b>${d.nome}</b>
        <button data-az="modifica">✏️</button>
        <button data-az="elimina">🗑</button>`;
      riga.querySelector('[data-az="modifica"]').addEventListener('click', () => { this._inModifica = { ...d }; this._render(); });
      riga.querySelector('[data-az="elimina"]').addEventListener('click', () => {
        this.dati.blocchi = this.dati.blocchi.filter((x) => x.id !== d.id);
        rimuoviBlocco(d.id);
        this.salva();
        this.onCambio();
        this.toast(`🗑 «${d.nome}» eliminato (nei mondi resta come "blocco perduto")`);
        this._render();
      });
      p.appendChild(riga);
    }
  }

  /** Un campo della form, dal suo descrittore nello schema. */
  _campo(c, valori, ridisegna, anteprima) {
    const v = valori[c.id];
    const riga = document.createElement('label');
    riga.className = 'officina-campo';
    const nomeEl = document.createElement('span');
    nomeEl.textContent = c.etichetta;
    riga.appendChild(nomeEl);

    // PITTORE DELLE FACCE: sei pastiglie, una per lato, ognuna col suo colore
    if (c.tipo === 'facce') {
      const griglia = document.createElement('div');
      griglia.className = 'officina-facce';
      const stato = valori.facce = Object.assign({}, valori.facce);
      for (const l of LATI_BLOCCO) {
        const cella = document.createElement('span');
        cella.className = 'off-faccia';
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.value = stato[l.id] || (l.id === 'cima' ? valori.cima : l.id === 'fondo' ? valori.fondo : valori.lato);
        stato[l.id] = inp.value;
        inp.addEventListener('input', () => { stato[l.id] = inp.value; anteprima(); });
        const eti = document.createElement('small'); eti.textContent = l.nome;
        cella.append(inp, eti);
        griglia.appendChild(cella);
      }
      riga.classList.add('largo');
      riga.appendChild(griglia);
      return riga;
    }

    let input;
    if (c.tipo === 'interruttore') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = v !== false;
      input.addEventListener('change', () => { valori[c.id] = input.checked; ridisegna(); anteprima(); });
    } else if (c.tipo === 'scelta') {
      input = document.createElement('select');
      for (const [val, testo] of c.opzioni) {
        const o = document.createElement('option');
        o.value = val; o.textContent = testo; o.selected = val === v;
        input.appendChild(o);
      }
    } else {
      input = document.createElement('input');
      input.type = c.tipo === 'colore' ? 'color' : (c.tipo === 'numero' ? 'range' : 'text');
      if (c.tipo === 'numero') { input.min = c.min; input.max = c.max; input.step = c.passo; }
      input.value = v;
    }
    const val = document.createElement('em');
    if (c.tipo === 'numero') val.textContent = v;
    if (c.tipo !== 'interruttore') {
      input.addEventListener('input', () => {
        valori[c.id] = c.tipo === 'numero' ? Number(input.value) : input.value;
        if (c.tipo === 'numero') val.textContent = input.value;
        // una scelta può far comparire/sparire altri campi
        if (c.tipo === 'scelta' || c.tipo === 'numero') ridisegna();
        anteprima();
      });
    }
    riga.append(input, val);
    if (c.aiuto) { const a = document.createElement('small'); a.className = 'off-aiuto'; a.textContent = c.aiuto; riga.appendChild(a); }
    return riga;
  }

  /** Lista dei contenuti di un tipo diverso dai blocchi (es. attrezzi). */
  _renderListaSemplice() {
    const p = this.pagina;
    const schema = SCHEMI[this.scheda];
    const chiave = this.scheda + 'i';                  // attrezzo → attrezzi
    if (!this.dati[chiave]) this.dati[chiave] = [];
    p.innerHTML = '';
    const nuovo = document.createElement('button');
    nuovo.className = 'officina-nuovo';
    nuovo.textContent = `+ Nuovo ${schema.nome.toLowerCase().replace(/i$/, 'o')}`;
    nuovo.addEventListener('click', () => { this._inModifica = {}; this._render(); });
    p.appendChild(nuovo);

    const tit = document.createElement('div');
    tit.className = 'officina-vuoto';
    tit.textContent = this.dati[chiave].length ? `I tuoi ${schema.nome.toLowerCase()}:`
      : `Ancora niente qui: crea il primo col bottone qui sopra.`;
    p.appendChild(tit);

    for (const d of this.dati[chiave]) {
      const riga = document.createElement('div');
      riga.className = 'officina-riga';
      riga.innerHTML = `<span class="officina-cubo" style="display:grid;place-items:center;background:none">${d.emoji || '🔧'}</span>
        <b>${d.nome}</b>
        <button data-az="modifica">✏️</button><button data-az="elimina">🗑</button>`;
      riga.querySelector('[data-az="modifica"]').addEventListener('click', () => { this._inModifica = d; this._render(); });
      riga.querySelector('[data-az="elimina"]').addEventListener('click', () => {
        this.dati[chiave] = this.dati[chiave].filter((x) => x.id !== d.id);
        this.salva(); this.onCambio(false);
        this.toast(`🗑 «${d.nome}» eliminato`);
        this._render();
      });
      p.appendChild(riga);
    }
  }

  _renderForm(def) {
    const p = this.pagina;
    p.innerHTML = '';
    const form = document.createElement('div');
    form.className = 'officina-form';
    // valori di partenza: default dello schema + quelli già salvati
    const valori = Object.assign(valoriDefault(this.scheda), def);

    // Ridisegna la form a ogni cambio: i campi possono DIPENDERE da altri
    // (es. i colori a zone spariscono se dipingi faccia per faccia).
    const ridisegna = () => {
      form.innerHTML = '';
      for (const c of campiVisibili(this.scheda, valori)) {
        if (c.sezione) {
          const s = document.createElement('div');
          s.className = 'officina-sezione'; s.textContent = c.sezione;
          form.appendChild(s);
          continue;
        }
        form.appendChild(this._campo(c, valori, ridisegna, anteprima));
      }
    };

    // anteprima: cubetto con le tonalità correnti (stessa icona di ruota/zaino)
    const ant = document.createElement('div');
    ant.className = 'officina-anteprima';
    ant.innerHTML = '<span class="officina-cubo grande"></span><small>anteprima</small>';
    const anteprima = () => {
      const f = valori.facce || {};
      const cima = valori.pittura === 'facce' ? (f.cima || valori.cima) : valori.cima;
      const lato = valori.pittura === 'facce' ? (f.est || valori.lato) : valori.lato;
      ant.firstElementChild.style.background = `linear-gradient(135deg, ${cima} 0 52%, ${lato} 52%)`;
    };
    ridisegna();
    anteprima();

    const azioni = document.createElement('div');
    azioni.className = 'officina-azioni';
    const salvaB = document.createElement('button');
    salvaB.className = 'officina-nuovo';
    salvaB.textContent = def.id ? '💾 Salva modifiche'
      : (this.scheda === 'attrezzo' ? '✨ Crea l’attrezzo' : '✨ Crea il blocco');
    salvaB.addEventListener('click', () => {
      const d = { ...def, ...valori };
      if (!d.nome.trim()) { this.toast('Dagli un nome!'); return; }
      if (d.base) {
        // ritocco di un blocco di BASE: override persistito, applicato subito
        this.dati.override[d.id] = d;
        applicaOverride(d.id, d);
        this.salva();
        this.onCambio(true);        // true = anche remesh (i colori sono baked)
        this.toast(`✏️ «${d.nome}» aggiornato in tutto il mondo`);
      } else if (this.scheda === 'attrezzo') {
        if (!d.id) d.id = 'off:att:' + Math.random().toString(36).slice(2, 7);
        if (!this.dati.attrezzi) this.dati.attrezzi = [];
        const i = this.dati.attrezzi.findIndex((x) => x.id === d.id);
        if (i >= 0) this.dati.attrezzi[i] = d; else this.dati.attrezzi.push(d);
        fabbrica('attrezzo', d);
        this.salva();
        this.onCambio(false);       // gli attrezzi non toccano la mesh
        this.toast(`🛠 «${d.nome}» pronto: lo trovi nello zaino`);
      } else {
        if (!d.id) d.id = 'off:' + Math.random().toString(36).slice(2, 7);
        const i = this.dati.blocchi.findIndex((x) => x.id === d.id);
        if (i >= 0) this.dati.blocchi[i] = d; else this.dati.blocchi.push(d);
        fabbricaBlocco(d);
        this.salva();
        this.onCambio(i >= 0);      // modifica di un blocco esistente → remesh
        this.toast(`🧱 «${d.nome}» pronto: lo trovi nello zaino → Officina`);
      }
      this._inModifica = null;
      this._render();
    });
    const annulla = document.createElement('button');
    annulla.className = 'stanza-indietro';
    annulla.textContent = '← lista';
    annulla.addEventListener('click', () => { this._inModifica = null; this._render(); });
    azioni.append(salvaB, annulla);

    p.append(form, ant, azioni);
  }
}
