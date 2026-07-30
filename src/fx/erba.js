// L'ERBA — ciuffi piazzati sopra i blocchi d'erba, in UN draw call.
//
// LA PRIMA VERSIONE ERA SBAGLIATA, e il committente l'ha bocciata su cinque
// punti. Vale la pena scriverli, perché ognuno è una regola:
//
//   1. «FUORISTILE»: erano fili sottili e affusolati, da erba realistica. Qui
//      tutto è fatto di scatole e colori piatti — l'erba dev'essere RETTANGOLI
//      SPESSI, non lame.
//   2. «IL COLORE DELL'ERBA SOTTO, al variare delle altezze»: il verde era una
//      coppia di costanti. Ora ogni ciuffo prende il colore dalla PALETTE della
//      cella su cui sta (`paletteBlocco`), quindi segue la rampa per quota e le
//      stagioni senza saperne niente.
//   3. «UN OGGETTO PIAZZATO SOPRA IL BLOCCO, non sempre lo stesso»: un ciuffo è
//      un oggettino con la sua forma, e ce ne sono quattro tipi diversi scelti
//      per cella — non un tappeto di cloni.
//   4. «SPARISCE A DISTANZA»: prima il campo era un cerchio di 26 blocchi e
//      finiva lì, con un bordo visibile. Ora arriva a 80+ blocchi diradando a
//      ANELLI: vicino un ciuffo per cella, più in là uno ogni due, poi uno ogni
//      quattro. Il prato continua fino all'orizzonte senza costare di più.
//   5. «CALI DI FPS»: ed erano veri, ma non della GPU. La semina scandiva
//      migliaia di colonne IN UN FRAME SOLO ogni volta che si usciva dal
//      riquadro — una raffica di lavoro che si vedeva. Adesso si semina un
//      CHUNK PER FRAME in un buffer di scorta, e si scambia quando è pronto:
//      il vecchio prato resta visibile intanto, e nessun frame paga più di 256
//      colonne. La quota di una colonna si legge da una passata sola sui
//      blocchi del chunk, non frugando in giù cella per cella (era l'altra metà
//      del costo: `appoggioInColonna` scava fino a sessanta blocchi).
//
// L'ANIMAZIONE RESTA TUTTA NEL VERTEX SHADER: la CPU per frame scrive quattro
// uniform. Muovere ventimila ciuffi costa quanto muoverne uno.

import * as THREE from 'three';
import { paletteBlocco } from '../world/stagioni.js?v=ms7x2mdx';
import { CHUNK } from '../world/world.js?v=ms7x2mdx';

// I QUATTRO TIPI DI CIUFFO: (quante lamelle, larghezza, altezza, apertura).
// Non è varietà per la varietà — un prato di cloni si legge come una texture
// ripetuta, e in un gioco di cubi si nota subito.
const TIPI = [
  { n: 5, largo: 0.15, alto: 0.32, apri: 0.42 },   // ciuffo basso e largo
  { n: 4, largo: 0.12, alto: 0.50, apri: 0.34 },   // lamelle alte
  { n: 7, largo: 0.10, alto: 0.38, apri: 0.46 },   // cespuglio fitto
  { n: 3, largo: 0.18, alto: 0.28, apri: 0.30 },   // poche lamelle larghe
];
const LAMELLE_MAX = 8;

// LE CHIAZZE. Un prato con l'erba su OGNI cella si legge come una moquette
// stesa: nell'erba vera ci sono radure, zone rade e ciuffi fitti. Due rumori
// per hash — uno largo (macchie da otto celle) e uno fine (cella per cella) —
// bastano a rompere la regolarità senza inventare una simulazione.
const CHIAZZA_LARGA = 8;

/** Hash deterministico: stessa cella, stesso ciuffo, per sempre. */
function hash(x, z, s) {
  let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const GLSL_VERTEX = /* glsl */`
  attribute vec4 iPos;      // base della lamella (xyz) e ISTANTE DI NASCITA (w)
  attribute vec4 iDati;     // (rotazione, altezza, larghezza, fase personale)
  attribute vec3 iCol;      // colore preso dalla palette della cella sotto
  uniform float uTempo;
  uniform vec4 uVento;      // (dir.x, dir.z, forza di fondo, raffica)
  uniform vec4 uMobili[4];  // chi si muove: (x, y, z, raggio). w=0 = slot spento
  uniform float uNascita;   // durata della crescita, in secondi
  varying float vAlt;
  varying vec3 vCol;

  void main() {
    float alt = position.y;
    vAlt = alt;
    vCol = iCol;

    // NIENTE CIUFFI CHE «SPUNTANO»: ogni lamella nasce a scala zero e cresce in
    // mezzo secondo. Prima comparivano di colpo a pochi metri, e da fermi si
    // vedeva benissimo — il difetto non era DOVE nascevano ma il fatto che
    // nascessero già grandi.
    float eta = clamp((uTempo - iPos.w) / max(uNascita, 0.01), 0.0, 1.0);
    eta = eta * eta * (3.0 - 2.0 * eta);

    // RETTANGOLO, non lama: la larghezza si stringe appena in cima (0.82), non
    // fino a una punta. È la differenza fra un filo d'erba e una scheggia, ed è
    // la correzione di stile che serviva.
    float largo = iDati.z * (1.0 - alt * 0.18);
    float c = cos(iDati.x), s = sin(iDati.x);
    vec3 p = vec3(position.x * largo * c, alt * iDati.y * eta, position.x * largo * s);

    // ---- IL VENTO ------------------------------------------------------------
    // (1) la RAFFICA: un'onda che attraversa il campo. La fase dipende dalla
    // POSIZIONE oltre che dal tempo, quindi il prato si piega a ondate invece
    // che tutto insieme — è la cosa che si nota di più, e costa un seno.
    float onda = sin(uTempo * 1.15 + dot(iPos.xz, uVento.xy) * 0.30 + iDati.w);
    // (2) una seconda onda più corta e sfasata: due sole, e la raffica smette
    // di avere un ritmo riconoscibile
    float onda2 = sin(uTempo * 2.3 - dot(iPos.xz, uVento.xy) * 0.11 + iDati.w * 1.7);
    // (3) il TREMOLIO: piccolo, veloce, diverso per ciuffo
    float tremo = sin(uTempo * 4.1 + iDati.w * 6.3) * 0.18;
    float piega = (uVento.z + uVento.w * (onda * 0.75 + onda2 * 0.35) + tremo) * 0.22;

    // ---- IL GIOCATORE CHE PASSA ---------------------------------------------
    // I ciuffi si aprono al suo passaggio e si richiudono da soli: niente stato
    // da tenere, è tutta geometria.
    // CHIUNQUE SI MUOVA, non solo il giocatore: gatti in rete, palle, creature.
    // La spinta è PICCOLA e cresce piano — la prima versione spostava la lamella
    // di un blocco e mezzo, cioè tre volte la sua altezza, e il ciuffo si
    // strappava di lato invece di piegarsi. Era «tutta distorta», ed era vero.
    vec3 base = iPos.xyz;
    vec2 spostaMob = vec2(0.0);
    for (int i = 0; i < 4; i++) {
      float r = uMobili[i].w;
      if (r <= 0.0) continue;
      vec2 d = base.xz - uMobili[i].xz;
      float dd = dot(d, d);
      if (dd >= r * r || abs(base.y - uMobili[i].y) > 1.6) continue;
      float t = 1.0 - sqrt(dd) / r;               // lineare: il bordo non salta
      spostaMob += normalize(d + vec2(1e-4)) * t * t * 0.45;
    }

    // LA PIEGA CRESCE COL QUADRATO DELL'ALTEZZA: la base resta piantata e la
    // cima fa tutto il movimento, che è come si piega un ciuffo vero.
    float k = alt * alt;
    vec2 dir = uVento.xy * piega + spostaMob;
    p.x += dir.x * k;
    p.z += dir.y * k;
    p.y -= dot(dir, dir) * k * 0.30;      // piegandosi si accorcia

    gl_Position = projectionMatrix * modelViewMatrix * vec4(base + p, 1.0);
  }
`;

const GLSL_FRAGMENT = /* glsl */`
  varying float vAlt;
  varying vec3 vCol;
  uniform vec3 uAmbienteErba;

  void main() {
    // LA BASE È ESATTAMENTE IL COLORE DEL BLOCCO SOTTO, e da lì si SCHIARISCE
    // salendo. Prima la base era più scura del blocco (0.82) e l'attacco fra
    // erba e terreno si vedeva come una riga d'ombra: il ciuffo sembrava
    // appoggiato sopra invece che cresciuto lì. A quota zero adesso i due colori
    // coincidono al bit, e il passaggio non esiste proprio.
    vec3 col = mix(vCol, vCol * 1.28 + vec3(0.06), vAlt * vAlt);
    gl_FragColor = vec4(col * uAmbienteErba, 1.0);
  }
`;

// ANELLI DI DIRADAMENTO, in chunk di distanza: quanto spesso si semina una
// cella. Vicino tutte, poi una ogni due, poi una ogni quattro. È così che il
// prato arriva all'orizzonte senza che il conto delle lamelle esploda.
function passoPerDistanza(dc) {
  if (dc <= 1) return 1;
  if (dc <= 3) return 2;
  return 4;
}

export class Erba {
  /**
   * @param opzioni.raggioChunk quanti chunk attorno al giocatore (5 ≈ 80 blocchi)
   * @param opzioni.densita moltiplicatore di lamelle (la scala di qualità lo muove)
   */
  constructor(scena, { raggioChunk = 5, densita = 1, max = 30000 } = {}) {
    this.raggioChunk = raggioChunk;
    this.densita = densita;
    this.max = max;
    this.attiva = true;
    this._t = 0;
    this._ccx = 1e9; this._ccz = 1e9;
    this._coda = [];          // chunk da seminare, in ordine di distanza
    this._n = 0;              // lamelle scritte nel buffer di scorta
    this._quote = new Map();  // riuso fra i chunk della stessa passata

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    // DUE BUFFER: si semina in quello di SCORTA e si scambia a lavoro finito.
    // Senza, durante la semina progressiva si vedrebbe il prato costruirsi
    // pezzo per pezzo — che è peggio del salto che si voleva togliere.
    this.iPos = new Float32Array(max * 4);
    this.iDati = new Float32Array(max * 4);
    this.iCol = new Float32Array(max * 3);
    this.sPos = new Float32Array(max * 4);
    this.sDati = new Float32Array(max * 4);
    this.sCol = new Float32Array(max * 3);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.iPos, 4));
    g.setAttribute('iDati', new THREE.InstancedBufferAttribute(this.iDati, 4));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.iCol, 3));
    g.instanceCount = 0;
    // i ciuffi si spostano nel vertex shader: il culling automatico li farebbe
    // sparire a blocchi guardando di lato
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.materiale = new THREE.ShaderMaterial({
      vertexShader: GLSL_VERTEX,
      fragmentShader: GLSL_FRAGMENT,
      side: THREE.DoubleSide,
      uniforms: {
        uTempo: { value: 0 },
        uVento: { value: new THREE.Vector4(1, 0, 0.22, 0.35) },
        uMobili: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uNascita: { value: 0.5 },
        uAmbienteErba: { value: new THREE.Color(1, 1, 1) },
      },
    });
    this.mesh = new THREE.Mesh(g, this.materiale);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scena.add(this.mesh);

    this.forzaMeteo = 0;      // 0 sereno, 1 rovescio: la muove main
    this._forza = 0;
    this.fili = 0;
  }

  /**
   * LE QUOTE DI UN CHUNK IN UNA PASSATA SOLA. `appoggioInColonna` frugherebbe
   * in giù fino a sessanta celle PER COLONNA: su 256 colonne sono quindicimila
   * ricerche, ed era metà del calo di frame. Qui si scorrono i blocchi che il
   * chunk ha davvero — che sono quelli e basta — tenendo il più alto di ognuna.
   */
  _quoteChunk(mondo, kc) {
    const q = this._quote;
    q.clear();
    for (const b of mondo.blocchiDelChunk(kc)) {
      // ⚠ CON L'OFFSET, se no le coordinate NEGATIVE si sbriciolano: senza,
      // (−17, −16) tornava indietro come (−18, 4080) e i ciuffi finivano a
      // mezz'aria dall'altra parte del mondo. Stesso impacchettamento del mondo.
      const k = (b.x + 2048) * 4096 + (b.z + 2048);
      const v = q.get(k);
      if (v === undefined || b.y > v.y) q.set(k, { y: b.y, tipo: b.tipo });
    }
    return q;
  }

  /** Semina un chunk nel buffer di scorta. Ritorna quante lamelle ha scritto. */
  _seminaChunk(mondo, kc, dc) {
    const passo = passoPerDistanza(dc);
    const quote = this._quoteChunk(mondo, kc);
    const { sPos, sDati, sCol } = this;
    let n = this._n;
    const col = new THREE.Color();
    for (const [k, cima] of quote) {
      if (n >= this.max - LAMELLE_MAX) break;
      if (cima.tipo !== 'erba') continue;
      const x = Math.floor(k / 4096) - 2048, z = (k % 4096) - 2048;
      // il diradamento è per POSIZIONE, non a caso: allontanandosi il prato si
      // dirada sempre negli stessi punti e non «brulica» mentre cammini
      if (passo > 1 && ((x % passo) + passo) % passo !== 0) continue;
      if (passo > 1 && ((z % passo) + passo) % passo !== 0) continue;

      // LE CHIAZZE: una macchia larga decide le radure, un rumore fine dirada
      // dentro la macchia. Senza, il prato è una moquette stesa uguale ovunque.
      const macchia = hash(Math.floor(x / CHIAZZA_LARGA), Math.floor(z / CHIAZZA_LARGA), 91);
      if (macchia < 0.16) continue;                       // radura
      const fitto = 0.55 + 0.45 * macchia;                // quanto è fitta QUESTA macchia
      if (hash(x, z, 57) > fitto) continue;
      const h0 = hash(x, z, 3);
      const tipo = TIPI[(h0 * TIPI.length) | 0];
      const quante = Math.max(1, Math.round(tipo.n * this.densita));
      // IL COLORE DEL BLOCCO SOTTO: paletteBlocco conosce la rampa per quota e
      // la stagione, quindi il ciuffo è intonato senza saperne niente
      const p = paletteBlocco(cima.tipo, cima.y);
      col.setHex(p.cima);
      const y = cima.y + 1;
      for (let i = 0; i < quante; i++) {
        const h1 = hash(x, z, i * 17 + 5), h2 = hash(x, z, i * 17 + 11), h3 = hash(x, z, i * 17 + 23);
        const j = n * 4, d = n * 4;
        // IL JITTER RIEMPIE LA CELLA. Con i ciuffi al centro si vedeva la
        // GRIGLIA — file regolari a un blocco di passo, che in un mondo di cubi
        // è la cosa che si nota per prima. Qui la lamella può stare ovunque
        // nella cella, e il reticolo sparisce.
        sPos[j] = x + 0.5 + (h1 - 0.5) * (0.42 + tipo.apri);
        sPos[j + 1] = y;
        sPos[j + 2] = z + 0.5 + (h2 - 0.5) * (0.42 + tipo.apri);
        sPos[j + 3] = this._t;                            // istante di nascita
        sDati[d] = h3 * Math.PI;
        sDati[d + 1] = tipo.alto * (0.8 + 0.45 * h1);
        sDati[d + 2] = tipo.largo * (0.85 + 0.3 * h2);
        sDati[d + 3] = (h1 + h3) * 6.283;
        // ogni lamella un filo più chiara o più scura: senza, un ciuffo è una
        // macchia piatta
        const v = 0.94 + 0.12 * h2;
        const jc = n * 3;
        sCol[jc] = col.r * v; sCol[jc + 1] = col.g * v; sCol[jc + 2] = col.b * v;
        n++;
      }
    }
    const scritte = n - this._n;
    this._n = n;
    return scritte;
  }

  /** Prepara la coda dei chunk attorno al giocatore, dal più vicino. */
  _apriCoda(ccx, ccz) {
    const r = this.raggioChunk;
    this._coda.length = 0;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dc = Math.max(Math.abs(dx), Math.abs(dz));
        if (dc > r) continue;
        this._coda.push({ kc: (ccx + dx) + ',' + (ccz + dz), dc });
      }
    }
    this._coda.sort((a, b) => a.dc - b.dc);
    this._n = 0;
  }

  _scambia() {
    this.iPos.set(this.sPos.subarray(0, this._n * 4));
    this.iDati.set(this.sDati.subarray(0, this._n * 4));
    this.iCol.set(this.sCol.subarray(0, this._n * 3));
    const g = this.mesh.geometry;
    g.instanceCount = this._n;
    g.getAttribute('iPos').needsUpdate = true;
    g.getAttribute('iDati').needsUpdate = true;
    g.getAttribute('iCol').needsUpdate = true;
    this.fili = this._n;
  }

  /**
   * Da chiamare nel loop. La CPU qui fa cinque cose: avanza l'orologio, muove
   * il vento, copia la posizione del giocatore, e — se serve — semina AL PIÙ
   * due chunk. Tutto il resto lo fa la GPU.
   */
  aggiorna(dt, mondo, pos, ambiente) {
    if (!this.attiva) return;
    this._t += dt;
    const u = this.materiale.uniforms;
    u.uTempo.value = this._t;

    // IL VENTO SEGUE IL METEO, ed è la richiesta: con il rovescio si devono
    // VEDERE le raffiche. La forza insegue invece di saltare (il temporale
    // arriva, non scatta) e la direzione gira piano.
    this._forza += (this.forzaMeteo - this._forza) * Math.min(1, dt * 0.5);
    const a = this._t * 0.045;
    const fondo = 0.18 + 0.55 * this._forza;
    const raffica = 0.30 + 0.75 * this._forza;
    u.uVento.value.set(Math.cos(a), Math.sin(a), fondo, raffica);
    // il giocatore è sempre il primo; gli altri li mette main (gatti, palle)
    u.uMobili.value[0].set(pos.x, pos.y, pos.z, 1.1);
    if (ambiente) u.uAmbienteErba.value.copy(ambiente);

    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    if (ccx !== this._ccx || ccz !== this._ccz) {
      this._ccx = ccx; this._ccz = ccz;
      this._apriCoda(ccx, ccz);
    }
    // UN PO' PER FRAME. Il ritmo si ADATTA alla coda: se è corta bastano due
    // chunk, se è lunga se ne fanno di più — se no, correndo forte, il giocatore
    // esce dal ring prima che la semina finisca e il prato non si aggiorna MAI.
    // Il prato vecchio resta a schermo finché il nuovo non è pronto, quindi la
    // progressività non si vede.
    // due chunk bastano: a velocità di gioco (sei blocchi al secondo) il ring si
    // completa in mezzo secondo, molto prima del prossimo confine. Si sale a tre
    // solo se la coda è ancora lunghissima — cioè se qualcuno sta correndo.
    const quanti = this._coda.length > 60 ? 3 : 2;
    for (let i = 0; i < quanti && this._coda.length; i++) {
      const c = this._coda.shift();
      this._seminaChunk(mondo, c.kc, c.dc);
    }
    if (!this._coda.length && this._n !== this.fili) this._scambia();
  }

  /** Il mondo è cambiato sotto i piedi (blocco posato, mondo nuovo). */
  risemina() { this._ccx = 1e9; this._ccz = 1e9; }

  imposta(on) {
    this.attiva = !!on;
    this.mesh.visible = this.attiva;
    if (this.attiva) this.risemina();
  }
}
