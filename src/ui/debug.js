// Menu di debug (F3): il banco di prova del motore.
// Statistiche vive, preset del tempo, generazione mondo con snapshot,
// overlay diagnostici (raggi luci, footprint furni, bordi chunk, hitbox)
// e comandi player (volo, respawn, lampioni forzati).

import * as THREE from 'three';
import { CHUNK } from '../world/world.js?v=mtatt887';
import { elencoLuci, statLuci, statImpatti, memoriaVoxel } from '../fx/materials.js?v=mtatt887';
import { FISICA } from '../config.js?v=mtatt887';

/** Le condizioni della griglia dei muri, DISTINTE: spenta dall'utente, mondo
 *  vuoto, troppe celle per il paracadute, o un lato oltre il massimo della GPU.
 *  Erano una riga sola, e un guasto travestito da preferenza è il modo migliore
 *  per non accorgersene.
 *
 *  QUI C'ERA ANCHE «N lampade senza piastrella», il guasto dell'atlante pieno.
 *  Non c'è più perché non c'è più niente da esaurire: la griglia è una sola e
 *  risponde a qualunque numero di lampade. */
function luceTesto(st, gu) {
  if (st.occTroppoGrande) return `⚠ mondo troppo grande (${(st.occTroppoGrande / 1e6).toFixed(2)}M celle): niente ombre`;
  if (gu.voxTroppoLarga) return `⚠ lato ${gu.voxTroppoLarga} oltre il massimo della GPU: niente ombre`;
  if (!st.occCelle) return 'spenta (interruttore o mondo vuoto)';
  const kb = (memoriaVoxel() / 1024).toFixed(0);
  return `${(st.occCelle / 1000).toFixed(0)}k celle · ${kb} KB in GPU · agg. ${st.occMs.toFixed(1)} ms${st.occLocali ? ` (${st.occLocali} celle)` : ''}`;
}

// L'ORDINE DI QUESTO PANNELLO È UNA DECISIONE, non un accumulo. Sopra sta ciò
// che si tocca per GIUDICARE lo stile di V2 — lo zoo, l'ora, gli overlay —
// perché è quello che si apre venti volte in una sessione; sotto ciò che si
// tocca una volta e si dimentica. Prima era una pila cronologica di otto
// bottoni-mondo tutti uguali, e trovare quello giusto costava più del guardare.
const HTML = /* html */`
  <div class="dbg-testa"><span>🧪 Banco V2 <span data-el="netStato" title="stato del collegamento P2P" style="opacity:.6">⭘</span></span><button data-az="chiudi" title="Chiudi (F3)">×</button></div>

  <div class="dbg-sez">
    <button data-az="zoo" title="Il mondo di riferimento di Leafy V2: otto stazioni in fila, sempre identiche, tutte raggiungibili a piedi. Il mondo di adesso finisce nello snapshot."
      style="width:100%;min-height:52px;padding:12px;border-radius:12px;border:1px solid rgba(255,212,77,.55);background:linear-gradient(90deg,rgba(255,212,77,.22),rgba(124,255,176,.20));color:#eaf3ff;font:700 15px/1.3 system-ui,Segoe UI,Roboto,sans-serif;cursor:pointer">🦓 Zoo delle prove</button>
    <div style="font-size:11px;opacity:.6;margin-top:4px">Piano nudo · face shading · ombre portate · luci · matrice sorgenti · acqua · vegetazione · materiali.
    Ogni stazione ha il punto <b>sguardo</b> (da cui si giudica e si fotografa) e il punto <b>piedi</b> (dentro, per il dettaglio).</div>
    <div class="dbg-riga" data-el="zone" style="display:none"></div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">⏱ Ora del giorno</div>
    <div class="dbg-riga">
      <button data-az="ora" data-t="0.27">🌅</button>
      <button data-az="ora" data-t="0.50">☀️</button>
      <button data-az="ora" data-t="0.755">🌇</button>
      <button data-az="ora" data-t="0.95">🌙</button>
      <span class="dbg-sep"></span>
      <button data-az="pausa" data-el="btnPausa">⏸</button>
      <button data-az="vel" data-d="480">1×</button>
      <button data-az="vel" data-d="48">10×</button>
      <button data-az="vel" data-d="8">60×</button>
    </div>
    <div style="font-size:11px;opacity:.55;margin-top:4px">⚠️ Per un confronto A/B l'ora va <b>ferma</b> (⏸): due scatti a due ore diverse
    misurano il tempo che passa, non lo shader.</div>
  </div>

  <div class="dbg-sez"><pre class="dbg-stat" data-el="stat">…</pre></div>

  <div class="dbg-sez">
    <div class="dbg-tit">☀️ Sole e ombre <span style="font-size:11px;opacity:.55">tutto dal vivo</span></div>
    <div class="dbg-riga">
      <button data-az="controluce" data-el="btnControluce" title="Il mondo visto dal sole in una texture di profondità: la sagoma è la geometria VERA, il bordo è un confronto binario. Spento = il campo di quote per colonna di prima.">🌓 Controluce</button>
      <button data-az="soleManuale" data-el="btnSoleManuale" title="Ferma l'astro e lo comanda a mano con le due manopole qui sotto. Per un A/B è OBBLIGATORIO: con l'astro che cammina si misura il tempo che passa, non la modifica.">🎯 Sole a mano</button>
      <button data-az="soleBisturi" data-el="btnSoleBisturi" title="Spegne l'ombra del sole con una UNIFORM, a programma identico. È il bisturi che prima non c'era, e senza il quale ogni misura A/B del sole misurava anche la ricompilazione.">☀️ ombra on</button>
    </div>
    <div class="dbg-riga dbg-colonna" data-el="manopoleSole"></div>
    <div style="font-size:11px;opacity:.55;margin-top:4px">Guarda dalla <b>stazione 3</b> dello zoo. <b>Scarto</b> troppo basso = acne sugli smussi; troppo alto = l'ombra si stacca dalla base.</div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">👁 Overlay</div>
    <div class="dbg-riga dbg-colonna">
      <label><input type="checkbox" data-perf> ⏱ GPU: tempo reale per passata (tasto G)</label>
      <label><input type="checkbox" data-ov="luci"> 💡 Raggi delle luci-sfera</label>
      <label><input type="checkbox" data-ov="footprint"> 🪑 Footprint dei furni</label>
      <label><input type="checkbox" data-ov="chunk"> 🧩 Bordi dei chunk</label>
      <label><input type="checkbox" data-ov="hitbox"> 🐱 Hitbox del gatto</label>
    </div>
  </div>

  <div class="dbg-sez">
    <button data-az="diagnostica" title="Prova TUTTO sul tuo dispositivo e scarica un file con i risultati"
      style="width:100%;min-height:52px;padding:12px;border-radius:12px;border:1px solid rgba(124,255,176,.5);background:linear-gradient(90deg,rgba(91,209,255,.22),rgba(124,255,176,.22));color:#eaf3ff;font:700 15px/1.3 system-ui,Segoe UI,Roboto,sans-serif;cursor:pointer">📊 Diagnostica completa (scarica report)</button>
    <div style="font-size:11px;opacity:.6;margin-top:4px">~20‑30s: misura fps, CPU e GPU sul mondo attuale, poi scarica un file. Il mondo NON viene toccato.</div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">🌍 Mondo</div>
    <div class="dbg-riga">
      <button data-az="snapshot" title="Salva il mondo attuale (2 livelli)">📸 Snapshot</button>
      <button data-az="ripristina" title="Torna all'ultimo snapshot">↩️ Ripristina</button>
    </div>
    <div class="dbg-riga">
      <button data-az="isola">🏝 Isola demo</button>
      <button data-az="arcipelago">🌌 Arcipelago</button>
      <button data-az="open">⛰ Open world</button>
      <label>seme <input data-el="seme" type="number" value="42" min="0" max="99999"></label>
      <label>raggio <select data-el="est">
        <option value="32">32</option><option value="48" selected>48</option>
        <option value="64">64</option><option value="96">96</option>
      </select></label>
    </div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">🧰 Gli altri banchi</div>
    <div class="dbg-riga">
      <button data-az="mostra" title="Mondo piatto con TUTTI i blocchi separati, per provarli">🧪 Sala prove</button>
      <button data-az="mondoGigante" title="Montagne alte e mezzo milione di blocchi: il banco delle PRESTAZIONI, con le ombre accese">⛰ Mondo gigante</button>
      <button data-az="testMacchine" title="Banco dei MACCHINARI: tutti montati e già funzionanti, ognuno col contorno che gli serve. Tocca per usarli, tieni premuto per le manopole">⚙️ Macchinari</button>
    </div>
    <!-- SUPERATI DALLO ZOO, e stanno qui dentro invece che nel niente: le loro
         tre generatrici reggono 46 prove del motore (sagome-ombra 27,
         test-luci 19), quindi il CODICE non si tocca — a sparire è il posto
         che occupavano in prima fila. -->
    <details style="margin-top:6px">
      <summary style="font-size:11px;opacity:.55;cursor:pointer">i tre banchi superati dallo zoo</summary>
      <div class="dbg-riga" style="margin-top:4px">
        <button data-az="collaudo" title="Sei zone per luci e acqua. Lo zoo le rifà tutte, con i punti di sguardo">🔦 Collaudo</button>
        <button data-az="bancoOmbre" title="Sagome contro il sole e matrice delle sorgenti. Sono le stazioni 3 e 5 dello zoo">🌗 Banco ombre</button>
        <button data-az="testLuci" title="Solo luce: pesante contro leggera, occlusione, colori, fatui. È la stazione 4 dello zoo">💡 Test luci</button>
      </div>
    </details>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">🌸 Stagione</div>
    <div class="dbg-riga">
      <button data-az="stagione" data-s="primavera">🌸 Primavera</button>
      <button data-az="stagione" data-s="estate">🌾 Estate</button>
      <button data-az="stagione" data-s="autunno">🍂 Autunno</button>
      <button data-az="stagione" data-s="inverno">❄️ Inverno</button>
    </div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">🎞 Vista e meteo</div>
    <div class="dbg-riga">
      fog
      <button data-az="fog" data-f="1">vicina</button>
      <button data-az="fog" data-f="0.45">media</button>
      <button data-az="fog" data-f="0.18">lontana</button>
      <span class="dbg-sep"></span>
      <button data-az="riflessi">✨ riflessi</button>
      <button data-az="pioggia">🌧 pioggia</button>
    </div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">🐱 Player e lampioni</div>
    <div class="dbg-riga">
      <button data-az="volo" data-el="btnVolo">✈️ Volo (V)</button>
      <button data-az="respawn">🏠 Respawn</button>
      <button data-az="inf" data-el="btnInf">∞ risorse</button>
      <span class="dbg-sep"></span>
      <button data-az="lamp" data-m="auto">Auto</button>
      <button data-az="lamp" data-m="on">ON</button>
      <button data-az="lamp" data-m="off">OFF</button>
    </div>
    <div class="dbg-riga">
      <button data-az="arProva" title="Avvia l'AR con una camera FINTA che inquadra il marker: se il diorama appare, motore e marker funzionano">📷 AR di prova (camera finta)</button>
    </div>
  </div>
`;

export class MenuDebug {
  /**
   * @param deps { mondo, arredo, controller, ciclo, rig, mesher, hud, azioni }
   * azioni: { respawn(), isolaDemo(), arcipelago(seme, est), snapshot(), ripristina() }
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.aperto = false;
    this._acc = 0;
    this._frame = 0;
    this._fps = 0;

    this.el = document.createElement('div');
    this.el.id = 'debug';
    this.el.className = 'pannello hud';
    this.el.innerHTML = HTML;
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    this.elStat = this.el.querySelector('[data-el="stat"]');
    this.elSeme = this.el.querySelector('[data-el="seme"]');
    this.elEst = this.el.querySelector('[data-el="est"]');
    this.btnVolo = this.el.querySelector('[data-el="btnVolo"]');
    this.btnPausa = this.el.querySelector('[data-el="btnPausa"]');
    this.elNetStato = this.el.querySelector('[data-el="netStato"]');
    this.elZone = this.el.querySelector('[data-el="zone"]');
    this._costruisciManopole();

    // overlay three
    this.gruppi = {
      luci: new THREE.Group(), footprint: new THREE.Group(),
      chunk: new THREE.Group(), hitbox: new THREE.Group(),
    };
    for (const g of Object.values(this.gruppi)) { g.visible = false; this.rig.scena.add(g); }
    this._geoSfera = new THREE.SphereGeometry(1, 14, 10);
    this._geoBox = new THREE.BoxGeometry(1, 1, 1);
    this._matLuceOn = new THREE.MeshBasicMaterial({ color: 0xffd44d, wireframe: true, transparent: true, opacity: 0.35 });
    this._matLuceOff = new THREE.MeshBasicMaterial({ color: 0x8892b0, wireframe: true, transparent: true, opacity: 0.15 });
    this._matCella = new THREE.MeshBasicMaterial({ color: 0xff2277, wireframe: true, transparent: true, opacity: 0.85, depthTest: false });
    this._matChunk = new THREE.MeshBasicMaterial({ color: 0x39d6ff, wireframe: true, transparent: true, opacity: 0.5 });
    this._matHit = new THREE.MeshBasicMaterial({ color: 0x7dffa0, wireframe: true, depthTest: false });
    this._hitMesh = new THREE.Mesh(this._geoBox, this._matHit);
    this._hitMesh.scale.set(FISICA.larghezza, FISICA.altezza, FISICA.larghezza);
    this.gruppi.hitbox.add(this._hitMesh);

    this.elPerf = this.el.querySelector('[data-perf]');

    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('change', (e) => {
      const ov = e.target.getAttribute && e.target.getAttribute('data-ov');
      if (ov) this._toggleOverlay(ov, e.target.checked);
      // il misuratore GPU non è un overlay three: lo gestisce main (azioni.perf)
      if (e.target === this.elPerf && this.azioni.perf) this.azioni.perf(e.target.checked);
    });
  }

  /** Riflette lo stato del misuratore perf sulla spunta (se acceso col tasto G). */
  segnaPerf(on) { if (this.elPerf) this.elPerf.checked = !!on; }

  toggle(apri = !this.aperto) {
    this.aperto = apri;
    this.el.style.display = apri ? 'block' : 'none';
    if (apri) this.sincronizza();
  }

  sincronizza() {
    this.btnVolo.classList.toggle('attivo', this.controller.vola);
    this.btnPausa.textContent = this.ciclo.auto ? '⏸' : '▶';
    // ⚠ I BOTTONI CHE NASCONO ACCESI vanno marcati, se no il pannello mente su
    // cosa sta guardando l'utente — ed è così che si giudica un sistema per
    // l'altro. Controluce parte acceso: senza questa riga il bottone sembra
    // spento e chi lo preme lo SPEGNE credendo di accenderlo.
    const c = this.el.querySelector('[data-el="btnControluce"]');
    if (c && this.azioni.controluceStato) c.classList.toggle('attivo', !!this.azioni.controluceStato());
    const m = this.el.querySelector('[data-el="btnSoleManuale"]');
    if (m) m.classList.toggle('attivo', !!(this.ciclo.sole && this.ciclo.sole.manuale));
    const s = this.el.querySelector('[data-el="btnSoleBisturi"]');
    if (s && this.azioni.soleBisturiStato) s.classList.toggle('attivo', !this.azioni.soleBisturiStato());
    this.sincronizzaManopole();
  }

  /** LE MANOPOLE DEL SOLE E DELL'OMBRA, dal vivo.
   *
   *  Committente, 27/08: «voglio completo controllo del sole e la sua
   *  inclinazione». Sono una TABELLA e non dieci righe di HTML apposta: una
   *  manopola nuova è una riga, e il valore si scrive accanto sempre — una
   *  manopola senza numero si tara a memoria, e a memoria si sbaglia.
   *
   *  ⚠ `azione` riceve il valore GIÀ nell'unità giusta e rende cosa scrivere
   *  accanto: così l'etichetta non può divergere da quello che è successo
   *  davvero (il difetto classico di ogni pannello di taratura). */
  _costruisciManopole() {
    const box = this.el.querySelector('[data-el="manopoleSole"]');
    if (!box) return;
    this._manopole = [
      { id: 'azimut', nome: '🧭 Da dove viene', min: 0, max: 360, passo: 1, unita: '°',
        leggi: () => this.ciclo.sole.azimut, scrivi: (v) => { this.ciclo.sole.azimut = v; } },
      { id: 'elev', nome: '📐 Quanto è alto', min: 2, max: 89, passo: 1, unita: '°',
        leggi: () => this.ciclo.sole.elevazione, scrivi: (v) => { this.ciclo.sole.elevazione = v; } },
      { id: 'asse', nome: '🌅 Asse di levata', min: 0, max: 180, passo: 1, unita: '°',
        aiuto: 'da che parte sorge, nell\'arco AUTOMATICO', 
        leggi: () => this.ciclo.sole.asse, scrivi: (v) => { this.ciclo.sole.asse = v; } },
      { id: 'inclina', nome: '↗️ Inclinazione dell\'arco', min: 0, max: 60, passo: 1, unita: '°',
        aiuto: 'quanto il culmine sta di lato: a zero passa per lo zenit e a mezzogiorno le ombre spariscono sotto gli oggetti',
        leggi: () => this.ciclo.sole.inclina, scrivi: (v) => { this.ciclo.sole.inclina = v; } },
      { id: 'contrasto', nome: '🌗 Contrasto dell\'ombra', min: 0, max: 200, passo: 5, unita: '%',
        leggi: () => Math.round(this.ciclo.forzaOmbra * 100),
        scrivi: (v) => { this.ciclo.forzaOmbra = v / 100; } },
      { id: 'norm', nome: '🪚 Scostamento sugli smussi', min: 0, max: 60, passo: 1, unita: '/10 texel',
        aiuto: 'è la cura ai denti sugli smussi del supercubo: si sposta il punto di lettura lungo la normale, così lo scostamento è giusto a QUALUNQUE ora invece che a una sola',
        leggi: () => Math.round((this.azioni.scostaNormale ? this.azioni.scostaNormale() : 1.6) * 10),
        scrivi: (v) => { if (this.azioni.scostaNormale) this.azioni.scostaNormale(v / 10); } },
      { id: 'scarto', nome: '📏 Scarto in profondità', min: 0, max: 200, passo: 5, unita: '/100 blocchi',
        aiuto: 'troppo poco = acne sugli smussi, troppo = ombra staccata da terra',
        leggi: () => Math.round((this.azioni.scartoOmbra ? this.azioni.scartoOmbra() : 0.15) * 100),
        scrivi: (v) => { if (this.azioni.scartoOmbra) this.azioni.scartoOmbra(v / 100); } },
    ];
    for (const m of this._manopole) {
      const riga = document.createElement('label');
      riga.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;width:100%';
      riga.title = m.aiuto || '';
      const nome = document.createElement('span');
      nome.textContent = m.nome; nome.style.cssText = 'flex:0 0 46%;opacity:.85';
      const cur = document.createElement('input');
      cur.type = 'range'; cur.min = m.min; cur.max = m.max; cur.step = m.passo;
      cur.style.cssText = 'flex:1 1 auto;min-width:60px';
      const val = document.createElement('span');
      val.style.cssText = 'flex:0 0 76px;text-align:right;font-variant-numeric:tabular-nums;opacity:.7';
      const mostra = () => { const v = m.leggi(); cur.value = v; val.textContent = v + m.unita; };
      cur.addEventListener('input', () => { m.scrivi(Number(cur.value)); mostra(); this._suManopola(m.id); });
      m._mostra = mostra; mostra();
      riga.append(nome, cur, val);
      box.appendChild(riga);
    }
  }

  /** Dopo una manopola: l'ora va FERMATA (se no il valore appena messo scorre
   *  via) e la mappa d'ombra va rifatta, perché la sua chiave non sa niente
   *  delle manopole. */
  _suManopola(id) {
    if (['azimut', 'elev', 'asse', 'inclina'].includes(id)) {
      this.ciclo.aggiorna(0);
      if (this.azioni.rifaiOmbra) this.azioni.rifaiOmbra();
    } else if ((id === 'scarto' || id === 'norm') && this.azioni.rifaiOmbra) this.azioni.rifaiOmbra();
  }

  /** Rilegge tutte le manopole dal mondo: da chiamare quando qualcosa le muove
   *  da fuori (un preset, un caricamento). */
  sincronizzaManopole() { for (const m of this._manopole || []) m._mostra(); }

  /** Bottoni di teletrasporto per le zone della scena di collaudo. Compaiono
   *  appena la scena esiste e restano finché non se ne genera un'altra: senza,
   *  l'unico modo di raggiungere la cascata o il fondo della grotta era scrivere
   *  le coordinate a mano in console. `piedi`/`cima`/`dentro`/`retro` diventano
   *  ognuno un bottone, perché il punto interessante spesso NON è l'ingresso. */
  mostraZone(zone, vai) {
    const z = this.elZone;
    z.textContent = '';
    if (!zone) { z.style.display = 'none'; return; }
    for (const v of Object.values(zone)) {
      for (const [chiave, cella] of Object.entries(v)) {
        if (chiave === 'nome' || !Array.isArray(cella)) continue;
        const b = document.createElement('button');
        b.textContent = chiave === 'piedi' ? v.nome : `${v.nome} · ${chiave}`;
        b.title = `Teletrasporto a ${cella.join(', ')}`;
        b.addEventListener('click', () => { vai(cella); this.hud.toast(`🔦 ${b.textContent}`); });
        z.appendChild(b);
      }
    }
    z.style.display = '';
  }

  _click(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const az = b.getAttribute('data-az');
    if (az === 'chiudi') this.toggle(false);
    else if (az === 'diagnostica') { if (this.azioni.diagnostica) this.azioni.diagnostica(); return; }
    else if (az === 'ora') { this.ciclo.t = Number(b.getAttribute('data-t')); this.ciclo.aggiorna(0); }
    else if (az === 'pausa') { this.ciclo.auto = !this.ciclo.auto; this.sincronizza(); }
    else if (az === 'vel') { this.ciclo.durata = Number(b.getAttribute('data-d')); this.ciclo.auto = true; this.sincronizza(); this.hud.toast(`Giorno di ${this.ciclo.durata}s`); }
    else if (az === 'stagione') this.azioni.stagione(b.getAttribute('data-s'));
    else if (az === 'snapshot') this.azioni.snapshot();
    else if (az === 'ripristina') this.azioni.ripristina();
    else if (az === 'isola') this.azioni.isolaDemo();
    else if (az === 'arcipelago') this.azioni.arcipelago(Number(this.elSeme.value) || 0, Number(this.elEst.value));
    else if (az === 'open') this.azioni.openWorld(Number(this.elSeme.value) || 0, Number(this.elEst.value));
    else if (az === 'controluce') b.classList.toggle('attivo', this.azioni.controluce());
    else if (az === 'soleManuale') {
      this.ciclo.sole.manuale = !this.ciclo.sole.manuale;
      if (this.ciclo.sole.manuale) this.ciclo.auto = false;   // a mano l'ora non scorre
      b.classList.toggle('attivo', this.ciclo.sole.manuale);
      this.ciclo.aggiorna(0); this.sincronizza();
      if (this.azioni.rifaiOmbra) this.azioni.rifaiOmbra();
    }
    else if (az === 'soleBisturi') b.classList.toggle('attivo', !this.azioni.soleBisturi());
    else if (az === 'zoo') this.azioni.zoo();
    else if (az === 'mostra') this.azioni.salaProve();
    else if (az === 'collaudo') this.azioni.collaudo();
    else if (az === 'testLuci') this.azioni.testLuci();
    else if (az === 'bancoOmbre') this.azioni.bancoOmbre();
    else if (az === 'mondoGigante') this.azioni.mondoGigante();
    else if (az === 'testMacchine') this.azioni.testMacchine();
    else if (az === 'fog') this.azioni.fog(Number(b.getAttribute('data-f')));
    else if (az === 'arProva') this.azioni.arProva();
    else if (az === 'riflessi') b.classList.toggle('attivo', this.azioni.riflessi());
    else if (az === 'pioggia') b.classList.toggle('attivo', this.azioni.pioggia());
    else if (az === 'inf') b.classList.toggle('attivo', this.azioni.infinito());
    else if (az === 'volo') { this.controller.imposta_volo(!this.controller.vola); this.sincronizza(); }
    else if (az === 'respawn') this.azioni.respawn();
    else if (az === 'lamp') this._lampade(b.getAttribute('data-m'));
    this._rinfrescaOverlay();
  }


  netStato(testo) { this.elNetStato.textContent = testo; }

  _lampade(modo) {
    for (const ist of this.arredo.istanze) {
      if (!ist.def.stati) continue;
      if (modo === 'auto') { ist.manuale = false; this.arredo.setStato(ist, this.ciclo.eNotte ? 1 : 0); }
      else this.arredo.setStato(ist, modo === 'on' ? 1 : 0);
    }
    this.hud.toast(`Lampioni: ${modo.toUpperCase()}`);
  }

  // ---- overlay -------------------------------------------------------------

  _toggleOverlay(nome, attivo) {
    this.gruppi[nome].visible = attivo;
    if (attivo) this._costruisciOverlay(nome);
  }

  _rinfrescaOverlay() {
    for (const nome of ['luci', 'footprint', 'chunk']) {
      if (this.gruppi[nome].visible) this._costruisciOverlay(nome);
    }
  }

  /** Da chiamare quando mondo/furni cambiano (main fa da fan-out). */
  suEvento() { this._rinfrescaOverlay(); }

  _svuota(gruppo, tieni = null) {
    for (const f of [...gruppo.children]) { if (f !== tieni) gruppo.remove(f); }
  }

  _costruisciOverlay(nome) {
    const g = this.gruppi[nome];
    if (nome === 'luci') {
      this._svuota(g);
      for (const l of elencoLuci()) {
        const m = new THREE.Mesh(this._geoSfera, l.attiva ? this._matLuceOn : this._matLuceOff);
        m.position.copy(l.pos);
        m.scale.setScalar(l.raggio);
        g.add(m);
      }
    } else if (nome === 'footprint') {
      this._svuota(g);
      for (const ist of this.arredo.istanze) {
        for (const [x, y, z] of ist.celle) {
          const m = new THREE.Mesh(this._geoBox, this._matCella);
          m.position.set(x + 0.5, y + 0.5, z + 0.5);
          m.renderOrder = 10;
          g.add(m);
        }
      }
    } else if (nome === 'chunk') {
      this._svuota(g);
      for (const [kc, e] of this.mesher.chunks) {
        const [cx, cz] = kc.split(',').map(Number);
        e.solidi.geometry.computeBoundingBox();
        const bb = e.solidi.geometry.boundingBox;
        if (!bb || bb.isEmpty()) continue;
        const m = new THREE.Mesh(this._geoBox, this._matChunk);
        const alto = Math.max(1, bb.max.y - bb.min.y);
        m.scale.set(CHUNK, alto, CHUNK);
        m.position.set(cx * CHUNK + CHUNK / 2, bb.min.y + alto / 2, cz * CHUNK + CHUNK / 2);
        g.add(m);
      }
    }
  }

  // ---- loop ------------------------------------------------------------------

  aggiorna(dt) {
    this._frame++; this._acc += dt;
    if (this._acc >= 0.5) { this._fps = Math.round(this._frame / this._acc); this._frame = 0; this._acc = 0; }
    if (!this.aperto) return;

    if (this.gruppi.hitbox.visible) {
      const p = this.controller.pos;
      this._hitMesh.position.set(p.x, p.y + FISICA.altezza / 2, p.z);
    }
    const info = this.rig.renderer.info.render;
    const luci = statLuci();
    const st = this.mesher.statistiche;
    const imp = statImpatti();
    // i fatui sono un modulo opzionale: il pannello non deve pretenderlo
    const fatui = this.fuochiFatui ? this.fuochiFatui.statistiche() : null;
    this.elStat.textContent =
      `${this._fps} fps · ${(info.triangles / 1000).toFixed(1)}k tri · ${info.calls} draw\n` +
      `${this.mondo.contaBlocchi} blocchi · ${st.chunkAttivi} chunk · rimesh ${st.ultimaMs.toFixed(1)} ms\n` +
      // occMs è il costo dell'ULTIMO aggiornamento: quasi sempre quello LOCALE
      // (poche celle, frazioni di ms), non la griglia intera. Il conteggio delle
      // celle è invece la taglia della griglia, che cambia solo coi ricalcoli pieni.
      // TRE STATI, TRE ETICHETTE: "spenta" era la stessa riga anche quando il
      // paracadute LUCE_LIMITE_CELLE scattava, cioè un guasto travestito da
      // preferenza dell'utente.
      `occlusione ${luceTesto(st, this.mesher.guasti())}\n` +
      // IL TETTO LUCI_MAX VA VISTO: `escluse` sono le sorgenti attive che non
      // sono entrate nel frame, `sfumate` quelle che si stanno congedando sul
      // bordo (vedi FASCIA_TAGLIO in materials.js). Prima si vedeva solo
      // "inviate 24" e le altre sparivano senza che nulla lo dicesse.
      `luci ${luci.attive}/${luci.totali} (inviate ${luci.inviate}, ${luci.conOmbra} con ombra · ${luci.pesanti} pesanti${luci.escluse ? ` · ⚠ ${luci.escluse} oltre il tetto, ${luci.sfumate} in dissolvenza` : ''}) · furni ${this.arredo.istanze.length}\n` +
      (fatui && fatui.nidi ? `fuochi fatui ${fatui.vivi}/${fatui.chiesti} vivi in ${fatui.nidi} nidi${fatui.chiesti > fatui.tetto ? ` ⚠ tetto ${fatui.tetto}` : ''}\n` : '') +
      `anelli d'impatto ${imp.mostrati}/${imp.totali}${imp.totali > imp.mostrati ? ' ⚠ oltre il tetto' : ''}\n` +
      `gatto ${this.controller.pos.x.toFixed(1)}, ${this.controller.pos.y.toFixed(1)}, ${this.controller.pos.z.toFixed(1)}${this.controller.vola ? ' · ✈️' : ''}`;
  }
}
