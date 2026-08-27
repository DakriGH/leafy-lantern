// LE MATERIE — metallo, fango, ghiaccio, acceso, specchio.
//
// PERCHÉ ESISTE (committente, 26/08/2026): «materiali metallici, fangosi,
// specchi ecc: una versione SEMPLIFICATA delle PBR, emissività ecc. Questo deve
// essere l'engine più leggero e bello che esista.»
//
// L'IDEA, ed è tutta qui: **una materia non è una texture e non è una BRDF, è
// una RIGA DI TABELLA**. Il pixel non la vede mai. La legge il MESHER, che ne
// cava un colore e lo cuoce nel `color` per vertice che già scrive; e la legge
// main, per caricare le uniform di chi ha bisogno di un termine vero. Il
// programma del 95% dei pixel — erba, terra, roccia — non guadagna un'istruzione.
//
// ⚠ È LA REGOLA 2 DELLA CASA («Tabelle > if sparsi») applicata per intero: qui
// si aggiunge una riga, non un ramo dentro uno shader. E i nomi dicono cosa
// FANNO, non da quale libro vengono: non c'è `metallicità` né `rugosità`, c'è
// `curva` (quanto la banda di luce si stringe) e `glintR` (quanto è largo il
// disco del brillio). Un nome preso dalla PBR qui prometterebbe una fisica che
// non c'è.
//
// ⚠ L'ASSENZA DI MATERIA È IL GIOCO DI OGGI. Nessun blocco esistente cambia di
// un texel finché non gliene si scrive una: `def.materia` è opzionale e
// `materiaDi()` rende `null` per tutti. È la condizione per cui questa tappa
// può entrare senza che nessuno se ne accorga — e per cui l'A/B è possibile.
//
// ⚠⚠ E UNA REGOLA DURA, che è un guasto SILENZIOSO se la si viola: una materia
// NON si può mettere su un blocco con `def.cappello` (l'erba). Il mesher marca
// i vertici d'erba riconoscendo il COLORE (`Costruttore.tri`, world/mesher.js),
// e `ritintaErba` li riscrive a ogni cambio di stagione senza rifare la mesh.
// Un colore di materia scritto lì SMARCA quei vertici: il cappello resta verde
// d'inverno, mesi dopo, senza un errore in console. `test/materie.test.mjs` lo
// pretende, e il perché sta scritto lì dentro.

/**
 * @typedef {Object} Materia
 * @property {number} tinta   moltiplicatore dell'albedo: <1 scurisce, 1 lascia stare
 * @property {number} satura  moltiplicatore della saturazione: >1 accende il colore
 * @property {number} orlo    quanto si schiarisce lo SMUSSO (0 = nessun orlo)
 * @property {number} curva   quanto si stringe la banda delle lampade (−1…+1)
 * @property {number} glintR  raggio del disco di brillio, in unità di mondo
 * @property {number} emiss   0…1: quanto il blocco si illumina DA SÉ
 * @property {number} bagna   0…1: quanto reagisce al bagnato (pioggia, riva)
 * @property {number} sotto   0…1: quanta luce lo attraversa (ghiaccio, vetro)
 */

/** ⚠ IL RAGGIO DEL GLINT HA UN TETTO DURO, e non è una taratura: la faccia
 *  piatta del supercubo è larga 1,0 unità (il quad sta a ±8/16). Sopra 0,5 il
 *  disco copre la faccia INTERA, e a quel punto tutte le facce di un dato
 *  orientamento si accendono insieme — che è il face shading bocciato, in
 *  un'altra forma. Vedi §13.1.1 del piano. */
export const GLINT_RAGGIO_MAX = 0.5;

export const MATERIE = {
  // il metallo è scuro e desaturato, con l'orlo acceso sugli smussi e la banda
  // stretta: è così che si legge «duro e lucido» senza uno speculare del sole.
  metallo:  { tinta: 0.82, satura: 0.55, orlo: 0.18, curva: 1.0,  glintR: 0.34, emiss: 0,   bagna: 0.2, sotto: 0 },
  // il fango è l'opposto esatto: più scuro, PIÙ saturo, nessun orlo, banda larga
  // e smorzata. È l'albedo del bagnato, e non costa niente per pixel.
  fango:    { tinta: 0.72, satura: 1.35, orlo: 0,    curva: -1.0, glintR: 0.48, emiss: 0,   bagna: 1.0, sotto: 0 },
  ghiaccio: { tinta: 1.06, satura: 0.62, orlo: 0.12, curva: 0.6,  glintR: 0.30, emiss: 0,   bagna: 0.4, sotto: 0.30 },
  // l'emissiva NON riceve ombra: è il punto. Un blocco acceso dentro l'ombra di
  // un albero, di notte, resta acceso e piatto.
  accesa:   { tinta: 1.0,  satura: 1.0,  orlo: 0,    curva: 0,    glintR: 0,    emiss: 1.0, bagna: 0,   sotto: 0 },
  specchio: { tinta: 0.95, satura: 0.35, orlo: 0.10, curva: 1.0,  glintR: 0.30, emiss: 0,   bagna: 0,   sotto: 0 },
};

/** I nomi validi, per l'Officina e per le prove. */
export const NOMI_MATERIE = Object.keys(MATERIE);

/**
 * La materia di una definizione di blocco, o `null`.
 *
 * ⚠ RENDE `null` ANCHE PER UN NOME SCONOSCIUTO, e non lancia: le definizioni
 * arrivano anche dai salvataggi e dall'Officina, cioè da dati che un giorno
 * possono contenere una materia che questa versione non conosce più. Meglio un
 * blocco senza lucentezza che un mondo che non si apre — è la stessa regola del
 * «blocco perduto» in `defDi`.
 */
export function materiaDi(def) {
  if (!def || !def.materia) return null;
  return MATERIE[def.materia] || null;
}

/**
 * IL COLORE DI UNA MATERIA, che è tutto ciò che il livello a costo zero fa.
 *
 * Prende il colore che la palette avrebbe dato e lo trasforma: tinta (quanto
 * scuro), saturazione (quanto acceso), e `schiarisci` per l'ORLO degli smussi.
 *
 * ⚠ LA SATURAZIONE SI FA IN HSL A MANO e non con una libreria: il colore qui è
 * un intero 0xRRGGBB e passa da qui una volta per VERTICE del mesher, cioè
 * decine di migliaia di volte per rimesh. Convertire avanti e indietro con
 * oggetti Color allocherebbe come se piovesse proprio nel ciclo più caldo della
 * ricostruzione.
 */
export function tingiMateria(colore, materia, schiarisci = 0) {
  if (!materia) return colore;
  let r = ((colore >> 16) & 255) / 255;
  let g = ((colore >> 8) & 255) / 255;
  let b = (colore & 255) / 255;

  // saturazione attorno alla LUMINANZA percepita, non alla media dei canali:
  // con la media, desaturare un verde lo fa virare al grigio-marrone e si vede.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const s = materia.satura;
  r = luma + (r - luma) * s;
  g = luma + (g - luma) * s;
  b = luma + (b - luma) * s;

  const k = materia.tinta * (1 + schiarisci);
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * k * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}
