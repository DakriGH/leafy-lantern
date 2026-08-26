// BANCO A PIXEL — dire «identico» con un NUMERO, invece che a occhio.
//
// PERCHÉ ESISTE. `docs/RIFONDAZIONE-RESA.md` lo chiedeva come tappa 0 il
// 27 luglio 2026: «una scena fissa, camera fissa, e un confronto a pixel fra
// due configurazioni». Non è mai stato costruito — in tutto `src/` non c'era
// un solo `readPixels` — e per un mese ogni giudizio sull'aspetto è tornato a
// essere «guarda e dimmi». Con Leafy V2 che cambia la resa, quella non è più
// una misura: è una speranza.
//
// ⚠️ DUE TRAPPOLE CHE COSTANO UN POMERIGGIO SE NON LE SAI (le so perché ci
// sono cascato il 26/08, misurando cinque configurazioni diverse e ottenendo
// cinque volte lo stesso identico numero):
//
//  1. **NON si legge dal CANVAS.** Il renderer nasce senza
//     `preserveDrawingBuffer`, quindi dopo il compositing il buffer è già
//     svuotato: `gl.readPixels` sul canvas rende zeri, o — peggio — il
//     fotogramma di PRIMA, che sembra un dato buono. Si disegna dentro un
//     `WebGLRenderTarget` e si legge DA LÌ.
//  2. **Il bersaglio dev'essere a 8 bit.** Un target HalfFloat va letto con
//     `Uint16Array`: con `Float32Array` torna tutto zero, in silenzio.
//
// ⚠️ E PRIMA DI CONFRONTARE, SI CONGELA. Due fotogrammi presi a due istanti
// diversi non si confrontano: cambia la luce, cambia il vento, cambia l'onda.
// `congela()` ferma le otto cose che si muovono; senza, si misura il tempo che
// passa e si crede di misurare uno shader.

import * as THREE from 'three';

/** Le otto cose che devono stare ferme perché due scatti siano confrontabili. */
export function congela(L, { ora = 0.33, tempo = 12.0 } = {}) {
  const prima = {
    auto: L.ciclo.auto, t: L.ciclo.t,
    meteoAuto: L.opzioni && L.opzioni.meteoAuto,
    scala: L.rig.scalaInterna,
  };
  L.ciclo.auto = false;                 // 1. l'ora non scorre
  L.ciclo.t = ora;                      // 2. ed è QUESTA ora
  if (L.ciclo.aggiorna) L.ciclo.aggiorna(0);
  if (L.meteo && L.meteo.stato) L.meteo.auto = false;   // 3. il meteo non cambia
  if (L.aggiornaTempo) L.aggiornaTempo(tempo);          // 4. l'orologio degli shader
  if (L.erba && L.erba.forzaMeteo !== undefined) L.erba.forzaMeteo = 0;  // 5. vento fermo
  L.rig.scalaInterna = 1;               // 6. niente scala di resa
  return prima;                         // 7-8. camera e dpr li fissa chi chiama
}

export function scongela(L, prima) {
  if (!prima) return;
  L.ciclo.auto = prima.auto;
  L.ciclo.t = prima.t;
  if (L.opzioni) L.opzioni.meteoAuto = prima.meteoAuto;
  L.rig.scalaInterna = prima.scala;
}

/**
 * Disegna la scena in un bersaglio fuori schermo e ne rende i pixel RGBA.
 * `dipingi()` è chi disegna: di solito `() => rig.render()`.
 */
export function cattura(rig, dipingi, larghezza = 960, altezza = 540) {
  const r = rig.renderer;
  const bersaglio = new THREE.WebGLRenderTarget(larghezza, altezza, {
    // 8 BIT DI PROPOSITO: un HalfFloat andrebbe letto con Uint16Array, e chi
    // lo legge con Float32Array trova zeri senza un errore. Qui confrontiamo
    // immagini, non accumuliamo luce: otto bit sono il dato giusto.
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const vecchio = r.getRenderTarget();
  const px = new Uint8Array(larghezza * altezza * 4);
  try {
    r.setRenderTarget(bersaglio);
    dipingi();
    r.readRenderTargetPixels(bersaglio, 0, 0, larghezza, altezza, px);
  } finally {
    r.setRenderTarget(vecchio);
    bersaglio.dispose();
  }
  return { px, larghezza, altezza };
}

// ---------------------------------------------------------------- i numeri
// Da qui in giù è tutto PURO: nessun GL, nessun DOM. Si prova in Node.

const _lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/**
 * OKLab: lo spazio in cui una differenza di 1 vale come una differenza di 1
 * anche dall'altra parte della tavolozza. In RGB non è vero, e un confronto in
 * RGB assolve i cambi sui colori scuri — che qui sono le ombre, cioè proprio
 * quello che stiamo giudicando.
 */
export function oklab(r, g, b) {
  const R = _lin(r), G = _lin(g), B = _lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/**
 * QUANTI PIXEL SU CIASCUN GRADINO DI LUCE. È LA misura dello stile a bande: se
 * il gradino di mezzo si gonfia, lo stile è cambiato anche quando il ΔE medio
 * resta basso — ed è esattamente il modo in cui una rampa si intrufola senza
 * farsi notare da una media.
 */
export function istogrammaLuce(px, bande = 3) {
  const conti = new Array(bande + 1).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const L = oklab(px[i], px[i + 1], px[i + 2])[0];
    conti[Math.min(bande, Math.round(L * bande))]++;
  }
  return conti;
}

/**
 * QUANTI PIXEL SONO BORDO. Dice se i contorni si sono ammorbiditi (FXAA, uno
 * smoothstep di troppo, MSAA) SENZA che i colori cambino: due immagini possono
 * avere lo stesso ΔE medio e una sola delle due essere ancora netta.
 */
export function bordi(px, larghezza, altezza, soglia = 0.06) {
  let n = 0;
  for (let y = 1; y < altezza - 1; y++) {
    for (let x = 1; x < larghezza - 1; x++) {
      const i = (y * larghezza + x) * 4;
      const q = oklab(px[i], px[i + 1], px[i + 2])[0];
      const d = (j) => Math.abs(q - oklab(px[j], px[j + 1], px[j + 2])[0]);
      if (Math.max(d(i + 4), d(i - 4), d(i + larghezza * 4), d(i - larghezza * 4)) > soglia) n++;
    }
  }
  return n;
}

/**
 * Il confronto vero: TRE numeri, non uno.
 *
 * La media DA SOLA assolve i cambi di stile — un pugno di pixel stravolti in
 * mezzo a un milione uguali resta una media bassa. Per questo c'è il 99°
 * percentile (il peggio che si vede davvero), e per questo ci sono anche le
 * bande e i bordi: rispondono a due domande diverse — «il tono è cambiato?» e
 * «il contorno si è ammorbidito?».
 */
export function confronta(a, b) {
  if (a.larghezza !== b.larghezza || a.altezza !== b.altezza) {
    throw new Error(`misure diverse: ${a.larghezza}x${a.altezza} contro ${b.larghezza}x${b.altezza}`);
  }
  const n = a.larghezza * a.altezza;
  const delta = new Float64Array(n);
  let somma = 0, diversi = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const A = oklab(a.px[i], a.px[i + 1], a.px[i + 2]);
    const B = oklab(b.px[i], b.px[i + 1], b.px[i + 2]);
    const d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    delta[p] = d; somma += d;
    if (d > 0.004) diversi++;          // sotto questa soglia è rumore di 8 bit
  }
  const ord = Float64Array.from(delta).sort();
  const istoA = istogrammaLuce(a.px), istoB = istogrammaLuce(b.px);
  return {
    deltaMedio: somma / n,
    delta99: ord[Math.floor(n * 0.99)],
    deltaMax: ord[n - 1],
    diversi, frazioneDiversi: diversi / n,
    bande: { a: istoA, b: istoB,
             spostamento: istoA.map((v, i) => (istoB[i] - v) / n) },
    bordi: { a: bordi(a.px, a.larghezza, a.altezza),
             b: bordi(b.px, b.larghezza, b.altezza) },
  };
}

/** Vero se le due immagini sono «la stessa immagine» secondo tutti e tre i metri. */
export function identiche(esito, {
  medio = 0.002, novantanove = 0.01, bande = 0.01, bordi: bordiMax = 0.02,
} = {}) {
  const totBordi = Math.max(esito.bordi.a, 1);
  return esito.deltaMedio <= medio
    && esito.delta99 <= novantanove
    && esito.bande.spostamento.every((s) => Math.abs(s) <= bande)
    && Math.abs(esito.bordi.b - esito.bordi.a) / totBordi <= bordiMax;
}
