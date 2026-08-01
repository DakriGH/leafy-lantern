// Gestione dei furni piazzati: validazione (supporto pieno, celle libere),
// occupazione della griglia per fisica/pathfinding, stati con visuale dedicata
// (es. LampostON/OFF.fbx), luce-sfera + ALONI concentrici semitrasparenti
// (finta luce emessa, separata dal fake pointlight), fluttuazione di 1 px.

import * as THREE from 'three';
import { PX } from '../config.js?v=msakthua';
import { FURNI, celleOccupate, celleAppoggio, centroide } from './registry.js?v=msakthua';
import { defDi } from '../world/blocks.js?v=msakthua';
import { creaLuce, rimuoviLuce } from '../fx/materials.js?v=msakthua';

let prossimoId = 1;

// ---- L'INGOMBRO CHE FA OMBRA AL SOLE ----------------------------------------
// NON È LA HITBOX, ed è tutto il punto. La hitbox dell'albero è il TRONCO (1×1
// per tre piani, vedi il def): un albero che proiettasse quella farebbe l'ombra
// di un palo con sopra una chioma sospesa a mezz'aria — peggio che niente.
//
// E NON È NEMMENO LA SCATOLA DEL MODELLO, che è stato il primo tentativo e ha
// fatto ridere l'utente prima ancora di finire la frase: la scatola di un
// lampione è un parallelepipedo di tre celle, quindi un palo sottile proiettava
// l'ombra di un muro. «Come se la hitbox fa ombra e non l'oggetto 3D» — sì,
// esattamente quello.
//
// SI VOXELIZZA LA GEOMETRIA VERA: si passano i triangoli del modello già posato
// e ruotato, e si marcano le celle che ciascuno tocca. Il palo del lampione
// prende la sua colonna, la testa la sua cella, la chioma dell'albero prende un
// cono che si stringe verso l'alto. Il risultato resta a scalini di cella — è un
// mondo di cubi, i gradini si leggono come voluti — ma sono i gradini DELLA
// FORMA, non di una scatola che la contiene.
//
// UNA CELLA CONTA SOLO SE L'OGGETTO LA RIEMPIE, ed è la regola che mancava.
// La griglia ha celle da un blocco: è la grana più fine che un'ombra camminata
// possa avere. Il palo di un lampione è largo un quinto di cella — marcarne la
// cella vuol dire proiettare un'ombra CINQUE VOLTE più larga del palo, e da
// lontano non si legge come un lampione ma come un muro. Quindi si misura, piano
// per piano, quanto l'oggetto occupa davvero della cella: se non ne riempie
// almeno COPERTURA su tutt'e due gli assi orizzontali, quella cella non è un
// ostacolo. Il palo non proietta, la TESTA del lampione sì (è larga abbastanza);
// il tronco dell'albero no, la chioma sì. È l'ombra della SAGOMA, non del
// contenitore.
//
// PIANO PER PIANO e non in blocco: un oggetto stretto sotto e largo sopra —
// cioè quasi tutti, dai lampioni agli alberi — con una misura sola darebbe o
// tutto o niente.
//
// SI PUÒ STARE STRETTI, e prima non si poteva: finché i materiali dei furni
// ricevevano l'ombra degli ingombri, un pezzo di modello che sporgeva dal
// proprio ingombro si annerriva contro le celle del vicino, e serviva coprire
// abbondante. Adesso quei materiali gli ingombri non li guardano affatto (vedi
// SOGLIA_CIELO in fx/materials.js), quindi aderire è gratis.
//
// COSTO: una passata sui triangoli del modello, UNA VOLTA quando si piazza —
// non per frame, non per ricostruzione. I modelli sono già stati fusi in una
// mesh sola dal loader (vedi compatta), quindi sono qualche centinaio di
// triangoli a testa.
const CELLE_OMBRA_MAX = 160;     // paracadute: un modello sballato non allaga la griglia
const COPERTURA = 0.45;          // quanta cella serve riempire, per asse
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();

// ---- LE SCATOLE D'OMBRA: la forma del modello, non la griglia ---------------
//
// PERCHÉ NON BASTAVANO LE CELLE. La sagoma votata a celle intere è quanto di
// meglio si possa fare DENTRO la griglia dei voxel, ma la griglia ha il passo di
// un blocco: l'ombra di un albero veniva fuori un quadrato 3×3 col bordo a
// scalini, cioè né la forma della chioma né un bordo pulito. Vista da vicino è
// il difetto che si nota di più di tutta l'illuminazione — «seghettate e non
// coerenti con i modelli 3D», parole del committente, ed è esatto.
//
// COSA SI FA INVECE. Il modello si affetta in orizzontale e ogni fetta dà il suo
// rettangolo VERO in x e z (numeri con la virgola, non celle): ne esce una torta
// a piani che segue il profilo — la chioma si stringe verso la punta, il palo di
// un lampione resta sottile come è. Le fette uguali si fondono, quindi un palo
// diventa UNA scatola alta e non sei, e alla fine si tiene solo un pugno di
// scatole per mobile. Lo shader le prova contro il raggio del sole una per una:
// niente griglia, niente passo di blocco, bordi dritti.
//
// PERCHÉ FUNZIONA QUI E NON SAREBBE UNA BUONA IDEA IN GENERALE: i modelli di
// questo gioco sono fatti di cuboidi allineati agli assi (Blockbench), quindi
// una torta di scatole non è un'approssimazione grossolana, è quasi il modello.
//
// OGNI FETTA È UN OTTAGONO, NON UN RETTANGOLO — ed è la correzione arrivata
// guardando l'ombra dall'alto: le chiome di questi alberi sono OTTAGONALI, e il
// rettangolo che le avvolge aggiunge quattro angoli che la chioma non ha.
// L'unione delle fette proiettate diventava un parallelogramma pieno e squadrato
// — «non sembra la forma originale», ed era vero alla lettera. Oltre ai limiti
// in x e z si misurano quindi anche i limiti DIAGONALI (x+z e x−z, sui vertici
// veri dei triangoli): l'intersezione dei sei slab è l'ottagono convesso ESATTO
// della fetta. Per un pezzo squadrato le diagonali non tagliano niente (il palo
// resta un palo); per uno smussato tagliano gli angoli, che è tutto il punto.
// ⚠ LA FETTA ERA MEZZO BLOCCO, E MEZZO BLOCCO È GROSSO. Ogni fetta prende il
// MASSIMO della sagoma nella sua altezza, quindi una forma che si stringe in
// fretta esce sistematicamente grassa di una fetta. Misurato sul modello vero
// dell'albero (sezioni orizzontali esatte): a y+0.1 la base è 0.84, a y+0.25 il
// tronco è 0.35 — con la fetta da mezzo blocco il tronco proiettava 0.84, cioè
// un ceppo largo un blocco al posto di un tronco. Sulla chioma lo stesso: 2.47 →
// 1.48 → 1.07 → 0.30 in due blocchi, letti a passo 0.5, davano un cono sempre
// più largo del cono. A un quarto di blocco il profilo si segue davvero.
// IL COSTO NELLO SHADER NON CAMBIA: le fette in più le richiude `riduci`, che
// tiene lo stesso numero di scatole (SCATOLE_PER_FURNI) — solo che adesso può
// METTERE I TAGLI DOVE SERVE invece che su una griglia fissa. Un palo resta una
// scatola sola come prima (fette tutte uguali = fusione a costo zero).
const FETTA = 0.25;              // altezza di una fetta, in blocchi
const SCATOLE_PER_FURNI = 5;     // quante ne resta al massimo dopo la fusione
const SCATOLE_LONTANO = 2;       // il LOD oltre la soglia: corpo e chioma, non uno scatolone
const FONDI_SE = 0.10;           // due fette si fondono se i lati differiscono meno di così
// L'OMBRA DI CONTATTO: quanto sporge attorno alla base, in blocchi. A
// mezzogiorno l'ombra di un mobile BASSO (una panchina) cade quasi tutta sotto
// il mobile stesso: fisicamente giusta, ma a schermo «che fine ha fatto
// l'ombra?» — l'oggetto sembra appoggiato senza peso. È lo stesso mestiere del
// disco sotto il gatto: un bordo scuro sottile attorno alla base, sempre.
// ⚠ ERA 0.14 FISSI, ED ERA SBAGLIATO DUE VOLTE. Il committente: «la base del
// lampione non ha nulla a che fare con la silhouette del lampione». Misurato sul
// modello vero: base larga 0.72, palo 0.17 — e la scatola di contatto usciva
// 1.00 × 1.00, cioè un quadrato di un blocco pieno attorno a un palo sottile.
//   · un margine FISSO è enorme su un oggetto piccolo e invisibile su uno grande:
//     adesso è proporzionale alla pianta (8%), con un tetto perché su un tavolo
//     largo non deve diventare un tappeto;
//   · e la sagoma di contatto va allargata anche sugli slab DIAGONALI in modo
//     proporzionale, se no l'ottagono torna un rettangolo proprio alla base —
//     che è esattamente la forma che si vedeva.
const CONTATTO_FRAZ = 0.08;      // frazione della pianta
const CONTATTO_MAX = 0.09;       // …e comunque non più di così, in blocchi
// La scatola di contatto sta APPENA SOPRA la base, non sotto: un frammento a
// terra accanto al mobile deve avere la scatola DAVANTI lungo il raggio
// (l'anti-autoombra esclude chi ci sta dentro). Il fondo a +0.05 fa entrare il
// raggio dal basso a t≈0.07, comodamente sopra il gap di 0.04.
const CONTATTO_SU = 0.05, CONTATTO_ALTO = 0.15;

/** Fonde due ottagoni in uno che li contiene (unione dei sei slab). */
function fondi(a, b) {
  a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
  a.z0 = Math.min(a.z0, b.z0); a.z1 = Math.max(a.z1, b.z1);
  a.s0 = Math.min(a.s0, b.s0); a.s1 = Math.max(a.s1, b.s1);
  a.d0 = Math.min(a.d0, b.d0); a.d1 = Math.max(a.d1, b.d1);
  a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1);
  return a;
}

/** Riduce la torta a `n` scatole fondendo ogni volta la coppia ADIACENTE che
 *  gonfia meno la sagoma: fondere due fette uguali non cambia niente, fondere
 *  la punta col tronco sì — quindi punta e tronco restano separati finché si
 *  può. NON muta l'ingresso: il LOD lontano si costruisce da quello vicino. */
export function riduci(scatole, n) {
  const s = scatole.map((b) => ({ ...b }));
  while (s.length > n) {
    let miglior = 0, costoMin = Infinity;
    for (let i = 0; i + 1 < s.length; i++) {
      const a = s[i], b = s[i + 1];
      const dx = Math.max(a.x1, b.x1) - Math.min(a.x0, b.x0);
      const dz = Math.max(a.z1, b.z1) - Math.min(a.z0, b.z0);
      const costo = dx * dz * (b.y1 - a.y0)
        - (a.x1 - a.x0) * (a.z1 - a.z0) * (a.y1 - a.y0)
        - (b.x1 - b.x0) * (b.z1 - b.z0) * (b.y1 - b.y0);
      if (costo < costoMin) { costoMin = costo; miglior = i; }
    }
    fondi(s[miglior], s[miglior + 1]);
    s.splice(miglior + 1, 1);
  }
  return s;
}

// ---- IL RITAGLIO DEL TRIANGOLO SULLA FETTA ---------------------------------
// Due buffer che si scambiano, riempiti in loco: questa roba gira su ogni
// triangolo di ogni mobile che si posa, e allocare qui vorrebbe dire regalare
// lavoro al garbage collector proprio mentre si costruisce il mondo.
const _pA = new Float64Array(8 * 3);
const _pB = new Float64Array(8 * 3);

/** Taglia il poligono in `src` (n vertici) contro il semispazio y ≥ q (sopra) o
 *  y ≤ q, scrivendo in `dst`. Rende quanti vertici sono rimasti. */
function _tagliaY(src, n, dst, q, sopra) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = src[i * 3], ay = src[i * 3 + 1], az = src[i * 3 + 2];
    const bx = src[j * 3], by = src[j * 3 + 1], bz = src[j * 3 + 2];
    const dentroA = sopra ? ay >= q : ay <= q;
    const dentroB = sopra ? by >= q : by <= q;
    if (dentroA) { dst[m * 3] = ax; dst[m * 3 + 1] = ay; dst[m * 3 + 2] = az; m++; }
    if (dentroA !== dentroB) {
      // l'attraversamento: by ≠ ay per costruzione (uno sta dentro e l'altro no)
      const t = (q - ay) / (by - ay);
      dst[m * 3] = ax + (bx - ax) * t;
      dst[m * 3 + 1] = q;
      dst[m * 3 + 2] = az + (bz - az) * t;
      m++;
    }
  }
  return m;
}

/** Ritaglia il triangolo corrente (_va/_vb/_vc) alla fetta [y0,y1]. Lascia il
 *  risultato in `_pA` e rende il numero di vertici. */
function ritagliaFetta(y0, y1) {
  _pA[0] = _va.x; _pA[1] = _va.y; _pA[2] = _va.z;
  _pA[3] = _vb.x; _pA[4] = _vb.y; _pA[5] = _vb.z;
  _pA[6] = _vc.x; _pA[7] = _vc.y; _pA[8] = _vc.z;
  let n = _tagliaY(_pA, 3, _pB, y0, true);
  if (n < 3) return 0;
  return _tagliaY(_pB, n, _pA, y1, false);
}

/** I sei limiti (x, z e le due diagonali) del poligono in `_pA`. */
function misuraPoligono(n, r) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = _pA[i * 3], z = _pA[i * 3 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
    const s = x + z, d = x - z;
    if (s < s0) s0 = s; if (s > s1) s1 = s;
    if (d < d0) d0 = d; if (d > d1) d1 = d;
  }
  r.x0 = x0; r.x1 = x1; r.z0 = z0; r.z1 = z1;
  r.s0 = s0; r.s1 = s1; r.d0 = d0; r.d1 = d1;
}

/** Gli stessi sei limiti presi direttamente dai tre vertici (fetta unica). */
function misuraTriangolo(r) {
  r.x0 = Math.min(_va.x, _vb.x, _vc.x); r.x1 = Math.max(_va.x, _vb.x, _vc.x);
  r.z0 = Math.min(_va.z, _vb.z, _vc.z); r.z1 = Math.max(_va.z, _vb.z, _vc.z);
  // i limiti diagonali si misurano sui VERTICI, non sul rettangolo: è qui
  // che l'ottagono impara la forma vera (su un vertice smussato x+z non
  // arriva mai dove arriverebbe l'angolo del rettangolo)
  r.s0 = Math.min(_va.x + _va.z, _vb.x + _vb.z, _vc.x + _vc.z);
  r.s1 = Math.max(_va.x + _va.z, _vb.x + _vb.z, _vc.x + _vc.z);
  r.d0 = Math.min(_va.x - _va.z, _vb.x - _vb.z, _vc.x - _vc.z);
  r.d1 = Math.max(_va.x - _va.z, _vb.x - _vb.z, _vc.x - _vc.z);
}

/** La torta di OTTAGONI che approssima la sagoma di `oggetto`, in coordinate
 *  MONDO: [{x0,x1,y0,y1,z0,z1,s0,s1,d0,d1}] con s = x+z e d = x−z (i limiti
 *  diagonali). Vuota se il modello non ha triangoli. */
export function scatoleOmbra(oggetto) {
  oggetto.updateMatrixWorld(true);
  const fette = new Map();       // indice di fetta → ottagono xz
  const allarga = (f, r) => {
    const p = fette.get(f);
    if (!p) { fette.set(f, { ...r }); return; }
    if (r.x0 < p.x0) p.x0 = r.x0; if (r.x1 > p.x1) p.x1 = r.x1;
    if (r.z0 < p.z0) p.z0 = r.z0; if (r.z1 > p.z1) p.z1 = r.z1;
    if (r.s0 < p.s0) p.s0 = r.s0; if (r.s1 > p.s1) p.s1 = r.s1;
    if (r.d0 < p.d0) p.d0 = r.d0; if (r.d1 > p.d1) p.d1 = r.d1;
  };

  const r = {};
  oggetto.traverse((o) => {
    // `visible` false = uno stato SPENTO di questo furni (i modelli degli stati
    // stanno tutti in scena, se ne accende uno): la sua forma non c'entra.
    if (!o.isMesh || !o.geometry || o.userData.alone || !o.visible) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    const idx = o.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    const m = o.matrixWorld;
    for (let i = 0; i + 2 < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      _va.fromBufferAttribute(pos, a).applyMatrix4(m);
      _vb.fromBufferAttribute(pos, b).applyMatrix4(m);
      _vc.fromBufferAttribute(pos, c).applyMatrix4(m);
      const fa = Math.floor(Math.min(_va.y, _vb.y, _vc.y) / FETTA);
      const fb = Math.floor(Math.max(_va.y, _vb.y, _vc.y) / FETTA);
      if (fa === fb) {
        // il triangolo sta tutto in una fetta: il suo ingombro È il contributo
        misuraTriangolo(r);
        allarga(fa, r);
        continue;
      }
      // ⚠ IL TRIANGOLO CHE ATTRAVERSA PIÙ FETTE VA TAGLIATO, e non farlo era il
      // difetto che il committente ha visto per primo: «le ombre sono diverse
      // dall'oggetto, sembra una hitbox mischiata storta». Vero alla lettera.
      // Dare a OGNI fetta attraversata l'ingombro dell'INTERO triangolo vuol dire
      // che il fianco di una chioma conica — un triangolo alto che va dal bordo
      // largo alla punta — allarga anche la fetta della punta fino al bordo
      // largo. Misurato sui modelli veri prima del taglio: il tronco dell'albero
      // proiettava una fetta larga 1.06 (un tronco è 0.3) e il palo del lampione
      // 0.39 (il palo è 0.17). L'ombra non era la sagoma dell'oggetto: era la
      // sagoma del suo involucro, spalmata su tutta l'altezza.
      // Qui il triangolo si ritaglia contro i due piani della fetta (Sutherland–
      // Hodgman, al massimo cinque vertici) e si misura solo il pezzo che ci sta
      // davvero dentro. Costa una volta sola, quando il mobile si posa.
      for (let f = fa; f <= fb; f++) {
        const n2 = ritagliaFetta(f * FETTA, (f + 1) * FETTA);
        if (n2 < 3) continue;
        misuraPoligono(n2, r);
        allarga(f, r);
      }
    }
  });
  if (!fette.size) return [];

  // dalle fette alle scatole, fondendo quelle che si somigliano
  const ordinate = [...fette.entries()].sort((a, b) => a[0] - b[0]);
  const scatole = [];
  let corrente = null, ultimaFetta = null;
  const simile = (a, b) => Math.abs(a.x0 - b.x0) < FONDI_SE && Math.abs(a.x1 - b.x1) < FONDI_SE
    && Math.abs(a.z0 - b.z0) < FONDI_SE && Math.abs(a.z1 - b.z1) < FONDI_SE
    && Math.abs(a.s0 - b.s0) < 2 * FONDI_SE && Math.abs(a.s1 - b.s1) < 2 * FONDI_SE
    && Math.abs(a.d0 - b.d0) < 2 * FONDI_SE && Math.abs(a.d1 - b.d1) < 2 * FONDI_SE;
  for (const [f, q] of ordinate) {
    if (corrente && f === ultimaFetta + 1 && simile(corrente, q)) {
      fondi(corrente, { ...q, y0: f * FETTA, y1: (f + 1) * FETTA });
    } else {
      corrente = { ...q, y0: f * FETTA, y1: (f + 1) * FETTA };
      scatole.push(corrente);
    }
    ultimaFetta = f;
  }
  const ridotte = riduci(scatole, SCATOLE_PER_FURNI);

  // LA SCATOLA DI CONTATTO, in coda: la pianta della scatola più bassa allargata
  // di CONTATTO su tutti e sei gli slab, sospesa appena sopra la base. Il
  // frammento a terra accanto al mobile la vede DAVANTI a sé lungo il raggio e
  // va in ombra: è il bordo che «appoggia» il mobile, sempre, anche a
  // mezzogiorno con l'ombra vera tutta sotto la pianta. È una scatola IN PIÙ,
  // non un ritocco alla prima: le sagome vere restano fedeli al modello, e il
  // LOD lontano non la porta (da lontano 14 centimetri non si vedono).
  // ⚠ LA PIANTA DI CONTATTO SI PRENDE DALLA FETTA ORIGINALE PIÙ BASSA, non dalla
  // scatola ridotta: `riduci` fonde fette adiacenti, e se la più bassa è finita
  // insieme a quella sopra la sua pianta è già gonfiata — il contatto ereditava
  // quel gonfiore e lo allargava ancora.
  let base = scatole[0];
  for (const b of scatole) if (b.y0 < base.y0) base = b;
  const margine = Math.min(CONTATTO_MAX,
    Math.min(base.x1 - base.x0, base.z1 - base.z0) * CONTATTO_FRAZ);
  ridotte.push({
    x0: base.x0 - margine, x1: base.x1 + margine,
    z0: base.z0 - margine, z1: base.z1 + margine,
    s0: base.s0 - margine * 2, s1: base.s1 + margine * 2,
    d0: base.d0 - margine * 2, d1: base.d1 + margine * 2,
    y0: base.y0 + CONTATTO_SU, y1: base.y0 + CONTATTO_ALTO,
    // marcata: chi la manda allo shader la fa contare SOLO quando l'astro è alto
    // e l'ombra vera sparisce sotto l'oggetto (vedi main.js, _dosaScatole)
    contatto: 1,
  });
  return ridotte;
}

function celleIngombro(oggetto) {
  oggetto.updateMatrixWorld(true);
  // per piano orizzontale (y di cella): l'ingombro reale in x e z
  const piani = new Map();
  const allarga = (y, x0, x1, z0, z1) => {
    const p = piani.get(y);
    if (!p) { piani.set(y, { x0, x1, z0, z1 }); return; }
    if (x0 < p.x0) p.x0 = x0; if (x1 > p.x1) p.x1 = x1;
    if (z0 < p.z0) p.z0 = z0; if (z1 > p.z1) p.z1 = z1;
  };

  oggetto.traverse((o) => {
    // `visible` false = uno stato SPENTO di questo furni (i modelli degli stati
    // stanno tutti in scena, se ne accende uno): la sua forma non c'entra.
    if (!o.isMesh || !o.geometry || o.userData.alone || !o.visible) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    const idx = o.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    const m = o.matrixWorld;
    for (let i = 0; i + 2 < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      _va.fromBufferAttribute(pos, a).applyMatrix4(m);
      _vb.fromBufferAttribute(pos, b).applyMatrix4(m);
      _vc.fromBufferAttribute(pos, c).applyMatrix4(m);
      const x0 = Math.min(_va.x, _vb.x, _vc.x), x1 = Math.max(_va.x, _vb.x, _vc.x);
      const z0 = Math.min(_va.z, _vb.z, _vc.z), z1 = Math.max(_va.z, _vb.z, _vc.z);
      const ya = Math.floor(Math.min(_va.y, _vb.y, _vc.y));
      const yb = Math.floor(Math.max(_va.y, _vb.y, _vc.y));
      for (let y = ya; y <= yb; y++) allarga(y, x0, x1, z0, z1);
    }
  });

  const celle = [];
  for (const [y, p] of piani) {
    for (let x = Math.floor(p.x0); x <= Math.floor(p.x1); x++) {
      const cx = Math.min(p.x1, x + 1) - Math.max(p.x0, x);
      if (cx < COPERTURA) continue;
      for (let z = Math.floor(p.z0); z <= Math.floor(p.z1); z++) {
        const cz = Math.min(p.z1, z + 1) - Math.max(p.z0, z);
        if (cz < COPERTURA) continue;
        if (celle.length >= CELLE_OMBRA_MAX) return [];   // o tutta o niente
        celle.push([x, y, z]);
      }
    }
  }
  return celle;
}

// aloni condivisi: due gusci concentrici additivi, immuni alla fog —
// grandi e LEGGERI (velature, non palle): richiesta esplicita dell'utente
const GEO_ALONE_1 = new THREE.SphereGeometry(0.42, 24, 16);
const GEO_ALONE_2 = new THREE.SphereGeometry(0.85, 24, 16);
const MAT_ALONE_1 = new THREE.MeshBasicMaterial({
  color: 0xffdf9e, transparent: true, opacity: 0.16, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: false,
});
const MAT_ALONE_2 = new THREE.MeshBasicMaterial({
  color: 0xffd071, transparent: true, opacity: 0.06, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: false,
});

export class Arredo {
  constructor(scena, mondo) {
    this.radice = new THREE.Group();
    scena.add(this.radice);
    this.mondo = mondo;
    this.istanze = [];
    this.onEvento = null;
    // CAMBIA A OGNI PIAZZAMENTO O RIMOZIONE. Serve a chi tiene una lista
    // derivata dai mobili (le sagome d'ombra in main): contare le istanze non
    // basta — caricare un altro diorama con lo stesso numero di mobili lascia
    // in giro le sagome di quello di prima, e sono ombre di cose che non ci sono.
    this.versione = 0;
  }

  /** Controlla se un furni può stare lì. Ritorna {ok, motivo}. */
  puoiPiazzare(defId, cella, rot, controller = null) {
    const def = FURNI[defId];
    const celle = celleOccupate(def, cella, rot);
    for (const [x, y, z] of celle) {
      // l'acqua non blocca: i furni si piazzano anche a mezz'acqua (waterlog)
      const tIn = this.mondo.tipo(x, y, z);
      if (tIn && !defDi(tIn).acqua) return { ok: false, motivo: 'C’è un blocco in mezzo' };
      if (this.mondo.furniIn(x, y, z)) return { ok: false, motivo: 'C’è già un furni' };
      if (controller && controller.occupaCella(x, y, z)) return { ok: false, motivo: 'Ci sei sopra tu!' };
    }
    for (const [x, y, z] of celleAppoggio(def, cella, rot)) {
      if (!this.mondo.solido(x, y - 1, z)) return { ok: false, motivo: 'Serve terreno piano sotto' };
    }
    return { ok: true };
  }

  /** @param config manopole della MACCHINA da ripristinare (solo dal caricamento:
   *  un furni posato adesso nasce coi default). Vive sul furni e non sulla
   *  macchina apposta — vedi gioco/macchine.js, «DOVE VIVE DAVVERO». */
  piazza(defId, cella, rot = 0, silenzioso = false, config = null) {
    const def = FURNI[defId];
    if (!def || !def.modello3d) return null;

    const gruppo = new THREE.Group();
    gruppo.position.set(cella[0] + 0.5, cella[1] + PX, cella[2] + 0.5); // fluttua di 1 px
    gruppo.rotation.y = rot * Math.PI / 2;

    const [cX, cZ] = centroide(def);               // multicella: modello sul baricentro
    const off = def.offsetPx || [0, 0, 0];         // calibrazione fine modello↔hitbox
    const posa = (o) => o.position.set(cX + off[0] * PX, off[1] * PX, cZ + off[2] * PX);

    const istanza = {
      id: prossimoId++, defId, def, cella: [...cella], rot,
      stato: 0, manuale: false, gruppo, luce: null, aloni: null, visualiStato: null,
      // le manopole della macchina, se questo furni ne è una. Resta grezza
      // finché il reconcile non crea l'entità: è `creaEntitaMacchina` a
      // normalizzarla (e a metterci i default se qui è null).
      config: config || null,
      celle: celleOccupate(def, cella, rot),
    };

    // visuale: una per stato se i tuoi FBX di stato esistono, altrimenti il base
    const usaStati = (def.stati || []).some((s) => s.modello3d);
    if (usaStati) {
      istanza.visualiStato = def.stati.map((s) => {
        const v = (s.modello3d || def.modello3d).clone();
        posa(v);
        v.visible = false;
        gruppo.add(v);
        return v;
      });
    } else {
      const corpo = def.modello3d.clone();
      posa(corpo);
      gruppo.add(corpo);
    }

    // PRIMA degli aloni, che sono sfere di 85 cm e gonfierebbero la scatola.
    // DUE SAGOME, e non è un doppione: le CELLE finiscono nella griglia dei
    // voxel e servono alle lampade (che camminano quella griglia), le SCATOLE
    // vanno allo shader e servono al sole, che le prova una per una e quindi
    // può permettersi la forma vera invece del passo di un blocco.
    istanza.celleOmbra = def.senzaOmbra ? [] : celleIngombro(gruppo);
    istanza.scatoleOmbra = def.senzaOmbra ? [] : scatoleOmbra(gruppo);
    // LA SAGOMA RIDOTTA, per i mobili lontani: il budget dello shader è finito
    // e un albero in fondo allo schermo non ha bisogno di cinque scatole. Ma
    // UNA sola era troppo poco — uno scatolone dal suolo alla punta, largo come
    // la chioma, proiettava un'ombra «senza senso» appena lo si degnava di uno
    // sguardo. Due (corpo e chioma, le sceglie il costo di fusione) sono il
    // minimo che ancora racconta la forma. SENZA la scatola di contatto (è
    // l'ultima): fonderla nel corpo gonfierebbe il LOD, e da lontano un bordo
    // di 14 centimetri non si vede comunque.
    istanza.scatolaOmbra = istanza.scatoleOmbra.length
      ? riduci(istanza.scatoleOmbra.slice(0, -1), SCATOLE_LONTANO) : [];

    // luce-sfera + aloni per gli stati che li prevedono
    const statoConLuce = (def.stati || []).find((s) => s.luce);
    // CHI PORTA LA LUCE IGNORA SÉ STESSO. L'ingombro di un furni normale ferma
    // anche le lampade — un albero fa ombra al lampione accanto — ma quello di
    // un lampione no: la sua lampada sta DENTRO il suo palo e si murerebbe da
    // sola. La distinzione la fa la sorgente, non il tipo di oggetto (vedi
    // OMBRA_OPACA in world/luce.js).
    istanza.ombraOpaca = !statoConLuce && !def.luce;
    if (statoConLuce) {
      const offL = statoConLuce.luce.offset || [0, 1.8, 0];
      istanza.luce = creaLuce({
        pos: new THREE.Vector3(cella[0] + 0.5 + offL[0], cella[1] + offL[1], cella[2] + 0.5 + offL[2]),
        raggio: statoConLuce.luce.raggio,
        colore: statoConLuce.luce.colore,
        intensita: statoConLuce.luce.intensita,
        ombra: !!statoConLuce.luce.ombra,
        attiva: false,
      });
      const aloni = new THREE.Group();
      const a1 = new THREE.Mesh(GEO_ALONE_1, MAT_ALONE_1);
      const a2 = new THREE.Mesh(GEO_ALONE_2, MAT_ALONE_2);
      a1.renderOrder = 3; a2.renderOrder = 3;
      // MAI nel render specchiato: da sotto il pelo gli aloni additivi sono
      // enormi → lavavano via il riflesso (guardando l'acqua attraverso la luce)
      a1.userData.alone = true; a2.userData.alone = true;
      aloni.add(a1, a2);
      aloni.position.set(offL[0], offL[1] - PX, offL[2]); // locali al gruppo (già alzato di 1 px)
      aloni.visible = false;
      gruppo.add(aloni);
      istanza.aloni = aloni;
    }

    gruppo.traverse((o) => { o.userData.istanza = istanza; });
    this.radice.add(gruppo);
    this.istanze.push(istanza);
    this.versione++;
    this.mondo.occupaFurni(istanza.celle, istanza);
    this.mondo.occupaOmbra(istanza.celleOmbra, istanza.ombraOpaca);
    this._applicaStato(istanza);
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'furniPiazza', defId, cella, rot });
    return istanza;
  }

  /**
   * LE SAGOME SEGUONO LA FORMA VERA, e non è un ricalcolo di lusso: un furni con
   * più stati tiene in scena TUTTI i suoi modelli e ne accende uno solo. Finché
   * la sagoma si prendeva una volta al piazzamento — e girando su tutte le mesh,
   * visibili o no — l'ombra era l'unione di tutti gli stati, cioè la forma di
   * nessuno: «gli oggetti cambiano forma, come mai non cambia l'ombra?».
   *
   * COSTA UNA PASSATA SUI TRIANGOLI, e solo quando lo stato CAMBIA davvero
   * (accendere un lampione, aprire una macchina): non per frame, non per
   * ricostruzione. `versione` avvisa main che la lista delle sagome vicine va
   * rifatta, se no lo shader tiene le vecchie fino al prossimo passo.
   *
   * LE CELLE DELLA GRIGLIA NO, ed è voluto: quelle vivono nella texture 3D
   * delle lampade, cambiarle vuol dire toccare il mondo e rifare un pezzo di
   * griglia a ogni interruttore. Fra gli stati di uno stesso mobile l'ingombro
   * a celle intere non cambia comunque (è la stessa cosa, con la lampada accesa).
   */
  _ricalcolaSagome(istanza) {
    if (istanza.def.senzaOmbra) { istanza.scatoleOmbra = []; istanza.scatolaOmbra = []; return; }
    istanza.scatoleOmbra = scatoleOmbra(istanza.gruppo);
    istanza.scatolaOmbra = istanza.scatoleOmbra.length
      ? riduci(istanza.scatoleOmbra.slice(0, -1), SCATOLE_LONTANO) : [];
    this.versione++;
  }

  _applicaStato(istanza) {
    const stato = istanza.def.stati ? istanza.def.stati[istanza.stato] : null;
    if (istanza.visualiStato) {
      istanza.visualiStato.forEach((v, i) => { v.visible = i === istanza.stato; });
      this._ricalcolaSagome(istanza);
    }
    const accesa = !!(stato && stato.luce);
    // BASTA LA SFERA. Qui si avvisava anche il mesher (onLuce → main.js →
    // verificaLuciFurni), perché la maschera d'occlusione doveva seguire
    // l'interruttore: una lampada spenta che lasciava la sua maschera aperta si
    // vedeva. Con le ombre camminate per-frammento la maschera non esiste —
    // c'è la griglia dei MURI, e un interruttore i muri non li sposta.
    if (istanza.luce) istanza.luce.attiva = accesa;
    if (istanza.aloni) istanza.aloni.visible = accesa;
  }

  setStato(istanza, indice) {
    if (!istanza.def.stati || indice === istanza.stato) return;
    istanza.stato = indice;
    this._applicaStato(istanza);
  }

  /** Click su un furni con stati: alterna (es. lampione Spento/Acceso). */
  alterna(istanza) {
    if (!istanza.def.stati) return false;
    istanza.manuale = true;
    this.setStato(istanza, (istanza.stato + 1) % istanza.def.stati.length);
    if (this.onEvento) this.onEvento({ tipo: 'furniStato', cella: istanza.cella, stato: istanza.stato });
    return true;
  }

  /** Al cambio giorno/notte i furni autoNotte seguono il ciclo. */
  aggiornaNotte(eNotte) {
    for (const ist of this.istanze) {
      if (!ist.def.autoNotte || !ist.def.stati) continue;
      ist.manuale = false;
      this.setStato(ist, eNotte ? 1 : 0);
    }
  }

  rimuoviIn(cella) {
    const ist = this.mondo.furniIn(cella[0], cella[1], cella[2]);
    if (!ist) return false;
    this.rimuovi(ist);
    return true;
  }

  rimuovi(istanza, silenzioso = false) {
    this.mondo.liberaFurni(istanza.celle);
    if (istanza.celleOmbra) this.mondo.liberaOmbra(istanza.celleOmbra, istanza.ombraOpaca);
    this.radice.remove(istanza.gruppo);
    if (istanza.luce) rimuoviLuce(istanza.luce);
    const i = this.istanze.indexOf(istanza);
    if (i >= 0) this.istanze.splice(i, 1);
    this.versione++;
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'furniRimuovi', cella: istanza.cella });
  }

  svuota() {
    for (const ist of [...this.istanze]) this.rimuovi(ist, true);
  }

  /** Dal risultato di un raycaster three risale all'istanza. */
  istanzaDa(oggetto) {
    let o = oggetto;
    while (o) {
      if (o.userData && o.userData.istanza) return o.userData.istanza;
      o = o.parent;
    }
    return null;
  }
}
