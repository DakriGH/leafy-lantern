// Griglia di luce a voxel — il motore delle ombre "cel shading".
//
// PERCHÉ COSÌ. Far controllare a una luce finta se un muro la blocca, pixel per
// pixel, vorrebbe dire tirare raggi d'ombra a ogni frame: insostenibile, e su
// una resa unlit non avrebbe nemmeno senso. In un mondo a blocchi la luce si
// PROPAGA nella griglia: parte dalle sorgenti, si diffonde di cella in cella
// perdendo un livello per passo e non attraversa i solidi. Il conto si fa UNA
// VOLTA quando il chunk si ricostruisce, non a ogni frame, e il risultato è un
// numero per cella che il mesher cuoce nei vertici. A schermo costa un
// attributo in più e una moltiplicazione.
//
// I livelli sono INTERI 0..15: la quantizzazione non è un compromesso, è
// esattamente il gradino netto del cel shading. Le ombre nascono già a fasce.
//
// DUE CANALI, come in tutti i giochi a blocchi:
//  - CIELO: scende dall'alto a livello pieno finché non incontra un solido,
//    poi si diffonde di lato. Lo modula l'ora del giorno: di notte va giù.
//  - BLOCCO: parte da lampioni e blocchi luminosi. NON lo tocca l'ora, per
//    questo di notte restano accese solo le lanterne (la "luce fievole").
// Il colore finale prende il massimo dei due, così una stanza chiusa e
// illuminata resta illuminata anche a mezzogiorno.

export const MAX_LIVELLO = 15;     // 0 = buio pesto, 15 = pieno sole

/**
 * Griglia di luce su una scatola di mondo. Le coordinate passate ai metodi
 * sono di MONDO: la conversione a indice la fa la griglia.
 */
export class GrigliaLuce {
  /** @param {{minX,minY,minZ,larghezza,altezza,profondita}} scatola */
  constructor(scatola) {
    const { minX, minY, minZ, larghezza, altezza, profondita } = scatola;
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.lx = larghezza; this.ly = altezza; this.lz = profondita;
    const n = larghezza * altezza * profondita;
    // Uint8 e non Float32: 4 volte meno memoria, e i livelli sono interi
    this.cielo = new Uint8Array(n);
    this.blocco = new Uint8Array(n);
    this._coda = new Int32Array(n);   // coda BFS riusata, niente allocazioni
  }

  dentro(x, y, z) {
    const i = x - this.minX, j = y - this.minY, k = z - this.minZ;
    return i >= 0 && j >= 0 && k >= 0 && i < this.lx && j < this.ly && k < this.lz;
  }

  indice(x, y, z) {
    return ((x - this.minX) * this.ly + (y - this.minY)) * this.lz + (z - this.minZ);
  }

  /** Livello di cielo in una cella; fuori dalla scatola vale luce piena (è aperto). */
  livelloCielo(x, y, z) {
    return this.dentro(x, y, z) ? this.cielo[this.indice(x, y, z)] : MAX_LIVELLO;
  }

  /** Livello di luce artificiale; fuori dalla scatola non c'è nulla. */
  livelloBlocco(x, y, z) {
    return this.dentro(x, y, z) ? this.blocco[this.indice(x, y, z)] : 0;
  }

  /**
   * Ricalcola entrambi i canali.
   * @param {(x,y,z)=>boolean} solido blocca luce e propagazione
   * @param {Array<{x,y,z,livello}>} sorgenti lampioni e blocchi luminosi
   */
  calcola(solido, sorgenti = []) {
    this.cielo.fill(0);
    this.blocco.fill(0);
    this._cielo(solido);
    this._blocco(solido, sorgenti);
  }

  // ---- cielo: prima la caduta verticale, poi la diffusione laterale ----
  _cielo(solido) {
    const { lx, ly, lz } = this;
    let fine = 0;
    const coda = this._coda;
    for (let i = 0; i < lx; i++) {
      for (let k = 0; k < lz; k++) {
        const x = i + this.minX, z = k + this.minZ;
        // dall'alto in giù: luce piena finché non si incontra un solido.
        // È questo passaggio che fa "ombreggiare un cubo su quello sotto":
        // sotto al primo solido la colonna resta a zero.
        for (let j = ly - 1; j >= 0; j--) {
          const y = j + this.minY;
          if (solido(x, y, z)) break;
          const id = this.indice(x, y, z);
          this.cielo[id] = MAX_LIVELLO;
          coda[fine++] = id;
        }
      }
    }
    this._diffondi(this.cielo, coda, fine, solido);
  }

  // ---- luce artificiale: diffusione dalle sorgenti ----
  _blocco(solido, sorgenti) {
    const coda = this._coda;
    let fine = 0;
    for (const s of sorgenti) {
      if (!this.dentro(s.x, s.y, s.z)) continue;
      const id = this.indice(s.x, s.y, s.z);
      const liv = Math.min(MAX_LIVELLO, Math.max(0, s.livello | 0));
      if (liv <= this.blocco[id]) continue;
      this.blocco[id] = liv;
      coda[fine++] = id;
    }
    this._diffondi(this.blocco, coda, fine, solido);
  }

  /**
   * BFS sulla coda: ogni cella spinge nei 6 vicini il proprio livello meno 1.
   * La coda è un anello sull'array preallocato — con livelli limitati a 15 il
   * numero di celle riaccodate resta piccolo, e non si alloca nulla nel ciclo.
   */
  _diffondi(campo, coda, fine, solido) {
    const cap = coda.length;
    let testa = 0, inCoda = fine;
    while (inCoda > 0) {
      const id = coda[testa];
      testa = (testa + 1) % cap; inCoda--;
      const liv = campo[id];
      if (liv <= 1) continue;
      // dall'indice si risale a x,y,z (l'indice è ((i*ly)+j)*lz+k)
      const k = id % this.lz;
      const j = ((id - k) / this.lz) % this.ly;
      const i = ((id - k) / this.lz - j) / this.ly;
      const x = i + this.minX, y = j + this.minY, z = k + this.minZ;
      const prossimo = liv - 1;
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (!this.dentro(nx, ny, nz)) continue;
        if (solido(nx, ny, nz)) continue;      // ← è QUI che il muro ferma la luce
        const nid = this.indice(nx, ny, nz);
        if (campo[nid] >= prossimo) continue;
        campo[nid] = prossimo;
        if (inCoda < cap) { coda[(testa + inCoda) % cap] = nid; inCoda++; }
      }
    }
  }
}

/**
 * Occlusione ambientale del vertice, alla maniera classica dei voxel: si
 * guardano i tre blocchi che toccano l'angolo dal lato ESTERNO della faccia.
 * Torna 0 (angolo più chiuso, più scuro) … 3 (angolo aperto, pieno).
 *
 * Il caso `lato1 && lato2` è a parte: se i due fianchi sono pieni l'angolo è
 * sigillato e va al minimo anche se la diagonale è vuota — senza questo caso
 * gli spigoli interni restano chiari e la geometria si "appiattisce".
 */
export function aoVertice(lato1, lato2, diagonale) {
  if (lato1 && lato2) return 0;
  return 3 - (lato1 ? 1 : 0) - (lato2 ? 1 : 0) - (diagonale ? 1 : 0);
}

/**
 * Da livelli di luce a fattore di luminosità 0..1, a GRADINI.
 * `gradini` decide quanto è "cel": 4 dà quattro fasce nette, 15 è quasi
 * continuo. `minimo` è quanto resta al buio pesto — mai 0, altrimenti le zone
 * in ombra diventano macchie nere e si perde la lettura delle forme.
 */
export function fattoreLuce(cielo, blocco, oraDelGiorno = 1, gradini = 4, minimo = 0.32) {
  const c = (cielo / MAX_LIVELLO) * Math.max(0, Math.min(1, oraDelGiorno));
  const b = blocco / MAX_LIVELLO;
  const grezzo = Math.max(c, b);
  const passo = Math.max(1, gradini | 0);
  const scalino = Math.round(grezzo * passo) / passo;
  return minimo + (1 - minimo) * scalino;
}
