// LE FOGLIE — quadrati ruotati stesi a terra in AMMASSI, e quando ci cammini
// dentro schizzano via. Un draw call, come l'erba.
//
// TRE COSE CHE LE DISTINGUONO DALL'ERBA, e non sono dettagli:
//
//  · SONO AMMASSI, non un tappeto. L'erba si dirada per chiazze ma copre tutto
//    il prato; le foglie stanno in mucchi tondi, a distanza l'uno dall'altro,
//    con in mezzo terreno pulito. Il mucchio si costruisce attorno a un CENTRO
//    (hash della cella grossa) con caduta radiale: fitto in mezzo, sfilacciato
//    ai bordi. Un mucchio quadrato si riconoscerebbe subito.
//
//  · SI CALPESTANO SUL SERIO. Il calpestio non è solo un'animazione: le foglie
//    di quella cella se ne VANNO (istanze azzerate) e la cella resta segnata,
//    così non ricrescono dietro le spalle al primo riseminamento. Il mucchio
//    torna solo quando ci si allontana e si ritorna. Le particelle che partono
//    le tira main, con il colore di QUESTO mucchio.
//
//  · HANNO LA FORMA DI UNA FOGLIA, ritagliata nel fragment shader: allungata,
//    con la punta da una parte e il picciolo dall'altra. Un ovale simmetrico si
//    legge come un PETALO — cioè come un fiore — ed è stato bocciato per questo.
//    La rotazione è anche il canale del calpestio: girano su se stesse mentre
//    volano via.
//
// IL VENTO NON LE TOCCA, ed è una scelta, non una dimenticanza: una foglia
// caduta non è attaccata a niente. Se il vento la muove, o vola via — e allora
// non è più lì — oppure resta ferma. Un mucchio che ondeggia sul posto è la
// peggiore delle due, perché sembra piantato. Si muovono SOLO quando qualcosa
// ci passa dentro.

import * as THREE from 'three';
import { CHUNK } from '../world/world.js?v=ms8osh8u';

// I due tipi di mucchio. Le secche sono la regola, il ciliegio la sorpresa.
const TIPI = [
  { peso: 0.68, colori: [0xc98a3a, 0xb5702c, 0xd7a24e, 0x9c5a24] },   // secche
  { peso: 0.32, colori: [0xf2a8c4, 0xe58bb0, 0xf7c2d6, 0xd97a9e] },   // ciliegio
];
const FOGLIE_MAX_CELLA = 12;
const AMMASSO_PASSO = 7;        // ogni quante celle si tenta un mucchio
const AMMASSO_QUANTI = 0.34;    // frazione di celle grosse che ne ospitano uno
const CACHE_CHUNK = 320;        // chunk già seminati tenuti da parte (vedi fx/erba.js)
const SENZA_CIMA = -32768;      // colonna vuota nell'array piatto delle quote
const BUDGET_MS = 0.35;         // quanto può durare la semina in un frame

/** Hash deterministico: stessa cella, stesso mucchio, per sempre. */
function hash(x, z, s) {
  let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Chiave numerica di cella, con offset per le coordinate NEGATIVE: senza,
 *  (−17,−16) tornerebbe indietro come un'altra cella (è già successo con l'erba). */
function chiave(x, z) { return (x + 2048) * 4096 + (z + 2048); }

/**
 * Il mucchio che copre questa cella, se c'è: { forza 0..1, tipo }.
 * È una funzione PURA dell'hash — la usano sia la semina sia le particelle del
 * calpestio, e non c'è niente da tenere in memoria.
 */
export function ammassoDi(x, z) {
  const px = Math.floor(x / AMMASSO_PASSO), pz = Math.floor(z / AMMASSO_PASSO);
  if (hash(px, pz, 401) > AMMASSO_QUANTI) return null;
  // centro sparso dentro la cella grossa: mucchi allineati alla griglia si
  // vedono come mucchi allineati alla griglia
  const cx = px * AMMASSO_PASSO + hash(px, pz, 403) * AMMASSO_PASSO;
  const cz = pz * AMMASSO_PASSO + hash(px, pz, 407) * AMMASSO_PASSO;
  const raggio = 1.4 + hash(px, pz, 409) * 1.9;
  const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
  if (d > raggio) return null;
  const forza = 1 - (d / raggio) * (d / raggio);      // fitto al centro
  const h = hash(px, pz, 411);
  return { forza, tipo: h < TIPI[0].peso ? 0 : 1 };
}

const GLSL_VERTEX = /* glsl */`
  attribute vec4 iPos;      // posizione (xyz) e ISTANTE DI NASCITA (w)
  attribute vec4 iDati;     // (rotazione, lato, inclinazione, fase)
  attribute vec3 iCol;
  uniform float uTempo;
  uniform vec4 uMobili[4];  // chi si muove: (x, y, z, raggio). w=0 = slot spento
  uniform float uNascita;
  varying vec3 vCol;
  varying float vLuce;
  varying vec2 vUv;

  void main() {
    vUv = position.xz * 2.0;      // −1..1 dentro il quadrato: serve alla sagoma
    // come l'erba: nasce a scala zero e cresce, così nessuna foglia «spunta»
    float eta = clamp((uTempo - iPos.w) / max(uNascita, 0.01), 0.0, 1.0);
    eta = eta * eta * (3.0 - 2.0 * eta);
    float lato = iDati.y * eta;

    // ---- CHI CI CAMMINA DENTRO ----------------------------------------------
    // Le foglie vicine a un corpo in movimento si sollevano, scappano verso
    // fuori e GIRANO su se stesse. La spinta è più larga e più alta di quella
    // dell'erba: un ciuffo si piega, un mucchio di foglie esplode.
    vec3 fuga = vec3(0.0);
    float giro = 0.0;
    for (int i = 0; i < 4; i++) {
      float r = uMobili[i].w;
      if (r <= 0.0) continue;
      vec2 d = iPos.xz - uMobili[i].xz;
      float dd = dot(d, d);
      if (dd >= r * r || abs(iPos.y - uMobili[i].y) > 1.4) continue;
      float t = 1.0 - sqrt(dd) / r;
      fuga.xz += normalize(d + vec2(1e-4)) * t * t * 0.55;
      fuga.y += sin(t * 3.14159) * 0.30;
      giro += t * t * 5.0;
    }

    // ---- NIENTE VENTO -------------------------------------------------------
    // Le foglie ondeggiavano con la raffica come fa l'erba, e il committente
    // l'ha bocciato con una ragione che è più forte dell'estetica: una foglia
    // CADUTA non è attaccata a niente. Se il vento la muove, o vola via — e
    // allora non è più lì — oppure resta ferma. Un mucchio che ondeggia sul
    // posto è la cosa peggiore delle due, perché sembra piantato.
    //
    // Restano ferme, e si muovono SOLO quando qualcosa ci passa dentro.
    float ang = iDati.x + giro;

    // quadrato piatto: inclinato appena su un asse, poi girato attorno a Y
    float ct = cos(iDati.z), st = sin(iDati.z);
    vec3 l = vec3(position.x * lato, 0.0, position.z * lato);
    vec3 t3 = vec3(l.x, -l.z * st, l.z * ct);
    float c = cos(ang), s = sin(ang);
    vec3 p = vec3(t3.x * c - t3.z * s, t3.y, t3.x * s + t3.z * c);

    vec3 base = iPos.xyz + fuga;

    // la faccia prende luce diversa secondo come s'è girata: senza, un mucchio
    // è una macchia unica di colore piatto
    vLuce = 0.90 + 0.10 * cos(ang * 2.0 + iDati.w);
    vCol = iCol;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(base + p, 1.0);
  }
`;

const GLSL_FRAGMENT = /* glsl */`
  varying vec3 vCol;
  varying float vLuce;
  varying vec2 vUv;
  uniform vec3 uAmbienteFoglie;
  void main() {
    // NON un quadrato e NON un petalo tondo: una FOGLIA. La goccia simmetrica
    // di prima si leggeva come un fiore — è il rilievo del committente, e aveva
    // ragione: un ovale regolare è un petalo, non una foglia caduta.
    //
    // Tre correzioni, tutte nella stessa riga di distanza:
    //  · ALLUNGATA, non tonda: una foglia è lunga il doppio che larga;
    //  · una PUNTA da una parte e un PICCIOLO stretto dall'altra (il termine
    //    cubico rompe la simmetria fra le due estremità);
    //  · un rientro appena accennato ai fianchi, che è quello che distingue una
    //    foglia da un chicco di riso.
    vec2 q = vUv;
    float larga = 1.0 - 0.22 * abs(q.y);          // fianchi appena rientranti
    float m = (q.x * q.x) / (larga * larga) + q.y * q.y * (0.75 + q.y * 0.55);
    if (m > 1.0) discard;
    gl_FragColor = vec4(vCol * vLuce * uAmbienteFoglie, 1.0);
  }
`;

function passoPerDistanza(dc) {
  if (dc <= 1) return 1;
  if (dc <= 2) return 2;
  return 4;
}

export class Foglie {
  constructor(scena, { raggioChunk = 4, densita = 1, max = 9000 } = {}) {
    this.raggioChunk = raggioChunk;
    this.densita = densita;
    this.max = max;
    this.attiva = true;
    this._t = 0;
    this._ccx = 1e9; this._ccz = 1e9;
    this._coda = [];
    this._n = 0;
    this._quote = new Map();
    this._cache = new Map();  // chunk già seminati: vedi _seminaChunk
    this.foglie = 0;

    // LE CELLE GIÀ CALPESTATE. Senza questo elenco il mucchio ricresce al primo
    // riseminamento — cioè dopo sedici passi — e il calpestio non conta niente.
    // È limitato a coda: si scordano le più vecchie, che sono lontane.
    this._pesta = new Set();
    this._pestaCoda = [];
    this._pestaMax = 6000;
    // dove sta ogni cella nel buffer: serve a spegnere SOLO quelle istanze
    this._perCella = new Map();
    this._sPerCella = new Map();

    const g = new THREE.InstancedBufferGeometry();
    // quadrato orizzontale di lato 1 centrato nell'origine
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
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
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.materiale = new THREE.ShaderMaterial({
      vertexShader: GLSL_VERTEX,
      fragmentShader: GLSL_FRAGMENT,
      side: THREE.DoubleSide,
      uniforms: {
        uTempo: { value: 0 },
        uMobili: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uNascita: { value: 0.5 },
        uAmbienteFoglie: { value: new THREE.Color(1, 1, 1) },
      },
    });
    this.mesh = new THREE.Mesh(g, this.materiale);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scena.add(this.mesh);

  }

  imposta(on) { this.attiva = on; this.mesh.visible = on; }
  risemina() { this._ccx = 1e9; this._ccz = 1e9; }

  /** Quote per colonna del chunk in un array piatto: vedi il perché in fx/erba.js. */
  _quoteChunk(mondo, kc) {
    const N = CHUNK * CHUNK;
    if (!this._qy) { this._qy = new Int16Array(N); this._qt = new Array(N); }
    const qy = this._qy, qt = this._qt;
    qy.fill(SENZA_CIMA);
    const virgola = kc.indexOf(',');
    const ox = +kc.slice(0, virgola) * CHUNK, oz = +kc.slice(virgola + 1) * CHUNK;
    for (const b of mondo.blocchiDelChunk(kc)) {
      const i = (b.x - ox) * CHUNK + (b.z - oz);
      if (i < 0 || i >= N) continue;
      if (b.y > qy[i]) { qy[i] = b.y; qt[i] = b.tipo; }
    }
    return { qy, qt, ox, oz };
  }

  /**
   * Come nell'erba: il chunk già seminato non si risemina, si ricopia. Vedi il
   * commento lungo in fx/erba.js — stessa misura, stessa cura. Qui c'è una
   * ragione IN PIÙ per invalidare bene: la mappa cella→istanze (_sPerCella) deve
   * seguire le lamelle copiate, se no il calpestio spegnerebbe le foglie
   * sbagliate. Per questo la voce di cache si porta dietro anche le celle.
   */
  _seminaChunk(mondo, kc, dc) {
    const passo = passoPerDistanza(dc);
    const ck = kc + '|' + passo + '|' + (mondo.revisione ? mondo.revisione(kc) : 0);
    const pronto = this._cache.get(ck);
    // una cella calpestata DOPO che il chunk è finito in cache renderebbe la
    // voce bugiarda: si scarta e si risemina, che è il caso raro
    if (pronto && !pronto.celle.some(([k]) => this._pesta.has(k))) {
      if (this._n + pronto.n > this.max) return 0;
      this.sPos.set(pronto.pos, this._n * 4);
      this.sDati.set(pronto.dati, this._n * 4);
      this.sCol.set(pronto.col, this._n * 3);
      for (const [k, v] of pronto.celle) {
        this._sPerCella.set(k, { i0: this._n + v.i0, n: v.n, tipo: v.tipo });
      }
      this._n += pronto.n;
      return pronto.n;
    }
    const i0 = this._n;
    const scritte = this._seminaVero(mondo, kc, passo);
    if (scritte > 0) {
      const celle = [];
      for (const [k, v] of this._sPerCella) {
        if (v.i0 >= i0) celle.push([k, { i0: v.i0 - i0, n: v.n, tipo: v.tipo }]);
      }
      this._cache.set(ck, {
        n: scritte, celle,
        pos: this.sPos.slice(i0 * 4, (i0 + scritte) * 4),
        dati: this.sDati.slice(i0 * 4, (i0 + scritte) * 4),
        col: this.sCol.slice(i0 * 3, (i0 + scritte) * 3),
      });
      while (this._cache.size > CACHE_CHUNK) {
        this._cache.delete(this._cache.keys().next().value);
      }
    }
    return scritte;
  }

  _seminaVero(mondo, kc, passo) {
    const { qy, qt, ox, oz } = this._quoteChunk(mondo, kc);
    const { sPos, sDati, sCol } = this;
    let n = this._n;
    const col = new THREE.Color();
    for (let idx = 0; idx < qy.length; idx++) {
      if (n >= this.max - FOGLIE_MAX_CELLA) break;
      if (qy[idx] === SENZA_CIMA || qt[idx] !== 'erba') continue;
      const x = ox + ((idx / CHUNK) | 0), z = oz + (idx % CHUNK);
      const k = chiave(x, z);
      if (this._pesta.has(k)) continue;                  // già spazzata via
      const cima = { y: qy[idx], tipo: qt[idx] };
      if (passo > 1 && ((x % passo) + passo) % passo !== 0) continue;
      if (passo > 1 && ((z % passo) + passo) % passo !== 0) continue;
      const am = ammassoDi(x, z);
      if (!am) continue;
      if (hash(x, z, 61) > am.forza * 0.85 + 0.15) continue;   // bordo sfilacciato

      const tipo = TIPI[am.tipo];
      // TANTE E PICCOLE, non poche e grosse: con foglie larghe mezzo blocco il
      // mucchio sembrava un mucchio di patatine. Al centro del mucchio ce ne
      // stanno undici, ai bordi tre.
      const quante = Math.max(1, Math.round((3 + am.forza * 8) * this.densita));
      const i0 = n;
      const y = cima.y + 1;
      for (let i = 0; i < quante; i++) {
        const h1 = hash(x, z, i * 19 + 5), h2 = hash(x, z, i * 19 + 11);
        const h3 = hash(x, z, i * 19 + 23), h4 = hash(x, z, i * 19 + 31);
        const j = n * 4;
        sPos[j] = x + 0.5 + (h1 - 0.5) * 0.92;
        // ognuna a una quota appena diversa: tutte allo stesso millimetro
        // lampeggerebbero contro la faccia del blocco (z-fighting)
        sPos[j + 1] = y + 0.012 + h3 * 0.05;
        sPos[j + 2] = z + 0.5 + (h2 - 0.5) * 0.92;
        sPos[j + 3] = this._t;
        sDati[j] = h3 * Math.PI * 2;                     // rotazione attorno a Y
        sDati[j + 1] = 0.15 + h4 * 0.15;                 // lato della foglia
        sDati[j + 2] = (h1 - 0.5) * 0.7;                 // inclinazione
        sDati[j + 3] = (h2 + h4) * 6.283;                // fase personale
        col.setHex(tipo.colori[(h4 * tipo.colori.length) | 0]);
        const v = 0.92 + 0.16 * h1;
        const jc = n * 3;
        sCol[jc] = col.r * v; sCol[jc + 1] = col.g * v; sCol[jc + 2] = col.b * v;
        n++;
      }
      this._sPerCella.set(k, { i0, n: quante, tipo: am.tipo });
    }
    const scritte = n - this._n;
    this._n = n;
    return scritte;
  }

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
    this._sPerCella.clear();
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
    this.foglie = this._n;
    const t = this._perCella;
    this._perCella = this._sPerCella;
    this._sPerCella = t;
  }

  /**
   * Qualcuno ha camminato su questa cella. Se c'era un mucchio lo spegne e
   * dice a chi chiama COSA c'era, così può lanciare le particelle del colore
   * giusto. Ritorna null se lì non c'era niente: chiamarla a ogni passo costa
   * una lettura di Map.
   */
  calpesta(x, z) {
    const k = chiave(x, z);
    if (this._pesta.has(k)) return null;
    const voce = this._perCella.get(k);
    if (!voce) {
      // niente foglie caricate qui: se il mucchio esiste ma è fuori portata non
      // si segna niente, altrimenti si spegnerebbe roba mai vista
      return null;
    }
    this._pesta.add(k);
    this._pestaCoda.push(k);
    if (this._pestaCoda.length > this._pestaMax) {
      this._pesta.delete(this._pestaCoda.shift());
    }
    // spegnere = lato zero. L'istanza resta nel buffer (togliere di mezzo un
    // pezzo vorrebbe dire ricompattare tutto), ma un quadrato di lato zero non
    // produce frammenti: costa il vertex shader e basta.
    const { iDati } = this;
    for (let i = voce.i0; i < voce.i0 + voce.n; i++) iDati[i * 4 + 1] = 0;
    this.mesh.geometry.getAttribute('iDati').needsUpdate = true;
    const t = TIPI[voce.tipo];
    const c = new THREE.Color(t.colori[0]);
    return { quante: voce.n, colore: [c.r, c.g, c.b], tipo: voce.tipo };
  }

  aggiorna(dt, mondo, pos, ambiente) {
    if (!this.attiva) return;
    this._t += dt;
    const u = this.materiale.uniforms;
    u.uTempo.value = this._t;
    u.uMobili.value[0].set(pos.x, pos.y, pos.z, 1.25);
    if (ambiente) u.uAmbienteFoglie.value.copy(ambiente);

    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    if (ccx !== this._ccx || ccz !== this._ccz) {
      this._ccx = ccx; this._ccz = ccz;
      this._apriCoda(ccx, ccz);
    }
    if (this._coda.length) {
      // budget di TEMPO, non di chunk: vedi il perché in fx/erba.js
      const t0 = performance.now();
      let fatti = 0;
      while (this._coda.length && (fatti === 0 || performance.now() - t0 < BUDGET_MS)) {
        const c = this._coda.shift();
        this._seminaChunk(mondo, c.kc, c.dc);
        fatti++;
      }
      if (!this._coda.length) this._scambia();
    }
  }
}
