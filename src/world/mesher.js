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
import { materialeMondo, materialeAcqua, aggiornaCielo } from '../fx/materials.js';
import { CHUNK } from './world.js';

const U = 1 / 16;                 // 1 pixel in unità mondo
const COPPIE_SMUSSO = [[0, 1], [0, 2], [1, 2]];
const LATI = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const _colore = new THREE.Color();

class Costruttore {
  constructor() {
    this.pos = []; this.col = []; this.acq = null; this._ex = null;
    // vertici "cima d'erba" [indice, quotaCella, …]: il cambio stagione SMOOTH
    // riscrive solo questi float nel color buffer, senza ricostruire nulla
    this.erbe = [];
    this._erbaHex = null; this._erbaY = 0;
  }

  /** Attiva/spegne la marcatura dei triangoli color pal.cima come "erba". */
  erba(hexCima, quotaCella) { this._erbaHex = hexCima; this._erbaY = quotaCella; }
  fineErba() { this._erbaHex = null; }

  /** Canale extra per-vertice dell'ACQUA: (dirX corrente, dirZ corrente, tipo faccia).
   *  tipo: 0 sorgente calma · 1 pelo che scorre · 2 lato cascata · 3 schiuma · 5 piatto. */
  extra(fx, fz, tipo) {
    if (!this.acq) { this.acq = []; this.riv = []; }
    this._ex = [fx, fz, tipo];
  }

  /** riva per-vertice (0 = a ridosso di un solido, 1 = acqua aperta): la
   *  schiuma di riva nello shader nasce dal gradiente di questo canale. */
  tri(a, b, c, colore, fuori, rABC = null) {
    let rA = 1, rB = 1, rC = 1;
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
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    _colore.setHex(colore);
    for (let i = 0; i < 3; i++) this.col.push(_colore.r, _colore.g, _colore.b);
    if (this.acq) {
      const e = this._ex || [0, 0, 5];
      for (let i = 0; i < 3; i++) this.acq.push(e[0], e[1], e[2]);
      this.riv.push(rA, rB, rC);
    }
  }

  quad(a, b, c, d, colore, fuori, rABCD = null) {
    this.tri(a, b, c, colore, fuori, rABCD ? [rABCD[0], rABCD[1], rABCD[2]] : null);
    this.tri(a, c, d, colore, fuori, rABCD ? [rABCD[0], rABCD[2], rABCD[3]] : null);
  }

  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.acq) {
      g.setAttribute('aAcqua', new THREE.Float32BufferAttribute(this.acq, 3));
      g.setAttribute('aRiva', new THREE.Float32BufferAttribute(this.riv, 1));
    }
    return g;
  }

  get vuoto() { return this.pos.length === 0; }
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

// info = { livello, mioSopra, cascata, flusso:[fx,fz], vicinoAcqua, vicinoPieno }
function acquaBox(b, cx, cy, cz, pal, info) {
  const F = 8 * U;
  const { livello, mioSopra, cascata, flusso, vicinoAcqua, vicinoPieno, acquaA } = info;
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
    // riva per angolo: 0 se uno dei 3 vicini dell'angolo è un SOLIDO
    const riva = (sx, sz) => {
      for (const [dx, dz] of [[sx, 0], [0, sz], [sx, sz]]) {
        if (vicinoAcqua(dx, dz) === null && vicinoPieno(dx, 0, dz)) return 0;
      }
      return 1;
    };
    b.extra(flusso[0], flusso[1], scorre ? 1 : 0);
    b.quad(p(-F, hMM, -F), p(F, hPM, -F), p(F, hPP, F), p(-F, hMP, F), pal.cima, [0, 1, 0],
      [riva(-1, -1), riva(1, -1), riva(1, 1), riva(-1, 1)]);
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

function costruisciBlocco(bSolidi, bAcqua, mondo, x, y, z, tipo) {
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
        bAcqua.impatti.push({ x: cx, y: y + h + (15 - 2 * Lc2) / 16 + 0.02, z: cz, h });
      }
    }
    acquaBox(bAcqua, cx, cy, cz, pal, {
      livello: Lc, mioSopra, cascata: mioSopra, flusso, vicinoAcqua,
      vicinoPieno: (dx, dy, dz) => mondo.pieno(x + dx, y + dy, z + dz),
      // livello dell'acqua in una cella qualsiasi (anche sopra/sotto), per i
      // raccordi in pendenza alle foci e sui labbri delle cascate
      acquaA: (dx, dy, dz) => {
        const t = mondo.tipo(x + dx, y + dy, z + dz);
        const L = t ? livelloAcqua(t) : null;
        return L;
      },
    });
    return;
  }
  // i solidi si cullano solo tra loro: verso l'acqua restano visibili
  const vicinoSolido = (dx, dy, dz) => {
    const t = mondo.tipo(x + dx, y + dy, z + dz);
    if (!t) return false;
    const d = defDi(t);
    // lastre, pilastri e croci NON riempiono la cella: se cullassero i vicini
    // si aprirebbero buchi nel mondo
    return !d.acqua && !FORME_VUOTE.has(d.forma);
  };
  // forme non-cubiche dell'Officina: non cullano (non riempiono la cella)
  const extra = def.forma && FORME_EXTRA[def.forma];
  if (extra) { extra(bSolidi, cx, cy, cz, pal, () => false); return; }
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
}

// ---- mesher a chunk ------------------------------------------------------------

export class Mesher {
  constructor(scena) {
    this.scena = scena;
    this.chunks = new Map();       // "cx,cz" → { solidi: Mesh, acqua: Mesh }
    this.statistiche = { ultimaMs: 0, chunkAttivi: 0 };
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
      const acqua = new Costruttore();
      acqua.flussi = []; acqua.impatti = [];
      const scarto = new Costruttore();
      for (const { x, y, z, tipo } of mondo.blocchiDelChunk(kc)) {
        if (!defDi(tipo).acqua) continue;
        costruisciBlocco(scarto, acqua, mondo, x, y, z, tipo);
      }
      e0.acqua.geometry.dispose();
      e0.acqua.geometry = acqua.geometria();
      e0.acqua.geometry.computeBoundingBox();
      e0.flussi = acqua.flussi;
      e0.impatti = acqua.impatti;
      return;
    }

    const solidi = new Costruttore();
    const acqua = new Costruttore();
    acqua.flussi = []; acqua.impatti = [];
    for (const { x, y, z, tipo } of mondo.blocchiDelChunk(kc)) {
      costruisciBlocco(solidi, acqua, mondo, x, y, z, tipo);
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
    for (const kc of [...this.chunks.keys()]) {
      if (!mondo.chunks.has(kc)) this._rimuovi(kc);
    }
    for (const kc of mondo.chunks.keys()) this._chunk(mondo, kc);
    mondo.sporchi.clear();
    mondo.sporchiAcqua.clear();
    this.statistiche.ultimaMs = performance.now() - t0;
    this.statistiche.chunkAttivi = this.chunks.size;
  }

  /** Ricostruzione incrementale: solo i chunk sporchi. Da chiamare nel loop. */
  aggiorna(mondo) {
    if (mondo.sporchi.size === 0 && mondo.sporchiAcqua.size === 0) return;
    const t0 = performance.now();
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
