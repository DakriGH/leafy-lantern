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

/** Le NOVE cose che devono stare ferme perché due scatti siano confrontabili.
 *
 *  ⚠ LA NONA È ARRIVATA DOPO, E LA SUA ASSENZA HA PRODOTTO UNA MISURA FALSA che
 *  sembrava un trionfo. `fx/campoSole.js` ricalcola A FETTE dentro un bilancio
 *  di 2 ms e pubblica la texture solo alla fine: nei frame subito dopo un cambio
 *  d'ora — o dopo aver generato un mondo — lo shader legge un campo A METÀ.
 *  Il 27/08/2026 ho misurato l'indice di frastagliatura in quella finestra e mi
 *  è uscito 0,028; a campo finito, stesso identico stato, 0,140. Cinque volte
 *  meglio, e nel verso che fa credere riuscita qualunque cura si sia appena
 *  scritta. L'ho preso solo perché ho rifatto il controllo con e senza erba.
 *  Da qui la riga in fondo: si dà UN giro di loop (che porta al campo la
 *  direzione nuova del sole) e poi si DRENA. */
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
  // 9. IL CAMPO DEL SOLE DEVE AVER FINITO. Un giro di loop perché `aggiorna`
  // veda la direzione nuova e avvii il ricalcolo, poi si drena senza bilancio.
  // Senza queste due righe si fotografa un'ombra a metà costruzione.
  if (L.campoSole && L.passo) {
    L.passo(performance.now());
    if (L.campoSole.finisci) L.campoSole.finisci();
  }
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

// ------------------------------------------------------- «SEGHETTATO», in numero
//
// PERCHÉ SERVE. Il 27/08/2026 il committente ha bocciato le ombre per la TERZA
// volta con le stesse parole — «seghettate e non corrispondenti, tanti triangoli
// storti». Le prime due volte la cura è stata giudicata a occhio, e le prime due
// volte il difetto è tornato. Un difetto che si giudica a occhio non si chiude:
// si rimanda.
//
// I tre metri di sopra NON bastano per questo. ΔE dice quanto è cambiato il
// colore, l'istogramma dice se le bande si sono spostate, e `bordi` conta i
// pixel-bordo di TUTTA l'immagine — dove il contorno di un cubo pesa quanto il
// contorno di un'ombra. Nessuno dei tre sa rispondere alla domanda vera: **il
// bordo di QUESTA ombra è una linea o è un pettine?**
//
// L'IDEA, e regge su una proprietà sola: un dente largo un pixel non sopravvive
// a un voto di maggioranza 3×3, una linea dritta sì. Quindi si passa la macchia
// al voto e si contano i pixel che CAMBIANO IDEA, per pixel di bordo.
// Zero = il bordo era già una linea. Verso uno = ogni pixel di bordo era un dente.
//
// ⚠ NON si misura di quanto CALA il perimetro, che era il primo tentativo e non
// funziona: il perimetro conta PIXEL, e un pettine di denti da un pixel ne ha
// quasi quanti una linea dritta — uno per riga, solo spostato. Misurato: 0,128
// su un pettine che a occhio è un pettine, contro lo 0,03 di una linea. Il
// segnale c'era ma non separava. I pixel che cambiano idea separano di dieci
// volte, perché una linea è un PUNTO FISSO del voto e un pettine no.
//
// ⚠ E LA DIAGONALE A 45° DEVE RESTARE FERMA, se no il metro boccia la geometria
// invece del difetto: in questo gioco le ombre cadono quasi sempre in
// diagonale. Il voto è costruito apposta perché lo sia — un pixel appena dentro
// una diagonale perfetta ha 6 vicini su 9 dentro e ci resta, uno appena fuori ne
// ha 3 e resta fuori. Alla PARITÀ si tiene il valore di prima, che è la riga che
// rende la diagonale un punto fisso. C'è una prova che lo pretende.

/** I pixel in cui due immagini differiscono: è la MACCHIA da misurare (di
 *  solito «lo stesso fotogramma con e senza l'ombra del sole»). */
export function maschera(a, b, soglia = 0.004) {
  if (a.larghezza !== b.larghezza || a.altezza !== b.altezza) {
    throw new Error(`misure diverse: ${a.larghezza}x${a.altezza} contro ${b.larghezza}x${b.altezza}`);
  }
  const n = a.larghezza * a.altezza;
  const m = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const A = oklab(a.px[i], a.px[i + 1], a.px[i + 2]);
    const B = oklab(b.px[i], b.px[i + 1], b.px[i + 2]);
    if (Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) > soglia) m[p] = 1;
  }
  return m;
}

/** Quanti pixel della macchia toccano il fuori (vicinato a 4).
 *
 *  ⚠ IL BORDO DELLO SCHERMO NON CONTA, ed è una riga che cambia il numero di
 *  molto: un'ombra tagliata dall'inquadratura non ha lì un bordo VERO, e
 *  contarlo gonfia il denominatore con pixel che non hanno niente da dire sulla
 *  frastagliatura. Misurato sul pettine di prova: contando lo schermo l'indice
 *  usciva 0,268, senza esce 0,67 — e il difetto è lo stesso. Un'ombra che tocca
 *  il fondo dell'inquadratura è la norma, non l'eccezione. */
function perimetro(m, larghezza, altezza) {
  let n = 0;
  for (let y = 0; y < altezza; y++) {
    for (let x = 0; x < larghezza; x++) {
      const i = y * larghezza + x;
      if (!m[i]) continue;
      const sx = x > 0 ? m[i - 1] : 1, dx = x < larghezza - 1 ? m[i + 1] : 1;
      const su = y > 0 ? m[i - larghezza] : 1, giu = y < altezza - 1 ? m[i + larghezza] : 1;
      if (!sx || !dx || !su || !giu) n++;
    }
  }
  return n;
}

/** Voto di maggioranza 3×3. Alla parità si tiene il valore di prima: è la riga
 *  che rende la diagonale a 45° un punto fisso (vedi il ⚠ qui sopra). */
function maggioranza(m, larghezza, altezza) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < altezza; y++) {
    for (let x = 0; x < larghezza; x++) {
      const i = y * larghezza + x;
      let dentro = 0, contati = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= altezza) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= larghezza) continue;
          contati++; dentro += m[yy * larghezza + xx];
        }
      }
      const fuori = contati - dentro;
      out[i] = dentro > fuori ? 1 : (fuori > dentro ? 0 : m[i]);
    }
  }
  return out;
}

/**
 * L'INDICE DI FRASTAGLIATURA della macchia in cui `a` e `b` differiscono.
 * 0 = il bordo è già una linea (o una diagonale). Verso 1 = un pettine.
 *
 * Si rendono anche `area`, `perimetro` e `cambiati` grezzi, perché l'indice da
 * solo mente su una macchia minuscola: dieci pixel d'ombra hanno un indice
 * qualunque, e va visto che la macchia esista prima di credere al rapporto.
 */
export function frastagliatura(a, b, { soglia = 0.004 } = {}) {
  const m = maschera(a, b, soglia);
  const L = a.larghezza, A = a.altezza;
  let area = 0;
  for (let i = 0; i < m.length; i++) area += m[i];
  const votata = maggioranza(m, L, A);
  let cambiati = 0;
  for (let i = 0; i < m.length; i++) if (m[i] !== votata[i]) cambiati++;
  const p = perimetro(m, L, A);
  return {
    area, frazioneArea: area / (L * A),
    perimetro: p, perimetroLiscio: perimetro(votata, L, A),
    cambiati,
    indice: p > 0 ? cambiati / p : 0,
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
