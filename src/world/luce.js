// MASCHERA DI OCCLUSIONE DELLE LUCI-SFERA — dove la luce PUÒ arrivare.
//
// A COSA SERVE, E A COSA NON SERVE. Le luci-sfera (fx/materials.js) sono LA
// tecnica grafica del gioco: una sfera con caduta lineare posterizzata a bande
// nette. Decidono loro QUANTO illuminare, e il loro aspetto non si tocca.
// L'unico difetto che avevano è che una sfera è solo una distanza: non sa
// niente dei muri, e infatti i lampioni li attraversavano. Questo file calcola
// l'unica cosa che manca — per ogni cella, se la luce artificiale ci arriva
// DAVVERO — e il mesher la cuoce nei vertici come maschera 0/1.
// Il conto si fa quando i chunk si ricostruiscono, non a ogni frame.
//
// PERCHÉ LINEA DI VISTA E NON PIÙ IL FLOOD FILL. Qui c'era una propagazione a
// secchielli sui 6 vicini (stile Minecraft), e per questo lavoro non basta: la
// diffusione AGGIRA gli ostacoli, cioè fa esattamente ciò che la maschera deve
// impedire. Il flood fill misura distanze di TAXICAB mentre la sfera è
// euclidea, quindi il budget di propagazione va gonfiato o la sfera esce
// TAGLIATA A ROMBO — e gonfiandolo la luce scavalca i muri. Non è un'opinione,
// è misurato sul muro della scena di collaudo (muro alto 5, lucciola raggio 5
// dietro, a metà altezza) contando le facce del lato SBAGLIATO che si
// accendono, e in parallelo le celle dentro la sfera che la maschera taglia:
//
//   budget   facce accese sul retro     celle tagliate dentro la sfera
//            (deve essere 0)            piano della lampada / 2 sotto / 3 sotto
//   1.0·r    0                          28/69   56/69   40/45
//   1.4·r    0                           0/69   28/69   20/45
//   1.8·r    4  (fino al 67% di banda)    0/69    0/69    0/45
//
// Non esiste un budget che vada bene: sotto 1.8 la pozza di luce sotto un
// lampione rialzato diventa un rombo, a 1.8 il muro perde. La linea di vista
// dà entrambe le cose ed è pure più semplice — una cella è illuminabile se la
// lampada LA VEDE. In più il bordo dell'ombra è netto per costruzione, che è
// lo stile chiesto (niente sfocature, come l'ombra del player).
//
// IL COSTO CAMBIA DI NATURA, e non è un guadagno secco: il flood fill pagava il
// MONDO (il canale del cielo seminava ogni cella esposta), la linea di vista
// paga le LAMPADE (una traversata per cella dentro il raggio di ognuna).
// Misurato in Node sugli stessi mondi:
//   collaudo, 9 lampade ............ 15,4 ms → 2,9 ms   (5,3× più veloce)
//   open world r48, 81 lampade ...... 7,2 ms → 9,8 ms   (1,4× più lento)
//   open world r48, 289 lampade .... 12,7 ms → 11,6 ms
// Il caso peggiore è un mondo enorme e pieno di lampade, e lì si perde qualche
// millisecondo UNA VOLTA (al caricamento o a un import: il ricalcolo pieno non
// capita mentre si gioca). Quello che conta durante la partita è
// l'aggiornamento locale di applicaCambi, che sta a 0,20 ms per blocco posato.

// UNA MASCHERA PER LAMPADA, NON UNA SOLA PER TUTTE — ed è la correzione che
// rende vero il requisito "le luci non passano attraverso i muri".
// Prima ogni cella portava UN bit di unione ("qualche lampada arriva qui"), e
// bastava una lampada dalla parte giusta del muro per dichiarare libera la cella
// davanti: la sfera della lampada dall'ALTRA parte ci passava dentro lo stesso.
// MISURATO sul muro di collaudo con una lucciola per lato (dietro 6,4,−9 e
// davanti 6,4,−5), leggendo la faccia lato passeggiata: ambiente puro 57.8, sola
// lampada davanti 73.1÷84.5, tutte e due 84.5÷103.1 — cioè +11.6%÷+22% trapelati
// dalla lampada murata. Una stanza illuminata accanto a una strada illuminata è
// una costruzione normale, non un caso da laboratorio.
// Adesso ogni cella porta UN BIT PER LAMPADA e lo shader spegne la singola
// sfera, non tutte insieme.
//
// PERCHÉ 24 SLOT E NON UN INDICE QUALSIASI. Il bit va cotto nei vertici, e i
// vertici possono portare pochi byte: 24 bit stanno in TRE byte, cioè in un
// attributo vec3. Il quarto byte NON si usa apposta — un attributo che la
// geometria non ha legge (0,0,0,1) in WebGL, quindi la w varrebbe 1 e
// accenderebbe un bit fantasma su gatto, mano e mobili (regola della polarità).
// 24 è anche LUCI_MAX, cioè il numero di sfere che lo shader guarda per frame.
//
// GLI SLOT SI RICICLANO, e questo è ciò che rende il numero sufficiente: due
// lampade devono avere slot diversi solo se possono illuminare la STESSA cella,
// cioè se le loro sfere si toccano. È una colorazione di grafo, e su una
// costruzione vera i vicini sono pochissimi: un lampione ogni quattro celle
// lungo una strada usa due o tre colori in tutto. Chi non trova posto (24
// lampade tutte a contatto fra loro) resta senza slot e torna a comportarsi
// come prima — non si spegne: si conta, e il pannello debug lo dice.
export const SLOT_LUCE = 24;

export const RAGGIO_MAX = 15;        // portata massima di una sorgente, in celle

// MARGINE: la maschera si allarga di una cella oltre il raggio della lampada.
// Serve perché i due centri non coincidono al millimetro — la sfera è centrata
// su `luce.pos` (la testa di un lampione sta a mezza cella qualsiasi) mentre la
// maschera lavora sul CENTRO DELLA CELLA — e senza margine l'ultimo anello
// della sfera poteva cadere fuori dalla maschera e sparire.
// Allargare non apre falle: la linea di vista blocca a qualunque distanza, e le
// celle in più stanno dove la sfera vale già zero.
export const MARGINE_MASCHERA = 1;

/**
 * Griglia di occlusione su una scatola di mondo. Le coordinate dei metodi sono
 * di MONDO: la conversione a indice la fa la griglia.
 */
export class GrigliaLuce {
  /** @param {{minX,minY,minZ,larghezza,altezza,profondita}} scatola */
  constructor(scatola) {
    const { minX, minY, minZ, larghezza, altezza, profondita } = scatola;
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.lx = larghezza; this.ly = altezza; this.lz = profondita;
    this.celle = larghezza * altezza * profondita;
    // BIT s = la lampada dello SLOT s vede questa cella. Uint32 e non Uint8: è
    // il prezzo della maschera per-lampada, quattro byte a cella invece di uno
    // (su un open world r48 sono ~1,5 MB, non un problema; il tetto di
    // LUCE_LIMITE_CELLE resta il paracadute per i mondi assurdi).
    this.visto = new Uint32Array(this.celle);
    this.solidi = new Uint8Array(this.celle);
    // sorgenti indicizzate per cella: servono a rifare la maschera dopo una
    // modifica locale, e sono una manciata (costano quanto le lampade, non
    // quanto il mondo)
    this._sorgenti = new Map();
    // cella → slot (0..SLOT_LUCE−1, oppure −1 se non ce n'erano più liberi).
    // Sopravvive ad azzera(): uno slot che non cambia è un chunk che non va
    // rimeshato, e la via locale conta esattamente su questo.
    this._slot = new Map();
    this._usati = 0;                 // maschera degli slot davvero in uso
    // GUASTI DA NON SUBIRE IN SILENZIO: il pannello debug li stampa.
    this.slotEsauriti = 0;           // lampade rimaste senza slot (tornano a bucare i muri)
    this.raggiTroncati = 0;          // raggi tagliati da RAGGIO_MAX (la sfera è più lunga della maschera)
  }

  /** Stessa scatola? Serve a RIUSARE la griglia invece di riallocare gli
   *  Uint8Array a ogni ricalcolo. */
  stessaScatola(s) {
    return this.minX === s.minX && this.minY === s.minY && this.minZ === s.minZ
      && this.lx === s.larghezza && this.ly === s.altezza && this.lz === s.profondita;
  }

  /** Ripulisce per un ricalcolo da zero senza riallocare. `_slot` NON si butta:
   *  serve come PREFERENZA (vedi _riassegnaSlot) perché una lampada che non si è
   *  mossa si ritrovi lo stesso bit e i suoi chunk non risultino cambiati. */
  azzera() {
    this.solidi.fill(0);
    this._sorgenti.clear();
    this._usati = 0;
    this.slotEsauriti = 0;
    this.raggiTroncati = 0;
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

  /** Il raggio come lo userà la maschera. TRONCARE È UN GUASTO, non un dettaglio:
   *  lo shader disegna la sfera col raggio VERO, quindi una lampada oltre il
   *  tetto perderebbe l'anello esterno (mascherato a zero) senza nessun segnale.
   *  Oggi nessuno ci arriva (lucciola 5, lampione d'arredo 4.6), ma il giorno che
   *  succedesse si vedrebbe nel pannello invece di diventare una caccia. */
  _raggioUtile(raggio) {
    const r = Math.max(0, raggio);
    if (r > RAGGIO_MAX) { this.raggiTroncati++; return RAGGIO_MAX; }
    return r;
  }

  /** Sorgente di luce artificiale: `raggio` è quello della sfera, in celle
   *  (può essere frazionario — un lampione d'arredo ha raggio 4.6). */
  aggiungiSorgente(x, y, z, raggio) {
    if (!this.dentro(x, y, z)) return;
    const r = this._raggioUtile(raggio);
    const id = this.indice(x, y, z);
    if (r <= 0) { this._sorgenti.delete(id); return; }
    if ((this._sorgenti.get(id) || 0) >= r) return;   // vince la più grande
    this._sorgenti.set(id, r);
  }

  /** La cella è al buio per le lampade? 1 = sì (nessuna la vede).
   *  Fuori dalla scatola non ci sono muri noti: lì la luce arriva.
   *  SOLO PER I TEST: il gioco non la chiama da nessuna parte (legge per faccia
   *  con occlusaFaccia o per punto con occlusaPunto, che rendono una maschera
   *  per-lampada e non un booleano). Sta qui perché una risposta sì/no è ciò che
   *  serve a un'asserzione. */
  occlusa(x, y, z) {
    if (!this.dentro(x, y, z)) return 0;
    return this.visto[this.indice(x, y, z)] ? 0 : 1;
  }

  /** Quali lampade (per slot) vedono questa cella. Fuori dalla scatola non ci
   *  sono muri noti: lì arrivano tutte. */
  vistoIn(x, y, z) {
    if (!this.dentro(x, y, z)) return this._usati;
    return this.visto[this.indice(x, y, z)];
  }

  /** Lo slot della lampada che sta in questa cella (−1 = nessuna, o esaurito).
   *  Serve allo shader: è il ponte fra la sfera disegnata e il bit cotto. */
  slotDi(x, y, z) {
    if (!this.dentro(x, y, z)) return -1;
    const id = this.indice(x, y, z);
    if (!this._sorgenti.has(id)) return -1;
    const s = this._slot.get(id);
    return s === undefined ? -1 : s;
  }

  /** Le sorgenti con il loro slot. SOLO PER I TEST: il pannello debug non passa
   *  di qui (usa mesher.guasti() e statLuci()), e dirlo evitava di credere che
   *  ci fosse un lettore vivo a garantirne il formato. */
  elencoSorgenti() {
    const out = [];
    for (const [id, raggio] of this._sorgenti) {
      const c = this._coord(id);
      out.push({ x: c[0], y: c[1], z: c[2], raggio, slot: this._slot.get(id) ?? -1 });
    }
    return out;
  }

  /**
   * DUE LAMPADE SI PESTANO I PIEDI se le loro sfere possono toccare la stessa
   * cella: solo allora servono due bit distinti. Il margine entra due volte
   * perché la maschera di ognuna si allarga di una cella (vedi MARGINE_MASCHERA).
   */
  _conflitto(a, ra, b, rb) {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    const soglia = ra + rb + 2 * MARGINE_MASCHERA;
    return dx * dx + dy * dy + dz * dz <= soglia * soglia;
  }

  /**
   * Uno slot per la sorgente `id`, diverso da quello di TUTTE le lampade con cui
   * può sovrapporsi. Si preferisce quello che aveva già (stabilità: uno slot che
   * non cambia è un chunk che non va rimeshato), poi il più piccolo libero.
   * −1 = esauriti, e allora quella lampada torna a passare i muri: è il ripiego
   * onesto, contato in `slotEsauriti`.
   */
  _slotPer(id, raggio, assegnati) {
    const c = this._coord(id);
    let presi = 0;
    for (const [altro, dati] of assegnati) {
      if (altro === id || dati.slot < 0) continue;
      if (!this._conflitto(c, raggio, dati.c, dati.r)) continue;
      presi |= 1 << dati.slot;
    }
    const vecchio = this._slot.get(id);
    if (vecchio !== undefined && vecchio >= 0 && !(presi & (1 << vecchio))) return vecchio;
    for (let s = 0; s < SLOT_LUCE; s++) if (!(presi & (1 << s))) return s;
    return -1;
  }

  /** Riassegna gli slot a tutte le sorgenti (ricalcolo pieno). */
  _riassegnaSlot() {
    const assegnati = new Map();
    const nuovo = new Map();
    for (const [id, r] of this._sorgenti) {
      const s = this._slotPer(id, r, assegnati);
      assegnati.set(id, { c: this._coord(id), r, slot: s });
      nuovo.set(id, s);
    }
    this._slot = nuovo;                 // via le lampade che non ci sono più
    this._contaSlot();
  }

  /** `_usati` e i contatori dei guasti, dalla verità corrente. */
  _contaSlot() {
    let usati = 0, esauriti = 0;
    for (const id of this._sorgenti.keys()) {
      const s = this._slot.get(id);
      if (s !== undefined && s >= 0) usati |= 1 << s; else esauriti++;
    }
    this._usati = usati;
    this.slotEsauriti = esauriti;
  }

  /** Rifà la maschera da capo. Da chiamare dopo marcaSolido/aggiungiSorgente. */
  calcola() {
    this._riassegnaSlot();
    this.visto.fill(0);
    for (const [id, r] of this._sorgenti) {
      const s = this._slot.get(id);
      if (s < 0) continue;              // senza slot non c'è bit da accendere
      const c = this._coord(id);
      this._illumina(c[0], c[1], c[2], r, 1 << s);
    }
  }

  /** Coordinate mondo di un indice (l'inversa di indice()). */
  _coord(id) {
    const k = id % this.lz;
    const j = ((id - k) / this.lz) % this.ly;
    const i = ((id - k) / this.lz - j) / this.ly;
    return [i + this.minX, j + this.minY, k + this.minZ];
  }

  /**
   * Accende il BIT di questa sorgente in ogni cella dentro il suo raggio a cui
   * arriva in linea retta. `limite` (opzionale, in indici di cella) restringe il
   * lavoro alla zona da riscrivere durante un aggiornamento locale.
   *
   * QUI SI È PERSA UNA SCORCIATOIA, e vale la pena dire quale: prima si saltava
   * una cella appena un'ALTRA lampada l'aveva già vista, perché la maschera era
   * un'unione e il valore sarebbe stato lo stesso. Con un bit per lampada quel
   * salto è proprio ciò che non si può fare — era il difetto: la lampada vicina
   * "liberava" la cella anche per quella murata. Il conto ora è una traversata
   * per lampada e per cella, e si paga solo dove le sfere si sovrappongono.
   */
  _illumina(sx, sy, sz, raggio, bit, limite = null) {
    const R = Math.ceil(raggio) + MARGINE_MASCHERA;
    const r2 = (raggio + MARGINE_MASCHERA) * (raggio + MARGINE_MASCHERA);
    const { lx, ly, lz, minX, minY, minZ, visto } = this;
    // gli estremi si tagliano UNA volta, invece di chiedere dentro() per cella
    const x0 = Math.max(minX, sx - R), x1 = Math.min(minX + lx - 1, sx + R);
    const y0 = Math.max(minY, sy - R), y1 = Math.min(minY + ly - 1, sy + R);
    const z0 = Math.max(minZ, sz - R), z1 = Math.min(minZ + lz - 1, sz + R);
    const lim = limite || [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
    // z per ultimo: è l'asse contiguo in memoria, e l'indice avanza di uno
    for (let x = Math.max(x0, lim[0]); x <= Math.min(x1, lim[3]); x++) {
      const dx = x - sx, dx2 = dx * dx;
      for (let y = Math.max(y0, lim[1]); y <= Math.min(y1, lim[4]); y++) {
        const dy = y - sy, dxy2 = dx2 + dy * dy;
        if (dxy2 > r2) continue;
        const za = Math.max(z0, lim[2]), zb = Math.min(z1, lim[5]);
        let id = ((x - minX) * ly + (y - minY)) * lz + (za - minZ);
        for (let z = za; z <= zb; z++, id++) {
          if (visto[id] & bit) continue;          // già acceso da questa lampada
          const dz = z - sz;
          if (dxy2 + dz * dz > r2) continue;
          if (!this._bloccato(sx, sy, sz, x, y, z)) visto[id] |= bit;
        }
      }
    }
  }

  /**
   * C'È UN SOLIDO FRA I CENTRI DI DUE CELLE? Estremi ESCLUSI (la cella della
   * lampada è quasi sempre il blocco luminoso stesso, cioè solida).
   *
   * Traversata di voxel alla Amanatides-Woo: si avanza sempre verso il confine
   * di cella più vicino, quindi si visitano ESATTAMENTE le celle attraversate
   * dal segmento — non una di più (ombre più grasse del dovuto) né una di meno
   * (luce che passa negli spigoli). I `t` sono normalizzati sul segmento, così
   * t > 1 vuol dire "oltre l'arrivo" e non serve nessuna soglia in unità mondo.
   *
   * L'INDICE SI PORTA DIETRO invece di ricalcolarlo: è il ciclo più caldo di
   * tutto il file (una traversata per cella dentro il raggio di ogni lampada) e
   * chiamare eSolido() a ogni passo rifaceva due moltiplicazioni e sei confronti
   * di bordo. Qui un passo su X sposta l'indice di ly·lz, uno su Y di lz, uno su
   * Z di uno. Misurato su open world r48 con 81 lampade: 16,1 → 9,8 ms; con 289
   * lampade 20,8 → 11,6.
   */
  _bloccato(x0, y0, z0, x1, y1, z1) {
    const { lx, ly, lz, minX, minY, minZ, solidi } = this;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    // partendo dal CENTRO della cella, il primo confine sta a mezza cella
    let tx = ax ? 0.5 / ax : Infinity;
    let ty = ay ? 0.5 / ay : Infinity;
    let tz = az ? 0.5 / az : Infinity;
    const px = ax ? 1 / ax : Infinity;
    const py = ay ? 1 / ay : Infinity;
    const pz = az ? 1 / az : Infinity;
    const pasX = ly * lz, pasY = lz;
    let i = x0 - minX, j = y0 - minY, k = z0 - minZ;
    let id = (i * ly + j) * lz + k;
    // cintura: il cammino più lungo possibile è la somma dei tre scarti
    const passi = ax + ay + az + 2;
    for (let n = 0; n < passi; n++) {
      if (tx <= ty && tx <= tz) {
        if (tx > 1) break;
        i += sx; id += sx * pasX; tx += px;
        if (i < 0 || i >= lx) return false;             // uscito: fuori non c'è nulla
      } else if (ty <= tz) {
        if (ty > 1) break;
        j += sy; id += sy * pasY; ty += py;
        if (j < 0 || j >= ly) return false;
      } else {
        if (tz > 1) break;
        k += sz; id += sz; tz += pz;
        if (k < 0 || k >= lz) return false;
      }
      if (i === x1 - minX && j === y1 - minY && k === z1 - minZ) break;   // arrivati
      if (solidi[id]) return true;
    }
    return false;
  }

  /**
   * OCCLUSIONE DI UNA FACCIA, non di un blocco. Si legge nella cella d'ARIA che
   * la faccia affaccia — `fuori` è la sua normale uscente.
   *
   * È il punto che rende credibile tutto il resto: leggendo un valore solo per
   * blocco, un muro illuminato da un lato risulterebbe illuminato anche
   * dall'altro.
   *
   * RITORNA LA MASCHERA DELLE LAMPADE BLOCCATE (bit s = la lampada dello slot s
   * non arriva qui), ristretta agli slot davvero in uso — così "0" continua a
   * voler dire "faccia completamente illuminata" e "1" continua a voler dire
   * "l'unica lampada della scena è murata", esattamente come quando il valore
   * era booleano.
   *
   * Sugli smussi e sui triangoli d'angolo `fuori` ha più componenti (es.
   * [1,1,0]): BASTA UNA cella libera perché la faccia veda quella lampada — si
   * unisce, non si fa la media. Una media diventerebbe una sfumatura, e nello
   * shader il valore passa da un confronto di bit: gli smussi si annerirebbero a
   * righe proprio sul bordo illuminato.
   */
  occlusaFaccia(x, y, z, fuori) {
    let guardate = 0, vede = 0;
    for (let a = 0; a < 3; a++) {
      const f = fuori[a];
      if (f === 0) continue;
      const s = f > 0 ? 1 : -1;
      const nx = x + (a === 0 ? s : 0);
      const ny = y + (a === 1 ? s : 0);
      const nz = z + (a === 2 ? s : 0);
      if (this.eSolido(nx, ny, nz)) continue;    // faccia murata: quel lato non conta
      guardate++;
      vede |= this.vistoIn(nx, ny, nz);
    }
    // RIPIEGO: nessuna delle celle davanti alla faccia è libera. Capita ai bordi
    // fra un cappello d'erba (16 px) e un supercubo (18 px), dove il mesher
    // emette lo stesso una fascia di parete. Si prende il meglio dell'intorno:
    // meglio una faccia illuminata di troppo che una striscia nera nel prato.
    if (guardate === 0) {
      const m = this._migliore(x, y, z);
      // E QUANDO NEMMENO L'INTORNO HA NIENTE DA DIRE si sceglie la LUCE, che è
      // poi ciò che promette la riga qui sopra. Prima si cadeva su `vede = 0` e
      // il conto finale dava `_usati & ~0` = _usati, cioè TUTTE le lampade
      // bloccate: il valore più scuro possibile, l'esatto contrario del ripiego
      // dichiarato. Riprodotto con un blocco-lampada posato sul terreno pieno:
      // la faccia sotto la lampada usciva occlusa mentre quella accanto era
      // illuminata. «Nessuna informazione» non è «nessuna luce».
      if (m < 0) return 0;
      vede = m;
    }
    return this._usati & ~vede;
  }

  /**
   * OCCLUSIONE DI UN PUNTO, per chi non ha facce da interrogare: gatto, mano,
   * palle, mobili. Se il punto cade dentro un solido (un personaggio compenetra
   * sempre qualcosa) si prende il MEGLIO dei sei vicini — meglio un valore
   * dell'intorno che spegnere un gatto perché ha un piede in un blocco.
   * Stessa convenzione di occlusaFaccia: maschera delle lampade bloccate.
   */
  occlusaPunto(x, y, z) {
    if (!this.eSolido(x, y, z)) return this._usati & ~this.vistoIn(x, y, z);
    const vede = this._migliore(x, y, z);
    if (vede < 0) return 0;      // sepolto e sigillato: luce, vedi occlusaFaccia
    return this._usati & ~vede;
  }

  /**
   * L'unione dei sei vicini liberi: quali lampade arrivano nell'intorno.
   * −1 = INTORNO SIGILLATO, nessun vicino libero da cui copiare.
   *
   * Il caso va tenuto distinto da «sei vicini liberi che non vedono nessuna
   * lampada»: quello è un dato (qui è buio davvero), questo è assenza di dati.
   * Confonderli fa cadere i due ripieghi dalla parte sbagliata — restituire 0
   * per entrambi significa dire «tutte le lampade bloccate» proprio quando non
   * si sa nulla.
   */
  _migliore(x, y, z) {
    let vede = 0, liberi = 0;
    for (let d = 0; d < 6; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
      if (this.eSolido(nx, ny, nz)) continue;
      liberi++;
      vede |= this.vistoIn(nx, ny, nz);
    }
    return liberi === 0 ? -1 : vede;
  }

  // ---- aggiornamento LOCALE ---------------------------------------------------
  // PERCHÉ. Rifare la maschera del mondo intero a ogni blocco posato vuol dire
  // ripassare su tutte le lampade del mondo mentre a cambiare è una stanza sola.
  // Qui si paga solo la zona toccata, e la regola è semplice: un blocco può fare
  // ombra soltanto DENTRO la portata di una lampada che lo illumina. Le lampade
  // fuori portata non hanno niente da ricalcolare.
  //
  // Non c'è nessuna soglia oltre la quale l'aggiornamento dal vivo si spegne:
  // era una rupe invisibile: chi si costruiva una casa vedeva l'interno
  // illuminato come se non avesse tetto per tutta la sessione.

  /**
   * Applica un elenco di celle cambiate. Ogni voce è lo stato NUOVO:
   * `{x, y, z, solido, raggio}` (raggio 0 = non è una sorgente).
   *
   * Ritorna la scatola MONDO delle celle davvero riscritte — serve al mesher per
   * rifare i chunk giusti, perché l'ombra di un muro nuovo sconfina oltre il
   * chunk in cui lo si è posato. Ritorna null se una cella cade fuori dalla
   * griglia: lì la scatola non basta più e ci vuole un ricalcolo pieno.
   */
  applicaCambi(cambi) {
    for (const c of cambi) if (!this.dentro(c.x, c.y, c.z)) return null;

    // 1. le lampade che SPARISCONO o cambiano raggio: la loro zona vecchia va
    //    ripulita, quindi il raggio di prima va letto PRIMA di sovrascriverlo
    const rifare = [];
    const nuoveLampade = new Set();
    for (const c of cambi) {
      const id = this.indice(c.x, c.y, c.z);
      const vecchio = this._sorgenti.get(id);
      if (vecchio !== undefined) rifare.push(c.x, c.y, c.z, vecchio);
      else if (c.raggio > 0) nuoveLampade.add(id);      // lampada mai vista qui
    }

    // 2. stato nuovo di solidità e sorgenti
    for (const c of cambi) {
      const id = this.indice(c.x, c.y, c.z);
      this.solidi[id] = c.solido ? 1 : 0;
      const r = this._raggioUtile(c.raggio || 0);
      if (r > 0) {
        // il raggio cambiato allarga il vicinato: lo slot va riesaminato
        if (this._sorgenti.get(id) !== r) nuoveLampade.add(id);
        this._sorgenti.set(id, r);
      } else { this._sorgenti.delete(id); this._slot.delete(id); }
    }
    // 2b. SLOT: solo per le lampade toccate. Quelle che non c'entrano tengono il
    //     loro bit, ed è il motivo per cui la via locale può restare locale —
    //     riassegnare tutto vorrebbe dire rimeshare il mondo a ogni blocco.
    this._aggiornaSlotLocali(nuoveLampade);

    // 3. le lampade la cui SFERA contiene una cella cambiata: un solido nuovo
    //    (o tolto) può fare ombra solo dentro la portata di chi lo illumina
    for (const [id, r] of this._sorgenti) {
      const s = this._coord(id);
      const p = (r + MARGINE_MASCHERA) * (r + MARGINE_MASCHERA);
      for (const c of cambi) {
        const dx = c.x - s[0], dy = c.y - s[1], dz = c.z - s[2];
        if (dx * dx + dy * dy + dz * dz <= p) { rifare.push(s[0], s[1], s[2], r); break; }
      }
    }

    // 4. la zona da riscrivere: le scatole delle lampade da rifare, più le celle
    //    cambiate (il mesher deve rifare comunque il chunk in cui si è posato)
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const allarga = (x, y, z, r) => {
      if (x - r < b[0]) b[0] = x - r; if (x + r > b[3]) b[3] = x + r;
      if (y - r < b[1]) b[1] = y - r; if (y + r > b[4]) b[4] = y + r;
      if (z - r < b[2]) b[2] = z - r; if (z + r > b[5]) b[5] = z + r;
    };
    for (let i = 0; i < rifare.length; i += 4) {
      allarga(rifare[i], rifare[i + 1], rifare[i + 2], Math.ceil(rifare[i + 3]) + MARGINE_MASCHERA);
    }
    for (const c of cambi) allarga(c.x, c.y, c.z, 0);

    // 5. si azzera la zona e si RI-ILLUMINA con tutte le lampade che la toccano.
    //    Anche quelle che non erano da rifare: la maschera è un'unione, e le
    //    loro celle dentro la zona sono appena state cancellate. Ri-illuminare
    //    è idempotente (scrive solo 1), quindi rifarne una di troppo non sporca
    //    niente — sbagliarne una di meno lascerebbe un buco nero.
    for (let x = b[0]; x <= b[3]; x++) {
      for (let y = b[1]; y <= b[4]; y++) {
        for (let z = b[2]; z <= b[5]; z++) {
          if (this.dentro(x, y, z)) this.visto[this.indice(x, y, z)] = 0;
        }
      }
    }
    for (const [id, r] of this._sorgenti) {
      const slot = this._slot.get(id);
      if (slot === undefined || slot < 0) continue;
      const s = this._coord(id);
      const R = Math.ceil(r) + MARGINE_MASCHERA;
      if (s[0] + R < b[0] || s[0] - R > b[3] || s[1] + R < b[1]
        || s[1] - R > b[4] || s[2] + R < b[2] || s[2] - R > b[5]) continue;
      this._illumina(s[0], s[1], s[2], r, 1 << slot, b);
    }

    return { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] };
  }

  /**
   * Slot per le sole lampade in `daRifare` (nuove o col raggio cambiato). Le
   * altre NON si toccano: il loro bit è già cotto nei vertici di chunk che
   * questa via non rimesha, e cambiarglielo sotto sarebbe la peggiore delle
   * regressioni — una maschera che dice il vero su una griglia che nessuno
   * ha più riletto.
   */
  _aggiornaSlotLocali(daRifare) {
    const assegnati = new Map();
    for (const [id, r] of this._sorgenti) {
      const s = this._slot.get(id);
      if (s === undefined || daRifare.has(id)) continue;
      assegnati.set(id, { c: this._coord(id), r, slot: s });
    }
    for (const [id, r] of this._sorgenti) {
      if (this._slot.has(id) && !daRifare.has(id)) continue;
      const s = this._slotPer(id, r, assegnati);
      this._slot.set(id, s);
      assegnati.set(id, { c: this._coord(id), r, slot: s });
    }
    this._contaSlot();
  }
}

/**
 * Scatola che avvolge il mondo con il margine giusto.
 * Di lato basta un margine sottile per far leggere alle facce di bordo una cella
 * d'aria vera.
 *
 * IN VERTICALE È ARIA DI RISERVA, non decorazione: l'aggiornamento locale
 * funziona solo DENTRO la scatola, e appena si esce si paga un ricalcolo pieno
 * con lo scatto che ne segue. Chi costruisce una torre scavalca il tetto a ogni
 * blocco, quindi senza riserva sarebbe una griglia nuova per blocco.
 *
 * `sopra` e `sotto` sono UGUALI, e la simmetria è il punto: prima sopra c'erano
 * 6 livelli e sotto 2, e scavare (che è comune almeno quanto costruire) sfondava
 * la scatola tre volte più spesso.
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
  for (const s of sorgenti) g.aggiungiSorgente(s.x, s.y, s.z, s.raggio);
  g.calcola();
  return g;
}
