// Griglia di luce a voxel — il motore delle fasce nette del cel shading.
//
// PERCHÉ COSÌ. Chiedere a una luce finta se un muro la blocca, pixel per pixel,
// vorrebbe dire tirare raggi d'ombra a ogni frame: insostenibile, e su una resa
// unlit non avrebbe nemmeno senso. In un mondo a blocchi la luce si PROPAGA
// nella griglia — parte dalle sorgenti, passa ai 6 vicini perdendo un livello a
// ogni passo, e sui solidi si ferma. Il conto si fa UNA VOLTA quando i chunk si
// ricostruiscono, non a ogni frame: il risultato finisce nei vertici, e a
// schermo costa un attributo in più e una moltiplicazione.
// (Riferimenti: 0fps.net "Voxel lighting", Minecraft Wiki "Light".)
//
// I livelli sono INTERI 0..15 e la quantizzazione NON è un compromesso: è
// esattamente il gradino del cel shading. Le fasce nascono da lì, non da un
// effetto disegnato sopra.
//
// DUE CANALI, come in tutti i giochi a blocchi:
//  · CIELO: le colonne esposte valgono 15 fin dove non incontrano un solido,
//    poi la luce si diffonde di lato perdendo 1 per passo. È questo che rende
//    più buie grotte e tettoie. NON dipende dall'ora: come in Minecraft i
//    valori di luce del cielo non cambiano col sole, cambia solo la luminosità
//    di RESA. Ed è anche il motivo per cui qui NON ci sono ombre direzionali
//    del sole: su un terreno a terrazze OGNI gradino sarebbe un occlusore e i
//    prati piatti si riempirebbero di rettangoli scuri (già provato, già fallito).
//  · BLOCCO: parte dai blocchi luminosi (def.luce) e dai lampioni, si diffonde
//    uguale e l'ora NON lo tocca. Per questo di notte resta acceso solo ciò che
//    le lanterne raggiungono davvero.
//
// PRESTAZIONI: la solidità si marca UNA VOLTA in un Uint8Array (marcaSolido)
// e la propagazione legge solo memoria contigua. Passare invece una funzione
// del mondo (che compone una stringa "x,y,z" e cerca in una Map) costava 423 ms
// su 195k celle contro 56: la propagazione la interroga per ogni cella e per
// ognuno dei 6 vicini, quindi l'errore si moltiplica per sette.

export const MAX_LIVELLO = 15;       // 0 = buio pesto, 15 = cielo aperto

// ---- costanti di RESA, condivise con lo shader --------------------------------
// Stanno qui perché fattoreLuce() (provato dai test) e il GLSL in materials.js
// devono calcolare LA STESSA COSA: se i numeri vivessero in due posti, i test
// passerebbero mentre a schermo si vedrebbe altro.
// GRADINI = 5, e non è un numero a caso. Con 4 gradini la scala saltava un
// livello e ne raddoppiava un altro: mappando 0..15 con floor(L/15*4+0.5) i
// secchielli venivano L0-1 (2 livelli), L2-5 (4), L6-9 (4), L10-13 (4), L14-15
// (2) — le due bande estreme LARGHE LA METÀ. Sull'alone di una lucciola
// (raggio 5, quindi lume = L/5) gli anelli a distanza 2 e 3 finivano sullo
// STESSO valore e poi il salto era doppio: un anello sdoppiato seguito da uno
// scalino brusco, cioè il "tagliato a scatti" segnalato.
// Con 5 gradini la rampa di una lampada torna ESATTA (L/5 → banda L/5, un
// anello per cella, passi tutti uguali) e i secchielli del cielo diventano
// 2/3/3/3/3/2 invece di 2/4/4/4/2.
export const GRADINI = 5;            // scalini del cel shading (6 valori distinti)
export const LUCE_MIN = 0.38;        // pavimento di luminosità A MEZZOGIORNO
export const QUOTA_MIN_NOTTE = 0.3;  // ...e frazione che ne resta a notte fonda:
                                     // MAI 0 (le zone in ombra diventerebbero
                                     // macchie nere) ma nemmeno 0.38 fisso, che
                                     // di notte appiattiva tutto il mondo in un
                                     // range di 1,6:1 — vedi minimoLuce()
export const GUADAGNO_LUME = 3;      // i raggi delle lampade qui sono piccoli
                                     // (4..5 celle): senza guadagno una lucciola
                                     // varrebbe 5/15 = un terzo di luce e non
                                     // illuminerebbe nemmeno la propria cella

/** Arrotonda a `n` gradini: è LA quantizzazione del cel shading, ed è l'UNICA —
 *  la usano sia il canale cotto sia le luci-sfera (materials.js). Prima erano
 *  due regole diverse (floor(v*4+0.5) sui livelli, ceil(v*3) sulla distanza)
 *  sulla stessa lampada: due insiemi di anelli che non potevano coincidere. */
export function gradino(v, n = GRADINI) {
  return Math.floor(Math.max(0, Math.min(1, v)) * n + 0.5) / n;
}

/**
 * Pavimento di luminosità all'ora data: SCENDE COL SOLE.
 *
 * Tenerlo fisso a LUCE_MIN era una protezione anti-macchie-nere che di notte
 * diventava un tappo APPIATTENTE: a mezzanotte tutto il mondo stava fra 0.38 e
 * 0.61 (1,6:1 contro il 2,6:1 del giorno), cioè "il giorno con la luminosità
 * abbassata" — nessuna pozza di luce, nessun dramma, e le lucciole due puntini.
 * Scalando col sole il buio può essere davvero buio (≈0.14 a mezzanotte) e le
 * lampade risaltano; la quota minima impedisce comunque il nero pieno.
 */
export function minimoLuce(ora, minimo = LUCE_MIN) {
  const o = Math.max(0, Math.min(1, ora));
  return minimo * Math.max(QUOTA_MIN_NOTTE, o);
}

/**
 * Da livelli di luce a moltiplicatore di luminosità 0..1 — la stessa formula
 * del frammento GLSL (vedi lanternaLuce in materials.js).
 *
 * Si quantizzano i LIVELLI, non il prodotto con l'ora: le fasce devono essere
 * nette nello SPAZIO, non nel TEMPO. Quantizzando dopo la moltiplicazione, al
 * tramonto il mondo intero salterebbe di luminosità a scatti — un flash ogni
 * volta che l'ora scavalca un gradino.
 *
 * NB: qui esce solo QUANTA luce c'è. DI CHE COLORE lo decide lo shader, e i due
 * termini (cielo e lampada) restano separati: moltiplicare il caldo della
 * lanterna per l'ambiente blu della notte lo annullava.
 */
export function fattoreLuce(cielo, blocco, ora = 1, gradini = GRADINI, minimo = LUCE_MIN, guadagno = GUADAGNO_LUME) {
  const c = gradino(cielo / MAX_LIVELLO, gradini);
  const l = gradino(Math.min(1, (blocco / MAX_LIVELLO) * guadagno), gradini);
  const g = Math.max(c * Math.max(0, Math.min(1, ora)), l);
  const m = minimoLuce(ora, minimo);
  return m + (1 - m) * g;
}

/** Lista di interi che cresce da sola: i secchielli della propagazione. */
class Lista {
  constructor(cap = 256) { this.a = new Int32Array(cap); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) {
      const b = new Int32Array(this.a.length * 2);
      b.set(this.a); this.a = b;
    }
    this.a[this.n++] = v;
  }
  svuota() { this.n = 0; }
}

/**
 * Griglia di luce su una scatola di mondo. Le coordinate dei metodi sono di
 * MONDO: la conversione a indice la fa la griglia.
 */
export class GrigliaLuce {
  /** @param {{minX,minY,minZ,larghezza,altezza,profondita}} scatola */
  constructor(scatola) {
    const { minX, minY, minZ, larghezza, altezza, profondita } = scatola;
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.lx = larghezza; this.ly = altezza; this.lz = profondita;
    this.celle = larghezza * altezza * profondita;
    // Uint8 e non Float32: quattro volte meno memoria, e i livelli sono interi
    this.cielo = new Uint8Array(this.celle);
    this.blocco = new Uint8Array(this.celle);
    this.solidi = new Uint8Array(this.celle);
    this._secchi = Array.from({ length: MAX_LIVELLO + 1 }, () => new Lista());
    // sorgenti indicizzate: servono a RISEMINARE dopo una rimozione locale, e
    // una Map costa quanto le lampade (una manciata), non quanto il mondo
    this._sorgenti = new Map();
    // buffer dell'aggiornamento incrementale, riusati fra una chiamata e
    // l'altra: posare un blocco non deve allocare niente
    this._semi = []; this._riaccendi = [];
    this._traccia = false;               // segna la zona toccata? (solo incrementale)
    this._box = [0, 0, 0, 0, 0, 0];      // i,j,k min/max delle celle riscritte
  }

  /** Stessa scatola? Serve a RIUSARE la griglia invece di riallocare i tre
   *  Uint8Array a ogni ricalcolo (su un open world sono 670 KB per volta). */
  stessaScatola(s) {
    return this.minX === s.minX && this.minY === s.minY && this.minZ === s.minZ
      && this.lx === s.larghezza && this.ly === s.altezza && this.lz === s.profondita;
  }

  /** Ripulisce per un ricalcolo da zero senza riallocare. */
  azzera() {
    this.solidi.fill(0);
    this._sorgenti.clear();
  }

  dentro(x, y, z) {
    const i = x - this.minX, j = y - this.minY, k = z - this.minZ;
    return i >= 0 && j >= 0 && k >= 0 && i < this.lx && j < this.ly && k < this.lz;
  }

  indice(x, y, z) {
    return ((x - this.minX) * this.ly + (y - this.minY)) * this.lz + (z - this.minZ);
  }

  /** Marca una cella come opaca. UNA passata sui blocchi esistenti, poi basta. */
  marcaSolido(x, y, z) {
    if (this.dentro(x, y, z)) this.solidi[this.indice(x, y, z)] = 1;
  }

  /** Fuori dalla scatola non c'è niente: è aria aperta, non un muro. */
  eSolido(x, y, z) {
    return this.dentro(x, y, z) ? this.solidi[this.indice(x, y, z)] === 1 : false;
  }

  /** Sorgente di luce artificiale: il livello è il RAGGIO in celle (si perde
   *  un livello per cella, quindi raggio 5 = livello 5 = 5 celle di portata). */
  aggiungiSorgente(x, y, z, livello) {
    if (!this.dentro(x, y, z)) return;
    const liv = Math.max(0, Math.min(MAX_LIVELLO, Math.round(livello)));
    const id = this.indice(x, y, z);
    if (liv <= 0) { this._sorgenti.delete(id); return; }
    if ((this._sorgenti.get(id) || 0) >= liv) return;   // vince la più forte
    this._sorgenti.set(id, liv);
  }

  /** Livello di cielo; fuori dalla scatola è cielo pieno (siamo all'aperto). */
  livelloCielo(x, y, z) {
    return this.dentro(x, y, z) ? this.cielo[this.indice(x, y, z)] : MAX_LIVELLO;
  }

  /** Livello di luce artificiale; fuori dalla scatola non arriva niente. */
  livelloBlocco(x, y, z) {
    return this.dentro(x, y, z) ? this.blocco[this.indice(x, y, z)] : 0;
  }

  /** Calcola i due canali. Da chiamare dopo marcaSolido/aggiungiSorgente. */
  calcola() {
    this.cielo.fill(0);
    this.blocco.fill(0);
    this._semeCielo();
    this._diffondi(this.cielo);
    this._semeBlocco();
    this._diffondi(this.blocco);
  }

  // ---- cielo: prima la caduta verticale, poi la diffusione laterale ----------
  _semeCielo() {
    const s = this._secchi[MAX_LIVELLO];
    for (let i = 0; i < this.lx; i++) {
      for (let k = 0; k < this.lz; k++) {
        const x = i + this.minX, z = k + this.minZ;
        // dall'alto in giù: cielo pieno finché non si incontra un solido. È
        // QUESTO passaggio che mette in ombra ciò che sta sotto un tetto.
        for (let j = this.ly - 1; j >= 0; j--) {
          const y = j + this.minY;
          const id = this.indice(x, y, z);
          if (this.solidi[id]) break;
          this.cielo[id] = MAX_LIVELLO;
          s.push(id);
        }
      }
    }
  }

  _semeBlocco() {
    // la cella della lampada è spesso il blocco stesso (solido): il seme ci
    // sta comunque, altrimenti una lucciola murata non illuminerebbe nulla
    for (const [id, liv] of this._sorgenti) {
      if (this.blocco[id] >= liv) continue;
      this.blocco[id] = liv;
      this._secchi[liv].push(id);
    }
  }

  /**
   * Propagazione a SECCHIELLI: la luce scende sempre di esattamente uno, quindi
   * processando i livelli dal più alto al più basso ogni cella si tocca una
   * volta sola e la propagazione è completa per costruzione. (Una coda
   * circolare di dimensione fissa, com'era in una versione precedente, poteva
   * traboccare e perdere pezzi di propagazione senza dire niente.)
   */
  _diffondi(campo) {
    const { lx, ly, lz, solidi } = this;
    const sx = ly * lz, sy = lz;      // passi dell'indice: x salta un piano, y una riga
    for (let L = MAX_LIVELLO; L >= 2; L--) {
      const s = this._secchi[L], a = s.a, n = s.n;
      for (let q = 0; q < n; q++) {
        const id = a[q];
        if (campo[id] !== L) continue;         // già superata da una più forte
        const k = id % lz;
        const j = ((id - k) / lz) % ly;
        const i = ((id - k) / lz - j) / ly;
        const p = L - 1;
        for (let d = 0; d < 6; d++) {
          let ni = i, nj = j, nk = k, nid = id;
          if (d === 0) { ni++; nid += sx; } else if (d === 1) { ni--; nid -= sx; } else if (d === 2) { nj++; nid += sy; } else if (d === 3) { nj--; nid -= sy; } else if (d === 4) { nk++; nid += 1; } else { nk--; nid -= 1; }
          if (ni < 0 || nj < 0 || nk < 0 || ni >= lx || nj >= ly || nk >= lz) continue;
          if (solidi[nid]) continue;           // ← è QUI che il muro ferma la luce
          if (campo[nid] >= p) continue;
          campo[nid] = p;
          if (this._traccia) this._tocca(ni, nj, nk);
          this._secchi[p].push(nid);
        }
      }
      s.svuota();
    }
    // il secchiello 1 si riempie ma non si processa (a livello 1 la luce
    // finisce): va svuotato a mano, o il canale dopo ripartirebbe sporco
    this._secchi[1].svuota();
    this._secchi[0].svuota();
  }

  // ---- aggiornamento INCREMENTALE ---------------------------------------------
  // PERCHÉ. Rifare la griglia da zero a ogni blocco posato costa quanto il
  // MONDO, non quanto la modifica: 16 ms su un open world r48, cioè un frame
  // saltato a ogni posa su una RTX 4060 e uno scatto visibile sul Chromebook
  // bersaglio. Per questo esisteva una soglia oltre la quale la rilluminazione
  // dal vivo si SPEGNEVA — e siccome la soglia contava le celle della SCATOLA
  // (un AABB denso: l'arcipelago fa 20 celle per blocco), era una rupe invisibile
  // che scattava per un blocco posato più in alto. Risultato: chi si costruiva
  // una casa sull'open world vedeva l'interno illuminato come se non avesse
  // tetto, per tutta la sessione.
  //
  // Qui il costo è quello della ZONA TOCCATA. È l'algoritmo classico dei mondi a
  // blocchi in due tempi: prima si SPEGNE tutto ciò che dipendeva dalla cella
  // cambiata (raccogliendo i bordi rimasti accesi), poi si RIACCENDE partendo da
  // quei bordi. Nessuna soglia, nessun paracadute, nessun comportamento che
  // dipende da un ingombro invisibile all'utente.

  _tocca(i, j, k) {
    const b = this._box;
    if (i < b[0]) b[0] = i; if (i > b[3]) b[3] = i;
    if (j < b[1]) b[1] = j; if (j > b[4]) b[4] = j;
    if (k < b[2]) b[2] = k; if (k > b[5]) b[5] = k;
  }

  /** Spinge i sei vicini di una cella nei secchielli: si riverseranno dentro il
   *  buco appena aperto. */
  _spingiVicini(campo, id) {
    const { lx, ly, lz } = this, sx = ly * lz;
    const k = id % lz, j = ((id - k) / lz) % ly, i = ((id - k) / lz - j) / ly;
    for (let d = 0; d < 6; d++) {
      let nid = id;
      if (d === 0) { if (i + 1 >= lx) continue; nid += sx; }
      else if (d === 1) { if (i === 0) continue; nid -= sx; }
      else if (d === 2) { if (j + 1 >= ly) continue; nid += lz; }
      else if (d === 3) { if (j === 0) continue; nid -= lz; }
      else if (d === 4) { if (k + 1 >= lz) continue; nid += 1; }
      else { if (k === 0) continue; nid -= 1; }
      const v = campo[nid];
      if (v >= 2) this._secchi[v].push(nid);
    }
  }

  /**
   * BFS DI RIMOZIONE. `this._semi` contiene coppie (id, livelloVecchio) di celle
   * GIÀ azzerate: si spegne a catena tutto ciò che era più debole (cioè che
   * riceveva luce da lì) e si mette da parte in `_riaccendi` chi è rimasto
   * acceso di suo — sono quelli i bordi da cui la luce tornerà dentro.
   */
  _spegni(campo) {
    const { lx, ly, lz } = this, sx = ly * lz;
    const semi = this._semi, ri = this._riaccendi;
    ri.length = 0;
    for (let q = 0; q < semi.length; q += 2) {
      const id = semi[q], liv = semi[q + 1];
      const k = id % lz, j = ((id - k) / lz) % ly, i = ((id - k) / lz - j) / ly;
      for (let d = 0; d < 6; d++) {
        let nid = id;
        if (d === 0) { if (i + 1 >= lx) continue; nid += sx; }
        else if (d === 1) { if (i === 0) continue; nid -= sx; }
        else if (d === 2) { if (j + 1 >= ly) continue; nid += lz; }
        else if (d === 3) { if (j === 0) continue; nid -= lz; }
        else if (d === 4) { if (k + 1 >= lz) continue; nid += 1; }
        else { if (k === 0) continue; nid -= 1; }
        const v = campo[nid];
        if (v === 0) continue;
        if (v < liv) { campo[nid] = 0; semi.push(nid, v); this._toccaId(nid); }
        else ri.push(nid);        // ancora acceso: riaccenderà i vicini
      }
    }
    semi.length = 0;
  }

  _toccaId(id) {
    const { ly, lz } = this;
    const k = id % lz, j = ((id - k) / lz) % ly, i = ((id - k) / lz - j) / ly;
    this._tocca(i, j, k);
  }

  /**
   * Applica un elenco di celle cambiate. Ogni voce è lo stato NUOVO:
   * `{x, y, z, solido, livello}` (livello 0 = non è una sorgente).
   *
   * Ritorna la scatola MONDO delle celle davvero riscritte — serve al mesher per
   * rifare i chunk giusti, perché l'ombra di un tetto può sconfinare oltre il
   * chunk dove si è posato il blocco. Ritorna null se una cella cade fuori dalla
   * griglia: lì la scatola non basta più e ci vuole un ricalcolo pieno.
   */
  applicaCambi(cambi) {
    for (const c of cambi) if (!this.dentro(c.x, c.y, c.z)) return null;
    this._traccia = true;
    const b = this._box;
    b[0] = this.lx; b[1] = this.ly; b[2] = this.lz; b[3] = -1; b[4] = -1; b[5] = -1;

    const ids = [];
    for (const c of cambi) {
      const id = this.indice(c.x, c.y, c.z);
      this.solidi[id] = c.solido ? 1 : 0;
      const liv = Math.max(0, Math.min(MAX_LIVELLO, Math.round(c.livello || 0)));
      if (liv > 0) this._sorgenti.set(id, liv); else this._sorgenti.delete(id);
      ids.push(id, c.x, c.y, c.z);
      this._toccaId(id);
    }

    this._cieloInc(ids);
    this._bloccoInc(ids);

    this._traccia = false;
    if (b[3] < b[0]) return null;                 // niente toccato (non capita)
    return {
      minX: b[0] + this.minX, minY: b[1] + this.minY, minZ: b[2] + this.minZ,
      maxX: b[3] + this.minX, maxY: b[4] + this.minY, maxZ: b[5] + this.minZ,
    };
  }

  /** Canale CIELO. La particolarità è la caduta verticale: il cielo non si
   *  attenua scendendo, quindi un blocco nuovo spegne di colpo TUTTA la colonna
   *  sotto di sé, e un blocco tolto la riapre fino al primo solido. */
  _cieloInc(ids) {
    const campo = this.cielo, semi = this._semi;
    semi.length = 0;
    for (let n = 0; n < ids.length; n += 4) {
      const id = ids[n], x = ids[n + 1], y = ids[n + 2], z = ids[n + 3];
      if (!this.solidi[id]) continue;
      if (campo[id]) { semi.push(id, campo[id]); campo[id] = 0; this._toccaId(id); }
      for (let yy = y - 1; yy >= this.minY; yy--) {
        const nid = this.indice(x, yy, z);
        if (this.solidi[nid] || campo[nid] !== MAX_LIVELLO) break;
        campo[nid] = 0; semi.push(nid, MAX_LIVELLO); this._toccaId(nid);
      }
    }
    // sempre, anche con `semi` vuoto: _spegni() ripulisce _riaccendi, e senza
    // quella ripulita il canale dopo ripartirebbe con i bordi di quello prima
    this._spegni(campo);
    for (const id of this._riaccendi) this._secchi[campo[id]].push(id);
    for (let n = 0; n < ids.length; n += 4) {
      const id = ids[n], x = ids[n + 1], y = ids[n + 2], z = ids[n + 3];
      if (this.solidi[id]) continue;
      // buco appena aperto: se sopra c'è cielo pieno la colonna si riaccende
      // fino al primo solido, altrimenti se la cava coi vicini
      const idSopra = this.dentro(x, y + 1, z) ? this.indice(x, y + 1, z) : -1;
      const apertoSopra = idSopra < 0 || (!this.solidi[idSopra] && campo[idSopra] === MAX_LIVELLO);
      if (apertoSopra) {
        for (let yy = y; yy >= this.minY; yy--) {
          const nid = this.indice(x, yy, z);
          if (this.solidi[nid] || campo[nid] === MAX_LIVELLO) break;
          campo[nid] = MAX_LIVELLO; this._toccaId(nid);
          this._secchi[MAX_LIVELLO].push(nid);
        }
      }
      this._spingiVicini(campo, id);
    }
    this._diffondi(campo);
  }

  /** Canale BLOCCO. Dopo la rimozione si RISEMINANO tutte le sorgenti: sono una
   *  manciata, e così non serve indovinare quali siano finite nella zona spenta
   *  (una lampada dentro l'alone di un'altra, per dire). */
  _bloccoInc(ids) {
    const campo = this.blocco, semi = this._semi;
    semi.length = 0;
    for (let n = 0; n < ids.length; n += 4) {
      const id = ids[n];
      if (campo[id]) { semi.push(id, campo[id]); campo[id] = 0; this._toccaId(id); }
    }
    // sempre, anche con `semi` vuoto: _spegni() ripulisce _riaccendi, e senza
    // quella ripulita il canale dopo ripartirebbe con i bordi di quello prima
    this._spegni(campo);
    for (const id of this._riaccendi) this._secchi[campo[id]].push(id);
    for (const [id, liv] of this._sorgenti) {
      if (campo[id] >= liv) continue;
      campo[id] = liv; this._toccaId(id);
      this._secchi[liv].push(id);
    }
    for (let n = 0; n < ids.length; n += 4) this._spingiVicini(campo, ids[n]);
    this._diffondi(campo);
  }

  /**
   * LUCE DI UN PUNTO, per chi non ha facce da interrogare: gatto, mano, palle,
   * mobili. Quelle mesh non passano dal mesher, quindi leggevano l'attributo
   * mancante — cioè "cielo pieno" OVUNQUE: il gatto appoggiato alla parete di
   * una grotta rendeva il 45% più chiaro della parete che toccava, e la
   * maschera che tiene le luci-sfera dietro i muri per lui non esisteva.
   *
   * Se il punto cade dentro un solido (il gatto compenetra sempre qualcosa) si
   * prende il MEGLIO dei sei vicini: meglio un valore dell'intorno che spegnere
   * un personaggio perché ha un piede in un blocco.
   *
   * Scrive in `out` = [cielo, lume] già normalizzati 0..1.
   */
  punto(x, y, z, out) {
    if (!this.eSolido(x, y, z)) {
      out[0] = this.livelloCielo(x, y, z) / MAX_LIVELLO;
      out[1] = this.livelloBlocco(x, y, z) / MAX_LIVELLO;
      return out;
    }
    let c = 0, b = 0;
    for (let d = 0; d < 6; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
      if (this.eSolido(nx, ny, nz)) continue;
      const vc = this.livelloCielo(nx, ny, nz);
      const vb = this.livelloBlocco(nx, ny, nz);
      if (vc > c) c = vc;
      if (vb > b) b = vb;
    }
    out[0] = c / MAX_LIVELLO;
    out[1] = b / MAX_LIVELLO;
    return out;
  }

  /**
   * LUCE DI UNA FACCIA, non di un blocco. Si legge nella cella d'ARIA che la
   * faccia affaccia — quella indicata da `fuori`, la normale uscente.
   *
   * È il punto che rende il risultato credibile: leggendo un valore solo per
   * blocco, un muro illuminato da un lato sarebbe chiaro anche dall'altro.
   *
   * Sugli smussi e sui triangoli d'angolo `fuori` ha più componenti (es.
   * [1,1,0]): si media sulle celle dei singoli assi con peso al QUADRATO della
   * componente, la stessa pesatura dell'ombra per direzione di faccia nel
   * mesher — così la luce attraversa lo smusso senza salti.
   *
   * Scrive in `out` = [cielo, lume] già normalizzati 0..1.
   */
  faccia(x, y, z, fuori, out) {
    let sc = 0, sb = 0, peso = 0;
    for (let a = 0; a < 3; a++) {
      const f = fuori[a];
      if (f === 0) continue;
      const s = f > 0 ? 1 : -1;
      const nx = x + (a === 0 ? s : 0);
      const ny = y + (a === 1 ? s : 0);
      const nz = z + (a === 2 ? s : 0);
      if (this.eSolido(nx, ny, nz)) continue;   // faccia murata: quel lato non conta
      const w = f * f;
      sc += w * this.livelloCielo(nx, ny, nz);
      sb += w * this.livelloBlocco(nx, ny, nz);
      peso += w;
    }
    if (peso > 0) {
      out[0] = sc / peso / MAX_LIVELLO;
      out[1] = sb / peso / MAX_LIVELLO;
      return out;
    }
    // RIPIEGO: nessuna delle celle davanti alla faccia è libera. Capita ai
    // bordi fra un cappello d'erba (alto 16 px) e un supercubo (18 px), dove il
    // mesher emette lo stesso una fascia di parete. Meglio il migliore dei sei
    // vicini che una faccia nera in mezzo al prato.
    let c = 0, b = 0;
    for (let d = 0; d < 6; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
      if (this.eSolido(nx, ny, nz)) continue;
      const vc = this.livelloCielo(nx, ny, nz);
      const vb = this.livelloBlocco(nx, ny, nz);
      if (vc > c) c = vc;
      if (vb > b) b = vb;
    }
    out[0] = c / MAX_LIVELLO;
    out[1] = b / MAX_LIVELLO;
    return out;
  }
}

/**
 * Scatola che avvolge il mondo con il margine giusto.
 * Di lato basta un margine sottile per far leggere alle facce di bordo una cella
 * d'aria vera: allargarlo costerebbe solo celle, perché la luce del cielo entra
 * comunque dall'alto.
 *
 * IN VERTICALE È TUTTA UN'ALTRA COSA, ed è ARIA DI RISERVA, non decorazione:
 * l'aggiornamento incrementale funziona solo DENTRO la scatola, e appena si
 * esce si paga un ricalcolo pieno (20÷90 ms su un open world) con lo scatto che
 * ne segue. Chi costruisce una torre scavalca il tetto a ogni blocco, quindi
 * senza riserva sarebbe una griglia nuova per blocco.
 *
 * `sopra` e `sotto` sono UGUALI, e la simmetria è il punto. Prima sopra c'erano
 * 6 livelli e sotto solo il margine laterale (2), giustificati nel commento con
 * "un tetto, un piano e un camino" — dello scavo, che è almeno altrettanto
 * comune, non si diceva nulla. MISURATO su open world r48: costruendo in su il
 * ricalcolo pieno scattava a y=18 (49,1 ms) e y=25 (44,7 ms), cioè uno scatto
 * ogni sette blocchi; scavando in giù a y=−1 (81,5 ms), y=−4 (86,2) e y=−7
 * (91,6), cioè UNO OGNI TRE, e per giunta più caro. Sul Chromebook bersaglio
 * era un blocco visibile ogni tre colpi di piccone. Quattro livelli in più
 * costano il 15% di celle sulla griglia (~3 ms sul pieno) e dimezzano gli
 * scatti: si paga una volta ciò che prima si pagava a ripetizione.
 * Restano un CONFINE, non una soluzione: la scatola finita ce l'ha per forza,
 * e prima o poi ci si arriva. La differenza è che adesso ci si arriva alla
 * stessa distanza in tutte e due le direzioni.
 */
export function scatolaPerMondo(minX, minY, minZ, maxX, maxY, maxZ, margine = 2, sopra = 6, sotto = 6) {
  const M = margine;
  return {
    minX: minX - M, minY: minY - sotto, minZ: minZ - M,
    larghezza: (maxX - minX) + 2 * M + 1,
    altezza: (maxY - minY) + sotto + sopra + 1,
    profondita: (maxZ - minZ) + 2 * M + 1,
  };
}

/** Griglia pronta da un elenco di celle solide e sorgenti (comodo nei test). */
export function costruisciGriglia({ scatola, solidi = [], sorgenti = [] }) {
  const g = new GrigliaLuce(scatola);
  for (const [x, y, z] of solidi) g.marcaSolido(x, y, z);
  for (const s of sorgenti) g.aggiungiSorgente(s.x, s.y, s.z, s.livello);
  g.calcola();
  return g;
}
