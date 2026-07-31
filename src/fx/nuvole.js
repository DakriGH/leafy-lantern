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
import { NUVOLE } from '../config.js?v=ms8osh8u';
import { impostaOmbreNuvole, ambienteAttuale, sbiecoAstro, direzioneAstro } from './materials.js?v=ms8osh8u';

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
const PUFF = [
  { x: -0.478, y: -0.14, r: 0.239 },
  { x: -0.239, y: 0.08, r: 0.313 },
  { x: 0.018, y: 0.24, r: 0.258 },   // la gobba alta, spostata dal centro
  { x: 0.276, y: 0.04, r: 0.294 },
  { x: 0.534, y: -0.14, r: 0.221 },
  { x: 0.092, y: -0.16, r: 0.294 },  // il corpo, sotto le gobbe
];
// IL TAGLIO DEVE PASSARE SOTTO A TUTTI, non solo a qualcuno: con la riga più in
// basso i batuffoli esterni la sfioravano appena e il fondo veniva smerlato —
// tondo di qua, dritto di là. Qui ogni cerchio ci arriva sotto, quindi la base è
// una riga sola da un capo all'altro.
const FONDO = -0.24;
// QUANTO SI FONDONO. A 0.16 i sei batuffoli diventavano una cupola sola; qui
// restano attaccati ma distinti. Sotto questa soglia ricompaiono le strozzature
// a clessidra fra un cerchio e l'altro.
const FUSIONE = 0.06;

// QUANTO POSSONO GONFIARSI E SCHIACCIARSI le nuvole. Non sono numeri sparsi nel
// costruttore perché sono un VINCOLO: la sagoma più gonfia e più schiacciata
// deve ancora stare dentro il cartello, se no il quadrato la taglia dritta e la
// riga si vede. Il test LIMITI lo verifica su questi valori.
export const LIMITI = {
  rMin: 0.88, rDelta: 0.30,          // raggio dei batuffoli: 0.88 … 1.18
  schiaccioMin: 0.80, schiaccioDelta: 0.40,   // schiacciamento: 0.80 … 1.20
  fusione: FUSIONE,
  // quanto ogni nuvola può spostare e gonfiare i propri batuffoli. Sono
  // DENTRO i limiti apposta: sommati al gonfiore la sagoma deve ancora stare
  // nel cartello, e il test lo verifica sul caso peggiore di TUTTI insieme.
  spostaMax: 0.10, gonfiaMax: 0.26,
};

// COME OGNI NUVOLA DIVENTA DIVERSA DALLE ALTRE.
// Con sei batuffoli fissi e due soli numeri per nuvola (gonfiore e
// schiacciamento) tutte le nuvole avevano la STESSA sagoma vista da lontano — è
// il rilievo del committente, ed era vero: cambiava la taglia, non la forma.
//
// Qui ogni batuffolo ha la SUA reazione alla deformazione della nuvola: uno si
// sposta a destra mentre il vicino sale, uno si gonfia mentre un altro si
// sgonfia. Bastano tre numeri per nuvola (iDeforma) per ottenere sagome che non
// si somigliano, senza un attributo per batuffolo.
//
// I COEFFICIENTI SONO UNA TABELLA, non un hash: la CPU deve calcolare gli
// STESSI centri per l'ombra a terra, e un hash trigonometrico dà risultati
// diversi in float32 (shader) e float64 (JS) — la sagoma e la sua ombra si
// separerebbero. Una tabella scritta a mano è identica dalle due parti.
const REAZIONE = [
  { x: -0.9, y: 0.5, r: 0.8 },
  { x: 0.6, y: -0.8, r: -0.5 },
  { x: -0.3, y: 1.0, r: 0.6 },
  { x: 0.8, y: 0.4, r: -0.9 },
  { x: 1.0, y: -0.5, r: 0.4 },
  { x: -0.5, y: -1.0, r: -0.7 },
];
/** Dove sta e quanto è grosso il batuffolo `i` per una nuvola con questa
 *  deformazione. LA VERITÀ È QUI: la usa la CPU per l'ombra, e il codice GLSL
 *  qui sotto è generato da questa stessa formula. */
export function puffDeformato(i, def) {
  const p = PUFF[i], r = REAZIONE[i];
  return {
    x: p.x + r.x * def.x,
    y: p.y + r.y * def.y,
    r: p.r * (1 + r.r * def.z),
  };
}
const GLSL_SAGOMA = PUFF.map((p, i) => {
  const r = REAZIONE[i];
  return `    d = smin(d, length(uv - vec2(${p.x.toFixed(3)} + ${r.x.toFixed(2)} * g.x, `
    + `${p.y.toFixed(3)} + ${r.y.toFixed(2)} * g.y)) `
    + `- ${p.r.toFixed(3)} * (1.0 + ${r.r.toFixed(2)} * g.z) * f.x, ${FUSIONE});`;
}).join('\n');

const VERT = /* glsl */`
  attribute vec3 iOrig;     // origine: x di partenza, quota, z
  attribute float iVel;     // deriva (unità/s)
  attribute vec2 iDim;      // larghezza e altezza in unità di mondo
  attribute vec3 iForma;    // (raggio dei batuffoli, schiacciamento, riserva)
  attribute vec3 iDeforma;  // quanto questa nuvola sposta e gonfia i batuffoli
  uniform float uTempo;
  uniform float uRaggio;
  uniform vec3 uSole;
  varying vec2 vUv;
  varying vec2 vLuce;
  varying vec3 vForma;
  varying vec3 vDeforma;
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
    vDeforma = iDeforma;

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
  varying vec3 vDeforma;
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
    vec3 f = vForma;
    vec3 g = vDeforma;
    uv.y /= max(f.y, 0.05);                    // schiacciamento della nuvola
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

    const orig = [], vel = [], dim = [], forma = [], deforma = [];
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
        // ogni nuvola gonfia i batuffoli e si schiaccia a modo suo: sei cerchi
        // fissi darebbero dieci nuvole identiche, e in cielo si nota subito
        rBatuffolo: LIMITI.rMin + hash(seme + 31) * LIMITI.rDelta,
        schiaccio: LIMITI.schiaccioMin + hash(seme + 37) * LIMITI.schiaccioDelta,
        // LA DEFORMAZIONE PERSONALE — quella che rende ogni nuvola una nuvola
        // diversa invece della stessa sagoma in tre taglie.
        //
        // NON e' un hash: e' DISTRIBUITA. Con numeri casuali due nuvole su dieci
        // finiscono vicine per pura sfortuna e in cielo si vedono gemelle
        // (misurato: lo scarto minimo era 0.015, cioe' niente). Qui ogni nuvola
        // prende un angolo diverso sul cerchio delle deformazioni, spaziati con
        // la sezione aurea: dieci nuvole = dieci direzioni ben separate, e
        // aggiungerne un'undicesima non rovina la spaziatura delle altre.
        deforma: {
          x: Math.cos(i * 2.39996) * LIMITI.spostaMax,
          y: Math.sin(i * 2.39996) * LIMITI.spostaMax,
          z: (((i * 0.7548776662) % 1) - 0.5) * 2 * LIMITI.gonfiaMax,
        },
      };
      this.nuvole.push(nv);
      orig.push(nv.x0, nv.y, nv.z);
      vel.push(nv.vel);
      dim.push(nv.largo, nv.alto);
      forma.push(nv.rBatuffolo, nv.schiaccio, 0);
      deforma.push(nv.deforma.x, nv.deforma.y, nv.deforma.z);
    }

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iOrig', new THREE.InstancedBufferAttribute(new Float32Array(orig), 3));
    g.setAttribute('iVel', new THREE.InstancedBufferAttribute(new Float32Array(vel), 1));
    g.setAttribute('iDim', new THREE.InstancedBufferAttribute(new Float32Array(dim), 2));
    g.setAttribute('iForma', new THREE.InstancedBufferAttribute(new Float32Array(forma), 3));
    g.setAttribute('iDeforma', new THREE.InstancedBufferAttribute(new Float32Array(deforma), 3));
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
    for (let i = 0; i < numero * PUFF.length; i++) this._box.push(new THREE.Vector4());
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
        for (let i = 0; i < PUFF.length; i++) {
          if (n >= this._box.length) break;
          // GLI STESSI batuffoli che disegna lo shader, deformazione compresa:
          // se qui si usasse la sagoma non deformata, l'ombra sarebbe di
          // un'altra nuvola
          const p = puffDeformato(i, nv.deforma);
          const rx = p.r * nv.rBatuffolo * semi;
          this._box[n++].set(cx + p.x * semi, cz + p.y * semi * 0.7, rx, rx * 0.72);
        }
      }
      impostaOmbreNuvole(this._box.slice(0, n), NUVOLE.ombra);
    }
    this.materiale.uniforms.uAmb.value.copy(ambienteAttuale());   // di notte si spengono
  }
}

export { PUFF };
