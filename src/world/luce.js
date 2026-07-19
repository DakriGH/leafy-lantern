// LA GEOMETRIA CHE FERMA LA LUCE — dove stanno i muri, e basta.
//
// A COSA SERVE. Le luci-sfera (fx/materials.js) sono LA tecnica grafica del
// gioco: una sfera con caduta lineare posterizzata a bande nette. Decidono loro
// QUANTO illuminare, e il loro aspetto non si tocca. L'unico difetto che avevano
// è che una sfera è solo una distanza: non sa niente dei muri, e infatti i
// lampioni li attraversavano. Questo file tiene i muri in un Uint8Array e sa
// rispondere a UNA domanda: «fra questa lampada e questo punto c'è un solido?».
//
// LA RISPOSTA SE LA DÀ LO SHADER, NON PIÙ QUESTO FILE, ed è il cambiamento che
// ha riscritto mezzo sistema. L'array `solidi` viene caricato TALE E QUALE in
// una texture 3D (vedi impostaVoxel in fx/materials.js) e il fragment shader
// cammina la griglia cella per cella fino al primo muro — lo stesso identico
// algoritmo di `occluso()` qui sotto, che ne resta il gemello in JS per i test.
//
// QUI C'ERANO ANCHE LE SORGENTI, e vale la pena dire perché non ci sono più.
// La versione precedente COTTIVA una mappa d'ombra per lampada (world/ombre.js,
// cancellato): serviva sapere dove stavano le lampade, quali avevano una
// piastrella nell'atlante, e quali dovevano ricuocere quando cambiava un blocco.
// Col cammino per-frammento l'ombra non dipende più da NESSUN dato per-lampada:
// dipende solo da dove stanno i muri. Sono spariti con lei l'elenco delle
// sorgenti, `sondaDa`, il margine di ricottura, il tetto di 48 lampade e tutto
// l'apparato di invalidazione — accendere un lampione non tocca più niente.
//
// PRIMA ANCORA c'era un flood fill a secchielli sui 6 vicini (stile Minecraft):
// bocciato perché la diffusione AGGIRA gli ostacoli, cioè fa esattamente ciò che
// un'ombra deve impedire, e perché misura distanze di TAXICAB mentre la sfera è
// euclidea (la pozza di luce usciva a rombo).

export const RAGGIO_MAX = 15;        // portata massima di una sorgente, in celle

/**
 * QUANTI PASSI DI GRIGLIA PUÒ FARE UN RAGGIO D'OMBRA, ed è il tetto del ciclo
 * nello shader (che pretende un limite costante).
 *
 * NON È UN NUMERO A CASO: un raggio lungo `d` celle attraversa al massimo
 * d·(|dx|+|dy|+|dz|) confini di cella, e la norma-1 di un versore vale al
 * massimo √3 — cioè la diagonale del cubo, la direzione che taglia più celle per
 * unità di lunghezza. Con RAGGIO_MAX = 15 fanno 25.98, più 2 di margine per gli
 * arrotondamenti sul primo e sull'ultimo confine.
 *
 * OLTRE RAGGIO_MAX DEGRADA, e va detto in chiaro: una lampada con raggio più
 * grande (nessuno la vieta — l'Officina lascia scegliere il raggio) vede il
 * proprio raggio d'ombra fermarsi qui, quindi la parte più esterna della sua
 * pozza torna a trapassare i muri. Nessuna lampada del gioco ci arriva: la più
 * larga è la lampada da 8. Il test test/luce.test.mjs lo tiene vero.
 */
export const PASSI_MAX = Math.ceil(RAGGIO_MAX * Math.sqrt(3)) + 2;

/** Quanto si accorcia il raggio d'ombra per non arrivare a toccare il frammento.
 *  SERVE, ed è l'unica costante di tutto il sistema: un frammento sta SULLA
 *  faccia di un blocco, cioè esattamente sul confine di una cella, e senza
 *  questo scarto il rumore di virgola mobile lo farebbe finire ogni tanto DENTRO
 *  il solido che lo porta — cioè l'acne classica delle shadow map.
 *  Un millesimo di cella è 1/16 di pixel di blocco (invisibile) contro un errore
 *  di interpolazione che in float32 su un chunk da 16 celle sta sotto 1e-6:
 *  mille volte il margine che serve. */
export const SCARTO_OMBRA = 1e-3;

/**
 * Griglia dei solidi su una scatola di mondo. Le coordinate dei metodi sono di
 * MONDO: la conversione a indice la fa la griglia.
 *
 * L'ORDINE DI `solidi` È UN CONTRATTO CON LA GPU: indice = ((x·ly) + y)·lz + z,
 * cioè Z scorre per primo, poi Y, poi X. È esattamente il layout che una texture
 * 3D si aspetta se la si dichiara larga `lz`, alta `ly` e profonda `lx` — per
 * questo l'array si carica in GPU senza copiarlo né rimescolarlo (vedi
 * impostaVoxel). Cambiare qui l'ordine senza cambiare là le dimensioni fa
 * ombre a caso, non un errore.
 */
export class GrigliaLuce {
  /** @param {{minX,minY,minZ,larghezza,altezza,profondita}} scatola */
  constructor(scatola) {
    const { minX, minY, minZ, larghezza, altezza, profondita } = scatola;
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.lx = larghezza; this.ly = altezza; this.lz = profondita;
    this.celle = larghezza * altezza * profondita;
    this.solidi = new Uint8Array(this.celle);
  }

  /** La scatola che copre, nella stessa forma con cui l'ha ricevuta: serve a chi
   *  deve ricaricarla in GPU senza essersi tenuto da parte l'originale. */
  scatola() {
    return {
      minX: this.minX, minY: this.minY, minZ: this.minZ,
      larghezza: this.lx, altezza: this.ly, profondita: this.lz,
    };
  }

  /** Stessa scatola? Serve a RIUSARE la griglia invece di riallocare l'array
   *  dei solidi a ogni ricalcolo. */
  stessaScatola(s) {
    return this.minX === s.minX && this.minY === s.minY && this.minZ === s.minZ
      && this.lx === s.larghezza && this.ly === s.altezza && this.lz === s.profondita;
  }

  /** Ripulisce per un ricalcolo da zero senza riallocare. */
  azzera() {
    this.solidi.fill(0);
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

  /**
   * QUANTO LONTANO ARRIVA UN RAGGIO prima di sbattere. Parte da (px,py,pz) —
   * punto qualsiasi, non per forza il centro di una cella — e cammina nella
   * direzione (dx,dy,dz), che dev'essere NORMALIZZATA perché il `t` reso è una
   * distanza in celle. Rende `tMax` (o più) se non incontra niente.
   *
   * LA CELLA DI PARTENZA NON CONTA, e non è un dettaglio: la lampada è quasi
   * sempre il blocco luminoso stesso, cioè solida, e contandola ogni raggio
   * uscirebbe bloccato a distanza zero — buio totale. Il ciclo comincia
   * uscendo dalla cella d'origine, quindi l'esclusione è per costruzione.
   *
   * Traversata di voxel alla Amanatides-Woo: si avanza sempre verso il confine
   * di cella più vicino, quindi si visitano ESATTAMENTE le celle attraversate
   * dal raggio — non una di più (ombre più grasse del dovuto) né una di meno
   * (luce che passa negli spigoli).
   *
   * L'INDICE SI PORTA DIETRO invece di ricalcolarlo: è il ciclo più caldo del
   * gioco (64² raggiate per lampada a ogni cottura) e chiamare eSolido() a ogni
   * passo rifarebbe due moltiplicazioni e sei confronti di bordo. Qui un passo
   * su X sposta l'indice di ly·lz, uno su Y di lz, uno su Z di uno.
   */
  distanzaSolido(px, py, pz, dx, dy, dz, tMax) {
    const { lx, ly, lz, minX, minY, minZ, solidi } = this;
    let i = Math.floor(px) - minX, j = Math.floor(py) - minY, k = Math.floor(pz) - minZ;
    if (i < 0 || j < 0 || k < 0 || i >= lx || j >= ly || k >= lz) return Infinity;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1, sz = dz >= 0 ? 1 : -1;
    // frazione dentro la cella: il primo confine sta a (1−f) avanti o a f indietro
    const fx = px - Math.floor(px), fy = py - Math.floor(py), fz = pz - Math.floor(pz);
    let tx = ax > 1e-9 ? (dx >= 0 ? 1 - fx : fx) / ax : Infinity;
    let ty = ay > 1e-9 ? (dy >= 0 ? 1 - fy : fy) / ay : Infinity;
    let tz = az > 1e-9 ? (dz >= 0 ? 1 - fz : fz) / az : Infinity;
    const px_ = ax > 1e-9 ? 1 / ax : Infinity;
    const py_ = ay > 1e-9 ? 1 / ay : Infinity;
    const pz_ = az > 1e-9 ? 1 / az : Infinity;
    const pasX = ly * lz, pasY = lz;
    let id = (i * ly + j) * lz + k;
    for (;;) {
      let t;
      if (tx <= ty && tx <= tz) {
        t = tx; i += sx; id += sx * pasX; tx += px_;
        if (i < 0 || i >= lx) return Infinity;      // uscito: fuori non c'è nulla
      } else if (ty <= tz) {
        t = ty; j += sy; id += sy * pasY; ty += py_;
        if (j < 0 || j >= ly) return Infinity;
      } else {
        t = tz; k += sz; id += sz; tz += pz_;
        if (k < 0 || k >= lz) return Infinity;
      }
      if (t >= tMax) return Infinity;
      if (solidi[id]) return t;
    }
  }

  /**
   * C'È UN MURO FRA LA LAMPADA E IL PUNTO? — il GEMELLO IN JS della funzione che
   * lo shader esegue per ogni frammento e per ogni lampada pesante che lo
   * illumina (fx/materials.js, ombraVoxel). Deve restare identica riga per riga:
   * è l'unico modo di provare in Node — cioè senza una GPU — la cosa da cui
   * dipende tutto l'aspetto delle ombre.
   *
   * PERCHÉ SI FERMA POCO PRIMA DEL PUNTO. Il frammento sta SULLA faccia di un
   * blocco, cioè sul confine della cella che quel blocco occupa: arrivandoci
   * esatti, metà delle facce illuminate si dichiarerebbe in ombra da sola.
   * Si accorcia di SCARTO_OMBRA, che è tre ordini di grandezza sopra l'errore di
   * virgola mobile e tre sotto la soglia del visibile.
   *
   * LA CELLA DELLA LAMPADA NON CONTA, ed è per costruzione (il ciclo comincia
   * uscendo): la lampada è quasi sempre il blocco luminoso stesso, cioè solida,
   * e contandola ogni raggio uscirebbe bloccato a distanza zero — buio totale.
   */
  occluso(lx, ly, lz, px, py, pz) {
    const dx = px - lx, dy = py - ly, dz = pz - lz;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return false;                      // dentro la lampada
    const t = this.distanzaSolido(lx, ly, lz, dx / d, dy / d, dz / d, d - SCARTO_OMBRA);
    return t !== Infinity;
  }

  /**
   * Applica un elenco di celle cambiate: `{x, y, z, solido}`. Ritorna false se
   * una cella cade fuori dalla griglia — lì la scatola non basta più e ci vuole
   * un ricalcolo pieno.
   *
   * QUI PRIMA C'ERA MOLTO DI PIÙ: la funzione doveva anche tenere il registro
   * delle sorgenti e rendere l'elenco delle lampade la cui mappa d'ombra era
   * scaduta, perché ogni lampada aveva una mappa cotta da invalidare. Col
   * cammino per-frammento non c'è niente di cotto: cambiare un blocco cambia un
   * byte di `solidi`, e le ombre di tutte le lampade del mondo sono già in pari.
   */
  applicaCambi(cambi) {
    for (const c of cambi) if (!this.dentro(c.x, c.y, c.z)) return false;
    for (const c of cambi) this.solidi[this.indice(c.x, c.y, c.z)] = c.solido ? 1 : 0;
    return true;
  }
}

/**
 * Scatola che avvolge il mondo con il margine giusto.
 * Di lato basta un margine sottile per far uscire i raggi radenti dal bordo.
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

/** Griglia pronta da un elenco di celle solide (comodo nei test). */
export function costruisciGriglia({ scatola, solidi = [] }) {
  const g = new GrigliaLuce(scatola);
  for (const [x, y, z] of solidi) g.marcaSolido(x, y, z);
  return g;
}
