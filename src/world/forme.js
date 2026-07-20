// FORME non-cubiche per i blocchi dell'Officina. Stessa firma dei costruttori
// del mesher — (b, cx, cy, cz, pal, vicino) — così il dispatch resta una riga.
//
//   lastra   mezza altezza (ci cammini sopra)
//   pilastro colonna sottile
//   croce    due quad incrociati in piedi: la classica "pianta", il vero
//            non-cubo. Va vista da entrambi i lati, quindi ogni quad si emette
//            due volte con la normale opposta.
//
// NB: queste forme NON riempiono la cella → non devono nascondere le facce dei
// vicini (vedi riempieCella in blocks.js), altrimenti si aprono buchi nel mondo.

import { coloreFaccia } from './stagioni.js?v=mrt21mqg';

const U = 1 / 16;
const F = 8 * U;        // mezza cella
const H = 9 * U;        // sbordo del supercubo

/** Scatola diritta fra due quote, larga `mez` sui lati. */
function scatola(b, cx, cy, cz, pal, y0, y1, mez) {
  const p = (x, y, z) => [cx + x, cy + y, cz + z];
  b.quad(p(-mez, y1, -mez), p(mez, y1, -mez), p(mez, y1, mez), p(-mez, y1, mez),
    coloreFaccia(pal, 1, 1), [0, 1, 0]);
  b.quad(p(-mez, y0, -mez), p(mez, y0, -mez), p(mez, y0, mez), p(-mez, y0, mez),
    coloreFaccia(pal, 1, -1), [0, -1, 0]);
  // i 4 fianchi, ognuno col colore della propria faccia
  const lati = [
    { d: [1, 0, 0], asse: 0, segno: 1 }, { d: [-1, 0, 0], asse: 0, segno: -1 },
    { d: [0, 0, 1], asse: 2, segno: 1 }, { d: [0, 0, -1], asse: 2, segno: -1 },
  ];
  for (const l of lati) {
    const [dx, , dz] = l.d;
    const tx = -dz, tz = dx;                       // tangente al lato
    const q = (y, t) => p(dx * mez + tx * t, y, dz * mez + tz * t);
    b.quad(q(y0, -mez), q(y1, -mez), q(y1, mez), q(y0, mez),
      coloreFaccia(pal, l.asse, l.segno), l.d);
  }
}

/** Mezza cella: pavimento/gradino. */
export function lastra(b, cx, cy, cz, pal) {
  scatola(b, cx, cy, cz, pal, -H, 0, F);
}

/** Colonna sottile, tutta altezza. */
export function pilastro(b, cx, cy, cz, pal) {
  scatola(b, cx, cy, cz, pal, -H, H, 5 * U);
}

/** Due quad incrociati in piedi (pianta/fiore): il vero non-cubo. */
export function croce(b, cx, cy, cz, pal) {
  const p = (x, y, z) => [cx + x, cy + y, cz + z];
  const c = coloreFaccia(pal, 0, 1);
  const d = F;
  // diagonale A (da -x-z a +x+z) e diagonale B, ognuna vista da tutti e due i lati
  const piani = [
    [[-d, -H, -d], [d, -H, d], [d, H, d], [-d, H, -d], [1, 0, -1]],
    [[-d, -H, d], [d, -H, -d], [d, H, -d], [-d, H, d], [1, 0, 1]],
  ];
  for (const [a1, a2, a3, a4, n] of piani) {
    b.quad(p(...a1), p(...a2), p(...a3), p(...a4), c, n);
    b.quad(p(...a1), p(...a2), p(...a3), p(...a4), c, [-n[0], -n[1], -n[2]]);
  }
}

/** Le forme extra, per il dispatch del mesher e per gli schemi dell'Officina. */
export const FORME_EXTRA = { lastra, pilastro, croce };

/** Una forma che NON riempie la cella non culla i vicini e non fa da tappo. */
export const FORME_VUOTE = new Set(['lastra', 'pilastro', 'croce']);
