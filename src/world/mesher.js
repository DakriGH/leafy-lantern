// Mesher dei supercubi — SPEC-TECNICA.md §1.
// Tre famiglie di blocchi:
//  · supercubo classico (26 pezzi, culling distruttivo sui vicini);
//  · blocco col CAPPELLO (erba): profilo ricavato dal GrassCell.fbx dell'utente —
//    corpo 18 px + bordino che sborda a 20 px, sotto-smusso, parete del brim,
//    smusso alto e cima A FILO cella. Le cime si affiancano al pixel: il brim
//    esiste solo sui lati esposti (il modello Blockbench sovrappone, noi culliamo);
//  · acqua: scatola col pelo ribassato di 2 px sotto la cima dell'erba.
// Il mondo è a chunk: si ricostruiscono solo i chunk sporchi.

import * as THREE from 'three';
import { BLOCCHI, defDi, tipoBase, livelloAcqua } from './blocks.js';
import { paletteBlocco, coloreFaccia } from './stagioni.js';
import { FORME_EXTRA, FORME_VUOTE } from './forme.js';
import { tintaPalette } from './motivi.js';
import { GrigliaLuce, scatolaPerMondo, RAGGIO_MAX, MARGINE_MASCHERA } from './luce.js';
import { materialeMondo, materialeAcqua, aggiornaCielo } from '../fx/materials.js';
import { CHUNK } from './world.js';

const U = 1 / 16;                 // 1 pixel in unità mondo
const COPPIE_SMUSSO = [[0, 1], [0, 2], [1, 2]];
const LATI = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const _colore = new THREE.Color();

// COLORI PIATTI DA PALETTE, ED È UNA SCELTA GRAFICA — non una cosa che manca.
// Qui NON c'è ombreggiatura per direzione di faccia e NON c'è occlusione
// ambientale: un tentativo le aveva aggiunte entrambe (una costante per normale
// più il velo classico sui tre vicini dell'angolo) ed è stato bocciato. Lo
// stacco fra le facce lo dà GIÀ coloreFaccia() scegliendo cima/lato/fondo dalla
// palette, e il volume lo danno le luci-sfera con le loro bande nette: sono
// quelli i gradini voluti, e un secondo moltiplicatore continuo sopra li
// sporcava. Il colore che finisce nel buffer è quindi ESATTAMENTE quello della
// palette, senza nessun fattore in mezzo. Se un giorno torna la tentazione:
// git show b540f50 ha l'implementazione completa di entrambe.

// Indice nell'intorno 3×3×3 precalcolato del blocco in corso. I VICINI SI
// PRECALCOLANO perché mondo.tipo() compone una stringa "x,y,z" e cerca in una
// Map, e il solo culling del supercubo ne chiede una cinquantina per blocco:
// con la cache diventa un'indicizzazione d'array.
const IV = (dx, dy, dz) => ((dy + 1) * 3 + (dz + 1)) * 3 + (dx + 1);


class Costruttore {
  constructor() {
    this.pos = []; this.col = []; this.acq = null; this._ex = null;
    // vertici "cima d'erba" [indice, quotaCella, …]: il cambio stagione SMOOTH
    // riscrive solo questi float nel color buffer, senza ricostruire nulla
    this.erbe = [];
    this._erbaHex = null; this._erbaY = 0;
    // MASCHERA D'OCCLUSIONE cotta per-vertice: aOcc = TRE byte, cioè 24 bit, uno
    // per SLOT di lampada (vedi world/luce.js). Bit acceso = quella lampada qui
    // non arriva, c'è un muro in mezzo.
    // LA POLARITÀ è scelta per il default WebGL di un attributo che la geometria
    // non ha, (0,0,0,1): chi non lo porta legge x=y=z=0, cioè "nessuna lampada
    // bloccata", e resta illuminato esattamente com'era. Memorizzare il
    // contrario avrebbe spento gatto, mano e mobili. Ed è anche il motivo per cui
    // i byte sono TRE e non quattro: la w di quel default vale 1, quindi un
    // quarto byte accenderebbe da solo il bit dello slot 24.
    this.luc = [];
    this.conLuce = false;                 // qualche blocco ha avuto una griglia?
    // la cintura di taglia in geometria() ha dovuto buttare aOcc? Il guasto lo
    // CONTA il Mesher, per chunk: qui si alza solo la bandierina (vedi _chunk)
    this.mascheraScartata = false;
    this.luceG = null; this._lx = 0; this._ly = 0; this._lz = 0;
    this._lFuori = null; this._lMask = 0;
  }

  /** Griglia d'occlusione + cella in corso. null = spenta (ghost, Officina). */
  luceCella(griglia, x, y, z) {
    if (griglia) this.conLuce = true;
    this.luceG = griglia; this._lx = x; this._ly = y; this._lz = z; this._lFuori = null;
  }
  fineLuce() { this.luceG = null; this._lFuori = null; }

  /** Attiva/spegne la marcatura dei triangoli color pal.cima come "erba". */
  erba(hexCima, quotaCella) { this._erbaHex = hexCima; this._erbaY = quotaCella; }
  fineErba() { this._erbaHex = null; }

  /** Canale extra per-vertice dell'ACQUA: (dirX corrente, dirZ corrente, tipo faccia).
   *  tipo: 0 sorgente calma · 1 pelo che scorre · 2 lato cascata · 3 schiuma · 5 piatto. */
  extra(fx, fz, tipo) {
    if (!this.acq) { this.acq = []; this.riv = []; }
    this._ex = [fx, fz, tipo];
  }

  /** riva per-vertice, DUE numeri per angolo: (quanto è lontana la sponda,
   *  quanta acqua aperta c'è intorno) — vedi rivaAngolo(). Il default (1,1) è
   *  "largo e aperto", cioè nessuna schiuma: è ciò che leggono le facce
   *  laterali, che la riva non ce l'hanno. */
  tri(a, b, c, colore, fuori, rABC = null) {
    let rA = UNO_UNO, rB = UNO_UNO, rC = UNO_UNO;
    if (rABC) { rA = rABC[0]; rB = rABC[1]; rC = rABC[2]; }
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    if (nx * fuori[0] + ny * fuori[1] + nz * fuori[2] < 0) {
      const t = b; b = c; c = t;
      const tr = rB; rB = rC; rC = tr;
    }
    if (this._erbaHex !== null && colore === this._erbaHex) {
      this.erbe.push(this.pos.length / 3, this._erbaY);
    }
    // OCCLUSIONE PER FACCIA, NON PER BLOCCO. Si legge nella cella d'ARIA che
    // questa faccia affaccia — `fuori` è già la sua normale uscente. Leggendo un
    // valore solo per blocco, un muro illuminato da un lato risulterebbe chiaro
    // anche dall'altro: è il punto che rende credibile tutta l'occlusione.
    // Il valore è COSTANTE sui tre vertici: sono bit, non un gradiente.
    if (this.luceG) {
      // quad() passa lo STESSO array `fuori` ai suoi due triangoli, e
      // conCappello lo riusa per più pezzi dello stesso fianco: l'identità
      // basta a dimezzare le letture senza rischiare un valore stantio (la
      // cella corrente azzera il memo in luceCella).
      if (fuori !== this._lFuori) {
        this._lFuori = fuori;
        this._lMask = this.luceG.occlusaFaccia(this._lx, this._ly, this._lz, fuori);
      }
      const m = this._lMask;
      const b0 = m & 255, b1 = (m >> 8) & 255, b2 = (m >> 16) & 255;
      for (let i = 0; i < 3; i++) this.luc.push(b0, b1, b2);
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    // IL COLORE DELLA PALETTE, TALE E QUALE, su tutti e tre i vertici: nessun
    // moltiplicatore per direzione di faccia né per occlusione (vedi in alto)
    _colore.setHex(colore);
    for (let i = 0; i < 3; i++) this.col.push(_colore.r, _colore.g, _colore.b);
    if (this.acq) {
      const e = this._ex || [0, 0, 5];
      for (let i = 0; i < 3; i++) this.acq.push(e[0], e[1], e[2]);
      this.riv.push(rA[0], rA[1], rB[0], rB[1], rC[0], rC[1]);
    }
  }

  // SEMPRE la diagonale a–c. La rotazione condizionale su b–d serviva SOLO
  // all'occlusione ambientale: erano i suoi quattro valori d'angolo a poter
  // essere non coplanari, e lì la diagonale sbagliata lasciava una cucitura
  // visibile in mezzo alla faccia. Senza AO i quattro vertici di un quad hanno
  // lo STESSO identico colore, quindi non c'è più niente da interpolare e
  // nessun taglio può vedersi.
  quad(a, b, c, d, colore, fuori, rABCD = null) {
    this.tri(a, b, c, colore, fuori, rABCD ? [rABCD[0], rABCD[1], rABCD[2]] : null);
    this.tri(a, c, d, colore, fuori, rABCD ? [rABCD[0], rABCD[2], rABCD[3]] : null);
  }

  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    // ATTRIBUTO OMESSO quando l'occlusione è spenta (o non c'è: ghost,
    // Officina). In WebGL un attributo che la geometria NON ha legge (0,0,0,1),
    // cioè esattamente la polarità "nessuna occlusione" assunta dallo shader —
    // quindi omettere è GRATIS, e l'interruttore per le macchine deboli non
    // alloca né carica in GPU un buffer di soli zeri.
    // Il controllo di taglia è una cintura: se una geometria mescolasse blocchi
    // con e senza griglia, meglio nessun dato che dati disallineati.
    // NON MUTA: se scatta, il pannello debug lo dice invece di continuare a
    // dichiarare l'occlusione attiva su chunk che non ce l'hanno (era un guasto
    // che degradava in silenzio verso il comportamento di prima della maschera).
    // Non normalizzato: i tre byte sono BIT, e vanno letti 0..255, non 0..1.
    if (this.conLuce) {
      if (this.luc.length === this.pos.length) {
        g.setAttribute('aOcc', new THREE.Uint8BufferAttribute(this.luc, 3));
      } else this.mascheraScartata = true;
    }
    if (this.acq) {
      g.setAttribute('aAcqua', new THREE.Float32BufferAttribute(this.acq, 3));
      g.setAttribute('aRiva', new THREE.Float32BufferAttribute(this.riv, 2));
    }
    return g;
  }

  get vuoto() { return this.pos.length === 0; }
}

/** Costruttore per il liquido: in più tiene i punti per i particellari
 *  (correnti sul pelo e impatti delle cascate). */
function costruttoreAcqua() {
  const c = new Costruttore();
  c.flussi = []; c.impatti = [];
  return c;
}

function vec(cx, cy, cz, a, va, b, vb, c, vc) {
  const p = [cx, cy, cz];
  p[a] += va; p[b] += vb; p[c] += vc;
  return p;
}

// ---- supercubo classico (26 pezzi) -----------------------------------------

export function supercubo(b, cx, cy, cz, pal, vicino) {
  const F = 8 * U, H = 9 * U;
  const N = (asse, s) => vicino(asse === 0 ? s : 0, asse === 1 ? s : 0, asse === 2 ? s : 0);

  for (let a = 0; a < 3; a++) {
    for (const s of [-1, 1]) {
      if (N(a, s)) continue;
      const bA = (a + 1) % 3, cA = (a + 2) % 3;
      // pittura PER FACCIA se il blocco ce l'ha, altrimenti cima/lato/fondo
      const colore = coloreFaccia(pal, a, s);
      const fuori = [0, 0, 0]; fuori[a] = s;
      b.quad(
        vec(cx, cy, cz, a, s * H, bA, -F, cA, -F),
        vec(cx, cy, cz, a, s * H, bA, +F, cA, -F),
        vec(cx, cy, cz, a, s * H, bA, +F, cA, +F),
        vec(cx, cy, cz, a, s * H, bA, -F, cA, +F),
        colore, fuori,
      );
    }
  }
  for (const [a, bAsse] of COPPIE_SMUSSO) {
    const t = 3 - a - bAsse;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      if (N(a, sa) || N(bAsse, sb)) continue;
      const cima = (a === 1 && sa > 0) || (bAsse === 1 && sb > 0);
      const fondo = (a === 1 && sa < 0) || (bAsse === 1 && sb < 0);
      const colore = cima ? pal.cima : (fondo ? pal.fondo : pal.lato);
      const fuori = [0, 0, 0]; fuori[a] = sa; fuori[bAsse] = sb;
      b.quad(
        vec(cx, cy, cz, a, sa * H, bAsse, sb * F, t, -F),
        vec(cx, cy, cz, a, sa * F, bAsse, sb * H, t, -F),
        vec(cx, cy, cz, a, sa * F, bAsse, sb * H, t, +F),
        vec(cx, cy, cz, a, sa * H, bAsse, sb * F, t, +F),
        colore, fuori,
      );
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (N(0, sx) || N(1, sy) || N(2, sz)) continue;
    b.tri(
      [cx + sx * H, cy + sy * F, cz + sz * F],
      [cx + sx * F, cy + sy * H, cz + sz * F],
      [cx + sx * F, cy + sy * F, cz + sz * H],
      sy > 0 ? pal.cima : pal.fondo, [sx, sy, sz],
    );
  }
}

// ---- blocco col cappello (profilo GrassCell, quote in px dal centro cella) --
//   corpo: fondo −9 (metà 8) · smusso · parete ±9 da −8 a +2 · taglio d'angolo
//   cappello: sotto-smusso (9,+2)→(10,+3) · brim ±10 da +3 a +7 ·
//             smusso alto (10,+7)→(9,+8) · estensione piatta a +8 (8→9) · cima ±8 a +8

function conCappello(b, cx, cy, cz, pal, vicino) {
  const Nh = (dx, dz) => vicino(dx, 0, dz);
  const sotto = vicino(0, -1, 0);
  const cima = pal.cima, lato = pal.lato, fondo = pal.fondo;
  const p = (x, y, z) => [cx + x * U, cy + y * U, cz + z * U];

  // fondo e smussi bassi (come il supercubo)
  if (!sotto) {
    b.quad(p(-8, -9, -8), p(8, -9, -8), p(8, -9, 8), p(-8, -9, 8), fondo, [0, -1, 0]);
  }
  for (const [dx, dz] of LATI) {
    if (Nh(dx, dz)) continue;
    const tx = -dz, tz = dx;                       // tangente
    const q = (u, y, t) => p(u * dx + t * tx, y, u * dz + t * tz);
    const fuori = [dx, 0, dz];
    if (!sotto) b.quad(q(8, -9, -8), q(9, -8, -8), q(9, -8, 8), q(8, -9, 8), fondo, [dx, -1, dz]);
    b.quad(q(9, -8, -8), q(9, 2, -8), q(9, 2, 8), q(9, -8, 8), lato, fuori);      // parete corpo
    b.quad(q(9, 2, -8), q(10, 3, -8), q(10, 3, 8), q(9, 2, 8), cima, fuori);      // sotto-smusso brim
    b.quad(q(10, 3, -8), q(10, 7, -8), q(10, 7, 8), q(10, 3, 8), cima, fuori);    // parete brim
    b.quad(q(10, 7, -8), q(9, 8, -8), q(9, 8, 8), q(10, 7, 8), cima, [dx, 1, dz]); // smusso alto
    b.quad(q(8, 8, -8), q(9, 8, -8), q(9, 8, 8), q(8, 8, 8), cima, [0, 1, 0]);    // estensione cima
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (Nh(sx, 0) || Nh(0, sz)) continue;
    const q = (x, y, z) => p(x * sx, y, z * sz);
    const fuori = [sx, 0, sz];
    if (!sotto) b.tri(q(9, -8, 8), q(8, -9, 8), q(8, -8, 9), fondo, [sx, -1, sz]); // angolo basso
    b.quad(q(9, -8, 8), q(8, -8, 9), q(8, 2, 9), q(9, 2, 8), lato, fuori);         // taglio verticale corpo
    b.quad(q(9, 2, 8), q(8, 2, 9), q(8, 3, 10), q(10, 3, 8), cima, fuori);         // angolo sotto-smusso
    b.quad(q(10, 3, 8), q(8, 3, 10), q(8, 7, 10), q(10, 7, 8), cima, fuori);       // angolo brim
    b.quad(q(10, 7, 8), q(8, 7, 10), q(8, 8, 9), q(9, 8, 8), cima, [sx, 1, sz]);   // angolo smusso alto
    b.tri(q(8, 8, 8), q(9, 8, 8), q(8, 8, 9), cima, [0, 1, 0]);                    // angolo estensione
  }
  // cima centrale (il ramo cappello esiste solo se sopra c'è aria)
  b.quad(p(-8, 8, -8), p(8, 8, -8), p(8, 8, 8), p(-8, 8, 8), cima, [0, 1, 0]);
}

// ---- acqua: scatola A FILO CELLA (16 px), pelo che scende col livello --------
// A 18 px le cime di celle d'acqua adiacenti si sovrapponevano di 2 px e la
// doppia trasparenza disegnava una griglia scura. A 16 px combaciano al pixel
// e restano comunque sigillate: i corpi dei solidi vicini (18 px) le coprono.
// Il pelo: sorgente +7 px, flussi più bassi (7 − 2·livello) → rivoli e cascate.

const peloDi = (L) => (7 - 2 * Math.max(0, L)) * U;

// ---- RIVA: una DISTANZA, non un interruttore --------------------------------
// aRiva valeva 0 o 1 per angolo ("tocco un solido / non lo tocco"): la banda di
// schiuma era larga ESATTAMENTE una cella e NESSUNA soglia nello shader poteva
// allargarla, per quanto la si girasse. Adesso ogni angolo porta due numeri:
//   x = quanto è LONTANA la sponda (0 = ci sto addosso, 1 = RIVA_RAGGIO celle);
//   y = quanta ACQUA APERTA c'è intorno (1 = mare aperto, ~0.2 = canaletto).
//
// Il secondo è quello che rende sicura tutta l'operazione, e nasce da un limite
// che la sola distanza non può aggirare: in un canale largo UNA cella tutti e
// quattro gli angoli toccano una sponda, quindi la distanza vale 0 su tutta la
// cella e qualunque soglia la dipingerebbe di bianco piena. È esattamente il
// foglio bianco già visto una volta, ed è il motivo per cui a suo tempo la
// soglia venne alzata fino a spegnere quasi tutta la schiuma. L'apertura in quel
// canale vale ~0.2 contro lo ~0.5 di una riva vera: allo shader basta per
// distinguerli, e la soglia può tornare generosa dove la riva è vera.
const RIVA_RAGGIO = 2;
const RIVA_LATO = RIVA_RAGGIO * 2 + 1;
const UNO_UNO = [1, 1];              // "largo e aperto": nessuna schiuma
// L'intorno 5×5 della cella d'acqua in corso (1 = colonna che ferma l'acqua) e
// i quattro angoli già calcolati. Scratch riusati: acquaBox li consuma dentro
// lo stesso quad(), e allocare cinque array per cella d'acqua è lavoro per il GC
// in un ciclo che gira su ogni pelo del mondo.
const _rivaIntorno = new Uint8Array(RIVA_LATO * RIVA_LATO);
const _rivaAngoli = [[1, 1], [1, 1], [1, 1], [1, 1]];   // −−, +−, ++, −+

// Dislivello fra i quattro angoli oltre il quale il pelo non è più un pelo ma
// uno scivolo (vedi il tipo 3 in acquaBox). Mezzo blocco su una cella: i
// raccordi dolci fra due livelli d'acqua valgono 2 px = 0.125, quelli veri
// delle rampe arrivano a 0.75÷1.0 — misurati sulla scalinata di collaudo.
const PENDENZA_RIPIDA = 0.5;

/**
 * Distanza dalla sponda e apertura per TUTTI E QUATTRO gli angoli della cella
 * d'acqua, in una passata sola. Scrive in `_rivaAngoli` e lo ritorna.
 * `solido(dx,dz)` = c'è un blocco che ferma l'acqua in quella colonna.
 *
 * UNA LETTURA DEL MONDO, NON QUATTRO. La finestra 5×5 non dipende dall'angolo —
 * sx/sz entrano solo nell'aritmetica della distanza — quindi scandirla una volta
 * per angolo era ripetere quattro volte lo stesso lavoro: 100 mondo.tipo() per
 * cella d'acqua invece dei 25 dichiarati nel commento, e mondo.tipo() compone
 * una stringa "x,y,z" e cerca in una Map. Misurato sul collaudo con la funzione
 * strumentata: 4587 chiamate per 37 celle, di cui 3200 attribuibili alla riva e
 * 2400 ripetizioni byte-identiche.
 *
 * L'angolo sta a mezza cella dal centro: è da LÌ che si misura, altrimenti i
 * quattro angoli avrebbero tutti la stessa distanza e il canale tornerebbe
 * piatto. Le distanze sono al BORDO della cella solida (−0.5), non al centro.
 *
 * L'APERTURA È UNA LARGHEZZA, non più una frazione di celle aperte. La frazione
 * non sapeva distinguere "canale stretto" da "riva di uno specchio d'acqua", e
 * anzi li metteva nell'ordine SBAGLIATO: la cella d'angolo di una pozza 5×5 ha
 * 9 colonne aperte su 25 (0.36), MENO di un canale largo due celle (10/25 =
 * 0.40). A schermo il canale da 2 usciva più bianco (37.2% dei pixel) della
 * pozza (29.4%), e quello da 1 — l'unico caso che il collaudo prova — era
 * l'unico corretto. Qui si conta la cosa vera: quante celle d'acqua CONSECUTIVE
 * ci sono attraversando la cella in X e in Z, e si tiene la più stretta. Il
 * canale da 1 vale ancora 1/5 = 0.20 esatto (la taratura dello shader regge),
 * quello da 2 vale 0.40, quello da 3 vale 0.60 — e la pozza non scende mai
 * sotto 0.60. La relazione con la larghezza torna monotòna.
 */
function rivaCella(solido) {
  const g = _rivaIntorno;
  for (let dx = -RIVA_RAGGIO; dx <= RIVA_RAGGIO; dx++) {
    for (let dz = -RIVA_RAGGIO; dz <= RIVA_RAGGIO; dz++) {
      g[(dx + RIVA_RAGGIO) * RIVA_LATO + (dz + RIVA_RAGGIO)] = solido(dx, dz) ? 1 : 0;
    }
  }
  // larghezza libera attraversando il centro, sui due assi: si cammina finché
  // non si incontra una sponda (la cella di mezzo è acqua per costruzione)
  const C = RIVA_RAGGIO;
  let spanX = 1, spanZ = 1;
  for (let d = 1; d <= RIVA_RAGGIO; d++) { if (g[(C + d) * RIVA_LATO + C]) break; spanX++; }
  for (let d = 1; d <= RIVA_RAGGIO; d++) { if (g[(C - d) * RIVA_LATO + C]) break; spanX++; }
  for (let d = 1; d <= RIVA_RAGGIO; d++) { if (g[C * RIVA_LATO + C + d]) break; spanZ++; }
  for (let d = 1; d <= RIVA_RAGGIO; d++) { if (g[C * RIVA_LATO + C - d]) break; spanZ++; }
  const apertura = Math.min(spanX, spanZ) / RIVA_LATO;

  for (let a = 0; a < 4; a++) {
    const sx = a === 0 || a === 3 ? -1 : 1;
    const sz = a < 2 ? -1 : 1;
    const cx = sx * 0.5, cz = sz * 0.5;
    let vicina2 = Infinity;
    for (let dx = -RIVA_RAGGIO; dx <= RIVA_RAGGIO; dx++) {
      for (let dz = -RIVA_RAGGIO; dz <= RIVA_RAGGIO; dz++) {
        if (!g[(dx + RIVA_RAGGIO) * RIVA_LATO + (dz + RIVA_RAGGIO)]) continue;
        const ax = dx - cx, az = dz - cz, d2 = ax * ax + az * az;
        if (d2 < vicina2) vicina2 = d2;
      }
    }
    // la radice UNA volta sola, sul minimo: ordinare per distanza o per distanza
    // AL QUADRATO è la stessa cosa, e Math.hypot dentro un ciclo per cella
    // d'acqua è fra le cose più lente che V8 sappia fare
    const vicina = vicina2 === Infinity ? RIVA_RAGGIO : Math.max(0, Math.sqrt(vicina2) - 0.5);
    _rivaAngoli[a][0] = Math.min(1, vicina / RIVA_RAGGIO);
    _rivaAngoli[a][1] = apertura;
  }
  return _rivaAngoli;
}

// info = { livello, mioSopra, cascata, flusso:[fx,fz], vicinoAcqua, vicinoPieno }
function acquaBox(b, cx, cy, cz, pal, info) {
  const F = 8 * U;
  const { livello, mioSopra, cascata, flusso, vicinoAcqua, vicinoPieno, acquaA } = info;
  // UNA sola lettura per colonna: rivaAngolo ne scandisce 25, e passare dal
  // paio vicinoAcqua+vicinoPieno (tre mondo.tipo/pieno a cella) le triplicava
  const solidoXZ = info.solidoXZ || ((dx, dz) => vicinoAcqua(dx, dz) === null && vicinoPieno(dx, 0, dz));
  const p = (x, y, z) => [cx + x, cy + y, cz + z];
  const scorre = flusso[0] !== 0 || flusso[1] !== 0;
  const mioPelo = peloDi(livello);
  const pelo = mioSopra ? F : mioPelo;

  // QUOTA D'ANGOLO (le "curve" di Minecraft): ogni angolo del pelo sta alla
  // MEDIA dei peli delle celle d'acqua che lo toccano (io + 3 vicini). Gli
  // angoli condivisi coincidono per costruzione → le superfici si RACCORDANO
  // in rampe continue, niente terrazze. Colonna piena vicina → angolo a filo.
  const quotaAngolo = (sx, sz) => {
    if (mioSopra) return F;
    let somma = mioPelo, n = 1;
    for (const [dx, dz] of [[sx, 0], [0, sz], [sx, sz]]) {
      const v = vicinoAcqua(dx, dz);
      if (v !== null) {
        if (v.sopra) return F;
        somma += peloDi(v.livello); n++;
        continue;
      }
      // RACCORDO IN PENDENZA (foci nei laghi, labbri delle cascate): se di
      // fianco non c'è acqua ma UN GRADINO sotto/sopra sì, l'angolo scivola
      // verso quel pelo. I due lati mediano le STESSE quote assolute → gli
      // angoli condivisi coincidono e il muro diventa una rampa continua.
      if (!acquaA || vicinoPieno(dx, 0, dz)) continue;
      const giu = acquaA(dx, -1, dz);
      if (giu !== null && giu !== undefined) { somma += peloDi(giu) - 2 * F; n++; continue; }
      if (!vicinoPieno(dx, 1, dz)) {
        const su = acquaA(dx, 1, dz);
        if (su !== null && su !== undefined) { somma += peloDi(su) + 2 * F; n++; }
      }
    }
    return somma / n;
  };
  const hMM = quotaAngolo(-1, -1), hPM = quotaAngolo(1, -1);
  const hPP = quotaAngolo(1, 1), hMP = quotaAngolo(-1, 1);
  const angolo = (sx, sz) => (sx < 0 ? (sz < 0 ? hMM : hMP) : (sz < 0 ? hPM : hPP));

  if (!mioSopra) {
    const riva = rivaCella(solidoXZ);     // −−, +−, ++, −+: l'ordine del quad
    // FACCIA IN PENDENZA → tipo 3. Quando i quattro angoli non stanno quasi
    // sullo stesso piano questo non è un pelo piatto: è uno scivolo, e nello
    // shader prende un DISEGNO suo (le strisce lungo la corrente) — ma resta
    // pelo a tutti gli effetti, con riflesso, schiuma e onde come gli altri.
    //
    // Un commit passato aveva sistemato il bianco "delle cascate" correggendo
    // solo le facce LATERALI (tipo 2); la faccia superiore in pendenza aveva
    // tipo 1 e finiva nel ramo del pelo calmo, dove il rumore si campiona SOLO
    // in XZ. Su uno scivolo che scende quasi un blocco per cella quel rumore si
    // stira lungo la linea di massima pendenza: invece di spruzzo fine vengono
    // chiazze grandi e collegate, e il bianco non si spezza mai.
    const hMin = Math.min(hMM, hPM, hPP, hMP), hMax = Math.max(hMM, hPM, hPP, hMP);
    const inPendenza = hMax - hMin > PENDENZA_RIPIDA;
    b.extra(flusso[0], flusso[1], inPendenza ? 3 : (scorre ? 1 : 0));
    b.quad(p(-F, hMM, -F), p(F, hPM, -F), p(F, hPP, F), p(-F, hMP, F), pal.cima, [0, 1, 0], riva);
  }
  b.extra(0, 0, 5);
  if (!vicinoPieno(0, -1, 0)) b.quad(p(-F, -F, -F), p(F, -F, -F), p(F, -F, F), p(-F, -F, F), pal.fondo, [0, -1, 0]);

  for (const [dx, dz] of LATI) {
    const acquaLi = vicinoAcqua(dx, dz);             // livello dell'acqua vicina o null
    let base = -F;
    if (acquaLi !== null) {
      // acqua contro acqua: le rampe si raccordano da sole. Serve una parete
      // solo per le COLONNE PIENE (cascate), sopra il pelo del vicino.
      if (!mioSopra) continue;
      const suoPelo = acquaLi.sopra ? F : peloDi(acquaLi.livello);
      if (suoPelo >= pelo - 1e-6) continue;
      base = suoPelo;
    } else if (vicinoPieno(dx, 0, dz)) {
      continue;                                       // sigillata dal solido (18 px)
    }
    const tx = -dz, tz = dx;
    // le due quote in alto della parete = gli angoli di quel lato (rampa)
    const h1 = mioSopra ? F : angolo(dx - tx, dz - tz);
    const h2 = mioSopra ? F : angolo(dx + tx, dz + tz);
    b.extra(0, 0, cascata ? 2 : 5);
    b.quad(
      p(dx * F - tx * F, base, dz * F - tz * F),
      p(dx * F + tx * F, base, dz * F + tz * F),
      p(dx * F + tx * F, h2, dz * F + tz * F),
      p(dx * F - tx * F, h1, dz * F - tz * F),
      pal.lato, [dx, 0, dz],
    );
    b.extra(0, 0, 5);
  }
}

// ---- smistamento per blocco ---------------------------------------------------

function costruisciBlocco(bSolidi, bAcqua, mondo, x, y, z, tipo, luce = null) {
  const def = defDi(tipo);
  let pal = paletteBlocco(tipoBase(tipo), y);   // stagione + rampa d'altezza
  // MOTIVO: variazione deterministica cella per cella (la "texture" qui)
  if (def.motivo) pal = tintaPalette(pal, def.motivo, def.motivoForza ?? 1, x, y, z);
  const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
  if (def.acqua) {
    const sopraT = mondo.tipo(x, y + 1, z);
    const mioSopra = !!(sopraT && defDi(sopraT).acqua);
    const vicinoAcqua = (dx, dz) => {
      const t = mondo.tipo(x + dx, y, z + dz);
      if (!t || !defDi(t).acqua) return null;
      const s = mondo.tipo(x + dx, y + 1, z + dz);
      return { livello: livelloAcqua(t), sopra: !!(s && defDi(s).acqua) };
    };
    // CORRENTE: gradiente dei livelli (dal basso N verso l'alto N) + attrazione
    // verso i bordi liberi dove sta per cadere. Le sorgenti ferme restano calme.
    const Lc = livelloAcqua(tipo);
    let fx = 0, fz = 0;
    for (const [dx, dz] of LATI) {
      const t2 = mondo.tipo(x + dx, y, z + dz);
      if (t2 && defDi(t2).acqua) {
        const dL = livelloAcqua(t2) - Lc;
        fx += dL * dx; fz += dL * dz;
      } else if (!mondo.pieno(x + dx, y, z + dz) && !mondo.pieno(x + dx, y - 1, z + dz)) {
        fx += 1.5 * dx; fz += 1.5 * dz;              // orlo della cascata: tira di là
      }
    }
    const lung = Math.hypot(fx, fz);
    const flusso = (Lc > 0 || mioSopra) && lung > 0.01 ? [fx / lung, fz / lung] : [0, 0];

    // punti per i PARTICELLARI: correnti sul pelo e impatti delle cascate
    if (bAcqua.flussi && !mioSopra && (flusso[0] || flusso[1])) {
      bAcqua.flussi.push({ x: cx, y: cy + (7 - 2 * Lc) / 16, z: cz, fx: flusso[0], fz: flusso[1] });
    }
    if (bAcqua.impatti && mioSopra && livelloAcqua(sopraT) > 0) {
      // impatto SOLO sotto una colonna che CADE (flussi): il fondo di un lago
      // di sorgenti non è una cascata — niente bollicine sott'acqua
      const sotto = mondo.tipo(x, y - 1, z);
      const atterrata = !!sotto && (!defDi(sotto).acqua || livelloAcqua(sotto) === 0);
      if (atterrata) {
        let h = 0;
        while (h < 12) {
          const su = mondo.tipo(x, y + 1 + h, z);
          if (!su || !defDi(su).acqua) break;
          h++;
        }
        // le bollicine nascono ALLA SUPERFICIE della colonna, non sott'acqua
        const tCima = mondo.tipo(x, y + h, z);
        const Lc2 = tCima ? (livelloAcqua(tCima) || 0) : 0;
        // `ys` è tutt'altra quota: DOVE SBATTE, cioè il centro della cella che
        // ha fermato la colonna. Ci si appende l'anello di schiuma, che sta sul
        // pelo della pozza; `y` invece è la cima della colonna e serve solo alle
        // bollicine. Confonderle metteva l'anello in cima alla cascata.
        bAcqua.impatti.push({ x: cx, y: y + h + (15 - 2 * Lc2) / 16 + 0.02, z: cz, ys: cy, h });
      }
    }
    bAcqua.luceCella(luce, x, y, z);
    acquaBox(bAcqua, cx, cy, cz, pal, {
      livello: Lc, mioSopra, cascata: mioSopra, flusso, vicinoAcqua,
      vicinoPieno: (dx, dy, dz) => mondo.pieno(x + dx, y + dy, z + dz),
      // "questa colonna ferma l'acqua?" con UNA lettura: stessa regola del
      // culling (acqua e forme non piene non contano). mondo.pieno() da solo
      // non basta — conta anche l'acqua, e ogni pozza sarebbe sponda di sé stessa
      solidoXZ: (dx, dz) => {
        const t = mondo.tipo(x + dx, y, z + dz);
        if (!t) return false;
        const d = defDi(t);
        return !d.acqua && !FORME_VUOTE.has(d.forma);
      },
      // livello dell'acqua in una cella qualsiasi (anche sopra/sotto), per i
      // raccordi in pendenza alle foci e sui labbri delle cascate
      acquaA: (dx, dy, dz) => {
        const t = mondo.tipo(x + dx, y + dy, z + dz);
        const L = t ? livelloAcqua(t) : null;
        return L;
      },
    });
    bAcqua.fineLuce();
    return;
  }
  // INTORNO 3×3×3 IN UNA VOLTA SOLA. Prima ogni vicinoSolido() rifaceva una
  // mondo.tipo() (stringa + Map) e il supercubo ne chiede una cinquantina per
  // blocco. Qui si pagano 26 lookup fissi e poi tutto è indicizzazione d'array.
  // 1 = solido che occlude; acqua e forme non piene valgono 0 (lastre, pilastri
  // e croci non riempiono la cella: se cullassero i vicini si aprirebbero buchi).
  const vicini = new Uint8Array(27);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const t = mondo.tipo(x + dx, y + dy, z + dz);
        if (!t) continue;
        const d = defDi(t);
        if (!d.acqua && !FORME_VUOTE.has(d.forma)) vicini[IV(dx, dy, dz)] = 1;
      }
    }
  }
  const vicinoSolido = (dx, dy, dz) => vicini[IV(dx, dy, dz)] === 1;
  // forme non-cubiche dell'Officina: non cullano (non riempiono la cella)
  const extra = def.forma && FORME_EXTRA[def.forma];
  if (extra) {
    bSolidi.luceCella(luce, x, y, z);
    extra(bSolidi, cx, cy, cz, pal, () => false);
    bSolidi.fineLuce();
    return;
  }
  bSolidi.luceCella(luce, x, y, z);
  if (def.cappello && !vicinoSolido(0, 1, 0)) {
    bSolidi.erba(pal.cima, y);          // marca le cime: ritinta stagionale in-place
    conCappello(bSolidi, cx, cy, cz, pal, vicinoSolido);
    bSolidi.fineErba();
  } else {
    // REGOLA SPECIALE (culling attraverso i bordi): un vicino col cappello
    // SCOPERTO è alto 16 px, non 18 — non copre la fascia +8..+9 del supercubo.
    // In orizzontale culla solo un vicino "a tutta altezza".
    const vicinoTuttaAltezza = (dx, dy, dz) => {
      if (!vicinoSolido(dx, dy, dz)) return false;
      if (dy !== 0) return true;
      const t = mondo.tipo(x + dx, y, z + dz);
      return !defDi(t).cappello || vicinoSolido(dx, 1, dz);
    };
    supercubo(bSolidi, cx, cy, cz, pal, vicinoTuttaAltezza);
  }
  bSolidi.fineLuce();
}

// ---- mesher a chunk ------------------------------------------------------------

// PARACADUTE: oltre questa taglia la griglia di luce non si calcola proprio.
// Meglio nessuna maschera (il mondo torna esattamente com'era) che mezzo
// secondo di blocco all'apertura di un mondo enorme.
//
// DA DOVE VIENE IL NUMERO. Il ricalcolo pieno costa ~75 µs ogni mille celle
// (misurato in gioco: 19,7 ms su una griglia di 265k celle, open world r48).
// 2 milioni di celle sono quindi ~150 ms, il massimo che abbia senso far
// aspettare in un colpo solo. Era 6e6, cioè mezzo secondo abbondante — e per
// giunta IRRAGGIUNGIBILE: il raggio più grande che il menu debug sappia
// generare è 96, che fa una scatola di ~197×30×197 = 1,16M celle, cinque volte
// sotto la soglia. Un paracadute che non si apre mai è codice morto; questo
// invece resta una rete vera per i mondi importati o costruiti in verticale.
const LUCE_LIMITE_CELLE = 2e6;
// Oltre questi cambi in un colpo solo la rilluminazione locale non conviene più
// (generazione del mondo, import, incolla di una struttura): meglio una griglia
// nuova. NON è più una soglia sulla TAGLIA DEL MONDO: quella era una rupe
// invisibile — misurava le celle di un AABB denso, quindi sull'arcipelago
// scattava per un blocco posato più in alto, e da lì in poi la maschera
// smetteva di aggiornarsi senza dare alcun segnale.
//
// PERCHÉ 96. È il punto in cui le due strade costano uguale sul mondo di prova.
// Una cella cambiata costa una ri-illuminazione della zona che tocca (una
// traversata per lampada e per cella dentro il raggio); il ricalcolo pieno costa quanto il mondo e non dipende da quante
// celle sono cambiate. Sull'open world r48 il pieno sta fra 20 e 90 ms, e la
// via locale ci arriva attorno al centinaio di celle. Sotto conviene sempre il
// locale, sopra il pieno: il numero è la frontiera, non una preferenza. È anche
// abbastanza alto da coprire i casi normali (una casetta, una zolla di terreno,
// i lampioni che si accendono al tramonto) senza mai svegliare il ricalcolo.
const CAMBI_MAX_LOCALI = 96;

export class Mesher {
  constructor(scena) {
    this.scena = scena;
    this.chunks = new Map();       // "cx,cz" → { solidi: Mesh, acqua: Mesh }
    // occTroppoGrande: il paracadute LUCE_LIMITE_CELLE è scattato. Serve un
    // campo suo perché prima quel caso lasciava occCelle = 0 e il pannello
    // stampava "occlusione spenta" — la STESSA identica riga di "l'utente ha
    // spento l'interruttore" e di "mondo vuoto". Tre stati diversi sotto
    // un'etichetta sola: se il paracadute si aprisse davvero, nessuno saprebbe
    // distinguerlo da una preferenza.
    this.statistiche = { ultimaMs: 0, chunkAttivi: 0, occMs: 0, occCelle: 0, occLocali: 0, occTroppoGrande: 0 };
    this.luce = null;              // GrigliaLuce, rifatta prima dei chunk
    this.occlusioneAttiva = true;        // interruttore delle Impostazioni
    // sorgenti che NON sono blocchi (lampioni dei furni): una funzione, non un
    // elenco copiato, così è sempre quella di adesso e non serve tenerla in pari
    this.sorgentiExtra = null;     // () => [{x, y, z, raggio}]
    this._celleLuce = new Set();   // celle-sorgente cambiate fuori dal mondo (furni)
    this._sorgFurni = [];
  }

  /**
   * Ricalcola la MASCHERA D'OCCLUSIONE sull'estensione occupata dal mondo. Si fa
   * QUI, una volta per ricostruzione: il risultato finisce nei vertici come bit
   * per-lampada e NON dipende dall'ora. Il giorno e la notte li fa uAmbiente, un
   * colore che lo shader moltiplica per tutto: cambiare ora non tocca la
   * maschera, e infatti il ciclo non rimesha mai niente.
   */
  _ricalcolaLuce(mondo) {
    const t0 = performance.now();
    const vecchia = this.luce;
    this.luce = null;
    this.statistiche.occCelle = 0;
    this.statistiche.occMs = 0;
    this.statistiche.occLocali = 0;
    this.statistiche.occTroppoGrande = 0;
    mondo.scordaCambi();
    this._celleLuce.clear();      // il ricalcolo pieno assorbe tutto
    if (!this.occlusioneAttiva) return;

    // UNA SOLA PASSATA SUL MONDO. La scatola serve prima di poter allocare la
    // griglia, quindi le celle solide si mettono da parte qui appiattite: la
    // seconda passata, da sola, costava 39 ms su 73k blocchi. E si usa perOgni()
    // invece di tutti(), che per ogni blocco ricompone le coordinate con
    // split+map e alloca un oggetto: altri 34 ms buttati (misurato in gioco).
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const sorgenti = [], solidi = [];
    mondo.perOgni((x, y, z, tipo) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      const d = defDi(tipo);
      // Stessa regola del culling: acqua e forme non piene NON fermano la luce
      // (una pianta o una lastra non fanno ombra). I furni nemmeno: non sono
      // blocchi, e un tavolo che proietta un quadrato nero sarebbe peggio.
      if (!d.acqua && !FORME_VUOTE.has(d.forma)) solidi.push(x, y, z);
      // LO STESSO RAGGIO DELLA SFERA, non arrotondato: la maschera deve coprire
      // esattamente la zona che la luce-sfera illumina, o l'ultimo anello
      // sparirebbe. (Il margine per i centri sfalsati lo mette la griglia.)
      if (d.luce) sorgenti.push(x, y, z, d.luce.raggio);
    });
    if (!isFinite(minX)) return;                    // mondo vuoto

    const scatola = scatolaPerMondo(minX, minY, minZ, maxX, maxY, maxZ);
    const celle = scatola.larghezza * scatola.altezza * scatola.profondita;
    // il pannello deve poter dire "troppo grande", non "spenta": vedi statistiche
    if (celle > LUCE_LIMITE_CELLE) { this.statistiche.occTroppoGrande = celle; return; }
    // RIUSO: se la scatola non è cambiata (il caso normale, perché il ricalcolo
    // pieno capita quasi solo al caricamento e all'import) si riciclano i due
    // array della griglia — `visto` (Uint32, quattro byte a cella: è il prezzo
    // del bit per lampada) e `solidi` (Uint8) — invece di riallocarli e darli in
    // pasto al GC
    const g = (vecchia && vecchia.stessaScatola(scatola))
      ? (vecchia.azzera(), vecchia) : new GrigliaLuce(scatola);

    // SOLIDITÀ PRECALCOLATA, la lezione costata cara: passare `mondo.pieno` come
    // test costava 423 ms su 195k celle contro 56, perché compone una stringa
    // "x,y,z" e cerca in una Map — e la maschera lo chiede a OGNI PASSO di OGNI
    // traversata, cioè il ciclo più caldo del gioco. Qui è un Uint8Array riempito
    // una volta, e la traversata legge un indice che si porta dietro (vedi
    // _bloccato in luce.js).
    for (let i = 0; i < solidi.length; i += 3) g.marcaSolido(solidi[i], solidi[i + 1], solidi[i + 2]);
    for (let i = 0; i < sorgenti.length; i += 4) {
      g.aggiungiSorgente(sorgenti[i], sorgenti[i + 1], sorgenti[i + 2], sorgenti[i + 3]);
    }
    if (this.sorgentiExtra) {
      // i lampioni dei furni si cuociono per lo STATO IN CUI SONO: sorgentiExtra
      // filtra già gli spenti. Prima si cuocevano sempre accesi — costava meno,
      // ma a schermo dava un interruttore che non spegne (l'alone spariva e la
      // stanza restava illuminata, per giunta virata all'arancione).
      this._sorgFurni = this.sorgentiExtra();
      for (const s of this._sorgFurni) g.aggiungiSorgente(s.x, s.y, s.z, s.raggio);
    }
    g.calcola();
    this.luce = g;
    this.statistiche.occCelle = celle;
    this.statistiche.occMs = performance.now() - t0;
  }

  /**
   * Ricalcolo pieno CHIAMATO DAL VIVO, cioè mentre si gioca. Oltre a rifare la
   * griglia deve dire QUALI CHUNK sono cambiati, e quello è il punto: i ripieghi
   * di _rillumina rifacevano la griglia e uscivano senza sporcare niente, quindi
   * restavano sporchi solo i chunk marcati da world._sporca, che ha raggio ~1
   * cella — mentre l'ombra di una lampada arriva fino al suo raggio.
   * PROVATO: un muro nuovo davanti a una lampada aggiornava benissimo la
   * maschera, ma i chunk oltre il muro restavano STANTII (illuminati) finché il
   * giocatore non toccava qualcosa lì vicino. Ed è proprio il ramo che scatta
   * quando il cambiamento è GRANDE, cioè quando il rischio è massimo.
   *
   * Non si sporca tutto a scatola chiusa: su un open world sarebbero 900 ms di
   * rimesh. Si tiene una COPIA della maschera e si confronta colonna per colonna
   * — un memcpy e un giro di confronti, contro un rebuild che non serve. Solo
   * quando la scatola cambia (allora gli indici si spostano tutti) si sporca
   * l'intero mondo.
   */
  _ricalcolaLuceDalVivo(mondo) {
    const vecchia = this.luce;
    const prima = vecchia ? vecchia.visto.slice() : null;
    this._ricalcolaLuce(mondo);
    const g = this.luce;
    // _ricalcolaLuce riusa l'oggetto SOLO se la scatola combacia: l'identità è
    // già la risposta a "gli indici sono ancora gli stessi?"
    if (!g || g !== vecchia) {
      for (const kc of mondo.chunks.keys()) mondo.sporchi.add(kc);
      return;
    }
    const { lx, ly, lz, minX, minZ, visto } = g;
    for (let i = 0; i < lx; i++) {
      const kx = Math.floor((i + minX) / CHUNK);
      for (let k = 0; k < lz; k++) {
        const kc = kx + ',' + Math.floor((k + minZ) / CHUNK);
        if (mondo.sporchi.has(kc) || !mondo.chunks.has(kc)) continue;
        const base = i * ly * lz + k;
        for (let j = 0; j < ly; j++) {
          const id = base + j * lz;
          if (visto[id] !== prima[id]) { mondo.sporchi.add(kc); break; }
        }
      }
    }
  }

  /** Occlusione in un PUNTO, per le mesh che non passano dal mesher (gatto,
   *  mano, palle, mobili): maschera delle lampade bloccate, 0 = luce libera.
   *  -1 = non c'è griglia, chi chiama lasci le cose com'erano. */
  sonda(x, y, z) {
    if (!this.luce) return -1;
    return this.luce.occlusaPunto(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  /** Lo SLOT della lampada che sta in questo punto (−1 = nessuna). È il ponte
   *  fra la sfera che lo shader disegna e il bit cotto nei vertici: senza, la
   *  maschera per-lampada non saprebbe quale bit interrogare. */
  slotLuce(pos) {
    if (!this.luce) return -1;
    return this.luce.slotDi(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
  }

  /** I guasti che degraderebbero in silenzio: il pannello debug li stampa.
   *  · occScartate  chunk a cui la cintura di taglia ha tolto aOcc
   *  · slotEsauriti lampade senza bit (tornano ad attraversare i muri)
   *  · raggiTroncati raggi tagliati da RAGGIO_MAX (sfera più lunga della maschera)
   *
   *  TUTTI E TRE DICONO COM'È ADESSO, non quante volte è successo dall'avvio.
   *  occScartate era un contatore di modulo che sapeva solo crescere: una volta
   *  scattato, il pannello continuava a stampare «⚠ N chunk senza maschera» per
   *  sempre, anche dopo che una ricostruzione aveva rimesso a posto quei chunk —
   *  e il numero saliva a ogni remesh. Qui si contano i chunk che il guasto ce
   *  l'hanno ORA, quindi rimeshare lo cancella e togliere il chunk pure.
   *  (slotEsauriti e raggiTroncati stanno sulla griglia e si azzerano in
   *  GrigliaLuce.azzera(): stessa proprietà, strada diversa.) */
  guasti() {
    let occScartate = 0;
    for (const e of this.chunks.values()) if (e.senzaMaschera || e.senzaMascheraAcqua) occScartate++;
    return {
      occScartate,
      slotEsauriti: this.luce ? this.luce.slotEsauriti : 0,
      raggiTroncati: this.luce ? this.luce.raggiTroncati : 0,
    };
  }

  /** Una LUCE è cambiata in `cella`: la maschera va rifatta e vanno rimeshati i
   *  chunk che quella luce raggiunge. `portata` è il raggio in celle — usarlo
   *  invece del massimo (15) conta: con l'anello fisso di 3×3 chunk, posare una
   *  lucciola su un open world costava 216 ms perché ne rifaceva nove.
   *  Il margine è lo stesso della griglia: la maschera arriva una cella più in
   *  là della sfera, e quei chunk vanno rifatti anche loro. */
  sporcaLuce(mondo, cella, portata = RAGGIO_MAX) {
    if (!this.occlusioneAttiva) return;
    this._celleLuce.add(cella[0] + ',' + cella[1] + ',' + cella[2]);
    const r = Math.max(1, Math.min(RAGGIO_MAX, Math.ceil(portata) + MARGINE_MASCHERA));
    const x0 = Math.floor((cella[0] - r) / CHUNK), x1 = Math.floor((cella[0] + r) / CHUNK);
    const z0 = Math.floor((cella[2] - r) / CHUNK), z1 = Math.floor((cella[2] + r) / CHUNK);
    for (let i = x0; i <= x1; i++) {
      for (let k = z0; k <= z1; k++) {
        const kc = i + ',' + k;
        if (mondo.chunks.has(kc)) mondo.sporchi.add(kc);
      }
    }
  }

  /** Le luci dei FURNI sono cambiate? Confrontare l'elenco è più solido che
   *  farsi raccontare dagli eventi cosa è successo: togliendo un furni l'evento
   *  non porta con sé la luce che aveva, e senza il raggio non si saprebbe
   *  nemmeno quali chunk rifare. */
  verificaLuciFurni(mondo) {
    if (!this.occlusioneAttiva || !this.sorgentiExtra) return;
    const chiave = (v) => `${v.x},${v.y},${v.z}:${v.raggio}`;
    const ora = this.sorgentiExtra(), prima = this._sorgFurni || [];
    const oraK = new Set(ora.map(chiave)), primaK = new Set(prima.map(chiave));
    for (const v of prima) if (!oraK.has(chiave(v))) this.sporcaLuce(mondo, [v.x, v.y, v.z], v.raggio);
    for (const v of ora) if (!primaK.has(chiave(v))) this.sporcaLuce(mondo, [v.x, v.y, v.z], v.raggio);
    this._sorgFurni = ora;
  }

  _entry(kc) {
    let e = this.chunks.get(kc);
    if (!e) {
      e = {
        solidi: new THREE.Mesh(new THREE.BufferGeometry(), materialeMondo()),
        acqua: new THREE.Mesh(new THREE.BufferGeometry(), materialeAcqua()),
      };
      e.acqua.renderOrder = 2;
      // geometrie in coordinate mondo, mesh mai spostate: matrici congelate
      e.solidi.matrixAutoUpdate = false;
      e.acqua.matrixAutoUpdate = false;
      this.scena.add(e.solidi, e.acqua);
      this.chunks.set(kc, e);
    }
    return e;
  }

  _rimuovi(kc) {
    const e = this.chunks.get(kc);
    if (e) {
      this.scena.remove(e.solidi, e.acqua);
      e.solidi.geometry.dispose();
      e.acqua.geometry.dispose();
      this.chunks.delete(kc);
    }
    this._cieloChunk(kc, null);
  }

  /** Heightmap del cielo per le ombre delle nuvole: quota superficie per colonna. */
  _cieloChunk(kc, mondo) {
    const [cx, cz] = kc.split(',').map(Number);
    const quote = new Map();       // "locale" ix,iz → quota
    const colonne = [];
    if (mondo) {
      for (const { x, y, z, tipo } of mondo.blocchiDelChunk(kc)) {
        const k = (x - cx * CHUNK) * CHUNK + (z - cz * CHUNK);
        const q = quote.get(k);
        if (q === undefined || y + 1 > q) quote.set(k, y + 1);
      }
    }
    for (let ix = 0; ix < CHUNK; ix++) {
      for (let iz = 0; iz < CHUNK; iz++) {
        const q = quote.get(ix * CHUNK + iz);
        colonne.push([[cx * CHUNK + ix, cz * CHUNK + iz], q === undefined ? -1000 : q]);
      }
    }
    aggiornaCielo(colonne);
  }

  _chunk(mondo, kc, soloAcqua = false) {
    // REBUILD SOLO-ACQUA: la simulazione tocca solo celle d'acqua, ricostruire
    // anche tutti i solidi del chunk (i cappelli d'erba pesano 100+ tri l'uno)
    // faceva crollare gli fps durante l'espansione. Qui si rifà solo il liquido.
    const e0 = this.chunks.get(kc);
    if (soloAcqua && e0) {
      const acqua = costruttoreAcqua();
      const scarto = new Costruttore();
      for (const { x, y, z, tipo } of mondo.blocchiDelChunk(kc)) {
        if (!defDi(tipo).acqua) continue;
        costruisciBlocco(scarto, acqua, mondo, x, y, z, tipo, this.luce);
      }
      e0.acqua.geometry.dispose();
      e0.acqua.geometry = acqua.geometria();
      e0.acqua.geometry.computeBoundingBox();
      e0.senzaMascheraAcqua = acqua.mascheraScartata;
      e0.flussi = acqua.flussi;
      e0.impatti = acqua.impatti;
      return;
    }

    const solidi = new Costruttore();
    const acqua = costruttoreAcqua();
    for (const { x, y, z, tipo } of mondo.blocchiDelChunk(kc)) {
      costruisciBlocco(solidi, acqua, mondo, x, y, z, tipo, this.luce);
    }
    this._cieloChunk(kc, mondo);
    if (solidi.vuoto && acqua.vuoto) { this._rimuovi(kc); return; }
    const e = this._entry(kc);
    e.solidi.geometry.dispose();
    e.solidi.geometry = solidi.geometria();
    e.erbe = solidi.erbe;
    e.acqua.geometry.dispose();
    e.acqua.geometry = acqua.geometria();
    e.acqua.geometry.computeBoundingBox();   // il riflesso cerca il pelo più vicino
    // GUASTO DI QUESTO CHUNK, NON DEL MONDO: si riscrive ogni volta che il chunk
    // si ricostruisce, così una ricostruzione che risolve il problema lo TOGLIE
    // dal conto (vedi guasti()).
    e.senzaMaschera = solidi.mascheraScartata;
    e.senzaMascheraAcqua = acqua.mascheraScartata;
    e.flussi = acqua.flussi;
    e.impatti = acqua.impatti;
  }

  /** Cambio stagione SMOOTH: riscrive in-place i colori delle cime d'erba
   *  (indici marcati dal Costruttore) — niente remesh, solo float nel buffer.
   *  `colorePer(quotaCella)` → {r,g,b} in [0..1]. */
  ritintaErba(colorePer) {
    for (const e of this.chunks.values()) {
      if (!e.erbe || e.erbe.length === 0) continue;
      const attr = e.solidi.geometry.getAttribute('color');
      if (!attr) continue;
      const arr = attr.array;
      // stride 2 (indice del primo vertice, quota) e NIENTE fattori: il colore
      // di stagione va nel buffer tale e quale, esattamente come lo scrive
      // tri(). Portava anche tre moltiplicatori per triangolo — ombra per
      // faccia × AO — e senza di loro qui l'erba sarebbe tornata piatta al
      // primo cambio di stagione; adesso quei moltiplicatori non esistono più
      // e riapplicarli scurirebbe le sole cime d'erba, che sono le uniche a
      // passare da qui.
      for (let i = 0; i < e.erbe.length; i += 2) {
        const vi = e.erbe[i], c = colorePer(e.erbe[i + 1]);
        for (let v = 0; v < 3; v++) {
          const o = (vi + v) * 3;
          arr[o] = c.r; arr[o + 1] = c.g; arr[o + 2] = c.b;
        }
      }
      attr.needsUpdate = true;
    }
  }

  /** Ricostruzione totale (avvio, import, reset): via gli orfani, su tutto il resto. */
  ricostruisciTutto(mondo) {
    const t0 = performance.now();
    this._ricalcolaLuce(mondo);
    for (const kc of [...this.chunks.keys()]) {
      if (!mondo.chunks.has(kc)) this._rimuovi(kc);
    }
    for (const kc of mondo.chunks.keys()) this._chunk(mondo, kc);
    mondo.sporchi.clear();
    mondo.sporchiAcqua.clear();
    this.statistiche.ultimaMs = performance.now() - t0;
    this.statistiche.chunkAttivi = this.chunks.size;
  }

  /**
   * Porta la griglia in pari con ciò che è cambiato: LOCALE quando può, da capo
   * quando il cambiamento è troppo grosso (generazione, import) o esce dalla
   * scatola. Non c'è più nessuna soglia sulla taglia del mondo: la maschera si
   * aggiorna mentre si costruisce SEMPRE, anche su un open world r48.
   *
   * L'acqua non entra mai qui: non ferma la luce e non ne emette, e la sua
   * simulazione tocca celle di continuo (world.js non la registra apposta).
   */
  _rillumina(mondo) {
    if (!this.occlusioneAttiva) { mondo.scordaCambi(); this._celleLuce.clear(); return; }
    if (!this.luce) { this._ricalcolaLuceDalVivo(mondo); return; }
    // niente da fare: si esce PRIMA di interrogare l'arredo, o la simulazione
    // dell'acqua (che sporca chunk di continuo) pagherebbe quel giro a ogni tick
    if (mondo.cambiate.length === 0 && this._celleLuce.size === 0) return;

    // le lampade d'arredo di ADESSO, per cella: possono cadere sulla stessa
    // cella di un blocco luminoso, e allora vince la più forte
    const furni = new Map();
    if (this.sorgentiExtra) {
      const ora = this.sorgentiExtra();
      // DIFF DI SICUREZZA: chi accende un lampione dovrebbe passare da
      // verificaLuciFurni, ma legarsi a quella promessa vuol dire che un giorno
      // qualcuno aggiunge un modo di accendere e la maschera resta indietro
      // in silenzio. Qui si guarda com'è ADESSO e si recupera comunque.
      const chiave = (v) => `${v.x},${v.y},${v.z}:${v.raggio}`;
      const oraK = new Set(ora.map(chiave)), primaK = new Set(this._sorgFurni.map(chiave));
      for (const v of this._sorgFurni) if (!oraK.has(chiave(v))) this._celleLuce.add(`${v.x},${v.y},${v.z}`);
      for (const v of ora) if (!primaK.has(chiave(v))) this._celleLuce.add(`${v.x},${v.y},${v.z}`);
      this._sorgFurni = ora;
      for (const s of ora) {
        const k = s.x + ',' + s.y + ',' + s.z;
        furni.set(k, Math.max(furni.get(k) || 0, s.raggio));
      }
    }

    // (nessun controllo a zero: ci si arriva solo passando dall'uscita in alto,
    // che scatta proprio quando entrambi i contatori sono vuoti)
    const quanti = mondo.cambiate.length / 3 + this._celleLuce.size;
    if (mondo.troppiCambi || quanti > CAMBI_MAX_LOCALI) { this._ricalcolaLuceDalVivo(mondo); return; }

    const t0 = performance.now();
    const visto = new Set(), cambi = [];
    const aggiungi = (x, y, z) => {
      const k = x + ',' + y + ',' + z;
      if (visto.has(k)) return;
      visto.add(k);
      const t = mondo.tipo(x, y, z);
      const d = t ? defDi(t) : null;
      let raggio = d && d.luce ? d.luce.raggio : 0;
      const f = furni.get(k);
      if (f > raggio) raggio = f;
      cambi.push({ x, y, z, raggio, solido: !!(d && !d.acqua && !FORME_VUOTE.has(d.forma)) });
    };
    const c = mondo.cambiate;
    for (let i = 0; i < c.length; i += 3) aggiungi(c[i], c[i + 1], c[i + 2]);
    for (const k of this._celleLuce) {
      const i1 = k.indexOf(','), i2 = k.indexOf(',', i1 + 1);
      aggiungi(+k.slice(0, i1), +k.slice(i1 + 1, i2), +k.slice(i2 + 1));
    }
    mondo.scordaCambi();
    this._celleLuce.clear();

    const zona = this.luce.applicaCambi(cambi);
    if (!zona) { this._ricalcolaLuceDalVivo(mondo); return; }   // fuori scatola: griglia nuova
    // I CHUNK CHE LA LUCE HA DAVVERO TOCCATO. Serve: l'ombra di un tetto sconfina
    // oltre il chunk dove hai posato il blocco, e senza questo il vicino
    // resterebbe illuminato fino a chissà quando.
    for (let cx = Math.floor(zona.minX / CHUNK); cx <= Math.floor(zona.maxX / CHUNK); cx++) {
      for (let cz = Math.floor(zona.minZ / CHUNK); cz <= Math.floor(zona.maxZ / CHUNK); cz++) {
        const kc = cx + ',' + cz;
        if (mondo.chunks.has(kc)) mondo.sporchi.add(kc);
      }
    }
    this.statistiche.occMs = performance.now() - t0;
    this.statistiche.occLocali = cambi.length;
  }

  /** Ricostruzione incrementale: solo i chunk sporchi. Da chiamare nel loop. */
  aggiorna(mondo) {
    if (mondo.sporchi.size === 0 && mondo.sporchiAcqua.size === 0
        && mondo.cambiate.length === 0 && this._celleLuce.size === 0) return;
    const t0 = performance.now();
    this._rillumina(mondo);
    for (const kc of mondo.sporchi) {
      if (mondo.chunks.has(kc)) this._chunk(mondo, kc);
      else this._rimuovi(kc);
    }
    for (const kc of mondo.sporchiAcqua) {
      if (mondo.sporchi.has(kc)) continue;           // già rifatto per intero
      if (mondo.chunks.has(kc)) this._chunk(mondo, kc, true);
      else this._rimuovi(kc);
    }
    mondo.sporchi.clear();
    mondo.sporchiAcqua.clear();
    this.statistiche.ultimaMs = performance.now() - t0;
    this.statistiche.chunkAttivi = this.chunks.size;
  }
}

// ---- superficie di prova ----------------------------------------------------
// Roba interna esportata SOLO per i test (test/mesher.test.mjs): la riva e la
// soglia di pendenza, cioè i numeri su cui sono tarate le soglie dello shader
// dell'acqua — cambiarli qui lo scalibrerebbe in silenzio.
export { rivaCella, Costruttore, PENDENZA_RIPIDA, RIVA_RAGGIO };

/** Geometria di un singolo blocco isolato (per il ghost di anteprima). */
export function geometriaSingola(tipo) {
  const def = defDi(tipo);
  const pal = paletteBlocco(tipoBase(tipo), 3);   // quota media della rampa
  const b = new Costruttore();
  const nessuno = () => false;
  if (def.acqua) acquaBox(b, 0, 0, 0, pal, { livello: 0, mioSopra: false, cascata: false, flusso: [0, 0], vicinoAcqua: () => null, vicinoPieno: nessuno });
  else if (def.forma && FORME_EXTRA[def.forma]) FORME_EXTRA[def.forma](b, 0, 0, 0, pal, nessuno);
  else if (def.cappello) conCappello(b, 0, 0, 0, pal, nessuno);
  else supercubo(b, 0, 0, 0, pal, nessuno);
  return b.geometria();
}
