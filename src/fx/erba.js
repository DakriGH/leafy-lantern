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
import { paletteBlocco } from '../world/stagioni.js?v=ms8q8h3a';
import { CHUNK } from '../world/world.js?v=ms8q8h3a';
import { uniformiOmbraSole } from './materials.js?v=ms8q8h3a';

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

// QUANTI CHUNK GIÀ SEMINATI SI TENGONO DA PARTE. Il ring più largo è 11×11 =
// 121 chunk, e lo stesso chunk può stare in cache a due passi di diradamento
// diversi mentre lo si attraversa: 320 lascia margine senza far crescere la
// memoria (una voce media sono poche decine di KB).
const CACHE_CHUNK = 320;

/** Colonna senza niente sopra, nell'array piatto delle quote. */
const SENZA_CIMA = -32768;

// QUANTO PUÒ DURARE LA SEMINA IN UN FRAME. Mezzo millisecondo: su un telefono
// che ne ha undici per fotogramma è il 5%, e la coda si svuota comunque in poche
// decine di frame perché la maggior parte dei chunk arriva dalla cache.
const BUDGET_MS = 0.5;

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
  varying float vLontano;
  varying float vSole;
  uniform vec3 uCamera;
  uniform vec2 uSfuma;      // (dove comincia a spegnersi, dove è spenta)
  uniform vec3 uCentro;     // centro del campo seminato: il GIOCATORE
  uniform vec2 uBordo;      // (dove comincia il bordo del campo, dove finisce)
  // l'ombra del sole, LE STESSE uniform del mondo (fx/materials.js)
  uniform sampler2D uCielo;
  uniform vec4 uCieloInfo;
  uniform vec3 uSoleDir;
  uniform int uSolePassi;
  uniform float uSoleForza;
  uniform float uVoxCima;

  // L'ERBA RICEVE L'OMBRA DEL SOLE, e la chiede alla stessa heightmap che usa il
  // mondo. Ma la chiede UNA VOLTA PER LAMELLA, nel vertex shader, non per pixel:
  // un ciuffo è alto mezzo blocco e largo un dito, l'ombra al suo piede e quella
  // alla sua punta sono la stessa. Ventimila letture invece di qualche milione.
  //
  // Passi pochi (sei) e per la stessa ragione: quello che conta è che il prato
  // dentro l'ombra di una collina sia scuro come la collina, non che l'orlo sia
  // al centimetro — al centimetro non si vede, un prato illuminato dentro
  // un'ombra si vede da lontano.
  float erbaAlSole(vec3 p) {
    if (uSoleForza <= 0.0 || uSolePassi == 0 || uSoleDir.y <= 0.02) return 1.0;
    vec2 dirXZ = uSoleDir.xz;
    float lenXZ = length(dirXZ);
    if (lenXZ < 0.02) return 1.0;
    vec2 dxz = dirXZ / lenXZ;
    float salita = uSoleDir.y / lenXZ;
    for (int k = 1; k <= 6; k++) {
      float fk = float(k) * 1.6;                 // passo più lungo: sei letture bastano
      if (fk > float(uSolePassi)) break;
      float y = p.y + salita * fk;
      if (y >= uVoxCima) break;
      vec2 uv = (p.xz + dxz * fk - uCieloInfo.xy) * uCieloInfo.z;
      if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) break;
      if (texture2D(uCielo, uv).r > y) return 0.0;
    }
    return 1.0;
  }

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

    // ---- IL CONGEDO CON LA DISTANZA ----------------------------------------
    // «L'erba compare di botto quando ti avvicini»: era vero, e la crescita da
    // scala zero non bastava perché il ciuffo NUOVO nasce già a colori pieni in
    // mezzo a un prato che non ne aveva nessuno.
    //
    // Qui l'ultimo tratto fa DUE cose insieme, e servono tutt'e due: la lamella
    // si accorcia fino a sparire nel manto, E il suo colore converge a quello
    // esatto del blocco sotto. Quando arriva al bordo del campo seminato è alta
    // quasi zero e indistinguibile dal terreno: che ci sia o non ci sia non lo
    // si può vedere, quindi non si vede nemmeno il momento in cui appare.
    //
    // Costa due sottrazioni per vertice. Farlo con la trasparenza costerebbe
    // l'ordinamento di ventimila quad; farlo con cartelli 2D che guardano la
    // camera costerebbe una seconda geometria e un secondo materiale — e a quel
    // punto si vedrebbe il passaggio FRA i due, che è lo stesso difetto spostato
    // di dieci metri più in là.
    vSole = erbaAlSole(iPos.xyz);
    // DUE CONGEDI, E SI PRENDE IL PIU' FORTE. Servono tutti e due, e per un giro
    // ne ho messo uno solo — ecco perche' i pop-in erano ancora li'.
    //
    //  · dalla CAMERA: una lamella lontana dall'occhio e' piu' piccola di un
    //    pixel e non deve costare ne' brillare;
    //  · dal CENTRO DEL CAMPO, cioe' dal giocatore: il prato esiste solo dentro
    //    il ring seminato attorno a LUI. In vista a diorama la camera sta a
    //    sessanta blocchi e guarda terreno lontano dal giocatore: li' l'erba o
    //    c'e' o non c'e', e il confine si vedeva come un muro che si sposta
    //    mentre cammini. Adesso quel confine e' gia' a zero prima di arrivarci.
    float viaCam = clamp((distance(iPos.xz, uCamera.xz) - uSfuma.x)
                     / max(uSfuma.y - uSfuma.x, 0.001), 0.0, 1.0);
    float viaBordo = clamp((distance(iPos.xz, uCentro.xz) - uBordo.x)
                     / max(uBordo.y - uBordo.x, 0.001), 0.0, 1.0);
    vLontano = max(viaCam, viaBordo);
    eta *= 1.0 - vLontano * vLontano * 0.82;

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
  varying float vLontano;
  varying float vSole;
  uniform vec3 uAmbienteErba;
  uniform vec3 uOmbraFatt;     // di che colore scurisce l'ombra del cielo

  void main() {
    // LA BASE È ESATTAMENTE IL COLORE DEL BLOCCO SOTTO, e da lì si SCHIARISCE
    // salendo. Prima la base era più scura del blocco (0.82) e l'attacco fra
    // erba e terreno si vedeva come una riga d'ombra: il ciuffo sembrava
    // appoggiato sopra invece che cresciuto lì. A quota zero adesso i due colori
    // coincidono al bit, e il passaggio non esiste proprio.
    //
    // LA SCHIARITA STA IN CIMA, non su tutta la lamella, e questo è il rilievo
    // del committente («a risoluzioni basse la sfumatura deve funzionare, se no
    // esce molto brutto»). Con una rampa quadratica metà della lamella era già
    // più chiara del blocco: a schermo pieno si legge come sfumatura, ma quando
    // la lamella è larga due pixel di quella sfumatura si vede solo la parte
    // chiara — e il prato diventa una macchia pallida sopra un terreno scuro.
    // Con la cubica la schiarita vive nell'ultimo terzo: il colore MEDIO della
    // lamella resta quello del blocco a qualsiasi risoluzione.
    vec3 col = mix(vCol, vCol * 1.22 + vec3(0.035), vAlt * vAlt * vAlt);
    // e in lontananza si torna al colore esatto del blocco: vedi il vertex
    col = mix(col, vCol, vLontano);
    // l'ombra del sole, con LO STESSO colore con cui scurisce il mondo: se qui
    // si usasse un grigio qualunque, l'erba dentro l'ombra sarebbe di una tinta
    // e il blocco sotto di un'altra — e il difetto si vede proprio sul confine
    vec3 amb = uAmbienteErba * mix(uOmbraFatt, vec3(1.0), vSole);
    gl_FragColor = vec4(col * amb, 1.0);
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
    this._cache = new Map();  // chunk già seminati: vedi _seminaChunk

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
        uCamera: { value: new THREE.Vector3() },
        uSfuma: { value: new THREE.Vector2(30, 52) },
        uCentro: { value: new THREE.Vector3() },
        uBordo: { value: new THREE.Vector2(40, 64) },
        // per RIFERIMENTO: restano agganciate al ciclo del giorno da sole
        ...uniformiOmbraSole(),
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
    // UN ARRAY PIATTO, NON UNA MAPPA. Un chunk ha 256 colonne e basta: indicizzarle
    // per posizione locale costa un moltiplicatore, mentre la Map costava una
    // chiave impacchettata + un hash + un oggetto {y,tipo} PER BLOCCO — e i
    // blocchi di un chunk sono migliaia. Sparisce anche l'offset +2048 con cui
    // si impacchettavano le coordinate negative: era il posto dove i ciuffi
    // finivano a mezz'aria dall'altra parte del mondo, e ora non esiste più.
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
   * IL CHUNK GIÀ SEMINATO NON SI RISEMINA. È la cura del difetto peggiore di
   * questo sistema, ed era invisibile finché non si è misurato: attraversando un
   * confine di chunk — cioè ogni sedici passi — `_apriCoda` buttava via TUTTO e
   * rifaceva da capo tutti gli 81 chunk del ring. Misurato camminando sul mondo
   * aperto: picchi da 3,5 ms sull'erba e 2,1 sulle foglie, con mediana ZERO. Su
   * un telefono cinque volte più lento sono i trenta millisecondi che il
   * committente vedeva come scatto.
   *
   * Dei 81 chunk, attraversando un confine ne cambiano una ventina: gli altri
   * sessanta hanno lo stesso contenuto di un attimo prima. Qui si tengono le
   * lamelle già calcolate e si ricopiano — una memcpy invece di rifare hash,
   * palette e quote.
   *
   * LA CHIAVE PORTA DENTRO LA REVISIONE DEL CHUNK (mondo.revisione), quindi
   * scavare una cella rende irraggiungibile la voce vecchia: la cache non ha
   * bisogno di essere svuotata da nessuno, si invalida da sola. E porta dentro
   * anche il PASSO di diradamento, perché lo stesso chunk visto da lontano ha
   * meno ciuffi di quando lo si ha addosso.
   *
   * EFFETTO COLLATERALE CHE VALE DA SOLO: l'istante di nascita viaggia con la
   * lamella. Prima ogni riseminata rimetteva `nascita = adesso` su TUTTO il
   * prato, cioè ogni sedici passi l'intero campo ricresceva da scala zero sotto
   * gli occhi. Adesso ricresce solo l'erba davvero nuova.
   *
   * @returns quante lamelle ha scritto nel buffer di scorta
   */
  _seminaChunk(mondo, kc, dc) {
    const passo = passoPerDistanza(dc);
    const ck = kc + '|' + passo + '|' + (mondo.revisione ? mondo.revisione(kc) : 0);
    const pronto = this._cache.get(ck);
    if (pronto) {
      if (this._n + pronto.n > this.max) return 0;
      this.sPos.set(pronto.pos, this._n * 4);
      this.sDati.set(pronto.dati, this._n * 4);
      this.sCol.set(pronto.col, this._n * 3);
      this._n += pronto.n;
      return pronto.n;
    }
    const i0 = this._n;
    const scritte = this._seminaVero(mondo, kc, passo);
    this._ricorda(ck, i0, scritte);
    return scritte;
  }

  /** Mette da parte le lamelle appena seminate. La cache è a coda: le voci più
   *  vecchie sono quelle dei chunk che ci si è lasciati alle spalle. */
  _ricorda(ck, i0, n) {
    if (n <= 0) return;
    this._cache.set(ck, {
      n,
      pos: this.sPos.slice(i0 * 4, (i0 + n) * 4),
      dati: this.sDati.slice(i0 * 4, (i0 + n) * 4),
      col: this.sCol.slice(i0 * 3, (i0 + n) * 3),
    });
    while (this._cache.size > CACHE_CHUNK) {
      this._cache.delete(this._cache.keys().next().value);
    }
  }

  _seminaVero(mondo, kc, passo) {
    const { qy, qt, ox, oz } = this._quoteChunk(mondo, kc);
    const { sPos, sDati, sCol } = this;
    let n = this._n;
    const col = new THREE.Color();
    for (let i = 0; i < qy.length; i++) {
      if (n >= this.max - LAMELLE_MAX) break;
      if (qy[i] === SENZA_CIMA || qt[i] !== 'erba') continue;
      const x = ox + ((i / CHUNK) | 0), z = oz + (i % CHUNK);
      const cima = { y: qy[i], tipo: qt[i] };
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
  aggiorna(dt, mondo, pos, ambiente, occhio) {
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
    // IL CONGEDO SI MISURA DALLA CAMERA, non dal giocatore. L'avevo scritto al
    // contrario e a schermo il prato spariva del tutto: in vista a diorama la
    // camera sta a sessanta blocchi e guarda terreno lontano DAL GIOCATORE, che
    // con la misura sbagliata risultava tutto oltre la soglia. Quello che conta
    // e' quanto e' lontano dall'OCCHIO, perche' e' li' che una lamella diventa
    // piu' piccola di un pixel.
    u.uCamera.value.copy(occhio || pos);
    u.uCentro.value.copy(pos);
    // IL BORDO DEL CAMPO. Il ring seminato e' un QUADRATO di chunk attorno al
    // giocatore: il cerchio inscritto ha raggio raggioChunk·CHUNK, ed e' li' che
    // il prato finisce di sicuro in tutte le direzioni. Si spegne prima di
    // arrivarci, se no si vede il muro.
    const bordo = this.raggioChunk * CHUNK;
    u.uBordo.value.set(bordo * 0.55, bordo * 0.92);
    // e dalla camera: piu' corto, perche' qui il motivo e' la dimensione a
    // schermo e non l'esistenza
    u.uSfuma.value.set(bordo * 0.62, bordo * 0.98);

    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    if (ccx !== this._ccx || ccz !== this._ccz) {
      this._ccx = ccx; this._ccz = ccz;
      this._apriCoda(ccx, ccz);
    }
    // UN BUDGET DI TEMPO, NON UN NUMERO DI CHUNK. È la differenza fra sperare e
    // sapere: «due chunk per frame» è un tetto sul CONTEGGIO, e i chunk non
    // costano uguale — uno pieno d'erba costa dieci volte uno di roccia, e uno
    // già in cache costa una memcpy. Il tetto sul conteggio lasciava passare
    // picchi da tre millisecondi e mezzo (misurati camminando sul mondo aperto);
    // il tetto sul TEMPO li taglia dove sono, e nelle passate fatte di sole
    // copie fa scorrere la coda molto più in fretta di prima.
    //
    // SEMPRE ALMENO UNO, altrimenti su un dispositivo lentissimo il budget
    // sarebbe già finito prima di cominciare e la coda non scorrerebbe mai.
    const t0 = performance.now();
    let fatti = 0;
    while (this._coda.length && (fatti === 0 || performance.now() - t0 < BUDGET_MS)) {
      const c = this._coda.shift();
      this._seminaChunk(mondo, c.kc, c.dc);
      fatti++;
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
