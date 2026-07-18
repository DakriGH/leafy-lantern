// A* sulle colonne calpestabili — SPEC-TECNICA.md §4.
// Salite di +1 (salto automatico), discese fino a −4, diagonali senza tagli d'angolo.

const CARDINALI = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONALI = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

class Heap {
  constructor() { this.v = []; }
  push(n) {
    this.v.push(n);
    let i = this.v.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.v[p].f <= this.v[i].f) break;
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop() {
    const top = this.v[0], ultimo = this.v.pop();
    if (this.v.length) {
      this.v[0] = ultimo;
      let i = 0;
      for (;;) {
        const s = i * 2 + 1, d = s + 1;
        let m = i;
        if (s < this.v.length && this.v[s].f < this.v[m].f) m = s;
        if (d < this.v.length && this.v[d].f < this.v[m].f) m = d;
        if (m === i) break;
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
  get vuoto() { return this.v.length === 0; }
}

const chiave = (x, y, z) => x + ',' + y + ',' + z;

function euristica(x, y, z, gx, gy, gz) {
  const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
  return Math.max(dx, dz) + 0.41 * Math.min(dx, dz) + 0.6 * Math.abs(y - gy);
}

/** Percorso da `da` ad `a` (celle [x,y,z] dei piedi). Ritorna lista di celle o null. */
export function trovaPercorso(mondo, da, a, maxNodi = 6000) {
  let [gx, gy, gz] = a;
  if (!mondo.calpestabile(gx, gy, gz)) {
    const y2 = mondo.appoggioInColonna(gx, gz, gy + 2, 12);
    if (y2 === null) return null;
    gy = y2;
  }
  const [sx, sy, sz] = da;
  if (sx === gx && sy === gy && sz === gz) return [];

  const aperti = new Heap();
  const arrivo = new Map();   // chiave → {da: chiave|null, cella}
  const costoG = new Map();

  const kStart = chiave(sx, sy, sz);
  costoG.set(kStart, 0);
  arrivo.set(kStart, { da: null, cella: [sx, sy, sz] });
  aperti.push({ f: euristica(sx, sy, sz, gx, gy, gz), g: 0, x: sx, y: sy, z: sz });

  let esplorati = 0;
  while (!aperti.vuoto && esplorati < maxNodi) {
    const n = aperti.pop();
    const kN = chiave(n.x, n.y, n.z);
    if (n.g > (costoG.get(kN) ?? Infinity)) continue;
    esplorati++;

    if (n.x === gx && n.y === gy && n.z === gz) {
      const percorso = [];
      let k = kN;
      while (k) {
        const nodo = arrivo.get(k);
        percorso.push(nodo.cella);
        k = nodo.da;
      }
      percorso.reverse();
      percorso.shift(); // la cella di partenza non serve
      return percorso;
    }

    const prova = (nx, ny, nz, costo) => {
      const k = chiave(nx, ny, nz);
      const g = n.g + costo;
      if (g >= (costoG.get(k) ?? Infinity)) return;
      costoG.set(k, g);
      arrivo.set(k, { da: kN, cella: [nx, ny, nz] });
      aperti.push({ f: g + euristica(nx, ny, nz, gx, gy, gz), g, x: nx, y: ny, z: nz });
    };

    for (const [dx, dz] of CARDINALI) {
      const nx = n.x + dx, nz = n.z + dz;
      // dall'alto verso il basso: si atterra sempre sul piano più alto raggiungibile
      for (const dy of [1, 0, -1, -2, -3, -4]) {
        const ny = n.y + dy;
        if (!mondo.calpestabile(nx, ny, nz)) continue;
        if (dy === 1) {
          if (mondo.solido(n.x, n.y + 2, n.z)) break;    // niente spazio per saltare
          prova(nx, ny, nz, 1.55);
        } else if (dy === 0) {
          prova(nx, ny, nz, 1);
        } else {
          // per scendere serve poter uscire in orizzontale prima di cadere
          if (mondo.solido(nx, n.y, nz) || mondo.solido(nx, n.y + 1, nz)) break;
          prova(nx, ny, nz, 1 + 0.18 * -dy);
        }
        break;
      }
    }
    for (const [dx, dz] of DIAGONALI) {
      const nx = n.x + dx, nz = n.z + dz;
      if (!mondo.calpestabile(nx, n.y, nz)) continue;
      // niente tagli d'angolo: entrambe le celle ortogonali devono essere libere
      if (mondo.solido(nx, n.y, n.z) || mondo.solido(nx, n.y + 1, n.z)) continue;
      if (mondo.solido(n.x, n.y, nz) || mondo.solido(n.x, n.y + 1, nz)) continue;
      prova(nx, n.y, nz, 1.41);
    }
  }
  return null;
}
