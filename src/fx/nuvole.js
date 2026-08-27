// Nuvole CEL SHADING, e NON di scatole. La versione a cubi è stata bocciata per
// una ragione di stile precisa: il mondo è di voxel, il cielo no. Nuvole,
// particellari e roba d'ambiente devono avere una forma loro — tonda, disegnata
// — se no il gioco sembra fatto di un materiale solo.
//
// COME SONO FATTE. Ogni nuvola è UN quadrato che guarda la camera, e la forma
// vera si ritaglia nel fragment shader: l'unione morbida di sei cerchi (una
// distanza con segno) tagliata di netto sotto. Da qui vengono le tre cose che
// una nuvola a cubi non può avere:
//   · il PROFILO è tondo e continuo a qualsiasi distanza — non ha spigoli da
//     mostrare, perché non ci sono facce;
//   · il FONDO è piatto, come nei cumuli veri, ma è un taglio netto sulla
//     silhouette, non una fila di scatole allineate;
//   · costa DUE TRIANGOLI a nuvola. Tutte insieme sono un draw call e venti
//     triangoli: il cielo intero pesa meno di un albero.
//
// LA LUCE È CEL: tre toni piatti scelti da quanto si è dalla parte dell'astro,
// più due bordi netti — la CRESTA accesa sul lato del sole e l'ORLO in ombra
// sotto. I bordi si misurano sulla stessa distanza con segno che ritaglia la
// nuvola, quindi seguono il profilo tondo senza costare niente in più.
//
// Le OMBRE a terra sono l'unione degli stessi cerchi (impostaOmbreNuvole), con
// una penombra a un gradino: la sagoma dell'ombra è la sagoma della nuvola.
// Calcolo analitico, nessun render-target. La heightmap del cielo limita l'ombra
// alle superfici. Di notte le nuvole si tingono con l'ambiente.

import * as THREE from 'three';
import { NUVOLE } from '../config.js?v=mtbifcbo';
import { impostaOmbreNuvole, ambienteAttuale, sbiecoAstro, direzioneAstro } from './materials.js?v=mtbifcbo';

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// I BATUFFOLI, in coordinate della nuvola: x e y in −1..1, r = raggio.
// UNA SOLA FONTE DI VERITÀ: da qui si genera il codice GLSL che ritaglia la
// sagoma E si calcolano i cerchi dell'ombra a terra. Prima la stessa forma era
// scritta due volte — a mano — ed è esattamente il posto dove le due copie
// divergono senza che nessuno se ne accorga.
// I RAGGI SONO PICCOLI RISPETTO ALLA DISTANZA fra i centri, ed è la regola che
// decide tutto: con cerchi larghi e centri vicini l'unione è una cupola sola —
// una collina, non una nuvola. Qui i tre di sopra stanno a quote diverse e
// distanti quanto il proprio raggio, così restano tre GOBBE riconoscibili.
// I numeri sono un filo piu' stretti di quanto il cartello permetterebbe, e non
// e' timidezza: lo spazio che avanza e' il MARGINE PER LA DEFORMAZIONE. Con la
// sagoma a filo del bordo ogni nuvola sarebbe uguale alle altre, perche' non ci
// sarebbe posto per spostare niente.
// QUANTI CERCHI PUO' AVERE UNA NUVOLA. Sei e' il tetto dello shader; quante ne
// usa davvero lo decide la nuvola — chi ne usa tre e' un batuffolo, chi ne usa
// sei e' un cumulo lungo. Gli slot avanzati si mandano fuori dal cartello con
// raggio zero, cosi' la smin non li vede nemmeno.
export const PUFF_MAX = 6;

// IL TAGLIO DEVE PASSARE SOTTO A TUTTI, non solo a qualcuno: con la riga più in
// basso i batuffoli esterni la sfioravano appena e il fondo veniva smerlato —
// tondo di qua, dritto di là. Qui ogni cerchio ci arriva sotto, quindi la base è
// una riga sola da un capo all'altro.
export const FONDO = -0.24;
// QUANTO SI FONDONO. A 0.16 i sei batuffoli diventavano una cupola sola; qui
// restano attaccati ma distinti. Sotto questa soglia ricompaiono le strozzature
// a clessidra fra un cerchio e l'altro.
const FUSIONE = 0.06;
// ⚠ IL CARTELLO COPRE -1..1, non -0.5..0.5 (vUv = position.xy * 2.0). Questi
// sono i due limiti oltre cui la sagoma tocca il bordo e viene tagliata dritta:
// di lato quasi tutto lo spazio, in alto meno perche' lo shader divide uv.y per
// lo schiacciamento (fino a 1.20) e quindi lo spazio verticale si stringe.
const BORDO_X = 0.86;
const BORDO_Y = 0.78;

/**
 * ⚠ LA SAGOMA ADESSO E' DI OGNI NUVOLA, non di tutte.
 *
 * Prima c'erano SEI CERCHI FISSI e tre numeri per nuvola che li spostavano di
 * un decimo: la taglia cambiava, la forma no. Il committente l'ha detto due
 * volte, la seconda senza giri di parole — «le nuvole sono tutte uguali con
 * forme noiose e ripetitive» — e aveva ragione, perché nessuna deformazione
 * piccola può cambiare la FAMIGLIA di una sagoma. Cinque gobbe in fila restano
 * cinque gobbe in fila.
 *
 * Qui ogni nuvola si costruisce la propria fila: quanti cerchi (tre…sei), che
 * raggio, a che quota, con che spaziatura. Tre cerchi radi fanno un batuffolo
 * leggero, sei fitti e disuguali un cumulo gonfio. Poi la sagoma si NORMALIZZA
 * dentro il cartello, e questo e' il pezzo che rende la cosa sicura: comunque
 * vengano i numeri, il risultato sta dentro — quindi si puo' osare.
 *
 * LA VERITA' STA QUI E BASTA: la CPU legge questi cerchi per disegnare l'ombra a
 * terra, e lo shader li riceve come attributi. Non c'e' una seconda formula da
 * tenere allineata (era il motivo per cui prima i coefficienti erano una tabella
 * scritta a mano: hash diversi in float32 e float64 separavano nuvola e ombra).
 */
export function generaSagoma(hash, seme) {
  const n = 3 + Math.floor(hash(seme + 3) * 3.999);      // 3…6 gobbe
  const puff = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const r = 0.26 + hash(seme + i * 17 + 5) * 0.34;
    // le gobbe di mezzo stanno più in alto delle estreme: è il profilo di un
    // cumulo, e senza questo la nuvola è un salsicciotto orizzontale
    const arco = n > 1 ? Math.sin((i / (n - 1)) * Math.PI) : 1;
    const y = -0.26 + arco * (0.14 + hash(seme + i * 17 + 7) * 0.42);
    puff.push({ x, y, r });
    x += r * (0.80 + hash(seme + i * 17 + 11) * 0.85);   // spaziatura disuguale
  }
  // NORMALIZZA: si porta la sagoma dentro il cartello con una traslazione e UNA
  // scala sola (la stessa su x e y, se no i cerchi diventano ellissi e la
  // fusione morbida non torna).
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of puff) {
    x0 = Math.min(x0, q.x - q.r); x1 = Math.max(x1, q.x + q.r);
    y1 = Math.max(y1, q.y + q.r);
  }
  const cx = (x0 + x1) / 2;
  const k = Math.min(BORDO_X / Math.max((x1 - x0) / 2, 1e-3),
    BORDO_Y / Math.max(y1, 1e-3), 2.2);
  for (const q of puff) { q.x = (q.x - cx) * k; q.y *= k; q.r *= k; }
  // OGNI CERCHIO DEVE ARRIVARE SOTTO IL TAGLIO. La base della nuvola è una riga
  // dritta a FONDO: se un cerchio si ferma sopra, quella riga si smerla — tonda
  // di qua, dritta di là — ed è il difetto che il fondo piatto doveva togliere.
  // Abbassarlo non costa niente, perché sotto il taglio non si disegna comunque.
  for (const q of puff) q.y = Math.min(q.y, FONDO - 0.02 + q.r);
  // gli slot avanzati: lontanissimi e piccoli, la smin non li incontra mai
  while (puff.length < PUFF_MAX) puff.push({ x: 90, y: 90, r: 0.01 });
  return puff;
}

// il pezzo di shader che disegna la sagoma: sei cerchi presi dagli ATTRIBUTI
const GLSL_SAGOMA = Array.from({ length: PUFF_MAX }, (_, i) =>
  `    d = smin(d, length(uv - vQ${i}.xy) - vQ${i}.z, ${FUSIONE});`).join('\n');

const VERT = /* glsl */`
  attribute vec3 iOrig;     // origine: x di partenza, quota, z
  attribute float iVel;     // deriva (unità/s)
  attribute vec2 iDim;      // larghezza e altezza in unità di mondo
  attribute vec3 iForma;    // (riserva, schiacciamento, riserva)
  attribute vec3 iQ0;      // cerchio 0 della sagoma: (x, y, raggio)
  attribute vec3 iQ1;      // cerchio 1 della sagoma: (x, y, raggio)
  attribute vec3 iQ2;      // cerchio 2 della sagoma: (x, y, raggio)
  attribute vec3 iQ3;      // cerchio 3 della sagoma: (x, y, raggio)
  attribute vec3 iQ4;      // cerchio 4 della sagoma: (x, y, raggio)
  attribute vec3 iQ5;      // cerchio 5 della sagoma: (x, y, raggio)
  uniform float uTempo;
  uniform float uRaggio;
  uniform vec3 uSole;
  varying vec2 vUv;
  varying vec2 vLuce;
  varying vec3 vForma;
  varying vec3 vQ0;
  varying vec3 vQ1;
  varying vec3 vQ2;
  varying vec3 vQ3;
  varying vec3 vQ4;
  varying vec3 vQ5;
  #include <fog_pars_vertex>
  void main() {
    // L'AVVOLGIMENTO SI CALCOLA SULL'ORIGINE della nuvola: tutti e quattro i
    // vertici del quadrato condividono iOrig, quindi rientrano INSIEME. Col mod
    // applicato al vertice la nuvola si spezzerebbe mentre attraversa il bordo.
    float g = uRaggio * 2.0;
    float x = mod(iOrig.x + uTempo * iVel + uRaggio, g) - uRaggio;
    vec3 centro = vec3(x, iOrig.y, iOrig.z);

    // CARTELLO CHE GUARDA LA CAMERA. Gli assi si leggono dalla matrice di vista:
    // la nuvola non ha un davanti, quindi non c'è niente da ruotare.
    vec3 destra = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 su     = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 p = centro + destra * (position.x * iDim.x) + su * (position.y * iDim.y);

    vUv = position.xy * 2.0;                   // −1..1 dentro il quadrato
    // la direzione dell'astro PROIETTATA sul cartello: è lì che il cel shading
    // deve tagliare, ed è la stessa per tutte le nuvole (stessa camera)
    vec2 l = vec2(dot(uSole, destra), dot(uSole, su));
    float ll = length(l);
    vLuce = ll > 1e-4 ? l / ll : vec2(0.0, 1.0);
    vForma = iForma;
    vQ0 = iQ0;
    vQ1 = iQ1;
    vQ2 = iQ2;
    vQ3 = iQ3;
    vQ4 = iQ4;
    vQ5 = iQ5;

    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  varying vec2 vLuce;
  varying vec3 vForma;
  varying vec3 vQ0;
  varying vec3 vQ1;
  varying vec3 vQ2;
  varying vec3 vQ3;
  varying vec3 vQ4;
  varying vec3 vQ5;
  uniform vec3 uAmb;
  uniform float uOpacita;
  #include <fog_pars_fragment>

  // unione MORBIDA: due cerchi che si toccano diventano un batuffolo solo,
  // senza la strozzatura che lascia l'unione secca
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  void main() {
    vec2 uv = vUv;
    uv.y /= max(vForma.y, 0.05);               // schiacciamento della nuvola
    float d = 1e3;
${GLSL_SAGOMA}
    // FONDO PIATTO: un cumulo poggia su un piano. È un taglio netto, non una
    // fusione — la riga dritta sotto è metà del carattere di una nuvola.
    d = max(d, ${FONDO.toFixed(3)} - uv.y);
    if (d > 0.0) discard;                      // fuori sagoma: profilo tondo e netto

    // ---- CEL: tre toni piatti e due bordi ------------------------------------
    // s dice quanto si sta dalla parte dell'astro dentro la sagoma. I toni sono
    // TUTTI chiari di proposito: una nuvola si guarda quasi sempre di lato o da
    // sotto, e un'ombra scura la fa sembrare sporca. Il salto sta nella TINTA
    // (caldo → freddo), non nella luminosità.
    // Le soglie sono BASSE di proposito: una nuvola è bianca, con l'ombra sotto
    // la pancia. Tenendole al centro il tono di mezzo si prendeva due terzi
    // della sagoma e il cielo si riempiva di nuvole grigio-azzurre.
    float s = dot(uv, vLuce) * 0.85 + uv.y * 0.30;
    vec3 c = s > 0.06 ? vec3(1.00, 0.99, 0.95)
           : s > -0.16 ? vec3(0.84, 0.88, 0.98)
                       : vec3(0.64, 0.72, 0.92);
    // la CRESTA: un orlo acceso sul lato dell'astro, che segue il profilo tondo
    // perché si misura sulla stessa distanza con segno. È la riga che fa leggere
    // il volume in un disegno piatto — senza, restano tre macchie di colore.
    if (-d < 0.05 && s > 0.14) c = vec3(1.0, 1.0, 0.99);
    // e l'ORLO FREDDO sotto, dalla parte opposta
    if (-d < 0.07 && s < -0.24) c = vec3(0.56, 0.66, 0.90);

    gl_FragColor = vec4(c * uAmb, uOpacita);
    #include <colorspace_fragment>
    // NEBBIA A METÀ FORZA. Le nuvole stanno a settanta-novanta unità: con la
    // nebbia piena diventano macchie azzurre indistinguibili dal cielo proprio
    // quando la camera si allarga. Un po' ne prendono — restano lontane — ma non
    // fino a sparire.
    #if defined(USE_FOG) && defined(FOG_EXP2)
      float fF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fF * 0.55);
    #else
      #include <fog_fragment>
    #endif
  }
`;

export class Nuvole {
  constructor(scena, numero = NUVOLE.numero) {
    this.gruppo = new THREE.Group();
    scena.add(this.gruppo);
    this.nuvole = [];        // { x0, y, z, vel, largo, alto, raggio, schiaccio }

    const orig = [], vel = [], dim = [], forma = [];
    const q = Array.from({ length: PUFF_MAX }, () => []);
    for (let i = 0; i < numero; i++) {
      const seme = i * 7.31 + 2;
      const angolo = hash(seme + 11) * Math.PI * 2;
      const raggio = 8 + hash(seme + 13) * (NUVOLE.raggio - 12);
      const largo = 9 + hash(seme + 23) * 9;
      const nv = {
        x0: Math.cos(angolo) * raggio,
        y: NUVOLE.quotaMin + hash(seme + 17) * (NUVOLE.quotaMax - NUVOLE.quotaMin),
        z: Math.sin(angolo) * raggio,
        vel: 0.25 + hash(seme + 19) * 0.35,
        largo,
        alto: largo * (0.46 + hash(seme + 29) * 0.16),
        schiaccio: 0.80 + hash(seme + 37) * 0.40,
        // LA SUA sagoma: quanti cerchi, dove, quanto grossi. Vedi generaSagoma.
        puff: generaSagoma(hash, seme * 3.7 + i * 11),
      };
      this.nuvole.push(nv);
      orig.push(nv.x0, nv.y, nv.z);
      vel.push(nv.vel);
      dim.push(nv.largo, nv.alto);
      forma.push(0, nv.schiaccio, 0);
      for (let k = 0; k < PUFF_MAX; k++) q[k].push(nv.puff[k].x, nv.puff[k].y, nv.puff[k].r);
    }

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iOrig', new THREE.InstancedBufferAttribute(new Float32Array(orig), 3));
    g.setAttribute('iVel', new THREE.InstancedBufferAttribute(new Float32Array(vel), 1));
    g.setAttribute('iDim', new THREE.InstancedBufferAttribute(new Float32Array(dim), 2));
    g.setAttribute('iForma', new THREE.InstancedBufferAttribute(new Float32Array(forma), 3));
    for (let k = 0; k < PUFF_MAX; k++) {
      g.setAttribute(`iQ${k}`, new THREE.InstancedBufferAttribute(new Float32Array(q[k]), 3));
    }
    g.instanceCount = numero;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, NUVOLE.quotaMax, 0), NUVOLE.raggio * 2);

    this.materiale = new THREE.ShaderMaterial({
      uniforms: {
        uTempo: { value: 0 },
        uRaggio: { value: NUVOLE.raggio },
        uSole: { value: direzioneAstro() },       // per RIFERIMENTO: segue il ciclo
        uAmb: { value: new THREE.Color(1, 1, 1) },
        uOpacita: { value: 0.96 },
        fogColor: { value: new THREE.Color() },   // li riempie il renderer
        fogDensity: { value: 0 },
        fogNear: { value: 1 },
        fogFar: { value: 1000 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.materiale);
    this.mesh.frustumCulled = false;               // sempre in cielo, sempre visibili
    this.gruppo.add(this.mesh);

    this._t = 0;
    this._box = [];
    for (let i = 0; i < numero * PUFF_MAX; i++) this._box.push(new THREE.Vector4());
    this._tOmbra = 0;   // maschera d'ombra a ~30 Hz: a 8 Hz i bordi netti SCATTAVANO
  }

  /**
   * I DISCHI DELLE NUVOLE ADESSO, in coordinate mondo: (x, z, raggio).
   * Li usa la pioggia per sapere DOVE piove: sotto una nuvola, e non addosso al
   * giocatore. Il raggio è quello del cartello, cioè la larghezza vera della
   * sagoma — un rovescio largo quanto la nuvola che lo fa.
   *
   * NON è la stessa cosa dei rettangoli d'ombra: quelli sono proiettati LUNGO IL
   * RAGGIO DELL'ASTRO (obliqui, e a mezzogiorno cadono altrove), la pioggia cade
   * a piombo. Confonderli farebbe piovere di fianco alla nuvola.
   */
  dischi(fuori = []) {
    fuori.length = 0;
    for (const nv of this.nuvole) {
      fuori.push({ x: this._x(nv), z: nv.z, r: nv.largo * 0.5 });
    }
    return fuori;
  }

  /** X della nuvola adesso: STESSA formula del vertex shader, altrimenti l'ombra
   *  si stacca dalla nuvola proprio nel momento in cui rientra dal bordo. */
  _x(nv) {
    const g = NUVOLE.raggio * 2;
    return ((nv.x0 + this._t * nv.vel + NUVOLE.raggio) % g + g) % g - NUVOLE.raggio;
  }

  aggiorna(dt) {
    this._t += dt;
    this.materiale.uniforms.uTempo.value = this._t;
    // le nuvole vanno a 0.25-0.6 unità/s: in 0.12s si spostano di ~0.05 unità,
    // ridisegnare la maschera più spesso sarebbe lavoro (e upload) buttato
    this._tOmbra -= dt;
    if (this._tOmbra <= 0) {
      this._tOmbra = this.intervalloOmbra || 0.033;   // mobile: 15Hz (main lo imposta)
      // OGNI NUVOLA SI PROIETTA CON LA PROPRIA QUOTA. Il raggio dell'astro è
      // obliquo: una nuvola non oscura quello che ha sotto ma quello che ha
      // dalla parte opposta al sole, tanto più lontano quanto è alta — e qui le
      // quote vanno da 15 a 21, quindi una quota media falserebbe di parecchio.
      // Si scrive la maschera sul piano y=0 (togliendo sbieco×quota) e lo shader
      // ci riporta il frammento allo stesso modo: i conti tornano per qualsiasi
      // altezza del terreno, senza sapere niente del terreno.
      //
      // L'OMBRA È FATTA DEGLI STESSI BATUFFOLI della sagoma, non di un rettangolo:
      // una nuvola tonda che fa un'ombra squadrata era la cosa che tradiva tutto.
      // Il cartello gira con la camera, l'ombra NO: si stende sempre lungo X e si
      // stringe in Z, cioè si comporta come il volume che il cartello finge.
      const sb = sbiecoAstro();
      let n = 0;
      for (const nv of this.nuvole) {
        const cx = this._x(nv) - sb.x * nv.y, cz = nv.z - sb.y * nv.y;
        const semi = nv.largo / 2;
        for (let i = 0; i < PUFF_MAX; i++) {
          if (n >= this._box.length) break;
          // GLI STESSI cerchi che disegna lo shader: adesso è letteralmente lo
          // stesso array, non una formula da tenere allineata. Gli slot avanzati
          // hanno raggio 0.01 e stanno fuori dal cartello: non fanno ombra.
          const pf = nv.puff[i];
          if (pf.r < 0.02) continue;
          const rx = pf.r * semi;
          this._box[n++].set(cx + pf.x * semi, cz + pf.y * semi * 0.7, rx, rx * 0.72);
        }
      }
      impostaOmbreNuvole(this._box.slice(0, n), NUVOLE.ombra);
    }
    this.materiale.uniforms.uAmb.value.copy(ambienteAttuale());   // di notte si spengono
  }
}

