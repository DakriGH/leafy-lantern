// CONTROLUCE — il mondo visto dal sole, in una texture di profondità.
//
// PERCHÉ ESISTE (committente, 27/08/2026): «le ombre sono tremende ... sono
// seghettate e non corrispondenti vedi tanti triangoli storti rifarei
// completamente il sistema». È la TERZA bocciatura della stessa classe di
// difetto — le prime due sono citate in cima a `test/sagome-ombra.test.mjs`.
//
// ⚠ E LE PRIME DUE CURE SONO CADUTE PER LA STESSA RAGIONE: hanno cambiato DOVE
// si paga (cammino per pixel → campo per texel) e COSA si stampa (raggi →
// scatole), mai **cosa c'è scritto nel dato**. `fx/campoSole.js` memorizza UNA
// QUOTA PER COLONNA (x,z) del mondo, e da lì discendono per forza:
//   · il bordo è l'ISO-CONTORNO di un campo bilineare, e dentro una cella
//     bilineare l'insieme di livello è un ARCO IPERBOLICO — archi adiacenti
//     combaciano in posizione ma non in tangente: un ginocchio ogni texel, cioè
//     il bruco a lobi che il committente ha fotografato;
//   · la sagoma può solo essere un INVILUPPO DI COLONNE, cioè un albero è una
//     torta di cuboidi. Un parallelogramma non è l'isoipsa di niente di liscio.
// Non c'è una terza taratura: si cambia la PARAMETRIZZAZIONE. Qui il dato è
// «la profondità della geometria vera per texel di spazio-luce», e la sagoma è
// la mesh rasterizzata — smussi del supercubo, chiome FBX, gatti compresi.
//
// ⚠ E RAFFINARE IL CAMPO È CHIUSO CON UN NUMERO, non con un'opinione. Misurata
// l'ondulazione picco-picco del bordo su una pila 2×2 alta 12 col sole a 35°,
// al calare del texel: 1,000→0,614 · 0,500→0,408 · 0,250→0,180 · 0,125→0,094 ·
// 0,0625→0,728 · 0,0313→0,720. NON CONVERGE: tocca il minimo a un ottavo di
// blocco e poi RISALE al quanto del blocco, perché l'altezza si legge sulla
// colonna più vicina una volta per blocco mentre il raggio scorre continuo.
// Alzare `fattore` non è caro: è inutile.
//
// QUESTO FILE È DIVISO IN DUE, ed è di proposito: sopra la MATEMATICA, pura,
// senza GL e senza DOM, che si prova in Node in millisecondi; sotto la passata,
// che vuole un renderer. Le decisioni difficili stanno tutte sopra.

import * as THREE from 'three';

// ═══════════════════════════════════════════════════════ LA MATEMATICA (pura)

/** I lati del riquadro ammessi. ⚠ A SCATTI, NON CONTINUI, e non è pigrizia:
 *  se il lato variasse con continuità varierebbe con continuità anche la
 *  dimensione del texel, e lo snapping del centro — che è tutta la cura contro
 *  lo strisciamento del bordo — non servirebbe a niente. */
export const LATI = [24, 32, 48, 64, 96, 128, 192, 256];

/**
 * In quante celle si divide il lato del riquadro per il passo del centro.
 *
 * ⚠ QUESTO NUMERO ERA IN TEXEL ED ERA IL DIFETTO DEGLI SCATTI. Il centro si
 * muove solo di multipli interi di texel — quella parte è giusta e non si tocca,
 * è la cura allo strisciamento del bordo. Ma il passo era «otto TEXEL», e un
 * texel a N=2048 su un riquadro di lato 32 è 1/64 di blocco: otto texel fanno
 * **un ottavo di blocco**. Cioè bastava camminare dodici centimetri di mondo
 * per rifare la mappa. Il committente l'ha visto così: «gli scatti ci sono
 * eccome, specialmente quando mi sposto, salto e muovo la telecamera».
 *
 * Adesso il passo si misura sul RIQUADRO e non sul texel: un trentaduesimo del
 * lato, che a lato 32 fa due unità di mondo — si cammina due blocchi prima di
 * pagare. E resta un numero INTERO di texel per costruzione, perché N è una
 * potenza di due e 32 pure: l'invariante che tiene fermo il reticolo non si
 * perde.
 */
export const CELLE_CENTRO = 32;

/** Il passo del centro, in unità di mondo. Intero in texel per costruzione. */
export function passoCentro(lato, N) {
  const texel = 2 * lato / N;
  const passi = Math.max(1, Math.round((2 * lato / CELLE_CENTRO) / texel));
  return texel * passi;
}

/**
 * Il lato del riquadro, con ISTERESI.
 *
 * Sale appena il raggio da coprire non ci sta più; scende solo quando è sceso
 * SOTTO IL 70% del gradino di sotto. Senza l'isteresi, un raggio che oscilla
 * attorno a un confine farebbe rimbalzare il lato fra due valori, e ogni
 * rimbalzo è una ricostruzione **e** un reticolo nuovo: il bordo dell'ombra
 * tremerebbe al ritmo dello zoom.
 */
export function scegliLato(raggio, precedente = 0) {
  let su = LATI[LATI.length - 1];
  for (const l of LATI) { if (l >= raggio) { su = l; break; } }
  if (!precedente) return su;
  if (su > precedente) return su;                 // non ci sta più: si sale subito
  const i = LATI.indexOf(precedente);
  if (i > 0 && raggio <= LATI[i - 1] * 0.7) return LATI[i - 1];
  return precedente;                              // nella banda morta: si resta
}

/**
 * La base dello spazio-luce. **Dipende SOLO dalla direzione del sole.**
 *
 * ⚠ È LA REGOLA PIÙ IMPORTANTE DI QUESTO FILE. Se la base dipendesse anche
 * dalla camera, ruotare la camera ruoterebbe il reticolo dei texel sotto
 * l'ombra e TUTTO sfarfallerebbe — e qui la camera è orbitale, quindi ruota di
 * continuo. Il ricambio a `(0,0,1)` serve allo zenit, dove `cross` con l'alto
 * degenera a zero e la base diventerebbe NaN in silenzio.
 */
export function baseLuce(dir, fuori = {}) {
  const z = (fuori.z || new THREE.Vector3()).copy(dir).normalize();
  const alto = Math.abs(z.y) > 0.98 ? _ALTO_RICAMBIO : _ALTO;
  const x = (fuori.x || new THREE.Vector3()).crossVectors(alto, z).normalize();
  const y = (fuori.y || new THREE.Vector3()).crossVectors(z, x).normalize();
  return { x, y, z };
}
const _ALTO = /* @__PURE__ */ new THREE.Vector3(0, 1, 0);
const _ALTO_RICAMBIO = /* @__PURE__ */ new THREE.Vector3(0, 0, 1);

/**
 * Il centro del riquadro, SNAPPATO al reticolo dei texel in spazio-luce.
 *
 * ⚠ QUESTA È LA CURA ALLO STRISCIAMENTO, e vale la pena dire perché funziona:
 * finché il centro si muove solo di multipli interi di texel, il reticolo cade
 * ogni volta esattamente sugli stessi punti del mondo. Il bordo dell'ombra non
 * «scivola» di frazioni di texel mentre cammini — o è fermo, o salta di un
 * texel intero. Con un centro continuo il bordo bolle a ogni passo, ed è un
 * difetto che si nota molto più della scaletta.
 */
export function centroSnappato(bersaglio, base, lato, N, fuori = new THREE.Vector3()) {
  const passo = passoCentro(lato, N);
  const u = Math.round(bersaglio.dot(base.x) / passo) * passo;
  const v = Math.round(bersaglio.dot(base.y) / passo) * passo;
  // ⚠ SI SNAPPA ANCHE LUNGO IL RAGGIO, e la prima versione non lo faceva.
  // Sull'asse della luce lo scorrimento non muove i texel (la proiezione è
  // ortografica: lungo z non si sposta niente a schermo), quindi sembrava
  // innocuo — ma sposta il piano near/far di frazioni continue, e con esso il
  // valore di profondità scritto in ogni texel. Il confronto nello shader
  // vedrebbe un fondo che respira: lo stesso sfarfallio, entrato dalla porta
  // di servizio. Una prova l'ha preso («spostamento FRAZIONARIO di 0,0102»).
  const w = Math.round(bersaglio.dot(base.z) / passo) * passo;
  return fuori.set(
    base.x.x * u + base.y.x * v + base.z.x * w,
    base.x.y * u + base.y.y * v + base.z.y * w,
    base.x.z * u + base.y.z * v + base.z.z * w,
  );
}

/**
 * IL QUANTO DEL SOLE SI MISURA IN TEXEL, NON IN GRADI.
 *
 * ⚠ È la correzione di un difetto che il committente vede oggi: «durante il
 * giorno le ombre si muovono a scatti». Misurato il 27/08 fra due quanti
 * consecutivi del campo attuale (`Math.round(dir·96)`, ~mezzo grado): **il 26%
 * dei pixel cambia in un colpo solo**, con p99 = 0,41 — cioè il salto è un
 * evento visivo PIÙ GRANDE dell'ombra stessa (p99 0,29-0,34). Con una giornata
 * di 480 s su mezzo giro sono ~360 quanti, uno ogni 1,3 secondi.
 *
 * La causa è che un quanto in GRADI è sbagliato in modo insidioso: la punta
 * dell'ombra si sposta di `altezza · δ(1/tan)`, quindi a sole alto si ricostruisce
 * per niente e a sole basso si salta di mezzo schermo. Qui si quantizza la
 * GRANDEZZA CHE CONTA — di quanti texel si sposta la punta dell'ombra di un
 * oggetto alto `ALT_RIF` — così il bordo salta di un texel a QUALUNQUE
 * elevazione.
 */
export const ALT_RIF = 12;

export function chiaveRicostruzione({ dir, lato, N, centro, base, versioneCielo = 0, versioneArredo = 0 }) {
  const texel = 2 * lato / N;
  const s = ALT_RIF / Math.max(dir.y, 0.08);      // lunghezza d'ombra per unità di quota
  const px = Math.round(dir.x * s / texel);
  const pz = Math.round(dir.z * s / texel);
  const passo = passoCentro(lato, N);
  const cu = Math.round(centro.dot(base.x) / passo);
  const cv = Math.round(centro.dot(base.y) / passo);
  return `${px},${pz}|${lato}|${N}|${cu},${cv}|${versioneCielo}|${versioneArredo}`;
}

/**
 * IL LATO DELLA MAPPA DALLA POLITICA «AL MASSIMO SEMPRE», e non da un numero
 * scritto nei preset.
 *
 * ⚠ PERCHÉ NON È UNA COSTANTE. Il committente ha chiesto di «puntare al massimo
 * sempre», e il difetto che ha trovato è che oggi il massimo non esiste:
 * `solePassi` vale 8/12/13 nei preset ma il mondo lo testa solo per `== 0`
 * (`materials.js`), quindi Alta e Ultra danno ombre BIT PER BIT IDENTICHE.
 * La manopola onesta è **quanti pixel di schermo copre un texel d'ombra**, e
 * quella grandezza si deriva:
 *
 *     px_per_texel = 2·lato·H_render / (N · 2·H_render·tan(fov/2) / ... )
 *
 * ⚠ e la DISTANZA DELLA CAMERA SI SEMPLIFICA, che è il punto: il lato del
 * riquadro segue lo zoom, quindi la scala del riquadro e la scala a schermo si
 * annullano. Un texel vale gli stessi pixel da vicino e da lontano.
 * Con `lato = k · distanza` e l'altezza inquadrata `2·distanza·tan(fov/2)`:
 *
 *     px_per_texel = (2·lato/N) · H_render / (2·distanza·tan(fov/2))
 *                  = k · H_render / (N · tan(fov/2))
 *
 * Così «Ultra» vuol dire la stessa cosa su un 1440p e su un Chromebook, che è
 * l'unica lettura onesta della richiesta.
 */
export function configuraMappa({ k = 2, kMin = 1.25, hRender, fovGradi, pxBersaglio, tetto = 2048 }) {
  const tan = Math.tan(fovGradi * Math.PI / 360);
  const ideale = k * hRender / (tan * pxBersaglio);
  let N = Math.pow(2, Math.round(Math.log2(Math.max(1, ideale))));
  N = Math.max(512, Math.min(tetto, N));
  // ⚠ QUANDO IL TETTO MORDE, SI STRINGE LA SCATOLA — e questa riga è nata da una
  // prova rossa che ha preso, nel mio stesso codice, il difetto di cui accuso i
  // preset. Con solo `N` come manopola e il tetto a 2048, tre profili su quattro
  // uscivano identici: [1024, 2048, 2048, 2048]. Cioè avrei riscritto
  // `solePassi` 8/12/13 con un altro nome.
  // La grandezza vera è `k · H / (N · tan)`, e `k` è una manopola quanto `N`:
  // una scatola più stretta dà texel più fini a parità di risoluzione. È anche
  // la lettura giusta di «al massimo sempre» — non un numero più grande sulla
  // scatola sbagliata, ma la scatola stretta.
  const kNec = pxBersaglio * tan * N / hRender;
  const kVero = Math.max(kMin, Math.min(k, kNec));
  const px = kVero * hRender / (N * tan);
  // ⚠ E SE IL BERSAGLIO NON SI RAGGIUNGE, LO SI DICE. È la lezione del difetto
  // che il committente ha trovato: `solePassi` 8/12/13 producevano ombre bit per
  // bit identiche, e il menu mostrava lo stesso tre profili diversi. Un tetto
  // che morde è legittimo — quello che non è legittimo è tacerlo e lasciare che
  // «Ultra» e «Alta» sembrino due cose. Chi mostra i profili deve poter scrivere
  // «su questo schermo Ultra è uguale ad Alta» invece di mentire.
  return { N, k: kVero, px, saturo: px > pxBersaglio * 1.01 };
}

/** Quanti pixel di schermo copre un texel, con questa mappa. È il numero che va
 *  scritto ACCANTO a ogni profilo nel menu: se due profili mostrano lo stesso
 *  numero, uno dei due non esiste — ed è esattamente il difetto di oggi. */
export function pixelPerTexel({ k = 2, hRender, fovGradi, N }) {
  return k * hRender / (N * Math.tan(fovGradi * Math.PI / 360));
}

// ═══════════════════════════════════════════════════════════ LA PASSATA (GL)

/** Da spazio NDC [-1,1] a spazio mappa [0,1]: lo shader legge lì. */
const _BIAS = /* @__PURE__ */ new THREE.Matrix4().set(
  0.5, 0, 0, 0.5,
  0, 0.5, 0, 0.5,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
);

export class Controluce {
  /**
   * @param renderer  il WebGLRenderer del gioco
   * @param N         lato della mappa (vedi `latoMappa`)
   */
  constructor(renderer, N = 1024) {
    this.renderer = renderer;
    this.N = N;
    this.lato = 0;
    this.chiave = '';
    this.ricostruzioni = 0;
    this.ms = 0;
    /** Quando è stata rifatta l'ultima volta (orologio). */
    this._ultima = -1e9;
    /**
     * ⚠ IL FRENO ALLE RICOSTRUZIONI, e senza questo il sistema si mangia da solo.
     *
     * Tutta l'economia della mappa si regge su una frase: «si rifà quando il
     * sole scatta di un quanto, cioè di rado». Misurato il 27/08 col sole che
     * cammina alla velocità di gioco: **24,5 ricostruzioni al SECONDO**. Il
     * quanto in texel è corretto in teoria — un texel a N=2048 su un riquadro
     * di lato 32 è 1/64 di blocco — ma a quella finezza «di rado» diventa «ogni
     * due fotogrammi», e ogni ricostruzione porta con sé due traversate della
     * scena in CPU più il nascondere e riscoprire i chunk. Da lì gli scatti.
     *
     * La cura non è allargare il quanto (che riporterebbe i salti dell'ombra):
     * è un intervallo MINIMO. Se la chiave è cambiata ma sono passati meno di
     * tanto, la mappa resta indietro di un quanto — un sedicesimo di blocco,
     * che non si vede — invece di rubare un fotogramma.
     */
    this.intervalloMin = 90;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.matrice = new THREE.Matrix4();       // mondo → spazio mappa [0,1]³
    this.base = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
    this._centro = new THREE.Vector3();

    this.rt = creaBersaglio(N);
  }

  get texture() { return this.rt.depthTexture; }

  /**
   * CAMBIA IL LATO DELLA MAPPA A CALDO.
   *
   * ⚠ SERVE PERCHÉ IL LATO NON SI PUÒ DECIDERE UNA VOLTA SOLA. `configuraMappa`
   * lo ricava dall'ALTEZZA DI RESA, e quell'altezza non è una costante: cambia
   * quando si ridimensiona la finestra, quando la scala di qualità scende, e —
   * il caso insidioso — vale ancora il default della tela (150 px) se qualcuno
   * la misura prima che il renderer l'abbia dimensionata. Misurato il 27/08 nel
   * mio stesso banco: con 150 px di altezza `configuraMappa` rende N = 512
   * invece di 2048, cioè un texel QUATTRO VOLTE più largo — 0,1875 unità invece
   * di 0,047. E a quel texel le ombre dei mobili diventano quadrati grossi
   * come otto pixel di schermo: esattamente il «pixelloso» che il committente
   * ha fotografato. Un numero letto una volta sola, che quando sbaglia sbaglia
   * per sempre e in silenzio.
   */
  ridimensiona(N) {
    if (N === this.N || !N) return false;
    this.rt.depthTexture.dispose();
    this.rt.dispose();
    this.N = N;
    this.rt = creaBersaglio(N);
    // il lato del texel è cambiato: la chiave vecchia non descrive più questa
    // mappa, e senza azzerarla si terrebbe il contenuto disegnato all'altra
    // risoluzione finché il sole non scatta.
    this.chiave = '';
    this._ultima = -1e9;
    return true;
  }

  /** Il lato di un texel in unità di mondo: serve allo scarto (bias). */
  get texel() { return this.lato ? 2 * this.lato / this.N : 0; }

  /**
   * Decide dove va la mappa, e dice se è cambiato qualcosa.
   * NON disegna: disegnare è `costruisci()`, così chi chiama può spalmarlo.
   * @returns true se la mappa va RIFATTA
   */
  inquadra({ dir, bersaglio, raggio, quotaMin = -8, quotaMax = 40, versioneCielo = 0, versioneArredo = 0 }) {
    if (dir.y <= 0.02) { this.chiave = ''; return false; }   // astro all'orizzonte: niente ombra
    baseLuce(dir, this.base);
    // ⚠ FIT A SFERA, NON AL TRONCO DI PIRAMIDE. Un riquadro aderente al frustum
    // cambia misura a ogni grado di imbardata e il texel «respira»: il bordo
    // dell'ombra pulserebbe mentre giri attorno al diorama. La sfera costa
    // ~1,4× di sovradimensionamento e in cambio è invariante per rotazione.
    // Il passo del centro va SOMMATO al raggio: il centro è snappato, quindi
    // può stare fino a mezzo passo fuori posto, e senza margine si scoprirebbe
    // uno spigolo dell'inquadratura.
    const passo = passoCentro(this.lato || LATI[0], this.N);
    const lato = scegliLato(raggio + passo, this.lato);
    this.lato = lato;
    centroSnappato(bersaglio, this.base, lato, this.N, this._centro);

    const k = chiaveRicostruzione({ dir, lato, N: this.N, centro: this._centro, base: this.base,
      versioneCielo, versioneArredo });
    if (k === this.chiave) return false;
    // ⚠ IL FRENO. La chiave è cambiata, ma se si è appena rifatta si aspetta:
    // vedi `intervalloMin`. La chiave NON si aggiorna, così al prossimo giro si
    // riprova — se no si perderebbe il cambiamento invece di rimandarlo.
    const ora = (typeof performance !== 'undefined' ? performance.now() : 0);
    if (ora - this._ultima < this.intervalloMin) return false;
    this._ultima = ora;
    this.chiave = k;

    // ⚠ LO SLAB DI PROFONDITÀ NON È ADATTIVO, ED È UNA SCELTA. Allungarlo non
    // costa un texel di risoluzione laterale, ma TIRA DENTRO IL TRONCO DI LUCE
    // i chunk a monte: costa draw call e riempimento. Qui si prende la fetta
    // verticale del mondo e basta, con un po' di margine.
    const mezzo = (quotaMax - quotaMin) * 0.5 + lato;
    const c = this.camera;
    c.left = -lato; c.right = lato; c.top = lato; c.bottom = -lato;
    c.near = 0.1; c.far = 2 * mezzo + 1;
    c.position.copy(this._centro).addScaledVector(dir, mezzo);
    c.up.copy(this.base.y);
    c.lookAt(this._centro);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();

    this.matrice.multiplyMatrices(_BIAS, c.projectionMatrix).multiply(c.matrixWorldInverse);
    return true;
  }

  /**
   * Disegna la scena dentro la mappa.
   *
   * ⚠ `materiali` NON è un `overrideMaterial` piatto, e sarebbe l'errore che
   * viene in mente per primo. Questo motore SPOSTA I VERTICI nello shader — il
   * vento sui furni, l'erba istanziata — e un override piatto disegnerebbe
   * alberi FERMI mentre a schermo ondeggiano: si rifabbricherebbe «l'ombra non
   * corrisponde al modello», stavolta in movimento. Chi chiama passa i
   * materiali-ombra costruiti dallo STESSO codice di vertice di quelli veri.
   *
   * ⚠ E `colorWrite: false` DA SOLO NON BASTA: è `glColorMask`, ferma la
   * scrittura ROP e NON l'esecuzione del fragment. Il risparmio vero è il
   * fragment vuoto dei materiali-ombra.
   */
  costruisci(scena, prepara = null, ripristina = null) {
    const r = this.renderer;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    // otto pezzi di stato, non sei: `schiumaTop` ne salva sei e qui servono
    // anche `xr.enabled` (in AR il renderer disegna nel framebuffer del visore)
    // e il colorMask, che tocchiamo a mano.
    const rtPrima = r.getRenderTarget();
    const autoPrima = r.autoClear;
    const xrPrima = r.xr.enabled;
    const fogPrima = scena.fog;
    const bgPrima = scena.background;
    const ovPrima = scena.overrideMaterial;
    const gl = r.getContext();
    try {
      r.xr.enabled = false;
      scena.fog = null; scena.background = null;
      if (prepara) prepara();
      r.autoClear = true;
      r.setRenderTarget(this.rt);
      r.clear(true, true, false);
      gl.colorMask(false, false, false, false);
      r.render(scena, this.camera);
    } finally {
      gl.colorMask(true, true, true, true);
      if (ripristina) ripristina();
      r.setRenderTarget(rtPrima);
      r.autoClear = autoPrima;
      r.xr.enabled = xrPrima;
      scena.fog = fogPrima; scena.background = bgPrima;
      scena.overrideMaterial = ovPrima;
      this.ricostruzioni++;
      this.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    }
  }

  /** Cambia la risoluzione (la manopola di qualità). Butta e rifà il bersaglio:
   *  succede quando si tocca il menu, non nel loop. */
  ridimensiona(N) {
    if (N === this.N) return;
    this.rt.dispose();
    this.N = N;
    this.rt = creaBersaglio(N);
    this.chiave = '';           // il reticolo è cambiato: si rifà
  }

  dispose() { this.rt.dispose(); }
}

/**
 * Il bersaglio, con le tre trappole di three r185 scritte accanto — sono tutte
 * e tre SILENZIOSE, cioè non danno un errore ma un'immagine sbagliata.
 */
export function creaBersaglio(N) {
  const rt = new THREE.WebGLRenderTarget(N, N, {
    // three pretende un attachment di colore: R8, il più piccolo che accetta.
    format: THREE.RedFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    // ⚠ OBBLIGATORIO A FALSE. Con lo stencil three promuove i 16 bit a
    // DEPTH24_STENCIL8: si pagherebbe il DOPPIO della banda credendo di avere
    // 16 bit, e la taratura dello scarto — che è in ULP del depth buffer —
    // smetterebbe di valere. Il formato effettivo va ASSERITO, non richiesto.
    stencilBuffer: false,
  });
  rt.depthTexture = new THREE.DepthTexture(N, N, THREE.UnsignedShortType);
  // ⚠ NEAREST SU TUTTI E DUE I FILTRI. `LinearFilter` su una texture di
  // profondità SENZA `compareFunction` la rende INCOMPLETA e la lettura torna
  // NERA — in silenzio, senza un errore WebGL. In GLES3 i formati di profondità
  // non sono filtrabili: LINEAR è legale solo con TEXTURE_COMPARE_MODE, che
  // three accende solo se `compareFunction` è impostata. È lo stesso modo di
  // fallire di `OES_texture_float_linear` già scritto in materials.js, e la
  // prima volta è costato giorni di lavoro alla cieca.
  rt.depthTexture.minFilter = THREE.NearestFilter;
  rt.depthTexture.magFilter = THREE.NearestFilter;
  return rt;
}

// ═══════════════════════════════════════════════════════════════ LA LEGGE (GLSL)

/**
 * LA LEGGE UNICA DELL'OMBRA DEL SOLE, come stringa, perché la devono chiamare
 * anche shader che NON passano da `iniettaLanterna`.
 *
 * ⚠ È QUESTA LA CURA DEL «NON CORRISPONDENTI», più della risoluzione. Oggi il
 * sole ha SEI sorgenti che devono essere d'accordo e non possono: il mondo legge
 * il canale G del campo, i mobili il canale R, l'erba fa sei raymarch PER
 * VERTICE su una heightmap DIVERSA (`erba.js`, uCielo), le particelle
 * raymarciano per pixel, le foglie non hanno ombra affatto e il gatto ha un cono
 * che non sa nemmeno dov'è il sole. Sono i fili chiari dentro l'ombra che il
 * committente ha fotografato. Una stringa sola letta da tutti li chiude tutti
 * insieme, e il metro del successo non è «bordo dritto»: è **erba, terreno,
 * mobili e gatto che entrano in ombra nello stesso texel**.
 *
 * ⚠ FUORI MAPPA = PIENO SOLE, ed è un bordo VERO che si potrebbe vedere. La
 * scatola segue lo zoom apposta perché quel bordo stia sempre fuori
 * inquadratura: se lo si vede, la scatola è stretta — non è una soglia da
 * tarare qui.
 */
export function glslControluce() { return /* glsl */`
  uniform highp sampler2D uControluce;
  uniform vec4 uControluceInfo;      // (1/N, scarto, texel in unità, attiva)
  uniform mat4 uControluceM;
  uniform float uControluceNorm;     // quanti texel si scosta lungo la normale

  // «p» È GIÀ IN SPAZIO MAPPA, [0,1]³: la matrice l'ha applicata il VERTICE.
  // Ortografica ⇒ w = 1, quindi niente divisione prospettica.
  //
  // ⚠ LO SCOSTAMENTO LUNGO LA NORMALE, e senza questo gli smussi del supercubo
  // si riempiono di denti. Il committente li ha fotografati due volte: una fila
  // regolare di triangoli scuri lungo il bordo smussato di una terrazza, che
  // «glitchano per qualche istante sulle pareti semiverticali».
  //
  // Perché uno scarto in PROFONDITÀ non basta e uno lungo la NORMALE sì. Lo
  // smusso è largo √2·U — un ottavo di blocco, cioè due o tre texel della mappa
  // — ed è inclinato a 45°: dentro un solo texel la sua profondità in spazio
  // luce cambia di tantissimo, e cambia DI QUANTO DIPENDE DA DOVE STA IL SOLE.
  // Uno scarto costante tarato a mezzogiorno è troppo poco alle nove, e uno
  // tarato alle nove stacca le ombre da terra a mezzogiorno: da qui il
  // «per qualche istante», che sono gli angoli in cui la taratura non copre.
  // Spostando invece il punto di CAMPIONAMENTO perpendicolarmente alla
  // superficie, lo scostamento è per costruzione quello che serve a quella
  // pendenza — non c'è un angolo in cui va tarato di nuovo.
  //
  // ⚠ E si scosta il PUNTO, non il risultato: il bordo resta binario. La cura
  // sbagliata — sfumare il confronto — è già stata bocciata due volte.
  //
  // ⚠ E LO SCOSTAMENTO SCALA CON QUANTO LA LUCE RADE, non è costante. Misurato
  // sullo zoo spazzando l'elevazione del sole a mano (che è il motivo per cui
  // esiste quel comando): con uno scostamento COSTANTE di 1,6 texel l'indice di
  // frastagliatura migliora col sole alto (0,222 → 0,177 a 75°) ma PEGGIORA di
  // quattro volte col sole basso (0,045 → 0,189 a 10°). La ragione è geometrica:
  // a sole radente la normale di una superficie orizzontale è quasi
  // perpendicolare al raggio, quindi scostarsi lungo di essa sposta il punto di
  // lettura di TANTO dentro la mappa, e si legge l'ombra del vicino.
  // Il fattore «sen/cos» fra normale e luce vale ~0 quando la luce arriva
  // in faccia (dove l'acne non c'è e non serve scostarsi) e cresce quando rade
  // (dove serve). Tagliato, se no all'orizzonte esplode.
  // ⚠ «dirSole» ARRIVA COME ARGOMENTO e non come uniform dichiarata qui: la
  // stessa uniform è già dichiarata dal fragment del mondo, e in GLSL
  // ridichiararla è un errore di compilazione. Una stringa condivisa non può
  // dichiarare niente che il chiamante possa già avere.
  float ombraDelSole(vec3 p, vec3 nMondo, vec3 dirSole) {
    if (uControluceInfo.w < 0.5) return 1.0;
    float c = clamp(abs(dot(nMondo, dirSole)), 0.06, 1.0);
    float t = min(sqrt(1.0 - c * c) / c, 4.0);
    vec3 q = p + (uControluceM * vec4(nMondo * (uControluceInfo.z * uControluceNorm * t), 0.0)).xyz;
    if (q.x <= 0.0 || q.x >= 1.0 || q.y <= 0.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
    // Il confronto è BINARIO e resta binario: niente PCF, niente sfumatura.
    return step(q.z - uControluceInfo.y, texture2D(uControluce, q.xy).r);
  }
`; }
