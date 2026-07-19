// Luci-sfera: fake pointlight che schiariscono SOLO le superfici compenetrate.
// Nessuna luce three.js reale in tutto il gioco: materiali unlit + shader iniettato.
// (SPEC-TECNICA.md §2)

import * as THREE from 'three';
import { LUCI_MAX, BANDE_LUCE } from '../config.js';

// ---- heightmap del cielo: per colonna, la quota della superficie più alta.
// Serve alle OMBRE DELLE NUVOLE: scuriscono solo la cima della colonna
// (mai grotte o soffitti). Il mesher la aggiorna gratis a ogni rebuild di chunk.
const CIELO_DIM = 256;
const CIELO_ORIGINE = -128;
const _cieloDati = new Float32Array(CIELO_DIM * CIELO_DIM).fill(-1000);
const _cieloTex = new THREE.DataTexture(_cieloDati, CIELO_DIM, CIELO_DIM, THREE.RedFormat, THREE.FloatType);
_cieloTex.magFilter = THREE.NearestFilter;
_cieloTex.minFilter = THREE.NearestFilter;
_cieloTex.needsUpdate = true;

/** Scrive le quote di un chunk (mappa "x,z" → quota superficie). */
export function aggiornaCielo(colonne) {
  for (const [k, alt] of colonne) {
    const [x, z] = k;
    const ix = x - CIELO_ORIGINE, iz = z - CIELO_ORIGINE;
    if (ix < 0 || ix >= CIELO_DIM || iz < 0 || iz >= CIELO_DIM) continue;
    _cieloDati[iz * CIELO_DIM + ix] = alt;
  }
  _cieloTex.needsUpdate = true;
}

// ---- maschera d'ombra delle nuvole ----------------------------------------
// I rettangoli delle scatole vengono DISEGNATI su un piccolo canvas (CPU, poche
// volte al secondo) e lo shader fa UN campionamento a pixel. Prima c'era un
// ciclo fino a 40 rettangoli per OGNI fragment: su GPU mobile erano centinaia
// di operazioni a pixel, il singolo costo più alto di tutto il frame.
// Stesso dominio della heightmap (origine −128, 1 texel = 1 unità): lo shader
// riusa la stessa uv per entrambe le texture.
// 2 texel per unità (512² sul dominio da 256): a 1 texel il bordo NETTO delle
// ombre avanzava a scatti di una cella intera
const OMBRA_DIM = 512;
const _ombraCanvas = document.createElement('canvas');
_ombraCanvas.width = _ombraCanvas.height = OMBRA_DIM;
const _ombraCtx = _ombraCanvas.getContext('2d');
const _ombraTex = new THREE.CanvasTexture(_ombraCanvas);
_ombraTex.flipY = false;                       // riga 0 del canvas = v0, come la DataTexture
_ombraTex.magFilter = THREE.LinearFilter;      // il bilineare fa da bordo morbido (~1 unità)
_ombraTex.minFilter = THREE.LinearFilter;
_ombraTex.generateMipmaps = false;

// ---- maschera della SCHIUMA: footprint di ciò che sta dentro l'acqua -------
// La schiuma è una caratteristica dello shader dell'acqua: qualsiasi cosa
// tocca l'acqua (blocchi via aRiva, furni/oggetti via questa maschera, entità
// in movimento via uPgPos) ha il contorno bianco IN AUTOMATICO — nessuna mesh
// disegnata a mano sui singoli oggetti. Stesso dominio del cielo (origine
// −128, 256 unità) ma 2 texel per unità: l'anello resta leggibile.
const SCHIUMA_DIM = 512;
const _schiumaCanvas = document.createElement('canvas');
_schiumaCanvas.width = _schiumaCanvas.height = SCHIUMA_DIM;
const _schiumaCtx = _schiumaCanvas.getContext('2d');
const _schiumaTex = new THREE.CanvasTexture(_schiumaCanvas);
_schiumaTex.flipY = false;
_schiumaTex.magFilter = THREE.LinearFilter;
_schiumaTex.minFilter = THREE.LinearFilter;
_schiumaTex.generateMipmaps = false;

let _schiumaFirma = '';
/** Ridisegna la maschera: celle = colonne [x,z] occupate in acqua (furni,
 *  oggetti), cerchi = [{x,z,r}] extra (es. impatti delle cascate). */
export function impostaSchiumaAcqua(celle, cerchi = []) {
  const firma = celle.map((c) => c[0] + ',' + c[1]).join(';') + '|' +
    cerchi.map((c) => c.x + ',' + c.z + ',' + c.r.toFixed(1)).join(';');
  if (firma === _schiumaFirma) return;
  _schiumaFirma = firma;
  const ctx = _schiumaCtx, S = SCHIUMA_DIM / CIELO_DIM, OR = CIELO_ORIGINE;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCHIUMA_DIM, SCHIUMA_DIM);
  ctx.fillStyle = '#fff';
  for (const [x, z] of celle) ctx.fillRect((x - OR - 0.42) * S, (z - OR - 0.42) * S, 1.84 * S, 1.84 * S);
  // ANELLI, non dischi. Erano `fill()` di cerchi pieni: ai piedi di una
  // cascata OGNI faccia d'acqua entro il raggio finiva a schiuma piena, a
  // qualsiasi quota (la maschera si campiona solo in XZ) — una delle ragioni
  // del lenzuolo bianco. Il passaggio che li svuotava iterava su `celle`, che
  // il gioco passa sempre vuota, quindi non ha mai svuotato niente.
  ctx.lineWidth = Math.max(2, 0.55 * S);
  ctx.strokeStyle = '#fff';
  for (const c of cerchi) {
    ctx.beginPath();
    ctx.arc((c.x - OR) * S, (c.z - OR) * S, Math.max(0.1, c.r * S - ctx.lineWidth * 0.5), 0, Math.PI * 2);
    ctx.stroke();
  }
  // interni neri DOPO tutti i bianchi: la schiuma è il contorno dell'UNIONE
  ctx.fillStyle = '#000';
  for (const [x, z] of celle) ctx.fillRect((x - OR) * S, (z - OR) * S, S, S);
  _schiumaTex.needsUpdate = true;
}

// Uniform condivisi da OGNI materiale patchato: un solo aggiornamento per frame.
const uniformi = {
  uLuciPosRaggio: { value: Array.from({ length: LUCI_MAX }, () => new THREE.Vector4(0, 0, 0, 1)) },
  uLuciColore: { value: Array.from({ length: LUCI_MAX }, () => new THREE.Vector4(1, 1, 1, 0)) },
  uLuciNum: { value: 0 },
  uAmbiente: { value: new THREE.Color(1, 1, 1) },
  uOmbraNum: { value: 0 },        // 0 = nessuna nuvola: lo shader esce subito
  uOmbraForza: { value: 0.28 },
  uOmbraMask: { value: _ombraTex },
  uCielo: { value: _cieloTex },
  uCieloInfo: { value: new THREE.Vector4(CIELO_ORIGINE, CIELO_ORIGINE, 1 / CIELO_DIM, CIELO_DIM) },
  uTempo: { value: 0 },
  uPioggia: { value: 0 },                        // 0..1: increspature di pioggia
  uRiflesso: { value: null },                    // RT del mirror (riflesso.js)
  uRiflessoMat: { value: new THREE.Matrix4() },
  uRiflessoOn: { value: 0 },                     // 0/1 per-frame
  uRiflessoForza: { value: 1 },                  // slider Impostazioni (0..1.5)
  uPgPos: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uPgNum: { value: 0 },                          // ombre-cono dei personaggi
  uSchiuma: { value: _schiumaTex },              // maschera canvas (impatti cascate)
  uSchiumaRT: { value: null },                   // silhouette dall'alto (schiumaTop.js)
  uSchiumaRTInfo: { value: new THREE.Vector4(0, 0, 0, 0) },   // minX, minZ, 1/est, attivo
  uProfondita: { value: null },                  // depth della scena senza acqua
  uProfInfo: { value: new THREE.Vector4(0.1, 700, 1, 1) },   // near, far, 1/w, 1/h
  uOmbraCottaForza: { value: 1 },                // ombre cotte nella mesh (0 = spente)
  uLuceCottaForza: { value: 1 },                 // luce a voxel (0 = spenta)
  uOraLuce: { value: 1 },                        // 0 notte fonda … 1 pieno giorno
  uGradini: { value: 4 },                        // scalini del cel shading
  uLuceMin: { value: 0.34 },                     // luminosità residua al buio
  uLumeColore: { value: new THREE.Color(1.0, 0.86, 0.62) },   // caldo di lanterna
  uSole: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
  uSoleForza: { value: 0.38 },                   // 0 = nessuna ombra dal sole
  uSchiumaRiva: { value: 0.62 },                 // quanto la banda di riva entra al largo (0..1)
  // in AR il mondo vive dentro un pivot ruoto-scalato: questa è la sua INVERSA,
  // così vPosMondo resta in coordinate MONDO e luci/ombre/schiuma funzionano
  // anche sul diorama in AR (identità quando l'AR è spenta)
  uMondoInv: { value: new THREE.Matrix4() },
};

/** Le uniform condivise, per ispezionarle e regolarle dal vivo (debug/opzioni). */
export function uniformiCondivise() { return uniformi; }

/** Matrice mondo→pivot inversa (AR). Passare null per tornare all'identità. */
export function impostaMondoInv(matrice) {
  if (matrice) uniformi.uMondoInv.value.copy(matrice);
  else uniformi.uMondoInv.value.identity();
}

/** Collega la mappa di profondità del frame (per la schiuma di bordo). */
export function impostaProfondita(texture, near, far, w, h) {
  uniformi.uProfondita.value = texture;
  uniformi.uProfInfo.value.set(near, far, 1 / Math.max(1, w), 1 / Math.max(1, h));
}

/** Collega la silhouette dall'alto (schiuma a forma esatta) al frame. */
export function impostaSchiumaTop(texture, info) {
  uniformi.uSchiumaRT.value = texture;
  uniformi.uSchiumaRTInfo.value.copy(info);
}

/** Ombre-cono dei personaggi (player, gatto remoto, palle): {x,y,z,r} dai piedi. */
export function impostaOmbrePg(lista) {
  const n = Math.min(lista.length, 6);
  for (let i = 0; i < n; i++) {
    const e = lista[i];
    uniformi.uPgPos.value[i].set(e.x, e.y, e.z, e.r);
  }
  uniformi.uPgNum.value = n;
}

/** Orologio degli shader animati (acqua): da chiamare una volta per frame. */
export function aggiornaTempo(secondi) { uniformi.uTempo.value = secondi; }

/** Intensità della pioggia (0..1): accende le increspature sull'acqua. */
export function impostaPioggia(v) { uniformi.uPioggia.value = v; }
export function intensitaPioggia() { return uniformi.uPioggia.value; }

/** Collega il riflesso planare del frame (o lo spegne se ok=false). */
export function impostaRiflesso(ok, texture, matrice) {
  uniformi.uRiflessoOn.value = ok ? 1 : 0;
  if (ok) {
    uniformi.uRiflesso.value = texture;
    uniformi.uRiflessoMat.value.copy(matrice);
  }
}
export function impostaForzaRiflesso(f) { uniformi.uRiflessoForza.value = f; }

/** Le nuvole pubblicano qui i rettangoli (XZ) delle loro scatole = ombra reale.
 *  box = Vector4(minX, minZ, maxX, maxZ) in coordinate mondo. */
export function impostaOmbreNuvole(box, forza) {
  const ctx = _ombraCtx;
  const S = OMBRA_DIM / CIELO_DIM;               // texel per unità di mondo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OMBRA_DIM, OMBRA_DIM);
  ctx.fillStyle = '#fff';
  for (const b of box) {
    ctx.fillRect((b.x - CIELO_ORIGINE) * S, (b.y - CIELO_ORIGINE) * S, (b.z - b.x) * S, (b.w - b.y) * S);
  }
  _ombraTex.needsUpdate = true;
  uniformi.uOmbraNum.value = box.length ? 1 : 0;
  if (forza !== undefined) uniformi.uOmbraForza.value = forza;
}

const GLSL_VERTEX = /* glsl */`
  varying vec3 vPosMondo;
  uniform mat4 uMondoInv;
  // Ombra cotta dal mesher: 0 = piena luce, 1 = massimo buio. Il verso conta:
  // le geometrie che NON passano dal mesher (gatto, mano, mobili) condividono
  // questo shader e non hanno l'attributo — WebGL glielo legge 0, cioè
  // "nessuna ombra", ed è esattamente quello che serve.
  attribute float aOmbra;
  varying float vOmbra;
  // Luce cotta a voxel. aCieloMan = quanto cielo MANCA (0 = pieno sole), aLume
  // = luce artificiale. Il verso di aCieloMan serve a far leggere "cielo pieno"
  // alle geometrie che non hanno l'attributo (gatto, mobili).
  attribute float aCieloMan;
  attribute float aLume;
  varying float vCieloMan;
  varying float vLume;
`;
const GLSL_FRAGMENT = /* glsl */`
  varying vec3 vPosMondo;
  varying float vOmbra;
  varying float vCieloMan;
  varying float vLume;
  uniform float uOmbraCottaForza;   // 0 = spenta (opzione grafica)
  uniform float uLuceCottaForza;
  uniform float uOraLuce;           // 0 = notte fonda, 1 = pieno giorno
  uniform float uGradini;           // quanti scalini ha il cel shading
  uniform float uLuceMin;           // quanto resta al buio (mai 0: niente macchie nere)
  uniform vec3  uLumeColore;        // tinta della luce artificiale
  uniform vec3  uSole;              // direzione VERSO il sole (normalizzata)
  uniform float uSoleForza;         // quanto scurisce l'ombra del sole
  // L'altimetria del mondo. Dichiarata QUI, in cima, e non più più in basso
  // accanto alle ombre delle nuvole: GLSL pretende la dichiarazione prima
  // dell'uso, e ombraSole() la usa. Averla lasciata sotto faceva fallire la
  // compilazione dell'intero shader — schermo vuoto, senza che il gioco desse
  // il minimo segno di errore se non in console.
  uniform sampler2D uCielo;
  uniform vec4 uCieloInfo;

  // OMBRE DEL SOLE — quelle che si muovono con l'ora.
  //
  // Il canale CIELO della luce cotta scende dritto in giù, quindi sotto cielo
  // aperto vale il massimo OVUNQUE: moltiplicarlo per l'ora scuriva tutto in
  // modo uniforme, cioè un dimmer, non un'ombra. Le ombre vere richiedono la
  // DIREZIONE del sole, e cambiano forma e lunghezza durante il giorno.
  //
  // Niente shadow map: si cammina nell'altimetria del mondo (la stessa texture
  // che già serve alle nuvole) verso il sole. Se una colonna lungo il cammino
  // è più alta del raggio, il punto è in ombra. Costa qualche campionamento e
  // dà ombre lunghe all'alba, corte a mezzogiorno, dal lato giusto.
  float ombraSole() {
    if (uSole.y <= 0.06) return 1.0;              // sole sotto l'orizzonte: notte
    // passo proporzionale all'inclinazione: col sole basso le ombre sono lunghe
    float passo = mix(2.4, 0.7, clamp(uSole.y, 0.0, 1.0));
    vec3 p = vPosMondo + uSole * (passo * 0.6);   // staccato: niente auto-ombra
    for (int i = 0; i < 10; i++) {
      vec2 uv = (p.xz - uCieloInfo.xy) * uCieloInfo.z;
      if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) break;
      float quota = texture2D(uCielo, uv).r;
      if (quota > p.y + 0.3) {
        // bordo a gradini, come tutto il resto della grafica
        return 1.0 - uSoleForza;
      }
      p += uSole * passo;
    }
    return 1.0;
  }

  // IL CEL SHADING. I due canali si combinano prendendo il massimo: una stanza
  // chiusa e illuminata resta illuminata anche a mezzogiorno, e di notte —
  // quando uOraLuce scende — sopravvive solo ciò che le lanterne raggiungono.
  // Il risultato si QUANTIZZA a pochi gradini: le fasce nette non sono un
  // effetto aggiunto sopra, sono la luce stessa arrotondata.
  vec3 luceCotta() {
    // il sole ombreggia SOLO il canale cielo: una lanterna dentro casa non si
    // spegne perché fuori è passata una nuvola o è calata la sera
    float cielo = (1.0 - vCieloMan) * uOraLuce * ombraSole();
    float lume = vLume;
    float grezzo = max(cielo, lume);
    float scalino = floor(grezzo * uGradini + 0.5) / uGradini;
    float f = uLuceMin + (1.0 - uLuceMin) * scalino;
    // dove domina la luce artificiale la tinta vira sul caldo della lanterna
    float quota = clamp(lume - cielo, 0.0, 1.0);
    return vec3(f) * mix(vec3(1.0), uLumeColore, quota * 0.75);
  }
  uniform float uSchiumaRiva;       // soglia della banda di schiuma sulla riva
  uniform vec4 uLuciPosRaggio[${LUCI_MAX}];
  uniform vec4 uLuciColore[${LUCI_MAX}];
  uniform int uLuciNum;
  uniform vec3 uAmbiente;
  uniform int uOmbraNum;
  uniform float uOmbraForza;
  uniform sampler2D uOmbraMask;

  // Ombra delle nuvole: la sagoma (unione dei rettangoli-scatola) è pre-disegnata
  // in una maschera → UN campionamento a pixel, forma esatta della nuvola.
  // Scurisce SOLO la superficie più alta della colonna (heightmap: niente grotte).
  float lanternaOmbra() {
    if (uOmbraNum == 0 || uOmbraForza <= 0.0) return 1.0;
    vec2 uvC = (vPosMondo.xz - uCieloInfo.xy) * uCieloInfo.z;
    if (uvC.x <= 0.0 || uvC.x >= 1.0 || uvC.y <= 0.0 || uvC.y >= 1.0) return 1.0;
    float quota = texture2D(uCielo, uvC).r;
    if (vPosMondo.y < quota - 0.35) return 1.0;      // al coperto: niente ombra
    // Bordo netto ma NON binario. Con step() il filtro bilineare della maschera
    // veniva buttato via: il bordo poteva cadere solo su un confine di texel e
    // avanzava a salti di mezza unità di mondo — è da lì che veniva il
    // movimento "a pezzi". La maschera è 512² su 256 unità, cioè 2 texel per
    // unità: smoothstep su una fascia stretta tiene il taglio netto in stile
    // toon ma lascia passare la rampa fra i due texel, e il bordo scorre.
    float m = texture2D(uOmbraMask, uvC).r;
    float dentro = smoothstep(0.35, 0.65, m);
    return 1.0 - uOmbraForza * dentro;
  }

  uniform vec4 uPgPos[6];
  uniform int uPgNum;

  // Ombra-cono dei personaggi (stile Minecraft Bedrock): un cono proiettato
  // in giù dai piedi che SCURISCE LE MESH che attraversa — si adagia sui bordi
  // dei blocchi invece di saltare al piano sotto, e si stringe con la profondità.
  float ombraPg() {
    float f = 1.0;
    if (uPgNum == 0) return f;

    // PROFONDITÀ CORTA invece del cancello sull'altimetria. Il test qui sotto è
    // geometrico — un tronco di cono verticale con distanza solo orizzontale —
    // e con 6 unità di portata scuriva insieme il tavolo, il pavimento sotto e
    // il soffitto della grotta: era l'ombra che "trapassa gli oggetti".
    // Il primo tentativo (posare l'ombra solo sulla cima della colonna, come
    // le nuvole) ha risolto quello ma ne ha creato uno peggiore: DENTRO UNA
    // CAVERNA il pavimento non è la cima di nessuna colonna, e l'ombra spariva
    // del tutto. Bastava accorciare la portata: sotto i piedi c'è quasi sempre
    // il terreno entro un'unità e mezza, e un soffitto cinque metri più giù
    // resta fuori. Funziona anche al chiuso.
    for (int i = 0; i < 6; i++) {
      if (i >= uPgNum) break;
      vec4 o = uPgPos[i];
      float prof = o.y - vPosMondo.y;
      if (prof < -0.06 || prof > 1.6) continue;
      float raggio = o.w * (1.0 - prof * 0.30);
      if (raggio <= 0.02) continue;
      float d = distance(vPosMondo.xz, o.xz);
      if (d >= raggio) continue;
      // UN solo disco netto (le due bande concentriche non piacevano);
      // il fade con la profondità va a scatti (niente gradienti morbidi)
      float fade = ceil((1.0 - prof / 1.6) * 3.0) / 3.0;
      f = min(f, 1.0 - 0.45 * fade);
    }
    return f;
  }

  vec3 lanternaAccumulo() {
    vec3 acc = vec3(0.0);
    if (uLuciNum == 0) return acc;                    // giorno senza lampade: costo zero
    for (int i = 0; i < ${LUCI_MAX}; i++) {
      if (i >= uLuciNum) break;
      vec4 pr = uLuciPosRaggio[i];
      vec3 dv = vPosMondo - pr.xyz;
      float d2 = dot(dv, dv);
      if (d2 < pr.w * pr.w) {                         // sqrt e divisione solo dentro la sfera
        float f = 1.0 - sqrt(d2) / pr.w;
        // anelli concentrici: le sfere si sommano dove si compenetrano
        float banda = ceil(min(f, 1.0) * ${BANDE_LUCE}.0) / ${BANDE_LUCE}.0;
        acc += uLuciColore[i].rgb * uLuciColore[i].a * banda;
      }
    }
    return acc;
  }
`;

function iniettaLanterna(shader) {
  Object.assign(shader.uniforms, uniformi);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_VERTEX)
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPosMondo = (uMondoInv * modelMatrix * vec4(transformed, 1.0)).xyz;\n'
      + 'vOmbra = aOmbra;\nvCieloMan = aCieloMan;\nvLume = aLume;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL_FRAGMENT)
    .replace('#include <opaque_fragment>',
      'outgoingLight = outgoingLight * (uAmbiente + lanternaAccumulo()) * lanternaOmbra() * ombraPg() * (1.0 - vOmbra * uOmbraCottaForza) * mix(vec3(1.0), luceCotta(), uLuceCottaForza);\n#include <opaque_fragment>');
}

export function patchLuci(materiale) {
  materiale.onBeforeCompile = iniettaLanterna;
  // marca per il cache-key: materiali con patch diversa non condividono programma
  materiale.customProgramCacheKey = () => 'lanterna-luci';
  return materiale;
}

// ---- acqua (riflessi + cascate + pioggia) -----------------------------------
// Il pelo è PULITO: niente texture disegnata sopra. Il wobble del riflesso e i
// filamenti delle cascate sono PROCEDURALI (somme di seni): nessuna forma
// riconoscibile, niente "cerchi". I cerchi restano solo dove hanno senso:
// gli anelli di pioggia che nascono e si allargano.

const GLSL_ACQUA_VERTEX = /* glsl */`
  attribute vec3 aAcqua;
  attribute float aRiva;
  varying vec3 vAcqua;
  varying float vRiva;
  varying vec4 vRiflessoUv;
  uniform mat4 uRiflessoMat;
  uniform float uTempo;
`;
const GLSL_ACQUA_FRAGMENT = /* glsl */`
  varying vec3 vAcqua;
  varying float vRiva;
  varying vec4 vRiflessoUv;
  uniform sampler2D uRiflesso;
  uniform sampler2D uSchiuma;
  uniform sampler2D uSchiumaRT;
  uniform vec4 uSchiumaRTInfo;
  uniform float uTempo;
  uniform float uPioggia;
  uniform float uRiflessoOn;
  uniform float uRiflessoForza;
  float _schiumaAcqua;   // quanta schiuma qui: usata come EMISSIVA (brilla anche di notte)

  float lanternaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value-noise morbido: la base di schiuma, wobble e scie (MAI ripetitivo)
  float lanternaRumore(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(lanternaHash(i), lanternaHash(i + vec2(1.0, 0.0)), f.x),
      mix(lanternaHash(i + vec2(0.0, 1.0)), lanternaHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // increspature di pioggia: anelli che nascono e si allargano su una griglia
  // pseudo-casuale (solo pixel d'acqua, solo quando piove)
  float anelliPioggia(vec2 p) {
    float somma = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 pk = p * 0.9 + float(k) * 17.31;
      vec2 cella = floor(pk);
      float h = fract(sin(dot(cella + float(k) * 3.7, vec2(127.1, 311.7))) * 43758.5453);
      float fase = fract(uTempo * (0.8 + 0.4 * h) + h * 7.0);
      vec2 centro = cella + 0.5 + (vec2(h, fract(h * 7.13)) - 0.5) * 0.7;
      float d = length(pk - centro);
      somma += smoothstep(0.05, 0.0, abs(d - fase * 0.45)) * (1.0 - fase);
    }
    return min(somma, 1.0);
  }
`;
// tipo faccia: 0 sorgente calma · 1 scorre · 2 cascata · 5 piatto
// Il pelo è PULITO: niente pattern disegnato sopra — solo riflessi (con wobble
// organico), anelli di pioggia e strisce tenui sulle cascate. Lo scorrimento
// lo raccontano i particellari (fx/particelle.js), non la texture.
const GLSL_ACQUA_COLORE = /* glsl */`
{
  float tipoA = vAcqua.z;
  float band = 0.0;
  _schiumaAcqua = 0.0;
  if (tipoA < 1.5) {
    float lontano = clamp(distance(cameraPosition, vPosMondo) / 32.0, 0.0, 1.0);

    // RIFLESSO: wobble a VALUE-NOISE (mai ripetitivo) che sfuma con la
    // distanza — da lontano lo specchio resta fermo, niente pattern
    if (uRiflessoOn > 0.5) {
      vec2 pw = vPosMondo.xz * 0.6 + vAcqua.xy * uTempo * 0.4;
      vec2 w = vec2(lanternaRumore(pw + uTempo * 0.16), lanternaRumore(pw.yx - uTempo * 0.13)) - 0.5;
      vec4 ruv = vRiflessoUv;
      ruv.xy += w * 0.035 * (1.0 - lontano * 0.85) * ruv.w;
      vec3 rifl = texture2DProj(uRiflesso, ruv).rgb;
      vec3 vistaDir = normalize(cameraPosition - vPosMondo);
      float fres = pow(1.0 - clamp(vistaDir.y, 0.0, 1.0), 1.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, rifl, (0.28 + 0.42 * fres) * uRiflessoForza);
    }

    // SCHIUMA = CARATTERISTICA DELLO SHADER, per tutto ciò che tocca l'acqua:
    //  · RIVE e blocchi: dal gradiente aRiva (0 al bordo coi solidi);
    //  · TUTTO IL RESTO (furni di qualsiasi forma, gatti, palle, NPC futuri):
    //    silhouette dall'alto della sola geometria che BUCA il pelo — la
    //    schiuma segue la forma vera, niente footprint quadrati.
    // Banda BIANCA piena e NETTA (step), appena spezzata dal noise.
    // IL RUMORE VARIA ANCHE IN VERTICALE. Prima era campionato solo in XZ: su
    // una faccia in pendenza — una rampa scende fino a ~2 unità in Y su 1 di
    // XZ — lo stesso valore si ripeteva lungo tutta la linea di massima
    // pendenza, il bianco non si spezzava mai e la faccia superiore diventava
    // una striscia piena. È IL bug dell'acqua che scorre tutta bianca. Il ramo
    // delle cascate era già stato curato così, ma le facce in pendenza non ci
    // passano: hanno tipo 1, non 2, e finiscono in questo ramo, mai corretto.
    float frasta = lanternaRumore(
      vPosMondo.xz * 3.4 + vec2(vPosMondo.y * 2.6, -vPosMondo.y * 1.9) + uTempo * vec2(0.4, 0.3));
    float bordoRiva = 1.0 - vRiva;
    // silhouette VIVA: il punto di campionamento ONDEGGIA col tempo (il
    // contorno non sta mai fermo) e l'anello di dilatazione "respira"
    float sagoma = 0.0;
    if (uSchiumaRTInfo.w > 0.5) {
      vec2 wob = (vec2(
        lanternaRumore(vPosMondo.xz * 1.9 + uTempo * vec2(0.55, 0.4)),
        lanternaRumore(vPosMondo.zx * 1.9 - uTempo * vec2(0.5, 0.35))) - 0.5) * 0.3;
      vec2 uvT = (vPosMondo.xz + wob - uSchiumaRTInfo.xy) * uSchiumaRTInfo.z;
      if (uvT.x > 0.001 && uvT.x < 0.999 && uvT.y > 0.001 && uvT.y < 0.999) {
        float o = (0.32 + 0.08 * sin(uTempo * 2.3)) * uSchiumaRTInfo.z;
        sagoma = texture2D(uSchiumaRT, uvT).r;
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT + vec2(o, 0.0)).r);
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT - vec2(o, 0.0)).r);
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT + vec2(0.0, o)).r);
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT - vec2(0.0, o)).r);
      }
    }
    vec2 uvS = (vPosMondo.xz - uCieloInfo.xy) * uCieloInfo.z;
    float maschera = step(0.5, texture2D(uSchiuma, uvS).r);   // impatti cascate
    float vivo = lanternaRumore(vPosMondo.xz * 4.6 + uTempo * vec2(1.2, 0.9));
    // SCHIUMA DI RIVA, rifatta. Adesso aRiva è una DISTANZA vera dalla sponda
    // (0 = addosso, 1 = a RIVA_PORTATA celle di distanza), non più un sì/no:
    // per questo la banda può finalmente essere larga più di una cella.
    //
    // La forma è una CRESTA, non una soglia secca: massima appena staccata
    // dalla riva, poi si dirada verso il largo. Questo è anche ciò che salva i
    // canali stretti che una volta diventavano fogli bianchi — lì l'acqua sta
    // tutta a ridosso delle sponde, cioè nella parte iniziale della cresta, e
    // non nel suo massimo. uSchiumaRiva regola quanto la banda entra al largo.
    float dist = clamp(vRiva / max(uSchiumaRiva, 0.001), 0.0, 1.0);
    float cresta = smoothstep(0.0, 0.22, dist) * (1.0 - smoothstep(0.55, 1.0, dist));
    // il noise la sfrangia: bordo vivo e irregolare, mai una lastra geometrica
    float schiumaRiva = smoothstep(0.34, 0.62, cresta * (0.55 + 0.75 * frasta));
    // silhouette e SCIA (il RT sfuma la storia): chiazze che vivono col tempo
    float schiumaSag = step(0.62, sagoma * (0.55 + 0.55 * vivo));
    float schiuma = max(max(schiumaRiva, maschera), schiumaSag);
    band = max(band, schiuma);
    diffuseColor.a = min(1.0, diffuseColor.a + schiuma * 0.55);

    // CORRENTE: scie allungate lungo il flusso, trascinate dalla corrente
    if (tipoA >= 0.5) {
      vec2 pf = vPosMondo.xz - vAcqua.xy * uTempo * 1.2;
      float lungoF = dot(pf, vAcqua.xy);
      float traverso = dot(pf, vec2(-vAcqua.y, vAcqua.x));
      float scia = lanternaRumore(vec2(lungoF * 0.9, traverso * 3.5));
      band = max(band, smoothstep(0.68, 0.86, scia) * 0.3);
    }

    // pioggia: anelli bianchi sul pelo (solo quando piove)
    if (uPioggia > 0.01) band = max(band, anelliPioggia(vPosMondo.xz) * uPioggia);
  } else if (tipoA < 2.5) {
    // CASCATA / acqua CHE SCORRE in diagonale: NON una lastra bianca — resta
    // azzurra, con filamenti bianchi SOTTILI che corrono in giù (soglia alta:
    // prima step(0.35) copriva i 2/3 della faccia → tutta bianca)
    float colonna = lanternaRumore(vec2((vPosMondo.x + vPosMondo.z) * 1.9, floor(vPosMondo.y * 0.6)));
    float scorri = sin(vPosMondo.y * 4.8 + uTempo * 5.4 + colonna * 9.0);
    float filo = smoothstep(0.72, 0.96, scorri) * 0.7;
    // sottile frangia al ciglio (dove trabocca), non su tutta l'altezza
    float frangia = smoothstep(0.82, 0.98, lanternaRumore(vPosMondo.xz * 3.1) * 0.4 + fract(-vPosMondo.y) * 0.6) * 0.6;
    band = max(filo, frangia);
    diffuseColor.a = min(1.0, diffuseColor.a + band * 0.25);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), band);
  _schiumaAcqua = band;         // la schiuma brillerà (emissiva) anche al buio
}
`;

export function patchAcqua(materiale) {
  materiale.onBeforeCompile = (shader) => {
    iniettaLanterna(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_ACQUA_VERTEX)
      .replace('#include <begin_vertex>',
        `#include <begin_vertex>
vAcqua = aAcqua;
vRiva = aRiva;
// ONDE: il pelo respira (3 seni mischiati a frequenze scollegate — niente
// pattern) e le facce piatte smettono di leggersi come lastre rettangolari.
// Cascate e pareti (tipo 2..4) restano ferme: si muove solo la superficie.
if (aAcqua.z < 1.5 || aAcqua.z > 4.5) {
  transformed.y += (sin(transformed.x * 0.9 + uTempo * 1.25)
                  + sin(transformed.z * 1.15 - uTempo * 1.05)
                  + sin((transformed.x + transformed.z) * 0.55 + uTempo * 0.8)) * 0.022;
}
vRiflessoUv = uRiflessoMat * vec4((modelMatrix * vec4(transformed, 1.0)).xyz, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_ACQUA_FRAGMENT)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_ACQUA_COLORE)
      // la schiuma è EMISSIVA: si aggiunge DOPO l'illuminazione lanterna, così
      // resta bianca e visibile anche di notte (prima veniva moltiplicata per
      // l'ambiente scuro → schiuma "nera")
      .replace('#include <opaque_fragment>',
        'outgoingLight += _schiumaAcqua * vec3(0.85);\n#include <opaque_fragment>');
  };
  materiale.customProgramCacheKey = () => 'lanterna-acqua';
  return materiale;
}

export function impostaAmbiente(colore) {
  uniformi.uAmbiente.value.copy(colore);
  // IL CICLO GIORNO/NOTTE DELLE OMBRE nasce qui, e non serve altro: il ciclo
  // chiama questa funzione a ogni frame con il colore d'ambiente, e la sua
  // luminosità diventa uOraLuce, cioè quanto conta il canale CIELO della luce
  // cotta. Al calare della sera il cielo si spegne, le zone che vedevano solo
  // il sole scivolano in ombra e restano illuminate solo quelle raggiunte
  // dalle lanterne — che non dipendono dall'ora. La mesh non si ricostruisce
  // mai: cambia un solo numero.
  const l = colore.r * 0.299 + colore.g * 0.587 + colore.b * 0.114;
  // la notte non va a zero: resterebbe un buio illeggibile invece di una notte
  uniformi.uOraLuce.value = Math.max(0.18, Math.min(1, l));
}

/**
 * Posizione del sole dall'ora del giorno (t: 0 mezzanotte, 0.5 mezzogiorno).
 * È QUESTA a produrre le ombre che si muovono: all'alba il sole è basso a est
 * e le ombre sono lunghe verso ovest, a mezzogiorno è alto e sono corte, al
 * tramonto si allungano dall'altra parte.
 */
export function impostaSole(t) {
  // t=0.25 alba (orizzonte est) · 0.5 zenit · 0.75 tramonto (orizzonte ovest)
  const a = (t - 0.25) * Math.PI * 2;
  // la componente z inclinata evita che le ombre cadano perfettamente lungo un
  // asse della griglia, dove sparirebbero dietro i blocchi che le generano
  uniformi.uSole.value.set(Math.cos(a), Math.sin(a), 0.42).normalize();
}

/** Il colore ambiente corrente (per chi si tinge a mano, es. le nuvole). */
export function ambienteAttuale() { return uniformi.uAmbiente.value; }

// ---- registro delle sorgenti ----------------------------------------------

const sorgenti = new Set();

/** Registra una sfera di luce. Ritorna l'handle {pos, raggio, colore, intensita, attiva}. */
export function creaLuce({ pos = new THREE.Vector3(), raggio = 4, colore = 0xffd889, intensita = 1, attiva = true } = {}) {
  const luce = { pos: pos.clone(), raggio, colore: new THREE.Color(colore), intensita, attiva };
  sorgenti.add(luce);
  return luce;
}

export function rimuoviLuce(luce) { sorgenti.delete(luce); }

/** Per il menu di debug: elenco sorgenti e contatori. */
export function elencoLuci() { return [...sorgenti]; }
export function statLuci() {
  let attive = 0;
  for (const l of sorgenti) if (l.attiva && l.intensita > 0) attive++;
  return { totali: sorgenti.size, attive, inviate: uniformi.uLuciNum.value };
}

const _ordinabili = [];

/** Da chiamare una volta per frame: sceglie le LUCI_MAX più vicine al fuoco (player). */
export function aggiornaLuci(fuoco) {
  _ordinabili.length = 0;
  for (const l of sorgenti) {
    if (!l.attiva || l.intensita <= 0) continue;
    _ordinabili.push(l);
  }
  if (_ordinabili.length > LUCI_MAX) {
    _ordinabili.sort((a, b) => a.pos.distanceToSquared(fuoco) - b.pos.distanceToSquared(fuoco));
    _ordinabili.length = LUCI_MAX;
  }
  for (let i = 0; i < _ordinabili.length; i++) {
    const l = _ordinabili[i];
    uniformi.uLuciPosRaggio.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.raggio);
    uniformi.uLuciColore.value[i].set(l.colore.r, l.colore.g, l.colore.b, l.intensita);
  }
  uniformi.uLuciNum.value = _ordinabili.length;
}

// ---- fabbriche di materiali -----------------------------------------------
// Condivisi: tutti i chunk usano le STESSE due istanze (un solo programma GPU).

let _matMondo = null;
export function materialeMondo() {
  if (!_matMondo) _matMondo = patchLuci(new THREE.MeshBasicMaterial({ vertexColors: true }));
  return _matMondo;
}

let _matAcqua = null;
export function materialeAcqua() {
  if (!_matAcqua) {
    _matAcqua = patchAcqua(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
    }));
  }
  return _matAcqua;
}

/** Materiali dei furni con texture: le stagioni li ritingono (vedi stagioni.js). */
export const materialiConMappa = new Set();

/** Converte un materiale qualsiasi (es. dai FBX) in unlit patchato, preservando mappa e colore. */
export function convertiUnlit(sorgente, geometria) {
  const mappa = sorgente && sorgente.map ? sorgente.map : null;
  if (mappa) {
    mappa.magFilter = THREE.NearestFilter;
    mappa.minFilter = THREE.NearestFilter;
    mappa.generateMipmaps = false;
    mappa.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshBasicMaterial({
    map: mappa,
    color: sorgente && sorgente.color ? sorgente.color.clone() : new THREE.Color(0xffffff),
    vertexColors: !!(geometria && geometria.attributes && geometria.attributes.color),
  });
  if (mappa) {
    m.userData.mapOriginale = mappa;
    materialiConMappa.add(m);
  }
  return patchLuci(m);
}
