// Stagioni e colore del terreno — dalle reference dell'utente:
//  · il verde dell'erba VARIA CON L'ALTEZZA (rampa a 8 quote: chiaro in basso,
//    profondo in alto) così le terrazze si leggono a colpo d'occhio;
//  · 4 stagioni (primavera / estate secca / autunno / inverno) ricolorano erba
//    e FOGLIAME dei modelli FBX: si rimappano in HSL solo i pixel verdi delle
//    texture (i tronchi e gli arredi restano com'erano).
// PREDISPOSIZIONE FUTURA (richiesta utente): override per blocco — stagione
// forzata e "quota colore" scelta dal giocatore. paletteBlocco(tipo, y) è già
// il punto unico di risoluzione: basterà passargli l'override della cella.

import * as THREE from 'three';
import { BLOCCHI, defDi } from './blocks.js?v=mrsh3dhg';
import { materialiConMappa } from '../fx/materials.js?v=mrsh3dhg';

export const STAGIONI = {
  primavera: {
    nome: 'Primavera', emoji: '🌸',
    erba: [0x7ecd60, 0x74c458, 0x6abb51, 0x60b24a, 0x56a845, 0x4c9e40, 0x43943c, 0x3a8a38],
    fogliame: null, // texture originali
  },
  estate: {
    nome: 'Estate secca', emoji: '🌾',
    erba: [0xe5cf7e, 0xddc673, 0xd6bd69, 0xceb35f, 0xc6aa55, 0xbfa14c, 0xb79844, 0xb0903d],
    fogliame: { h: 0.128, sF: 0.72, l: (l) => l * 0.92 + 0.10 },
  },
  autunno: {
    nome: 'Autunno', emoji: '🍂',
    erba: [0xec9d50, 0xe59348, 0xde8941, 0xd77f3a, 0xd07534, 0xc96c2f, 0xc2632b, 0xbb5a27],
    fogliame: { h: 0.045, sF: 1.2, l: (l) => l * 1.05 + 0.09 },
  },
  inverno: {
    nome: 'Inverno', emoji: '❄️',
    erba: [0xf3f7f2, 0xebf1ea, 0xe2ebe3, 0xd9e4dc, 0xcfddd4, 0xc6d6cd, 0xbdd0c7, 0xb4c9c0],
    sabbia: { cima: 0xefe9da, lato: 0xe3dbc6, fondo: 0xd6cdb4 },
    fogliame: { h: 0.42, sF: 0.18, l: (l) => l * 0.38 + 0.58 },
  },
};

let corrente = 'primavera';

export function stagioneCorrente() { return corrente; }

/** I colori di un blocco per (tipo, quota). Punto unico: qui entrerà l'override per cella. */
/** Sposta un colore verso un altro di una frazione k (0..1). */
function verso(colore, meta, k) {
  const r = (colore >> 16) & 255, g = (colore >> 8) & 255, b = colore & 255;
  const R = (meta >> 16) & 255, G = (meta >> 8) & 255, B = meta & 255;
  const m = (a, z) => Math.round(a + (z - a) * k);
  return (m(r, R) << 16) | (m(g, G) << 8) | m(b, B);
}

export function paletteBlocco(tipo, y) {
  // defDi (non BLOCCHI[tipo]) perché ha il fallback "blocco perduto": un mondo
  // salvato può contenere un blocco custom poi CANCELLATO dall'Officina, e qui
  // destrutturare undefined faceva morire il boot con "Qualcosa è andato storto".
  const def = defDi(tipo);
  const st = STAGIONI[corrente];
  let { cima, lato, fondo } = def;
  if (def.cappello && st.erba && !def.override) {
    // rampa a PING-PONG: la variazione continua a OGNI quota — sale 0..7,
    // scende 7..0, risale… strati adiacenti sempre leggermente diversi.
    // (l'override dell'Officina scavalca la rampa: usa il colore scelto.)
    cima = st.erba[indiceRampa(y, st.erba.length)];
  }
  // REAZIONI dell'Officina: un blocco qualunque può rispondere all'ambiente
  // come fa l'erba. I colori sono cotti nella mesh, quindi qui si può reagire
  // solo a ciò che PROVOCA UN REMESH: stagione e quota. (Il giorno/notte non
  // sta qui: passa dalle luci, che sono uniform e non richiedono ricostruire.)
  if (def.reagisce === 'stagione' && st.erba) {
    const meta = st.erba[indiceRampa(y, st.erba.length)];
    const k = def.reagisceForza ?? 1;
    cima = verso(cima, meta, k); lato = verso(lato, meta, k * 0.45); fondo = verso(fondo, meta, k * 0.3);
  } else if (def.reagisce === 'quota') {
    // più in alto = più chiaro, a ping-pong come l'erba (mai una scala infinita)
    const p = indiceRampa(y, 8) / 7;
    const k = (def.reagisceForza ?? 1) * 0.5;
    const chiaro = (c) => verso(c, 0xffffff, p * k);
    cima = chiaro(cima); lato = chiaro(lato); fondo = chiaro(fondo);
  }
  if (tipo === 'sabbia' && st.sabbia) {
    ({ cima, lato, fondo } = st.sabbia);
  }
  // PITTURA PER FACCIA (Officina): se il blocco ha `facce`, ogni lato ha il suo
  // colore. Resta opzionale: senza, vale il classico cima/lato/fondo.
  return { cima, lato, fondo, facce: def.facce || null };
}

// ordine delle facce: +X, -X, +Y(cima), -Y(fondo), +Z, -Z
export const FACCE = [
  { id: 'est',   nome: 'Est  (+X)', asse: 0, segno: 1 },
  { id: 'ovest', nome: 'Ovest (−X)', asse: 0, segno: -1 },
  { id: 'cima',  nome: 'Cima (+Y)', asse: 1, segno: 1 },
  { id: 'fondo', nome: 'Fondo (−Y)', asse: 1, segno: -1 },
  { id: 'sud',   nome: 'Sud  (+Z)', asse: 2, segno: 1 },
  { id: 'nord',  nome: 'Nord (−Z)', asse: 2, segno: -1 },
];

/** Colore della faccia piatta (asse, segno). Ricade sul modello a 3 zone. */
export function coloreFaccia(pal, asse, segno) {
  if (pal.facce) {
    const i = asse * 2 + (segno > 0 ? 0 : 1);
    const c = pal.facce[i];
    if (c !== undefined && c !== null) return c;
  }
  return asse === 1 ? (segno > 0 ? pal.cima : pal.fondo) : pal.lato;
}

/** Indice della rampa a ping-pong per una quota (condiviso con la ritinta). */
export function indiceRampa(y, n = 8) {
  const ciclo = (n - 1) * 2;
  let i = ((Math.round(y) % ciclo) + ciclo) % ciclo;
  if (i >= n) i = ciclo - i;
  return i;
}

/** Cambia stagione (ritinge anche il fogliame). Ritorna true se qualcosa è cambiato. */
export function impostaStagione(chiave, forza = false) {
  if (!STAGIONI[chiave]) return false;
  if (chiave === corrente && !forza) return false;
  corrente = chiave;
  transizione = null;
  ritingiFogliame();
  return true;
}

// ---- transizione SMOOTH -----------------------------------------------------
// L'erba scivola da una palette all'altra riscrivendo i colori marcati nel
// mesher (ritintaErba): niente remesh a scatto. Il fogliame FBX cambia a metà
// strada; la sabbia invernale (geometria uguale, solo colore baked) richiede
// un remesh singolo alla FINE (info.remesh).

let transizione = null;
const _cA = new THREE.Color(), _cB = new THREE.Color(), _cMix = new THREE.Color();

export function avviaTransizione(chiave, durata = 4) {
  if (!STAGIONI[chiave] || chiave === corrente || transizione) return false;
  transizione = { da: corrente, a: chiave, t: 0, durata, fogliameFatto: false };
  return true;
}

export function transizioneInCorso() { return !!transizione; }

/** Da chiamare nel loop. Ritorna null, o { colorePer, fine, remesh }. */
export function aggiornaTransizione(dt) {
  if (!transizione) return null;
  transizione.t += dt / transizione.durata;
  const t = Math.min(1, transizione.t);
  const mix = t * t * (3 - 2 * t);
  const A = STAGIONI[transizione.da].erba, B = STAGIONI[transizione.a].erba;
  const memo = new Map();
  const colorePer = (y) => {
    let c = memo.get(y);
    if (!c) {
      const i = indiceRampa(y);
      _cA.setHex(A[i]); _cB.setHex(B[i]);
      _cMix.copy(_cA).lerp(_cB, mix);
      c = { r: _cMix.r, g: _cMix.g, b: _cMix.b };
      memo.set(y, c);
    }
    return c;
  };
  const info = { colorePer, fine: false, remesh: false };
  if (mix >= 0.5 && !transizione.fogliameFatto) {
    transizione.fogliameFatto = true;
    ritingiFogliame(transizione.a);
  }
  if (t >= 1) {
    info.fine = true;
    info.remesh = transizione.a === 'inverno' || transizione.da === 'inverno';   // sabbia
    corrente = transizione.a;
    transizione = null;
  }
  return info;
}

// ---- remap del fogliame nelle texture ---------------------------------------

function rgbAHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslARgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

const eVerde = (h, s) => h >= 0.16 && h <= 0.47 && s > 0.12;

function texturePer(materiale, chiave) {
  const st = STAGIONI[chiave];
  if (!st.fogliame) return materiale.userData.mapOriginale;

  const cache = (materiale.userData.stagioniCache ||= {});
  if (cache[chiave]) return cache[chiave];

  const img = materiale.userData.mapOriginale && materiale.userData.mapOriginale.image;
  if (!img || !(img.complete === undefined || img.complete) || !(img.naturalWidth || img.width)) return null;

  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dati = ctx.getImageData(0, 0, w, h);
    const px = dati.data;
    const F = st.fogliame;
    for (let i = 0; i < px.length; i += 4) {
      const [hh, ss, ll] = rgbAHsl(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
      if (!eVerde(hh, ss)) continue;
      const [r, g, b] = hslARgb(F.h, Math.min(1, ss * F.sF), Math.max(0, Math.min(1, F.l(ll))));
      px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255;
    }
    ctx.putImageData(dati, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    cache[chiave] = tex;
    return tex;
  } catch (e) {
    console.warn('[lantern] remap stagionale fallito su una texture', e);
    return null;
  }
}

export function ritingiFogliame(chiave = corrente) {
  for (const m of materialiConMappa) {
    const tex = texturePer(m, chiave);
    if (tex && m.map !== tex) {
      m.map = tex;
      m.needsUpdate = true;
    }
  }
}
