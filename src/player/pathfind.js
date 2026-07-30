// A* sulle colonne calpestabili — SPEC-TECNICA.md §4.
// Salite di +1 (salto automatico), discese fino a −4, diagonali senza tagli d'angolo.
//
// DUE COSE LO RENDONO VELOCE, e nascono dalla stessa misura: un clic a ottanta
// blocchi costava 69 ms, cioè quattro frame persi in un colpo, e un clic su una
// meta IRRAGGIUNGIBILE bruciava tutto il budget per poi non muovere il gatto.
//
//   1. LE CHIAVI SONO NUMERI. Ogni nodo visitato costruiva una stringa "x,y,z" e
//      la cercava in due Map diverse: la costruzione della stringa e l'hash di
//      una stringa sono il costo dominante di un A* su griglia. Impacchettando
//      le tre coordinate in UN intero (x e z 12 bit, y 8) le Map diventano
//      numeriche, e i tre dizionari si riducono a uno solo di record.
//   2. NON SI TORNA MAI A MANI VUOTE. Se la meta non si raggiunge (o finisce il
//      budget) si rende il percorso fino al nodo esplorato PIÙ VICINO alla meta.
//      È quello che fanno i giochi seri: clicchi di là dal burrone e il
//      personaggio ci si avvicina invece di ignorarti. Ed è anche ciò che
//      permette di tenere il budget BASSO senza che si veda: prima l'unica
//      difesa contro l'attesa era sperare che la meta fosse vicina.
//
// LE STRUTTURE SI RIUSANO fra una chiamata e l'altra: un percorso si cerca a
// ogni clic e la spazzatura di tremila record a colpo si sente. Non è
// rientrante, e va bene: il pathfinding gira in un thread solo.

const CARDINALI = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONALI = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// impacchettamento: x,z in [−2048, 2047] · y in [−64, 191]. Resta sotto 2^32,
// cioè dentro gli interi esatti del double: una Map numerica è molto più
// veloce di una a stringhe, ed è tutto il trucco.
const OFF_XZ = 2048, OFF_Y = 64;
const chiave = (x, y, z) => ((x + OFF_XZ) * 4096 + (z + OFF_XZ)) * 256 + (y + OFF_Y);

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
  svuota() { this.v.length = 0; }
}

function euristica(x, y, z, gx, gy, gz) {
  const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
  return Math.max(dx, dz) + 0.41 * Math.min(dx, dz) + 0.6 * Math.abs(y - gy);
}

const _aperti = new Heap();
const _nodi = new Map();     // chiave → { g, h, da, x, y, z }

/**
 * Percorso da `da` ad `a` (celle [x,y,z] dei piedi). Ritorna la lista di celle,
 * oppure null solo se non si è potuto fare NEMMENO un passo.
 * @param parziale se true (default) e la meta non si raggiunge, rende il
 *   percorso fino al punto esplorato più vicino alla meta.
 */
export function trovaPercorso(mondo, da, a, maxNodi = 2500, parziale = true) {
  let [gx, gy, gz] = a;
  if (!mondo.calpestabile(gx, gy, gz)) {
    const y2 = mondo.appoggioInColonna(gx, gz, gy + 2, 12);
    if (y2 === null) return null;
    gy = y2;
  }
  const [sx, sy, sz] = da;
  if (sx === gx && sy === gy && sz === gz) return [];

  _aperti.svuota();
  _nodi.clear();

  const kStart = chiave(sx, sy, sz);
  const hStart = euristica(sx, sy, sz, gx, gy, gz);
  _nodi.set(kStart, { g: 0, h: hStart, da: 0, x: sx, y: sy, z: sz });
  _aperti.push({ f: hStart, g: 0, k: kStart, x: sx, y: sy, z: sz });

  // il miglior ripiego: il nodo che si è avvicinato di più alla meta
  let miglior = kStart, migliorH = hStart;
  let esplorati = 0;

  const ricostruisci = (k) => {
    const percorso = [];
    while (k) {
      const n = _nodi.get(k);
      percorso.push([n.x, n.y, n.z]);
      k = n.da;
    }
    percorso.reverse();
    percorso.shift();               // la cella di partenza non serve
    return percorso;
  };

  while (!_aperti.vuoto && esplorati < maxNodi) {
    const n = _aperti.pop();
    const rec = _nodi.get(n.k);
    if (n.g > rec.g) continue;      // voce vecchia rimasta nell'heap
    esplorati++;

    if (n.x === gx && n.y === gy && n.z === gz) return ricostruisci(n.k);
    if (rec.h < migliorH) { migliorH = rec.h; miglior = n.k; }

    const prova = (nx, ny, nz, costo) => {
      const k = chiave(nx, ny, nz);
      const g = n.g + costo;
      const vecchio = _nodi.get(k);
      if (vecchio !== undefined && g >= vecchio.g) return;
      const h = euristica(nx, ny, nz, gx, gy, gz);
      if (vecchio === undefined) _nodi.set(k, { g, h, da: n.k, x: nx, y: ny, z: nz });
      else { vecchio.g = g; vecchio.da = n.k; }
      _aperti.push({ f: g + h, g, k, x: nx, y: ny, z: nz });
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

  // meta irraggiungibile (o budget finito): ci si avvicina il più possibile
  if (parziale && miglior !== kStart) return ricostruisci(miglior);
  return null;
}
