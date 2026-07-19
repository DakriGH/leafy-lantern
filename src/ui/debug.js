// Menu di debug (F3): il banco di prova del motore.
// Statistiche vive, preset del tempo, generazione mondo con snapshot,
// overlay diagnostici (raggi luci, footprint furni, bordi chunk, hitbox)
// e comandi player (volo, respawn, lampioni forzati).

import * as THREE from 'three';
import { CHUNK } from '../world/world.js';
import { elencoLuci, statLuci, statImpatti, memoriaVoxel } from '../fx/materials.js';
import { FISICA } from '../config.js';

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

const HTML = /* html */`
  <div class="dbg-testa"><span>🐞 Debug</span><button data-az="chiudi" title="Chiudi (F3)">×</button></div>

  <div class="dbg-sez"><pre class="dbg-stat" data-el="stat">…</pre></div>

  <div class="dbg-sez">
    <div class="dbg-tit">⏱ Tempo</div>
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
    <div class="dbg-tit">🌍 Mondo</div>
    <div class="dbg-riga">
      <button data-az="snapshot" title="Salva il mondo attuale (2 livelli)">📸 Snapshot</button>
      <button data-az="ripristina" title="Torna all'ultimo snapshot">↩️ Ripristina</button>
      <button data-az="isola">🏝 Isola demo</button>
    </div>
    <div class="dbg-riga">
      <button data-az="arcipelago">🌌 Arcipelago</button>
      <button data-az="open">⛰ Open world</button>
      <button data-az="mostra" title="Mondo piatto con TUTTI i blocchi separati, per provarli">🧪 Sala prove</button>
      <button data-az="collaudo" title="Sei zone per guardare luci e acqua: terrazze, grotta, tettoia, muro, cascata, piano nudo">🔦 Collaudo luci</button>
      <button data-az="testLuci" title="Mondo di SOLA luce: pesante vs leggera, occlusione difficile, colori che si mescolano, fuochi fatui e il tetto delle 48 piastrelle">💡 Test delle luci</button>
      <label>seme <input data-el="seme" type="number" value="42" min="0" max="99999"></label>
      <label>raggio <select data-el="est">
        <option value="32">32</option><option value="48" selected>48</option>
        <option value="64">64</option><option value="96">96</option>
      </select></label>
    </div>
    <div class="dbg-riga" data-el="zone" style="display:none"></div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">📷 AR</div>
    <div class="dbg-riga">
      <button data-az="arProva" title="Avvia l'AR con una camera FINTA che inquadra il marker: se il diorama appare, motore e marker funzionano">🧪 AR di prova (camera finta)</button>
    </div>
    <div class="dbg-tit">🎞 Vista</div>
    <div class="dbg-riga">
      fog
      <button data-az="fog" data-f="1">vicina</button>
      <button data-az="fog" data-f="0.45">media</button>
      <button data-az="fog" data-f="0.18">lontana</button>
      <span class="dbg-sep"></span>
      tilt‑shift
      <button data-az="ts" data-q="0">off</button>
      <button data-az="ts" data-q="1.5">leggero</button>
      <button data-az="ts" data-q="2.6">pieno</button>
    </div>
    <div class="dbg-riga">
      acqua
      <button data-az="riflessi">✨ riflessi</button>
      <span class="dbg-sep"></span>
      meteo
      <button data-az="pioggia">🌧 pioggia</button>
    </div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">👁 Overlay</div>
    <div class="dbg-riga dbg-colonna">
      <label><input type="checkbox" data-ov="luci"> 💡 Raggi delle luci-sfera</label>
      <label><input type="checkbox" data-ov="footprint"> 🪑 Footprint dei furni</label>
      <label><input type="checkbox" data-ov="chunk"> 🧩 Bordi dei chunk</label>
      <label><input type="checkbox" data-ov="hitbox"> 🐱 Hitbox del gatto</label>
    </div>
  </div>

  <div class="dbg-sez">
    <div class="dbg-tit">🌐 P2P di prova <span style="opacity:.6">(WebRTC, cifrato DTLS)</span> <span data-el="netStato">⭘</span></div>
    <div class="dbg-riga">
      <button data-az="netCrea">🎬 Crea partita</button>
      <span style="font-size:10px;opacity:.6">oppure incolla l'offerta e</span>
      <button data-az="netGenera">🚪 Genera risposta</button>
    </div>
    <textarea data-el="netA" rows="2" placeholder="codice OFFERTA (l'host lo crea, l'ospite lo incolla qui)"></textarea>
    <div class="dbg-riga">
      <button data-az="netCopiaA">📋 Copia offerta</button>
      <button data-az="netConferma">✅ Conferma risposta (host)</button>
      <button data-az="netCopiaB">📋 Copia risposta</button>
    </div>
    <textarea data-el="netB" rows="2" placeholder="codice RISPOSTA (l'ospite lo genera, l'host lo incolla qui)"></textarea>
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
    this.elNetA = this.el.querySelector('[data-el="netA"]');
    this.elNetB = this.el.querySelector('[data-el="netB"]');
    this.elNetStato = this.el.querySelector('[data-el="netStato"]');
    this.elZone = this.el.querySelector('[data-el="zone"]');

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

    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('change', (e) => {
      const ov = e.target.getAttribute && e.target.getAttribute('data-ov');
      if (ov) this._toggleOverlay(ov, e.target.checked);
    });
  }

  toggle(apri = !this.aperto) {
    this.aperto = apri;
    this.el.style.display = apri ? 'block' : 'none';
    if (apri) this.sincronizza();
  }

  sincronizza() {
    this.btnVolo.classList.toggle('attivo', this.controller.vola);
    this.btnPausa.textContent = this.ciclo.auto ? '⏸' : '▶';
  }

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
    else if (az === 'ora') { this.ciclo.t = Number(b.getAttribute('data-t')); this.ciclo.aggiorna(0); }
    else if (az === 'pausa') { this.ciclo.auto = !this.ciclo.auto; this.sincronizza(); }
    else if (az === 'vel') { this.ciclo.durata = Number(b.getAttribute('data-d')); this.ciclo.auto = true; this.sincronizza(); this.hud.toast(`Giorno di ${this.ciclo.durata}s`); }
    else if (az === 'stagione') this.azioni.stagione(b.getAttribute('data-s'));
    else if (az === 'snapshot') this.azioni.snapshot();
    else if (az === 'ripristina') this.azioni.ripristina();
    else if (az === 'isola') this.azioni.isolaDemo();
    else if (az === 'arcipelago') this.azioni.arcipelago(Number(this.elSeme.value) || 0, Number(this.elEst.value));
    else if (az === 'open') this.azioni.openWorld(Number(this.elSeme.value) || 0, Number(this.elEst.value));
    else if (az === 'mostra') this.azioni.salaProve();
    else if (az === 'collaudo') this.azioni.collaudo();
    else if (az === 'testLuci') this.azioni.testLuci();
    else if (az === 'fog') this.azioni.fog(Number(b.getAttribute('data-f')));
    else if (az === 'ts') this.azioni.tiltShift(Number(b.getAttribute('data-q')));
    else if (az === 'arProva') this.azioni.arProva();
    else if (az === 'riflessi') b.classList.toggle('attivo', this.azioni.riflessi());
    else if (az === 'pioggia') b.classList.toggle('attivo', this.azioni.pioggia());
    else if (az === 'inf') b.classList.toggle('attivo', this.azioni.infinito());
    else if (az === 'netCrea') this.azioni.netCrea();
    else if (az === 'netGenera') this.azioni.netGenera(this.elNetA.value);
    else if (az === 'netConferma') this.azioni.netConferma(this.elNetB.value);
    else if (az === 'netCopiaA') this._copia(this.elNetA);
    else if (az === 'netCopiaB') this._copia(this.elNetB);
    else if (az === 'volo') { this.controller.imposta_volo(!this.controller.vola); this.sincronizza(); }
    else if (az === 'respawn') this.azioni.respawn();
    else if (az === 'lamp') this._lampade(b.getAttribute('data-m'));
    this._rinfrescaOverlay();
  }

  _copia(area) {
    area.select();
    if (navigator.clipboard) navigator.clipboard.writeText(area.value).catch(() => {});
    this.hud.toast('📋 Copiato');
  }

  setNet(campo, valore) {
    (campo === 'A' ? this.elNetA : this.elNetB).value = valore;
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
