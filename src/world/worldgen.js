// Isola demo a terrazze, nello spirito del mockup: tre livelli d'erba,
// spiaggia bassa, laghetto, gradini per il pathfinding.

const BLOB = [
  { cx: 0,    cz: 0,    r: 8.6, h: 2, f1: 0.9, f2: 2.1 },   // terrazza bassa
  { cx: -1.5, cz: -1,   r: 5.4, h: 4, f1: 1.7, f2: 4.3 },   // terrazza media
  { cx: -3.5, cz: -2.5, r: 3.1, h: 6, f1: 0.4, f2: 2.8 },   // terrazza alta
];

function dentro(blob, x, z) {
  const dx = x - blob.cx, dz = z - blob.cz;
  const ang = Math.atan2(dz, dx);
  const raggio = blob.r + 0.8 * Math.sin(ang * 3 + blob.f1) + 0.45 * Math.sin(ang * 7 + blob.f2);
  return dx * dx + dz * dz <= raggio * raggio;
}

export function generaIsola(mondo) {
  mondo.svuota();
  const base = BLOB[0];
  const lim = Math.ceil(base.r + 2);

  for (let x = -lim; x <= lim; x++) {
    for (let z = -lim; z <= lim; z++) {
      let h = 0;
      for (const b of BLOB) if (dentro(b, x, z)) h = Math.max(h, b.h);
      if (h === 0) continue;

      // bordo esterno della terrazza bassa → spiaggia a gradino più basso
      let spiaggia = false;
      if (h === base.h) {
        const dx = x - base.cx, dz = z - base.cz;
        const ang = Math.atan2(dz, dx);
        const raggio = base.r + 0.8 * Math.sin(ang * 3 + base.f1) + 0.45 * Math.sin(ang * 7 + base.f2);
        if (Math.sqrt(dx * dx + dz * dz) > raggio - 1.7) { spiaggia = true; h = 1; }
      }

      for (let y = 0; y < h; y++) {
        const cima = y === h - 1;
        const tipo = cima ? (spiaggia ? 'sabbia' : 'erba') : (y === 0 ? 'roccia' : 'terra');
        mondo.metti(x, y, z, tipo, true);
      }
    }
  }

  // gradini di collegamento tra le terrazze (saltabili: +1 alla volta)
  const gradino = (x, z, h) => {
    for (let y = 0; y < h; y++) if (!mondo.pieno(x, y, z)) mondo.metti(x, y, z, y === h - 1 ? 'erba' : 'terra', true);
  };
  gradino(5, -1, 3); gradino(5, 0, 3);       // bassa (2) → media (4)
  gradino(-1, -4, 5); gradino(0, -4, 5);     // media (4) → alta (6)

  // laghetto sulla terrazza bassa: scava un anello e riempi d'acqua a filo
  const lago = [[4, 3], [5, 3], [4, 4], [5, 4], [6, 4], [5, 5]];
  for (const [x, z] of lago) {
    if (mondo.tipo(x, 1, z)) {
      mondo.togli(x, 1, z, true);
      mondo.metti(x, 1, z, 'acqua', true);
    }
  }

  mondo.sporco = true;
}

// ---- generazione procedurale (seminata, deterministica) --------------------
// Arcipelago di isole fluttuanti a terrazze: value noise 2 ottave su griglia.
// Usata per i test di carico; diventerà la base dei mondi infiniti (i chunk
// del mondo e del mesher sono già pronti a generare on-demand).

function hash2(x, z, seme) {
  let h = (x * 374761393 + z * 668265263 + seme * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function liscia(t) { return t * t * (3 - 2 * t); }

function rumore(x, z, seme) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = liscia(x - ix), fz = liscia(z - iz);
  const a = hash2(ix, iz, seme), b = hash2(ix + 1, iz, seme);
  const c = hash2(ix, iz + 1, seme), d = hash2(ix + 1, iz + 1, seme);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function generaArcipelago(mondo, seme = 1, estensione = 48) {
  mondo.svuota();
  for (let x = -estensione; x <= estensione; x++) {
    for (let z = -estensione; z <= estensione; z++) {
      const n = 0.65 * rumore(x * 0.055, z * 0.055, seme) + 0.35 * rumore(x * 0.13, z * 0.13, seme + 7);
      if (n < 0.56) continue;
      const h = 1 + Math.min(8, Math.round((n - 0.56) * 26));
      const spiaggia = n < 0.585;
      for (let y = 0; y < h; y++) {
        const cima = y === h - 1;
        const tipo = cima ? (spiaggia ? 'sabbia' : 'erba') : (y === 0 ? 'roccia' : 'terra');
        mondo.metti(x, y, z, tipo, true);
      }
    }
  }
}

/** Open world "alla Minecraft": terreno CONTINUO e SPESSO per i test di carico.
 *  Heightmap fbm a 3 ottave, laghi sotto il livello dell'acqua, manto d'erba,
 *  terra sotto, roccia in profondità. Ritorna i posti buoni per gli alberi. */
export const LIVELLO_ACQUA = 5;

export function generaOpenWorld(mondo, seme = 1, estensione = 64) {
  mondo.svuota();
  const alberi = [];
  const lampioni = [];
  const H = new Map();            // quota del terreno per colonna (per i fiumi)
  const candidati = [];           // possibili sorgenti di fiume sui rilievi
  for (let x = -estensione; x <= estensione; x++) {
    for (let z = -estensione; z <= estensione; z++) {
      const n =
        0.55 * rumore(x * 0.028, z * 0.028, seme) +
        0.30 * rumore(x * 0.07, z * 0.07, seme + 11) +
        0.15 * rumore(x * 0.16, z * 0.16, seme + 29);
      let h = Math.max(2, 1 + Math.round(Math.pow(Math.max(0, n), 1.6) * 22));
      // ANELLO DI SPIAGGIA al bordo mappa: il terreno si fonde a quota mare+1
      // verso il confine, così l'acqua è SEMPRE contenuta — senza, il mare
      // finiva troncato ("muro rettangolare") e traboccava nel vuoto.
      const bordo = Math.max(Math.abs(x), Math.abs(z));
      const t = Math.min(1, Math.max(0, (estensione - 2 - bordo) / 8));
      const s = t * t * (3 - 2 * t);
      h = Math.round(h * s + (LIVELLO_ACQUA + 1) * (1 - s));
      const spiaggia = h <= LIVELLO_ACQUA + 1;
      H.set(x + '|' + z, h);
      for (let y = 0; y < h; y++) {
        const cima = y === h - 1;
        const tipo = cima
          ? (spiaggia ? 'sabbia' : 'erba')
          : (y < h - 3 ? 'roccia' : 'terra');
        mondo.metti(x, y, z, tipo, true);
      }
      if (h <= LIVELLO_ACQUA) {
        for (let y = h; y <= LIVELLO_ACQUA; y++) mondo.metti(x, y, z, 'acqua', true);
      } else if (!spiaggia) {
        // posti per l'arredo sparso (deterministico dal seme)
        const r = hash2(x * 3 + 1, z * 3 + 7, seme + 101);
        if (r > 0.988 && alberi.length < 90) alberi.push([x, h, z]);
        else if (r < 0.004 && lampioni.length < 14) lampioni.push([x, h, z]);
        if (h >= LIVELLO_ACQUA + 6) {
          const rs = hash2(x * 5 + 3, z * 5 + 11, seme + 57);
          if (rs > 0.99) candidati.push({ x, z, h, r: rs });
        }
      }
    }
  }

  const letto = scavaFiumi(mondo, H, seme, candidati, estensione);
  // niente arredo dentro il letto del fiume
  const libero = (c) => !letto.has(c[0] + '|' + c[2]);
  const fiume = [...letto].map((k) => {
    const [x, z] = k.split('|').map(Number);
    return [x, H.get(k) - 2, z];
  });
  return { alberi: alberi.filter(libero), lampioni: lampioni.filter(libero), fiume };
}

/** Fiumi: dalle sorgenti sui rilievi si scende lungo il pendio sostituendo il
 *  blocco di cima con una SORGENTE d'acqua (livello a filo delle rive: le
 *  contengono da sole). Ai salti di quota il letto segue il terreno e la sim
 *  dell'acqua — pianificata da main dopo la generazione — fa traboccare le
 *  sorgenti dal ciglio: le CASCATE nascono da sole, deterministiche. */
const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function scavaFiumi(mondo, H, seme, candidati, estensione = 64) {
  const letto = new Set();
  // sorgenti: le più alte, distanziate tra loro
  candidati.sort((a, b) => b.h - a.h || a.r - b.r);
  const sorgenti = [];
  for (const c of candidati) {
    if (sorgenti.length >= 5) break;
    if (sorgenti.every((s) => (s.x - c.x) ** 2 + (s.z - c.z) ** 2 >= 28 * 28)) sorgenti.push(c);
  }

  // letto INCASSATO: si scavano DUE blocchi e la sorgente sta un livello sotto
  // il piano — le sponde contengono i flussi (a filo, ogni gradino del letto
  // faceva straripare l'acqua sulle rive: 10× celle di flusso).
  const posa = (x, z) => {
    const k = x + '|' + z;
    if (letto.has(k)) return;
    const h = H.get(k);
    mondo.togli(x, h - 1, z, true);
    mondo.togli(x, h - 2, z, true);
    mondo.metti(x, h - 2, z, 'acqua', true);
    letto.add(k);
  };

  for (const s of sorgenti) {
    let x = s.x, z = s.z, dPrec = null, piatti = 0;
    const visti = new Set([x + '|' + z]);
    for (let passo = 0; passo < 500; passo++) {
      const h = H.get(x + '|' + z);
      posa(x, z);
      // allarga a 2 celle dove la riva è alla stessa quota (letto più leggibile)
      if (dPrec) {
        const px = x + dPrec[1], pz = z - dPrec[0];
        if (H.get(px + '|' + pz) === h) posa(px, pz);
      }
      // prossimo passo: il vicino più basso mai visitato (pari quota = serpeggia)
      let best = null, bestH = Infinity, bestJ = Infinity;
      for (const d of DIR) {
        const nx = x + d[0], nz = z + d[1];
        if (visti.has(nx + '|' + nz)) continue;
        const h2 = H.get(nx + '|' + nz);
        if (h2 === undefined) continue;               // bordo mappa: fine corsa
        const j = (d === dPrec ? -0.5 : 0) + hash2(nx * 7 + 5, nz * 7 + 13, seme + 71);
        if (h2 < bestH || (h2 === bestH && j < bestJ)) { best = d; bestH = h2; bestJ = j; }
      }
      if (!best || bestH > h) break;                  // conca: il fiume finisce qui
      piatti = bestH === h ? piatti + 1 : 0;
      if (piatti > 24) break;                         // altopiano: non allagarlo tutto
      x += best[0]; z += best[1];
      visti.add(x + '|' + z); dPrec = best;
      if (H.get(x + '|' + z) <= LIVELLO_ACQUA) break; // sfociato nel lago/mare
      // mai scavare l'anello di spiaggia del bordo: l'acqua non deve uscire
      if (Math.max(Math.abs(x), Math.abs(z)) >= estensione - 6) break;
    }
  }

  // rive sabbiose: l'erba che tocca il letto diventa sabbia (leggibilità MC)
  for (const k of letto) {
    const [x, z] = k.split('|').map(Number);
    const h = H.get(k);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const k2 = (x + dx) + '|' + (z + dz);
      if (letto.has(k2)) continue;
      const h2 = H.get(k2);
      if (h2 === undefined || h2 < h || h2 > h + 1) continue;
      if (mondo.tipo(x + dx, h2 - 1, z + dz) === 'erba') {
        mondo.togli(x + dx, h2 - 1, z + dz, true);
        mondo.metti(x + dx, h2 - 1, z + dz, 'sabbia', true);
      }
    }
  }
  return letto;
}

// dove far comparire il gatto (cella con i piedi)
export const SPAWN = [-1, 4, -1];

// arredo iniziale suggerito (piazzato dopo il caricamento dei modelli)
export const ARREDO_INIZIALE = [
  { id: 'lampione', cella: [-1, 4, 1], rot: 0 },
  { id: 'panchina', cella: [-3, 4, 1], rot: 0 },
  { id: 'albero',  cella: [-4, 6, -3], rot: 0 },
  { id: 'albero',  cella: [2, 4, -3], rot: 1 },
  { id: 'lampione', cella: [3, 2, 5], rot: 0 },
];
