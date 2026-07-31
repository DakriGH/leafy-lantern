// Luci-sfera: fake pointlight che schiariscono SOLO le superfici compenetrate.
// Nessuna luce three.js reale in tutto il gioco: materiali unlit + shader iniettato.
// (SPEC-TECNICA.md §2)

import * as THREE from 'three';
import { LUCI_MAX, BANDE_LUCE } from '../config.js?v=ms87ar6v';
import { PASSI_MAX, SCARTO_OMBRA } from '../world/luce.js?v=ms87ar6v';

// BANDE_LUCE COME LETTERALE GLSL, e passa da qui per un motivo pratico: scritto
// a mano come `${BANDE_LUCE}.0` funziona solo se la costante è un intero — con
// 3.5 uscirebbe «3.5.0», lo shader non compila e il mondo diventa INVISIBILE
// senza altri segnali. toFixed(1) rende valido qualunque valore.
// Serve un valore JS e non una `const float` GLSL perché le bande servono in DUE
// stringhe iniettate (quella comune e quella dell'acqua) e l'ordine con cui
// finiscono nel sorgente non garantisce che la dichiarazione preceda l'uso.
const GBANDE = BANDE_LUCE.toFixed(1);

// LO SCARTO D'OMBRA COME LETTERALE GLSL, e passa da toFixed per la STESSA
// ragione di GBANDE, solo con un tranello peggiore: 1e-3 scritto tale e quale da
// JS diventa «0.001» e va bene, ma il giorno che qualcuno lo abbassa a 1e-7 JS
// stampa «1e-7» — che in GLSL non è un numero, quindi lo shader non compila e il
// mondo diventa INVISIBILE senza altri segnali. 6 decimali coprono qualunque
// valore sensato (un milionesimo di cella) restando in notazione decimale.
const GSCARTO = SCARTO_OMBRA.toFixed(6);

// TETTO DEGLI ATTRAVERSAMENTI di cella dell'ombra del cielo: è il limite del
// ciclo GLSL, che pretende una costante. NON è la portata dell'ombra — quella è
// `uSolePassi` e si misura in BLOCCHI, la muove la scala di qualità.
const SOLE_PASSI_MAX = 24;
// PORTATA MASSIMA dell'ombra del cielo, in blocchi. Il legame con SOLE_PASSI_MAX
// non è arbitrario: un raggio attraversa al più √3 ≈ 1.74 confini di cella per
// unità di lunghezza (quando va in diagonale su tutti e tre gli assi), quindi
// con 24 attraversamenti si arriva SEMPRE a 13 blocchi. Chiedere di più
// vorrebbe dire che il contatore dei passi si esaurisce prima della distanza, e
// il taglio tornerebbe seghettato proprio nelle ore in cui l'ombra è lunga.
const SOLE_RAGGIO_MAX = Math.floor(SOLE_PASSI_MAX / Math.sqrt(3));   // 13

// QUANTE SCATOLE POSSONO PROIETTARE nello stesso frame. Ci stanno dentro due
// cose che a lungo sono state separate e che il sole tratta identiche:
//   · la SAGOMA DEI MOBILI (alberi, lampioni, panchine), qualche scatola a
//     testa, ferma finché non si sposta il mobile;
//   · i CORPI IN MOVIMENTO (gatto, gatti in rete, palle), quando l'utente
//     accende «ombre dinamiche».
// Sono provate una per una per frammento, quindi il numero è un costo diretto —
// ma con lo scarto in pianta calcolato da CPU quasi tutte cadono al primo
// confronto. Ventiquattro coprono il pieno di un diorama attorno al giocatore.
// Chi resta fuori dal budget (perché più lontano) non proietta: è una scala di
// dettaglio, e la si sceglie per DISTANZA dal punto guardato, non a caso.
const SCATOLE_MAX = 32;
// QUANTO LONTANO PUÒ CADERE l'ombra di una scatola, in celle. È un'ombra DI
// CONTATTO: serve a incollare le cose al terreno, non a disegnare una lama
// lunga mezzo schermo all'alba (che con l'astro radente sarebbe il caso
// normale, non l'eccezione).
const DIN_LUNG = 12.0;

// ---- heightmap del cielo: per colonna, la quota della superficie più alta.
// Serve alle OMBRE DELLE NUVOLE: scuriscono solo la cima della colonna
// (mai grotte o soffitti). Il mesher la aggiorna gratis a ogni rebuild di chunk.
const CIELO_DIM = 256;
const CIELO_ORIGINE = -128;
const _cieloDati = new Float32Array(CIELO_DIM * CIELO_DIM).fill(-1000);
const _cieloTex = new THREE.DataTexture(_cieloDati, CIELO_DIM, CIELO_DIM, THREE.RedFormat, THREE.FloatType);
_cieloTex.magFilter = THREE.NearestFilter;
_cieloTex.minFilter = THREE.NearestFilter;
_cieloTex.needsUpdate = true;

/** Scrive le quote di un chunk (mappa "x,z" → quota superficie). */
export function aggiornaCielo(colonne) {
  for (const [k, alt] of colonne) {
    const [x, z] = k;
    const ix = x - CIELO_ORIGINE, iz = z - CIELO_ORIGINE;
    if (ix < 0 || ix >= CIELO_DIM || iz < 0 || iz >= CIELO_DIM) continue;
    _cieloDati[iz * CIELO_DIM + ix] = alt;
  }
  _cieloTex.needsUpdate = true;
}

// ---- maschera d'ombra delle nuvole ----------------------------------------
// I rettangoli delle scatole vengono DISEGNATI su un piccolo canvas (CPU, poche
// volte al secondo) e lo shader fa UN campionamento a pixel. Prima c'era un
// ciclo fino a 40 rettangoli per OGNI fragment: su GPU mobile erano centinaia
// di operazioni a pixel, il singolo costo più alto di tutto il frame.
// Stesso dominio della heightmap (origine −128, 1 texel = 1 unità): lo shader
// riusa la stessa uv per entrambe le texture.
// 2 texel per unità (512² sul dominio da 256): a 1 texel il bordo NETTO delle
// ombre avanzava a scatti di una cella intera
const OMBRA_DIM = 512;
const PENOMBRA = 1.2;                          // unità di alone attorno alla sagoma
const _ombraCanvas = document.createElement('canvas');
_ombraCanvas.width = _ombraCanvas.height = OMBRA_DIM;
const _ombraCtx = _ombraCanvas.getContext('2d');
const _ombraTex = new THREE.CanvasTexture(_ombraCanvas);
_ombraTex.flipY = false;                       // riga 0 del canvas = v0, come la DataTexture
_ombraTex.magFilter = THREE.LinearFilter;      // il bilineare fa da bordo morbido (~1 unità)
_ombraTex.minFilter = THREE.LinearFilter;
_ombraTex.generateMipmaps = false;

// ---- IMPATTI DELLE CASCATE: anelli di schiuma, calcolati nello shader -------
// Erano cerchi disegnati su un canvas 512² (2 texel per unità) e campionati in
// XZ. Due guai in uno, ed erano il "lenzuolo bianco" segnalato:
//  · si disegnavano con fill(), cioè DISCHI PIENI. Il passaggio che li avrebbe
//    svuotati iterava su `celle` — le colonne dei furni dentro l'acqua — che
//    main.js passa SEMPRE vuota da quando la silhouette la fa uSchiumaRT:
//    l'anello non è mai esistito, era sempre stato un disco;
//  · la maschera non conosceva la QUOTA, quindi sbiancava ogni faccia d'acqua
//    nel raggio a QUALSIASI altezza: nella scena di collaudo il canale in cima
//    diventava bianco per colpa della pozza cinque blocchi più sotto.
// Come distanza analitica l'anello è esatto a qualsiasi zoom e la quota entra
// nel conto gratis, ma il ciclo ha un TETTO che la maschera non aveva (lei
// rasterizzava un numero qualsiasi di cerchi).
//
// QUANTO DEVE VALERE. A 8 il commento diceva "gli impatti a vista sono una
// manciata": falso già su una cascata a gradini modesta — la scalinata delle
// terrazze allagata ne produce 79 di distinti, quindi 71 anelli sparivano e
// l'insieme degli 8 superstiti cambiava con la CAMERA (spostando il bersaglio
// da cima a fondo si scambiavano 8 su 8): gli anelli nascevano ai piedi del
// giocatore e svanivano dietro di lui.
// 32 è scelto sul costo VERO per fragment, misurato — non a occhio. Il grosso
// del ciclo era la lanterna di rumore che sfrangia il bordo, e quella NON
// dipende dall'indice (vedi anelloImpatti): spostata fuori, ogni giro costa una
// manciata di operazioni. Misurato con la scalinata allagata a tutto schermo
// (975×625, readPixels come punto di sincronia vero — con gl.finish() da solo
// il numero esce falso di un ordine di grandezza): 0,644 ms/frame a 0 impatti,
// 0,646 a 8, 0,699 a 32. Alzare il tetto da 8 a 32 costa quindi 0,05 ms, cioè
// ~0,002 ms per slot; 96 ne costerebbero quasi 0,2 (dieci volte tanto sul
// Chromebook bersaglio) e occuperebbero 96 dei 224 vec4 garantiti in ES 3.0,
// dove LUCI_MAX ne prende già 48. 32 è dove le due curve si incontrano.
//
// RESTA UN TETTO, e va detto: sopra i 32 impatti a vista qualcuno non si vede.
// Il pannello debug lo stampa ("anelli d'impatto N/M ⚠ oltre il tetto") invece
// di lasciarlo scoprire a occhio. Quello che NON succede più è il tremolio:
// vedi IMPATTI_FASCIA.
const IMPATTI_MAX = 32;
// Raggio della FASCIA di vicinanza usata per ordinare gli impatti quando sono
// più del tetto. Non si ordina per distanza pura: quella cambia a ogni passo del
// giocatore e rimescola l'insieme di continuo — era metà del difetto ("gli
// anelli nascono ai piedi del giocatore e svaniscono dietro di lui"). Ordinando
// per FASCIA e, dentro la fascia, per posizione nel mondo, l'insieme resta
// IDENTICO finché il fuoco si muove dentro la stessa fascia: le sostituzioni
// avvengono solo attraversando un confine, e lì gli anelli in gioco sono quelli
// a 12+ unità di distanza, cioè piccoli sullo schermo.
const IMPATTI_FASCIA = 12;

const _statImpatti = { mostrati: 0, totali: 0 };
/** Quanti anelli sono a schermo e quanti ne esistono: il tetto va VISTO, non
 *  subìto in silenzio (lo stampa il pannello debug). */
export function statImpatti() { return _statImpatti; }

/** Anelli di schiuma degli impatti di cascata: `impatti` = [{x, y, z, r}] in
 *  coordinate mondo, dove y è la quota del PELO su cui la colonna sbatte (non
 *  quella da cui parte). `fuoco` sceglie i più vicini quando sono troppi. */
export function impostaSchiumaAcqua(impatti, fuoco = null) {
  let lista = impatti;
  if (lista.length > IMPATTI_MAX) {
    // SI ORDINA SEMPRE. Il taglio era condizionato a `fuoco`: senza, restavano
    // i primi otto NELL'ORDINE DI ITERAZIONE DEI CHUNK — un sottoinsieme
    // arbitrario che cambiava da solo appena una Map veniva ricostruita.
    lista = lista.slice();
    // La posizione nel mondo è la chiave di riserva ED È IL PUNTO: non si muove,
    // quindi due frame consecutivi scelgono lo stesso insieme. Senza fuoco è
    // l'unico criterio; col fuoco decide dentro la fascia.
    const fascia = fuoco
      ? (i) => Math.floor(Math.hypot(i.x - fuoco.x, i.z - fuoco.z) / IMPATTI_FASCIA)
      : () => 0;
    lista.sort((a, b) => fascia(a) - fascia(b) || a.x - b.x || a.z - b.z || a.y - b.y);
  }
  const n = Math.min(lista.length, IMPATTI_MAX);
  for (let i = 0; i < n; i++) {
    const im = lista[i];
    uniformi.uImpatti.value[i].set(im.x, im.y, im.z, im.r);
  }
  uniformi.uImpattiNum.value = n;
  _statImpatti.mostrati = n;
  _statImpatti.totali = impatti.length;
}

// ---- OCCUPAZIONE DEI SOLIDI: la griglia dei muri, in GPU --------------------
//
// COS'È. Un byte per cella di mondo — 1 = solido, 0 = aria — in una texture 3D,
// che è tutto ciò che serve allo shader per camminare il raggio dalla lampada al
// frammento e fermarsi al primo muro (vedi ombraVoxel). Non c'è NIENTE di
// per-lampada: le stesse celle rispondono a tutte le lampade del mondo, ed è per
// questo che il tetto di 48 piastrelle dell'atlante che stava qui non esiste più.
//
// SI CARICA SENZA COPIARLA, e non è un caso: `GrigliaLuce.solidi` indicizza già
// con ((x·ly)+y)·lz+z, cioè Z per primo — che è ESATTAMENTE il layout di una
// texture 3D larga lz, alta ly e profonda lx. Il Uint8Array del mesher va in GPU
// tale e quale, senza un rimescolamento né un array d'appoggio.
//   texelFetch(uVox, ivec3(z−minZ, y−minY, x−minX), 0)
//
// QUANTO COSTA IN MEMORIA. Un byte per cella della SCATOLA DEL MONDO (world
// bounding box più i margini di scatolaPerMondo), non di un intorno del
// giocatore: il diorama del committente è 75×22×32 = 52 KB, il mondo «test delle
// luci» 222×22×61 = 291 KB, un open world r64 circa 520 KB. Il paracadute che
// già esisteva (LUCE_LIMITE_CELLE = 2 milioni di celle) è quindi anche il tetto
// della memoria: 2 MB nel caso peggiore, ed è il motivo per cui non serve una
// finestra scorrevole attorno al giocatore — che avrebbe voluto dire decidere
// cosa fare delle lampade appena fuori, cioè rimettere in gioco un tetto.
//
// PERCHÉ UNA TEXTURE 3D E NON UN ATLANTE DI FETTE 2D. Perché si può: three r185
// compila OGNI materiale come «#version 300 es» (WebGL1 non esiste più dalla
// r163), quindi sampler3D e texelFetch sono disponibili anche nei materiali
// che restano scritti in stile GLSL 1. Con texelFetch l'indirizzamento è a
// numeri INTERI: niente mezzo texel, niente normalizzazione, niente confine di
// fetta da rattoppare a mano — cioè nessuna delle tre classi di bug che un
// atlante di fette si porta dietro.
const _voxVuoto = new THREE.Data3DTexture(new Uint8Array(1), 1, 1, 1);
_voxVuoto.format = THREE.RedFormat;
_voxVuoto.type = THREE.UnsignedByteType;
_voxVuoto.needsUpdate = true;

let _voxTex = _voxVuoto;

/**
 * Collega la griglia dei solidi. `solidi` è il Uint8Array di GrigliaLuce e
 * `scatola` la sua estensione: la texture si RICREA solo se le dimensioni sono
 * cambiate (texStorage3D alloca una volta sola e non si può ridimensionare),
 * altrimenti si ricarica sopra la stessa.
 *
 * SI CHIAMA QUANDO SI COSTRUISCE, non a ogni frame: posare un blocco riscrive un
 * byte e ricarica il volume, camminare non tocca niente.
 */
export function impostaVoxel(solidi, scatola, cima) {
  const { minX, minY, minZ, larghezza, altezza, profondita } = scatola;
  const img = _voxTex.image;
  // larghezza texture = lz, altezza = ly, profondita = lx: vedi il commento sopra
  if (_voxTex === _voxVuoto || img.width !== profondita || img.height !== altezza || img.depth !== larghezza) {
    if (_voxTex !== _voxVuoto) _voxTex.dispose();
    _voxTex = new THREE.Data3DTexture(solidi, profondita, altezza, larghezza);
    _voxTex.format = THREE.RedFormat;
    _voxTex.type = THREE.UnsignedByteType;
    uniformi.uVox.value = _voxTex;
  } else {
    _voxTex.image.data = solidi;
  }
  _voxTex.needsUpdate = true;
  uniformi.uVoxMin.value.set(minX, minY, minZ, 1);
  uniformi.uVoxDim.value.set(larghezza, altezza, profondita);
  // LA CIMA È L'ACCELERATORE DEL SOLE: sopra di lei il cammino può smettere
  // subito. Se chi chiama non la sa, il tetto della scatola è la risposta sicura
  // (corretta, solo meno stretta: si perde la potatura, mai un'ombra).
  uniformi.uVoxCima.value = cima !== undefined && isFinite(cima) ? cima : minY + altezza;
}

/** Niente griglia: le sfere tornano ad attraversare i muri, esattamente come
 *  prima che l'occlusione esistesse. È il ripiego ONESTO per il mondo vuoto,
 *  per l'interruttore delle Impostazioni spento, per il paracadute delle celle
 *  e per l'Officina, dove una griglia non c'è proprio. */
export function spegniVoxel() {
  uniformi.uVoxMin.value.w = 0;
}

// IL LATO MASSIMO DI UNA TEXTURE 3D, che e' l'unico limite rimasto di tutto il
// sistema d'ombra. Il minimo GARANTITO da WebGL2 e' 256, le schede vere danno
// 2048: si parte dal minimo — cosi' un ambiente senza GPU (i test in Node) e un
// avvio prima che il renderer esista non promettono piu' di quanto sia sicuro —
// e main.js lo alza al valore VERO appena il contesto c'e'.
let _latoVoxMax = 256;

/** Il lato massimo dichiarato dalla GPU (main.js, da MAX_3D_TEXTURE_SIZE). */
export function impostaLatoMassimoVoxel(n) {
  if (n > 0) _latoVoxMax = n;
}
export function latoMassimoVoxel() { return _latoVoxMax; }

/** Quanto occupa in GPU la griglia collegata, in byte (lo stampa il pannello). */
export function memoriaVoxel() {
  if (uniformi.uVoxMin.value.w < 0.5) return 0;
  const d = uniformi.uVoxDim.value;
  return d.x * d.y * d.z;
}

// Uniform condivisi da OGNI materiale patchato: un solo aggiornamento per frame.
const uniformi = {
  uLuciPosRaggio: { value: Array.from({ length: LUCI_MAX }, () => new THREE.Vector4(0, 0, 0, 1)) },
  uLuciColore: { value: Array.from({ length: LUCI_MAX }, () => new THREE.Vector4(1, 1, 1, 0)) },
  // FA OMBRA, QUESTA LAMPADA? 1 = pesante (il raggio cammina la griglia dei
  // voxel), 0 = leggera (trapassa i muri: è il suo mestiere). Le sfere si
  // riordinano a ogni frame — le più vicine al giocatore — quindi la classe va
  // riscritta in parallelo a loro, e non può stare nella lampada.
  uLuciOmbra: { value: new Float32Array(LUCI_MAX) },
  uLuciNum: { value: 0 },
  // la griglia dei solidi e la sua collocazione nel mondo
  uVox: { value: _voxVuoto },
  uVoxMin: { value: new THREE.Vector4(0, 0, 0, 0) },   // (minX, minY, minZ, griglia valida)
  uVoxDim: { value: new THREE.Vector3(1, 1, 1) },      // (lx, ly, lz) in celle
  // quota sopra la quale la griglia è sicuramente vuota: il cammino del sole si
  // ferma lì invece di leggere texture che non possono contenere niente
  uVoxCima: { value: 0 },
  // QUANTE LUCI PESANTI SONO STATE INVIATE, ed è l'interruttore generale del
  // lavoro d'ombra: a 0 lo shader non tocca né la griglia né le sue uniform, ed
  // è il caso normale di giorno e di qualunque scena di sole luci leggere.
  uOmbreNumPesanti: { value: 0 },
  uAmbiente: { value: new THREE.Color(1, 1, 1) },
  uOmbraNum: { value: 0 },        // 0 = nessuna nuvola: lo shader esce subito
  uOmbraForza: { value: 0.28 },
  uOmbraMask: { value: _ombraTex },
  // QUANTO SBANDA L'OMBRA PER OGNI UNITÀ DI QUOTA (dir.xz / dir.y dell'astro).
  // È il ponte fra la maschera delle nuvole e il sole: senza, l'ombra di una
  // nuvola cadeva a piombo mentre TUTTE le altre ombre del gioco erano
  // già oblique. Vedi lanternaOmbra e fx/nuvole.js.
  uOmbraSbieco: { value: new THREE.Vector2(0, 0) },
  uCielo: { value: _cieloTex },
  uCieloInfo: { value: new THREE.Vector4(CIELO_ORIGINE, CIELO_ORIGINE, 1 / CIELO_DIM, CIELO_DIM) },
  uTempo: { value: 0 },
  // Interruttore Impostazioni della maschera d'occlusione (world/luce.js):
  // 0 = spenta, e le luci-sfera tornano ad attraversare i muri com'era prima.
  uOcclusione: { value: 1 },
  // IL BISTURI: quali TERMINI della lanterna esegue il fragment. Serve a
  // scomporre il costo per pixel sul dispositivo vero invece di indovinarlo —
  // sul Chromebook il pass principale costa 19,9 ms di giorno, cioè con le
  // lampade SPENTE e il ciclo delle luci che non gira nemmeno: senza spegnere un
  // termine alla volta non si sa dove vadano. È una uniform e non una define
  // perché la diagnostica la muove a caldo, fra due misure alternate, senza
  // ricompilare niente. Vedi PARTI e docs/RIFONDAZIONE-RESA.md.
  uParti: { value: 511 },
  // OMBRA DEL CIELO (cel shading): direzione verso l'astro, forza dello
  // scurimento, e quante celle si concede al cammino. A passi 0 non esiste.
  uSoleDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
  uSoleForza: { value: 0 },
  // per cosa si moltiplica l'ambiente dentro l'ombra: non un grigio, il colore
  // del cielo dell'ora (lo compone fx/daynight.js)
  uOmbraFatt: { value: new THREE.Color(1, 1, 1) },
  uSolePassi: { value: 0 },
  uPioggia: { value: 0 },                        // 0..1: increspature di pioggia
  uRiflesso: { value: null },                    // RT del mirror (riflesso.js)
  uRiflessoMat: { value: new THREE.Matrix4() },
  uRiflessoOn: { value: 0 },                     // 0/1 per-frame
  uRiflessoForza: { value: 1 },                  // slider Impostazioni (0..1.5)
  uPgPos: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uPgNum: { value: 0 },                          // ombre-cono dei personaggi
  // LE SCATOLE CHE PROIETTANO AL SOLE: la sagoma dei mobili (sempre) e i corpi
  // in movimento (se l'utente accende le ombre dinamiche). Provate analiticamente
  // contro il raggio dell'astro — è così che l'ombra di un albero ha la forma
  // dell'albero invece del passo della griglia.
  uDinPos: { value: Array.from({ length: SCATOLE_MAX }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uDinMez: { value: Array.from({ length: SCATOLE_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
  // i limiti DIAGONALI dell'ottagono: (s0, s1, d0, d1) con s = x+z e d = x−z.
  // Sono loro a togliere all'ombra gli angoli che il modello non ha.
  uDinDiag: { value: Array.from({ length: SCATOLE_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uDinNum: { value: 0 },
  // OCCHIO DI BUE: (centro.x, centro.y in pixel, raggio, bordo) e la distanza
  // camera→personaggio. `uForoDist` a 0 spegne tutto senza costo.
  uForo: { value: new THREE.Vector4(0, 0, 90, 40) },
  uForoDist: { value: 0 },
  uForoForza: { value: 0 },
  // quanta luce resta su una faccia girata dal sole: 0.55 = il chiaroscuro pesa
  // poco meno di metà dell'ombra portata. 0 lo spegne (solo ombre portate).
  uSoleTerm: { value: 0.55 },
  // impatti delle cascate: (x, quota del pelo colpito, z, raggio dell'anello)
  uImpatti: { value: Array.from({ length: IMPATTI_MAX }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uImpattiNum: { value: 0 },
  uSchiumaRT: { value: null },                   // silhouette dall'alto (schiumaTop.js)
  uSchiumaRTInfo: { value: new THREE.Vector4(0, 0, 0, 0) },   // minX, minZ, 1/est, attivo
  // QUANTA LUCE PROPRIA HA IL BIANCO DELL'ACQUA, ed è il rilievo del committente:
  // "adesso è troppo emissiva… non deve brillare al buio come una lampada".
  // Qui c'era 0.85 fisso, e 0.85 non è una quantità di schiuma: è una quantità
  // di LUCE sommata dopo l'illuminazione. Con NoToneMapping (il renderer non
  // comprime niente sopra 1.0) sommare 0.85 al bianco pieno vuol dire che la
  // schiuma esce clampata a 255 a qualunque ora: era l'unica cosa in tutto lo
  // schermo che il ciclo giorno/notte non toccava, ed è precisamente ciò che la
  // faceva leggere come una sorgente accesa invece che come acqua bianca.
  // A 0.18 il ciclo se la riprende — MISURATO sulla pozza del collaudo, maschera
  // esatta di ~46k px, luminanza media: mezzanotte 162.6 · alba 216.8 ·
  // mezzogiorno 231.4 · tramonto 212.0. Sale e scende con tutto il resto.
  //
  // MA 0.18 NON CHIUDE LA QUESTIONE, e vale la pena scriverlo perché il prossimo
  // che legge non giri la manopola sbagliata. Nello STESSO fotogramma, sempre a
  // mezzanotte, la schiuma sta a 1.61 volte l'erba illuminata dal solo ambiente;
  // e ad additivo SPENTO (uSchiumaEmiss = 0) sta comunque a 1.37. Cioè circa il
  // 60% dell'eccesso non viene da qui: viene dall'albedo BIANCO moltiplicato per
  // l'ambiente notturno (0.32/0.36/0.55). Si vede dal fatto che il rapporto ad
  // additivo spento non si muove con l'ora — 1.37 a mezzanotte, 1.35 all'alba,
  // 1.34 a mezzogiorno, 1.35 al tramonto: è il rapporto fra due albedo, bianco
  // su verde, non un effetto di luce.
  // Quindi: se il rilievo "brilla come una lampada" tornasse, abbassare ancora
  // questo numero NON lo sistemerebbe. Le leve vere sono due, e sono altrove —
  // l'albedo della schiuma (il mix(…, vec3(1.0), band) in GLSL_ACQUA_COLORE) o
  // l'ambiente notturno di daynight.js. Entrambe hanno un prezzo su tutto il
  // resto della scena, ed è per questo che non sono state toccate qui.
  //
  // ED È UNA MANOPOLA SOPRATTUTTO NOTTURNA, per costruzione: l'additivo trova
  // spazio dove c'è spazio sotto il clipping, quindi rende +24.8 di luminanza a
  // mezzanotte e +9.5 a mezzogiorno. Lavora cioè più forte proprio dove il
  // committente ha detto che l'eccesso si vede — un motivo in più per tenerla
  // bassa. Per tararla dal vivo: LANTERN.uniformi.uSchiumaEmiss.value.
  uSchiumaEmiss: { value: 0.18 },
  // in AR il mondo vive dentro un pivot ruoto-scalato: questa è la sua INVERSA,
  // così vPosMondo resta in coordinate MONDO e luci/ombre/schiuma funzionano
  // anche sul diorama in AR (identità quando l'AR è spenta)
  uMondoInv: { value: new THREE.Matrix4() },
};

/** Matrice mondo→pivot inversa (AR). Passare null per tornare all'identità. */
export function impostaMondoInv(matrice) {
  if (matrice) uniformi.uMondoInv.value.copy(matrice);
  else uniformi.uMondoInv.value.identity();
}

/** Collega la silhouette dall'alto (schiuma a forma esatta) al frame. */
export function impostaSchiumaTop(texture, info) {
  uniformi.uSchiumaRT.value = texture;
  uniformi.uSchiumaRTInfo.value.copy(info);
}

/**
 * CHI PROIETTA AL SOLE, tutto in una lista sola.
 *
 * @param scatole sagome FERME dei mobili, in coordinate mondo:
 *                `{x0,x1, y0,y1, z0,z1}`. Le sceglie e le ordina chi chiama
 *                (main: le più vicine al punto guardato), qui si prendono le
 *                prime finché c'è posto.
 * @param corpi   cose che si MUOVONO: `{x, y, z, r, h}` con `y` alla base.
 * @param dinamiche true = anche i corpi diventano scatole; false = restano i
 *                coni alla Bedrock, che costano quasi niente e non hanno bisogno
 *                di sapere dov'è il sole.
 *
 * I CORPI NON SI SOMMANO MAI ALLE PROPRIE OMBRE-CONO, ed è voluto: un disco
 * sotto e una scatola di lato per lo stesso gatto si leggerebbero come due gatti.
 * Le sagome dei mobili invece ci sono SEMPRE: sono ferme, quindi non costano
 * niente da preparare, e sono quelle che si guardano davvero.
 *
 * IL RAGGIO DI SCARTO LO CALCOLA QUI LA CPU, una volta per scatola invece che
 * per pixel: è quanto lontano in pianta può arrivare quell'ombra a quest'ora
 * (mezza diagonale più l'allungamento dato dall'inclinazione dell'astro,
 * tagliato a DIN_LUNG). Lo shader ci fa sopra un confronto di distanza al
 * quadrato e salta tutto il resto — è così che venti scatole restano pagabili.
 */
/**
 * L'OCCHIO DI BUE: dove sta il personaggio sullo SCHERMO e quanto è lontano.
 * Lo calcola main una volta per frame — proiettare un punto è aritmetica, e
 * farlo per pixel sarebbe assurdo.
 * @param x,y  centro in PIXEL del buffer di disegno (0,0 in basso a sinistra,
 *             come gl_FragCoord)
 * @param dist distanza camera→personaggio; 0 o meno = spento
 */
export function impostaForo(x, y, dist, raggio, bordo, forza) {
  uniformi.uForo.value.set(x, y, raggio, bordo);
  uniformi.uForoDist.value = Math.max(0, dist);
  uniformi.uForoForza.value = Math.max(0, Math.min(1, forza));
  // il velo è acceso? Se no il mondo resta OPACO e si tiene l'early-z.
  _veloAcceso = dist > 0 && forza > 0.002;
}

/** true se il mondo va disegnato col materiale velato (occhio di bue aperto).
 *  Lo chiede il mesher a ogni frame: cambiare `mesh.material` è una scrittura,
 *  non una ricompilazione. */
export function mondoVelato() { return _veloAcceso; }

export function impostaOmbre(scatole, corpi, dinamiche = false) {
  const dir = uniformi.uSoleDir.value;
  const oriz = Math.hypot(dir.x, dir.z) / Math.max(dir.y, 0.05);
  let n = 0;
  // `diag` sono i limiti dell'ottagono (s0,s1,d0,d1); per i CORPI, che sono
  // scatole piene, si ricavano dal rettangolo: nessun angolo tagliato.
  const metti = (cx, cy, cz, hx, hy, hz, diag, peso = 1) => {
    if (n >= SCATOLE_MAX) return;
    // IL PESO STA IN uDinMez.w, che era zero e basta. Serve a far COMPARIRE
    // un'ombra invece di farla apparire: chi entra nel budget camminando entra
    // da trasparente e si scurisce in un blocco o due di cammino. Senza, le
    // ombre lontane «si caricavano» a scatti — e si vedeva, eccome.
    uniformi.uDinMez.value[n].set(hx, hy, hz, peso);
    if (diag) uniformi.uDinDiag.value[n].set(diag.s0, diag.s1, diag.d0, diag.d1);
    else {
      const s = cx + cz, d = cx - cz, h = hx + hz;
      uniformi.uDinDiag.value[n].set(s - h, s + h, d - h, d + h);
    }
    const raggio = Math.hypot(hx, hz) + Math.min(DIN_LUNG, (hy * 2 + DIN_LUNG) * oriz);
    uniformi.uDinPos.value[n].set(cx, cy, cz, raggio);
    n++;
  };

  // I CORPI PRIMA DEI MOBILI, e non è un dettaglio di stile: quando il budget si
  // riempie chi resta fuori non proietta, e l'ombra che non può mancare è quella
  // del gatto che stai muovendo — un albero in meno in fondo allo schermo non se
  // lo fila nessuno, il proprio personaggio senza ombra sì.
  if (dinamiche) {
    for (const e of corpi) {
      const h = e.h || (e.r * 2);
      // `y0` quando c'è: il cono e la scatola non ancorano allo stesso punto
      const base = e.y0 !== undefined ? e.y0 : e.y;
      metti(e.x, base + h * 0.5, e.z, e.r, h * 0.5, e.r, null);
    }
    uniformi.uPgNum.value = 0;
  }

  for (const s of scatole) {
    metti((s.x0 + s.x1) * 0.5, (s.y0 + s.y1) * 0.5, (s.z0 + s.z1) * 0.5,
      (s.x1 - s.x0) * 0.5, (s.y1 - s.y0) * 0.5, (s.z1 - s.z0) * 0.5, s, s.peso ?? 1);
  }

  if (!dinamiche) {
    const m = Math.min(corpi.length, 6);
    for (let i = 0; i < m; i++) {
      const e = corpi[i];
      uniformi.uPgPos.value[i].set(e.x, e.y, e.z, e.r);
    }
    uniformi.uPgNum.value = m;
  }
  uniformi.uDinNum.value = n;
}

/** Il chiaroscuro (facce girate dal sole) si può spegnere da solo: su terreno a
 *  terrazze fitte è la cosa che si nota di più, e c'è chi lo vuole e chi no. Le
 *  ombre PORTATE restano. Acceso pesa MENO di un'ombra portata: vedi uSoleTerm. */
export const TERM_LEGGERO = 0.55;
export function impostaTerminatore(on) { uniformi.uSoleTerm.value = on ? TERM_LEGGERO : 0; }

/** Orologio degli shader animati (acqua): da chiamare una volta per frame. */
export function aggiornaTempo(secondi) { uniformi.uTempo.value = secondi; }

/** Intensità della pioggia (0..1): accende le increspature sull'acqua. */
export function impostaPioggia(v) { uniformi.uPioggia.value = v; }
export function intensitaPioggia() { return uniformi.uPioggia.value; }

/** Collega il riflesso planare del frame (o lo spegne se ok=false). */
export function impostaRiflesso(ok, texture, matrice) {
  uniformi.uRiflessoOn.value = ok ? 1 : 0;
  if (ok) {
    uniformi.uRiflesso.value = texture;
    uniformi.uRiflessoMat.value.copy(matrice);
  }
}
export function impostaForzaRiflesso(f) { uniformi.uRiflessoForza.value = f; }

/** I TERMINI della lanterna, per scomporne il costo sul dispositivo vero.
 *  Non è un'impostazione utente: la muove solo la diagnostica, e torna a TUTTE
 *  appena finisce. 0 = shader nudo (colore della palette e basta). */
export const PARTI = {
  nuvole: 1, personaggi: 2, lampade: 4, acqua: 8,
  // dentro l'acqua, per sapere QUALE pezzo costa (misurato: l'acqua è il 60%
  // del pass principale sul Chromebook, 14,3 ms su 24)
  riflesso: 16, silhouette: 32, correnti: 64, riva: 128, impatti: 256,
  tutte: 511,
};
export function impostaParti(maschera) { uniformi.uParti.value = maschera | 0; }

/** Le nuvole pubblicano qui i BATUFFOLI (XZ) della loro sagoma = ombra reale.
 *  box = Vector4(centroX, centroZ, raggioX, raggioZ) GIÀ PROIETTATI sul piano
 *  y=0 lungo il raggio dell'astro (lo fa fx/nuvole.js con sbiecoAstro): la
 *  maschera vive in «coordinate d'ombra», e lo shader ci riporta il frammento
 *  con lo stesso scarto. Così una nuvola alta 20 e un sasso alto 2 proiettano
 *  nello stesso verso, che è tutto il punto.
 *
 *  SONO ELLISSI, NON RETTANGOLI, e non è un dettaglio: le nuvole hanno un
 *  profilo tondo ritagliato nel fragment shader, e un'ombra squadrata sotto una
 *  nuvola tonda tradiva tutto il trucco. L'unione delle ellissi è la stessa
 *  unione di cerchi che disegna la sagoma (fx/nuvole.js, elenco PUFF).
 *
 *  LA FORZA SEGUE L'ASTRO, non è più una costante: un'ombra di nuvola netta a
 *  mezzanotte (o all'alba, quando ogni altra ombra è sparita) era l'unica cosa
 *  in scena che non sapeva che ora fosse. */
export function impostaOmbreNuvole(box, forza) {
  const ctx = _ombraCtx;
  const S = OMBRA_DIM / CIELO_DIM;               // texel per unità di mondo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OMBRA_DIM, OMBRA_DIM);
  // PENOMBRA A UN GRADINO. Le nuvole stanno quindici unità più su: un bordo
  // d'ombra tagliato col rasoio non lo fa nessuna nuvola. Si disegna prima
  // l'alone al 50% e POI il pieno sopra — in quest'ordine, altrimenti l'alone di
  // un batuffolo cancella il pieno del vicino. Restano DUE valori netti, non una
  // sfumatura: lo stile è quello.
  for (const [tinta, extra] of [['#808080', PENOMBRA], ['#fff', 0]]) {
    ctx.fillStyle = tinta;
    ctx.beginPath();
    for (const b of box) {
      const cx = (b.x - CIELO_ORIGINE) * S, cz = (b.y - CIELO_ORIGINE) * S;
      const rx = (b.z + extra) * S, rz = (b.w + extra) * S;
      // IL moveTo NON È DECORATIVO: senza, ellipse() tira una linea dal punto
      // corrente all'inizio dell'arco e i batuffoli restano cuciti fra loro.
      // Messo esattamente sull'inizio dell'arco, quella linea è lunga zero.
      ctx.moveTo(cx + rx, cz);
      ctx.ellipse(cx, cz, rx, rz, 0, 0, 6.283185307179586);
    }
    // UN FILL SOLO per tutti i batuffoli: con la regola «nonzero» le ellissi
    // sovrapposte si fondono invece di ritagliarsi a vicenda, ed è proprio
    // l'unione che serve.
    ctx.fill();
  }
  _ombraTex.needsUpdate = true;
  uniformi.uOmbraNum.value = box.length ? 1 : 0;
  if (forza !== undefined) _nuvoleBase = forza;
  uniformi.uOmbraForza.value = _nuvoleBase * forzaAstro();
}

// La forza dell'astro come FRAZIONE del pieno mezzogiorno (0..1). Il ciclo
// giorno/notte la passa a impostaOmbraCielo insieme alla direzione; qui serve a
// chi ha una forza propria da scalare — per ora le nuvole.
const K_PIENO = 0.50;              // il k di mezzogiorno in fx/daynight.js
let _astroK = 0;
let _nuvoleBase = 0.28;
export function forzaAstro() { return Math.min(1, _astroK / K_PIENO); }
/** Di quanto trasla l'ombra ogni unità di quota: serve alle nuvole per scrivere
 *  la maschera nello stesso sistema in cui lo shader la legge. */
export function sbiecoAstro() { return uniformi.uOmbraSbieco.value; }
/** Il Vector3 VIVO della direzione dell'astro. Si restituisce l'oggetto, non una
 *  copia, di proposito: chi ha uno shader suo (le nuvole) lo infila nella propria
 *  uniform e resta allineato al ciclo del giorno senza copiarlo ogni fotogramma. */
export function direzioneAstro() { return uniformi.uSoleDir.value; }

const GLSL_VERTEX = /* glsl */`
  varying vec3 vPosMondo;
  uniform mat4 uMondoInv;
`;
const GLSL_FRAGMENT = /* glsl */`
  varying vec3 vPosMondo;

  uniform vec4 uLuciPosRaggio[${LUCI_MAX}];
  uniform vec4 uLuciColore[${LUCI_MAX}];
  // 1 = lampada PESANTE (fa ombra), 0 = LEGGERA (trapassa i muri per mestiere).
  // Le sfere si riordinano a ogni frame — le più vicine al giocatore — quindi la
  // classe viaggia in parallelo a loro, nello stesso ordine.
  uniform float uLuciOmbra[${LUCI_MAX}];
  uniform int uLuciNum;
  uniform vec3 uAmbiente;
  uniform float uOcclusione;       // interruttore Impostazioni: 0 = niente ombre
  uniform int uParti;              // bisturi: 1 nuvole · 2 personaggi · 4 lampade · 8 acqua
                                   // dentro l'acqua: 16 riflesso · 32 silhouette · 64 correnti · 128 riva · 256 impatti
  // 1 byte: 255 muro · 160 pelle · 96 ingombro opaco · 64 ingombro di chi fa luce
  uniform highp sampler3D uVox;
  uniform vec4 uVoxMin;            // (minX, minY, minZ, 1 = griglia collegata)
  uniform vec3 uVoxDim;            // (lx, ly, lz) in celle
  uniform float uVoxCima;          // quota della faccia alta della cella occupata più alta
  uniform int uOmbreNumPesanti;    // early-out: 0 = niente lavoro d'ombra
  uniform vec3 uSoleDir;           // direzione VERSO il sole (o la luna), normalizzata
  uniform float uSoleForza;        // 0 = niente ombra dal cielo (interruttore, non intensità)
  uniform vec3 uOmbraFatt;         // per cosa si moltiplica l'ambiente DENTRO l'ombra
  uniform int uSolePassi;          // celle di cammino concesse (0 = spento)
  // IL CHIAROSCURO È PIÙ LEGGERO DELL'OMBRA PORTATA, e questa è la correzione
  // che è costata un rifiuto. Con un livello solo per tutt'e due, un terreno a
  // terrazze diventa una limatura di denti di sega: ogni gradino ha un'alzata
  // rivolta dall'altra parte, e a piena forza quelle alzate si leggono come
  // strisce nere a zigzag su tutta la collina — rumore, non rilievo. L'ombra
  // PORTATA invece è locale e vuole dire qualcosa, quindi resta piena.
  // Due livelli sono ancora cel shading (i toon shader classici ne hanno due o
  // tre): quello che lo stile non vuole è la RAMPA, e qui di rampa non ce n'è.
  uniform float uSoleTerm;         // 0 = niente chiaroscuro; se no quanto resta illuminato
  // scatole che proiettano: sagome dei mobili + corpi in moto (vedi ombraScatole)
  uniform vec4 uDinPos[${SCATOLE_MAX}]; // (centro.xyz, raggio di scarto in XZ)
  uniform vec4 uDinMez[${SCATOLE_MAX}]; // mezze estensioni della scatola
  uniform vec4 uDinDiag[${SCATOLE_MAX}]; // limiti diagonali: (s0, s1, d0, d1) con s=x+z, d=x−z
  uniform int uDinNum;

  // CHI FERMA LE LAMPADE PER QUESTO MATERIALE.
  // 0.31 = anche gli ingombri opachi fermano la luce: è il mondo, l'acqua, i
  // personaggi, cioè chi STA FUORI dagli ingombri. 0.5 = solo muri e pelle, ed è
  // la variante dei modelli dei furni: un albero è dentro il proprio ingombro,
  // e senza questa riga la sua chioma si spegnerebbe da sé appena accanto a un
  // lampione. Misurato prima di scriverla: −10% di luce sulla chioma.
  const float SOGLIA_LUME = __SOGLIA_LUME__;
  // QUESTO MATERIALE È UN MOBILE? Allora le SCATOLE non lo toccano. Le fette di
  // un albero si ombreggiavano a vicenda — le corone basse ricevevano la scatola
  // delle corone alte, e sulla chioma comparivano righe dritte col passo delle
  // fette («sopra gli alberi ci sono delle linee», ed erano esattamente quelle).
  // Le scatole non hanno identità: non si può dire «salta le TUE», quindi i
  // mobili non ricevono ombre-scatola affatto — la stessa scelta già fatta per
  // gli ingombri della griglia, per lo stesso motivo. Il chiaroscuro e l'ombra
  // dei muri veri gli arrivano comunque.
  const bool FURNI = __FURNI__;

  // QUESTA CELLA È UN MURO? Fuori dalla griglia non c'è niente — è aria aperta,
  // non un muro: la stessa regola di GrigliaLuce.eSolido, e sbagliarla vorrebbe
  // dire un guscio nero attorno al mondo.
  // texelFetch e non texture(): indirizzamento INTERO, niente mezzo texel da
  // aggiungere, niente normalizzazione, niente filtraggio da spegnere.
  // Il byte della cella, 0.0 se fuori griglia. Normalizzato: 255 → 1.0, 64 → 0.251.
  float voxVal(ivec3 c) {
    ivec3 i = c - ivec3(uVoxMin.xyz);
    if (i.x < 0 || i.y < 0 || i.z < 0) return 0.0;
    if (float(i.x) >= uVoxDim.x || float(i.y) >= uVoxDim.y || float(i.z) >= uVoxDim.z) return 0.0;
    // l'ordine è (z, y, x): vedi il contratto di layout in world/luce.js
    return texelFetch(uVox, ivec3(i.z, i.y, i.x), 0).r;
  }

  // FERMA UNA LAMPADA: muri (1.0), buccia del terreno (0.627) e gli ingombri
  // OPACHI (0.376), cioè i mobili che non portano una sorgente — un albero fa
  // ombra alla luce del lampione accanto.
  // Resta fuori solo l'ingombro di chi la luce ce l'ha addosso (0.251): la sua
  // lampada sta DENTRO il proprio palo e si murerebbe da sola. È così che
  // «l'oggetto che emette ignora sé stesso ma proietta sugli altri».
  // UN confronto, come prima: è il ciclo più caldo del gioco.
  bool voxPieno(ivec3 c) { return voxVal(c) > SOGLIA_LUME; }

  // FERMA IL SOLE: SOLO i muri veri, non la buccia del terreno (che sarebbe il
  // seghettato delle terrazze, vedi PELLE in world/luce.js) e non più gli
  // ingombri dei mobili.
  //
  // GLI INGOMBRI SONO USCITI DA QUI, ed è il cambio che ha reso le ombre dei
  // mobili quello che dovevano essere. La griglia ha il passo di UN BLOCCO:
  // qualunque cosa ci si scriva dentro proietta un'ombra fatta di cubi, e un
  // albero veniva fuori un quadrato 3×3 col bordo a scalini — né la sua forma né
  // un bordo pulito. Adesso i mobili proiettano con le loro SCATOLE (ombraScatole
  // qui sotto), che sono numeri con la virgola e non celle. Nella griglia gli
  // ingombri restano, ma solo per le LAMPADE, che la griglia la camminano e a cui
  // il passo di un blocco basta.
  bool voxCielo(ivec3 c) { return voxVal(c) > 0.8; }

  // C'È UN MURO FRA QUESTO FRAMMENTO E LA LAMPADA?
  //
  // SI CAMMINA LA GRIGLIA, CELLA PER CELLA (traversata di voxel alla
  // Amanatides-Woo): si avanza sempre verso il confine di cella più vicino,
  // quindi si visitano ESATTAMENTE le celle attraversate dal raggio — non una di
  // più (ombre più grasse del vero) né una di meno (luce che passa negli spigoli).
  //
  // ED È IL PUNTO DI TUTTA QUESTA RISCRITTURA: l'ombra non è più APPROSSIMATA, è
  // ESATTA. Prima si leggeva la distanza del primo ostacolo da una mappa
  // ottaedrale di 128×128 texel per lampada, cioè una risoluzione ANGOLARE: 128
  // texel per giro vogliono dire che la precisione lineare peggiora andando in
  // là, e a raggio 15 un texel copriva quasi mezza cella. Il bordo dell'ombra
  // cadeva dove capitava dentro quel mezzo blocco e ondeggiava a una frequenza
  // che non corrispondeva a niente di visibile in scena — il cervello la leggeva
  // come difetto, non come stile. Qui il bordo coincide AL PIXEL con lo spigolo
  // del cubo che la proietta: i gradini che restano sono i cubi veri, e in un
  // gioco a blocchi quelli si leggono come voluti.
  //
  // NIENTE BIAS DA TARARE, e non è una promessa ottimista: non c'è nessuna
  // distanza cotta da confrontare, quindi non c'è l'acne che un bias cura.
  // L'unico scarto è SCARTO_OMBRA, che ferma il raggio un millesimo di cella
  // prima del frammento — perché il frammento sta sulla faccia di un blocco,
  // cioè esattamente sul confine della sua cella, e senza quello il rumore di
  // virgola mobile lo farebbe finire ogni tanto dentro il solido che lo porta.
  //
  // IL GEMELLO IN JS è GrigliaLuce.occluso (world/luce.js), e le due devono
  // restare identiche: è l'unico modo di provare senza GPU la cosa da cui
  // dipende tutto l'aspetto delle ombre.
  bool ombraVoxel(vec3 lampada, vec3 dir, float dist) {
    vec3 passo = vec3(dir.x >= 0.0 ? 1.0 : -1.0, dir.y >= 0.0 ? 1.0 : -1.0, dir.z >= 0.0 ? 1.0 : -1.0);
    // il max evita la divisione per zero sugli assi: 1e8 si comporta da infinito
    // (il raggio è lungo al più RAGGIO_MAX celle, quindi quel confine non arriva mai)
    vec3 inv = 1.0 / max(abs(dir), vec3(1e-8));
    vec3 f = lampada - floor(lampada);
    // distanza al primo confine di cella per asse: (1−f)/|d| in avanti, f/|d| indietro
    vec3 prossimo = ((passo * 0.5 + 0.5) - passo * f) * inv;
    ivec3 c = ivec3(floor(lampada));
    ivec3 ipasso = ivec3(passo);
    float limite = dist - ${GSCARTO};
    for (int k = 0; k < ${PASSI_MAX}; k++) {
      float t;
      if (prossimo.x <= prossimo.y && prossimo.x <= prossimo.z) { t = prossimo.x; c.x += ipasso.x; prossimo.x += inv.x; }
      else if (prossimo.y <= prossimo.z)                        { t = prossimo.y; c.y += ipasso.y; prossimo.y += inv.y; }
      else                                                      { t = prossimo.z; c.z += ipasso.z; prossimo.z += inv.z; }
      if (t >= limite) return false;                  // arrivati al frammento senza incontrare niente
      if (voxPieno(c)) return true;
    }
    return false;
  }

  // L'OMBRA DEL CIELO — il sole di giorno, la luna di notte.
  //
  // È CEL SHADING VERO, e la parola chiave è PIATTA: non c'è penombra, non c'è
  // rampa, non c'è mezzo tono. Un frammento o vede il sole o non lo vede, e chi
  // non lo vede prende UNA moltiplicazione secca — esattamente come le bande
  // delle luci-sfera, come il disco del gatto e come la sagoma delle nuvole. Lo
  // stile del gioco è fatto di salti netti, e un'ombra sfumata sarebbe l'unica
  // cosa morbida in mezzo a schermate di tagli vivi (è già successo con la
  // schiuma, ed è stata rifatta netta).
  //
  // COME: si cammina la STESSA griglia dei solidi delle lampade (la texture 3D),
  // dal frammento verso la luce, alla Amanatides-Woo. Zero mappe d'ombra, zero
  // render aggiuntivi, zero memoria: il bordo dell'ombra coincide AL PIXEL con
  // lo spigolo del cubo che la proietta, e in un gioco a blocchi i gradini che
  // restano si leggono come voluti.
  //
  // IL BUDGET È IL CUORE DELLA COSA. Il cammino si ferma dopo uSolePassi celle:
  // è un'ombra DI CONTATTO, cioè quella che si vede davvero in un diorama —
  // sotto gli alberi, dentro le rientranze, ai piedi dei muri. Un budget corto
  // costa poco e rende quasi tutto; alzarlo allunga le ombre e costa in
  // proporzione. A zero non si esegue niente: la scala di qualità lo spegne per
  // prima sui dispositivi deboli, e su quelli buoni lo alza.
  //
  // LA CELLA DI PARTENZA NON CONTA (il ciclo comincia uscendo): il frammento sta
  // SULLA faccia del suo blocco, e contarla vorrebbe dire che ogni superficie
  // illuminata si dichiara in ombra da sola — il nero totale.
  //
  // ---- LE DUE METÀ DELL'OMBRA -----------------------------------------------
  // Un'ombra vera è fatta di DUE cose, e per un po' qui ce n'è stata una sola.
  //   1. IL TERMINATORE: una faccia girata dalla parte opposta al sole è in
  //      ombra perché il sole non la vede, punto — non serve nessun ostacolo.
  //   2. L'OMBRA PORTATA: una faccia rivolta al sole che però ha qualcosa in
  //      mezzo.
  // Con la sola (2) il risultato si legge SBAGLIATO e basta guardarlo un
  // secondo: il lato a nord di una casa è illuminato esattamente come quello a
  // sud, e in mezzo a quel piatto compaiono chiazze scure che sembrano sporco.
  // Il cervello non le legge come ombre perché manca ciò che le giustifica.
  // Il terminatore è anche la metà che costa MENO DI ZERO: chi lo prende non
  // cammina la griglia (esce subito), e sono grossomodo metà delle facce
  // verticali della scena più tutte quelle rivolte in giù.
  //
  // LO STESSO IDENTICO SALTO PER TUTT'E DUE, ed è la scelta di stile: un solo
  // livello di scuro in tutto il gioco, che sia il fianco in ombra di un cubo o
  // il suolo sotto un albero. Due toni diversi farebbero una rampa, cioè
  // l'esatto contrario del cel shading.
  //
  // LA NORMALE SI RICAVA DALLE DERIVATE (dFdx/dFdy della posizione di mondo) e
  // non da un attributo: le facce del mondo sono piatte e allineate agli assi,
  // quindi il prodotto vettoriale delle due derivate È la normale esatta, senza
  // aggiungere 12 byte per vertice al buffer più grosso del gioco. Sui modelli
  // FBX dà la normale di FACCIATA invece di quella interpolata — cioè proprio la
  // sfaccettatura netta che questo stile vuole.
  vec3 normaleGeom() {
    vec3 n = normalize(cross(dFdx(vPosMondo), dFdy(vPosMondo)));
    return gl_FrontFacing ? n : -n;
  }

  // ---- LE SCATOLE CHE PROIETTANO: la sagoma dei mobili e i corpi in moto -----
  //
  // PERCHÉ NON STANNO NELLA GRIGLIA. La griglia dei voxel ha il passo di un
  // blocco, e un albero scritto lì dentro proietta un quadrato 3×3 col bordo a
  // scalini: né la forma della chioma né un bordo pulito. Da vicino è il difetto
  // che si nota di più — «seghettate e non coerenti con i modelli 3D». Qui invece
  // ogni mobile porta un pugno di SCATOLE con la virgola (la torta di fette di
  // furniture.js) e il raggio del sole le prova una per una col classico test a
  // fette: il bordo dell'ombra è dritto e la forma è quella del modello.
  // La griglia serve ancora, ma solo alle LAMPADE, che la camminano.
  //
  // CI STANNO ANCHE I CORPI IN MOVIMENTO quando l'utente accende le ombre
  // dinamiche: la griglia si ricarica quando si POSA un blocco, non sessanta
  // volte al secondo, quindi un gatto che corre lì dentro non ci può stare.
  //
  // DUE SCARTI A BUON MERCATO PRIMA DEL TEST VERO, perché questo gira per ogni
  // frammento dello schermo: la distanza in pianta (il raggio arriva già
  // calcolato da CPU e tiene conto di quanto l'ombra si allunga a quell'ora) e
  // la quota (il sole viene dall'alto, sotto non ci si va). È il motivo per cui
  // ventiquattro scatole costano quanto poche: quasi tutte cadono al primo
  // confronto.
  // 1/x che non esplode MAI cambiando il segno del risultato: quando il raggio
  // è quasi parallelo a uno slab il denominatore va a zero, e lo slab deve
  // diventare «non stringe» (frammento dentro) o «taglia tutto» (fuori) — che è
  // esattamente ciò che dà un inverso enorme col segno giusto.
  float invSicuro(float v) { return 1.0 / (abs(v) < 1e-6 ? (v < 0.0 ? -1e-6 : 1e-6) : v); }

  // Rende QUANTO scurisce la scatola più forte che copre questo frammento:
  // 0 nessuna, 1 ombra piena. Era un bool, e un bool non sa sfumare.
  float ombraScatole() {
    float forte = 0.0;
    vec3 seg = vec3(uSoleDir.x >= 0.0 ? 1.0 : -1.0, uSoleDir.y >= 0.0 ? 1.0 : -1.0, uSoleDir.z >= 0.0 ? 1.0 : -1.0);
    vec3 inv = seg / max(abs(uSoleDir), vec3(1e-4));
    // le due direzioni diagonali del raggio, per gli slab dell'ottagono
    float invS = invSicuro(uSoleDir.x + uSoleDir.z);
    float invD = invSicuro(uSoleDir.x - uSoleDir.z);
    float fs = vPosMondo.x + vPosMondo.z;
    float fd = vPosMondo.x - vPosMondo.z;
    for (int i = 0; i < ${SCATOLE_MAX}; i++) {
      if (i >= uDinNum) break;
      vec4 p = uDinPos[i];
      vec2 d = vPosMondo.xz - p.xz;
      if (dot(d, d) > p.w * p.w) continue;
      vec3 h = uDinMez[i].xyz;
      if (vPosMondo.y > p.y + h.y) continue;
      vec3 t0 = (p.xyz - h - vPosMondo) * inv;
      vec3 t1 = (p.xyz + h - vPosMondo) * inv;
      vec3 tmin = min(t0, t1), tmax = max(t0, t1);
      float a = max(max(tmin.x, tmin.y), tmin.z);
      float b = min(min(tmax.x, tmax.y), tmax.z);
      // GLI SLAB DIAGONALI: il rettangolo diventa l'ottagono ESATTO della
      // fetta, e l'ombra perde gli angoli che il modello non ha — era il
      // «parallelogramma pieno e squadrato» al posto della chioma.
      vec4 dg = uDinDiag[i];
      float sA = (dg.x - fs) * invS, sB = (dg.y - fs) * invS;
      a = max(a, min(sA, sB)); b = min(b, max(sA, sB));
      float dA = (dg.z - fd) * invD, dB = (dg.w - fd) * invD;
      a = max(a, min(dA, dB)); b = min(b, max(dA, dB));
      // IL CONFRONTO SU a NON È UN DETTAGLIO: chiede che la scatola stia DAVANTI al
      // frammento lungo il raggio. Un frammento del corpo stesso sta dentro la
      // propria scatola, quindi lì a è negativo e la prova cade — se bastasse
      // «il raggio attraversa la scatola», ogni gatto si annerirebbe da solo,
      // tutto intero (provato: succede, ed è vistoso).
      if (b > a && a > 0.04 && a < ${DIN_LUNG.toFixed(1)}) {
        forte = max(forte, uDinMez[i].w);
        if (forte >= 0.999) return forte;      // piena: inutile provare le altre
      }
    }
    return forte;
  }

  float ombraCielo() {
    if (uSoleForza <= 0.0) return 1.0;               // opzione spenta o astro sotto
    if (uSoleDir.y <= 0.02) return 1.0;              // astro sull'orizzonte: nessuna ombra
    // (1) il terminatore, che è anche l'uscita rapida
    if (uSoleTerm > 0.0 && dot(normaleGeom(), uSoleDir) <= 0.0) return uSoleTerm;
    // (2) le scatole: la sagoma dei mobili e i corpi in moto, che nella griglia
    //     non ci sono (o non ci starebbero senza diventare cubi). I materiali
    //     dei MOBILI le saltano in blocco (vedi FURNI): il ramo sparisce in
    //     compilazione, non è un if pagato per pixel.
    if (!FURNI && uDinNum > 0) {
      float sc = ombraScatole();
      if (sc > 0.002) return 1.0 - sc;        // sfuma invece di apparire di colpo
    }
    if (uSolePassi == 0 || uVoxMin.w < 0.5) return 1.0;
    // chi sta sopra la cima del mondo non ha niente sopra di sé: niente cammino
    if (vPosMondo.y >= uVoxCima) return 1.0;
    // (3) l'ombra portata dal mondo: si cammina la griglia
    vec3 p = vPosMondo + uSoleDir * ${GSCARTO};      // stacco dalla faccia: niente acne
    vec3 passo = vec3(uSoleDir.x >= 0.0 ? 1.0 : -1.0, uSoleDir.y >= 0.0 ? 1.0 : -1.0, uSoleDir.z >= 0.0 ? 1.0 : -1.0);
    vec3 inv = 1.0 / max(abs(uSoleDir), vec3(1e-8));
    vec3 f = p - floor(p);
    vec3 prossimo = ((passo * 0.5 + 0.5) - passo * f) * inv;
    ivec3 c = ivec3(floor(p));
    ivec3 ipasso = ivec3(passo);
    // IL BUDGET SI SPENDE IN DISTANZA, NON IN CELLE CONTATE, ed è la cura di un
    // seghettato che è ricomparso appena le ombre delle ore radenti sono tornate
    // visibili. Contando le celle, quanto lontano arriva l'ombra dipende da DOVE
    // dentro la sua cella è nato il raggio: due frammenti vicini spendono i
    // dodici passi in modo diverso e finiscono a distanze diverse, così l'orlo
    // lontano dell'ombra diventa un dente di sega col passo della griglia. È lo
    // stesso difetto della vecchia mappa ottaedrale — un bordo che ondeggia a una
    // frequenza che non corrisponde a niente in scena — e il cervello lo legge
    // come guasto, non come stile. Con un limite in unità di mondo l'orlo cade
    // sulla stessa linea per tutti.
    //
    // ⚠ E IL CONTATORE DEI PASSI NON DEVE PIÙ FERMARE NIENTE, se no il taglio
    // resta quello di prima e la cura non si vede (ci sono cascato: messo il
    // limite in distanza e lasciata la vecchia uscita a passi contati, i denti
    // erano identici al pixel). Il ciclo può fare fino a SOLE_PASSI_MAX
    // attraversamenti; a fermarlo è la distanza, ed è per questo che uSolePassi
    // ora si legge come BLOCCHI DI PORTATA e non come passi. SOLE_RAGGIO_MAX
    // garantisce che i passi bastino sempre: un raggio attraversa al più √3
    // confini di cella per unità di lunghezza.
    float limite = float(uSolePassi);
    for (int k = 0; k < ${SOLE_PASSI_MAX}; k++) {
      float t;
      if (prossimo.x <= prossimo.y && prossimo.x <= prossimo.z) { t = prossimo.x; c.x += ipasso.x; prossimo.x += inv.x; }
      else if (prossimo.y <= prossimo.z)                        { t = prossimo.y; c.y += ipasso.y; prossimo.y += inv.y; }
      else                                                      { t = prossimo.z; c.z += ipasso.z; prossimo.z += inv.z; }
      if (t > limite) break;
      // SOPRA LA CIMA DEL MONDO NON C'È PIÙ NIENTE DA INCONTRARE, e il raggio
      // va verso l'astro, cioè verso l'alto: da qui in poi ogni altro passo
      // sarebbe una lettura di texture sicuramente vuota. Un confronto float
      // contro un texelFetch: su un diorama basso è la maggior parte del
      // cammino di ogni pixel illuminato. Esatto, non un'approssimazione —
      // uVoxCima è la quota della faccia alta della cella occupata più alta.
      if (float(c.y) >= uVoxCima) break;
      if (voxCielo(c)) return 0.0;                   // UN salto secco, niente rampa
    }
    return 1.0;
  }

  vec3 lanternaAccumulo() {
    vec3 acc = vec3(0.0);
    if ((uParti & 4) == 0) return acc;                // bisturi: lampade spente
    if (uLuciNum == 0) return acc;                    // giorno senza lampade: costo zero
    // EARLY-OUT DELLE OMBRE: se non c'è nemmeno una luce PESANTE in vista, il
    // lavoro d'ombra non si fa proprio — niente fetch, niente uniform lette.
    // È il motivo per cui le luci leggere (fuochi fatui, oggetti che brillano)
    // costano esattamente quanto le fake pointlight di prima.
    bool conOmbre = uOcclusione > 0.5 && uOmbreNumPesanti > 0 && uVoxMin.w > 0.5;
    for (int i = 0; i < ${LUCI_MAX}; i++) {
      if (i >= uLuciNum) break;
      vec4 pr = uLuciPosRaggio[i];
      vec3 dv = vPosMondo - pr.xyz;
      float d2 = dot(dv, dv);
      if (d2 < pr.w * pr.w) {                         // sqrt e divisione solo dentro la sfera
        float d = sqrt(d2);
        // IL CAMMINO SI PAGA SOLO DENTRO LA SFERA E SOLO SE LA LAMPADA È PESANTE:
        // è per questo che il costo segue la SOVRAPPOSIZIONE delle pozze e non il
        // numero di lampade a schermo — un pixel che sta dentro una sola pozza
        // cammina una volta sola, per lunga che sia la fila di lampioni.
        if (conOmbre && uLuciOmbra[i] > 0.5 && d > 1e-4 && ombraVoxel(pr.xyz, dv / d, d)) continue;
        float f = 1.0 - d / pr.w;
        // anelli concentrici: le sfere si sommano dove si compenetrano
        float banda = ceil(min(f, 1.0) * ${GBANDE}) / ${GBANDE};
        acc += uLuciColore[i].rgb * uLuciColore[i].a * banda;
      }
    }
    return acc;
  }

  uniform int uOmbraNum;
  uniform float uOmbraForza;
  uniform sampler2D uOmbraMask;
  uniform vec2 uOmbraSbieco;
  uniform sampler2D uCielo;
  uniform vec4 uCieloInfo;

  // Ombra delle nuvole: la sagoma (unione dei rettangoli-scatola) è pre-disegnata
  // in una maschera → UN campionamento a pixel, forma esatta della nuvola.
  // Scurisce SOLO la superficie più alta della colonna (heightmap: niente grotte).
  //
  // L'OMBRA CADE DOVE LA MANDA L'ASTRO, non a piombo. Il raggio è obliquo, quindi
  // la nuvola non oscura quello che ha SOTTO ma quello che ha dalla parte opposta
  // al sole — di parecchio, perché le nuvole stanno quindici unità più su. Finché
  // qui c'era una proiezione verticale, era l'unica ombra del gioco che non
  // sapeva dov'era il sole, e si vedeva: le ombre degli alberi puntavano tutte da
  // una parte e le macchie delle nuvole stavano ferme sotto di loro.
  //
  // COME: la maschera è già scritta in «coordinate d'ombra» (fx/nuvole.js
  // proietta ogni scatola sul piano y=0 lungo il raggio), quindi qui basta
  // riportare il frammento sullo stesso piano — due moltiplicazioni, nessun
  // campionamento in più. Chi ci sta dentro è chi la nuvola vede coprire.
  float lanternaOmbra() {
    if ((uParti & 1) == 0) return 1.0;                // bisturi: ombre delle nuvole
    if (uOmbraNum == 0 || uOmbraForza <= 0.0) return 1.0;
    vec2 uvC = (vPosMondo.xz - uCieloInfo.xy) * uCieloInfo.z;
    if (uvC.x <= 0.0 || uvC.x >= 1.0 || uvC.y <= 0.0 || uvC.y >= 1.0) return 1.0;
    float quota = texture2D(uCielo, uvC).r;
    if (vPosMondo.y < quota - 0.35) return 1.0;      // al coperto: niente ombra
    vec2 uvO = (vPosMondo.xz - uOmbraSbieco * vPosMondo.y - uCieloInfo.xy) * uCieloInfo.z;
    if (uvO.x <= 0.0 || uvO.x >= 1.0 || uvO.y <= 0.0 || uvO.y >= 1.0) return 1.0;
    // DUE GRADINI, non una sfumatura: pieno dentro la sagoma, metà nell'alone.
    // È la stessa logica del cel shading di tutto il resto — l'ombra di una
    // nuvola alta venti unità non ha un bordo da rasoio, ma nemmeno una rampa.
    float m = texture2D(uOmbraMask, uvO).r;
    float dentro = m > 0.75 ? 1.0 : (m > 0.28 ? 0.5 : 0.0);
    return 1.0 - uOmbraForza * dentro;
  }

  uniform vec4 uPgPos[6];
  uniform int uPgNum;

  // L'OMBRA DEL FRAMMENTO (nuvole × personaggi), tenuta da parte da
  // GLSL_COMPOSIZIONE. Serve a chi somma luce PROPRIA dopo la composizione — cioè
  // alla schiuma dell'acqua — perché un additivo messo dopo l'ombra l'ombra non
  // la riceve: era misurabile, a mezzanotte il disco del gatto scuriva l'acqua
  // nuda del 18% e la schiuma accanto molto meno, e a emissiva alta spariva del
  // tutto (zero pixel cambiati). Una superficie su cui le ombre non si posano si
  // legge come una sorgente accesa, che è precisamente il rilievo del
  // committente sulla schiuma.
  float _ombraTot;

  // Ombra-cono dei personaggi (stile Minecraft Bedrock): un cono proiettato
  // in giù dai piedi che SCURISCE LE MESH che attraversa — si adagia sui bordi
  // dei blocchi invece di saltare al piano sotto, e si stringe con la profondità.
  float ombraPg() {
    float f = 1.0;
    if ((uParti & 2) == 0) return f;                  // bisturi: ombre dei personaggi
    for (int i = 0; i < 6; i++) {
      if (i >= uPgNum) break;
      vec4 o = uPgPos[i];
      float prof = o.y - vPosMondo.y;
      if (prof < -0.06 || prof > 6.0) continue;
      float raggio = o.w * (1.0 - prof * 0.10);
      if (raggio <= 0.02) continue;
      float d = distance(vPosMondo.xz, o.xz);
      if (d >= raggio) continue;
      // UN solo disco netto (le due bande concentriche non piacevano); il fade
      // con la profondità va a scatti, e sugli STESSI gradini delle luci-sfera
      // (BANDE_LUCE): sono i due metri di paragone che il committente ha dato
      // per la nettezza, e mandarli in giro con due quantizzazioni scollegate
      // era il modo di farli divergere al primo ritocco della costante.
      float fade = ceil((1.0 - prof / 6.0) * ${GBANDE}) / ${GBANDE};
      f = min(f, 1.0 - 0.45 * fade);
    }
    return f;
  }
`;

// IL GIORNO E LA NOTTE LI FA uAmbiente, punto. È il ciclo (fx/daynight.js) a
// chiamare impostaAmbiente() con il colore dell'ora, e le lampade si sommano
// sopra: dove non arriva nessuna sfera resta l'ambiente, che di notte è il blu
// e a mezzogiorno è quasi bianco. Un tentativo aveva sostituito tutto questo con
// due canali di luce cotti nei vertici (cielo e lume) più occlusione ambientale
// e ombreggiatura per direzione di faccia: bocciato in blocco.
// L'OMBRA DEL CIELO MOLTIPLICA SOLO L'AMBIENTE, non le lampade — ed è la
// differenza fra un'ombra e una macchia nera. Una lanterna accesa dentro l'ombra
// di un albero deve illuminare lo stesso: è luce sua, non luce del sole. Se il
// fattore moltiplicasse tutta la somma, di notte una pozza di lampione dentro
// l'ombra della luna si spegnerebbe, che è il contrario di quello che si vede.
//
// L'OMBRA NON È NERA, È DEL COLORE DEL CIELO, ed è la differenza fra un'ombra
// disegnata bene e una macchia di sporco. Fuori, all'ombra, non c'è meno luce e
// basta: c'è LUCE DIVERSA — quella del cielo, che è azzurra di giorno e blu
// notte di notte. Moltiplicare l'ambiente per un numero scuro sposta tutto verso
// il nero e appiattisce; moltiplicarlo per un COLORE (uOmbraFatt, che il ciclo
// giorno/notte ricava dal cielo dell'ora) scurisce E vira insieme. Il salto
// resta uno solo — la nettezza non c'entra col fatto che sia grigio o azzurro.
// ---- L'OCCHIO DI BUE --------------------------------------------------------
//
// «Voglio bucare tutto e vedere attraverso, con un bel effetto sfocato ai bordi.»
//
// TRE COSE SBAGLIATE NEL PRIMO TENTATIVO, tutte segnalate e tutte vere:
//   1. LO SCARTO A PUNTINI si vedeva, e faceva schifo. Era stato scelto per non
//      toccare la trasparenza; il prezzo era una retinatura, cioè l'opposto di
//      «bel effetto sfocato».
//   2. IL BUCO ARRIVAVA AL CIELO. Togliendo del tutto i frammenti si vedeva
//      quello che c'è dietro il muro — e dietro l'ultimo muro c'è il vuoto.
//   3. SI ACCENDEVA SEMPRE, anche per due alberi che non coprivano niente.
//
// COSA FA ADESSO. Non toglie niente: ABBASSA L'OPACITÀ di ciò che copre, e non
// oltre una soglia (FORO_MIN). Il muro resta un muro — più chiaro, attraversato
// dalla sagoma del gatto — e non si vede mai il cielo dove c'era la roccia.
// La dissolvenza è vera, continua, senza un solo puntino.
//
// E SI ACCENDE SOLO QUANDO SERVE: quanto aprire lo decide la CPU contando i
// blocchi che stanno davvero fra l'obiettivo e il gatto (main, `aggiornaForo`).
// Zero blocchi = spento del tutto, e non costa niente. Un albero non è un
// blocco: la fronda non fa scattare niente, un muro sì.
//
// PERCHÉ NON ROMPE L'ORDINE DI DISEGNO. Il materiale del mondo diventa
// trasparente ma tiene `depthWrite`: con alfa 1 — cioè ovunque tranne il
// cerchio — la fusione è un'operazione nulla e il risultato è identico a prima.
// Il cerchio è piccolo e i chunk sono ordinati per distanza: le sovrapposizioni
// dentro il cerchio si fondono due volte, che è esattamente quel che serve
// quando ci sono DUE muri davanti.
const FORO_MIN = 0.22;   // quanto resta VISIBILE al centro: mai zero, mai cielo

const GLSL_FORO = /* glsl */`
  // (centro.x, centro.y in PIXEL di schermo, raggio, larghezza del bordo)
  uniform vec4 uForo;
  // distanza camera→personaggio; 0 = occhio di bue spento (niente costo)
  uniform float uForoDist;
  // quanto aprire: 0 spento, 1 tutto aperto. Lo decide la CPU contando i
  // blocchi davanti — così due alberi non aprono niente e un muro sì.
  uniform float uForoForza;

  /** L'opacità che resta a questo frammento: 1 intatto, FORO_MIN al centro. */
  float velaOcchioDiBue() {
    if (uForoDist <= 0.0 || uForoForza <= 0.001) return 1.0;
    // (1) sta davanti al personaggio? il margine tiene fuori il personaggio
    // stesso e il terreno che gli sta immediatamente attorno
    float d = distance(vPosMondo, cameraPosition);
    if (d >= uForoDist - 0.9) return 1.0;
    // (2) dentro il cerchio, in coordinate di SCHERMO. smoothstep due volte:
    // il bordo così parte e finisce con derivata nulla, e non si vede l'attacco
    float r = length(gl_FragCoord.xy - uForo.xy);
    float t = 1.0 - smoothstep(uForo.z - uForo.w, uForo.z + uForo.w, r);
    t = t * t * (3.0 - 2.0 * t);
    // chi è più vicino all'obiettivo si apre di più: se no il muro attaccato
    // alla camera resta solido mentre quello dietro è già diventato vetro
    float vicinanza = clamp((uForoDist - d) / max(uForoDist * 0.5, 1.0), 0.35, 1.0);
    return mix(1.0, ${FORO_MIN.toFixed(2)}, t * vicinanza * uForoForza);
  }
`;

// L'ALFA VA SCRITTA DOPO `opaque_fragment`, che è il pezzo di three che compone
// gl_FragColor: scriverla prima vorrebbe dire vedersela sovrascrivere. Qui non
// si tocca nient'altro — solo il canale alfa, e solo dentro il cerchio.
const GLSL_VELA = /* glsl */`
gl_FragColor.a *= velaOcchioDiBue();
`;

const GLSL_COMPOSIZIONE = /* glsl */`
_ombraTot = 1.0;
if (uParti != 0) {
  _ombraTot = lanternaOmbra() * ombraPg();
  vec3 _amb = uAmbiente * mix(uOmbraFatt, vec3(1.0), ombraCielo());
  outgoingLight = outgoingLight * (_amb + lanternaAccumulo()) * _ombraTot;
}
`;

// Le due varianti del fragment (vedi SOGLIA_CIELO): si compongono una volta e
// si riusano, perché sono stringhe da decine di KB e la patch gira per ogni
// materiale che passa da patchLuci.
const _fragVarianti = new Map();
function glslFragmento(ingombro) {
  let s = _fragVarianti.get(ingombro);
  if (!s) {
    s = (GLSL_FRAGMENT + GLSL_FORO)
      .replace('__SOGLIA_LUME__', ingombro ? '0.5' : '0.31')
      .replace('__FURNI__', ingombro ? 'true' : 'false');
    _fragVarianti.set(ingombro, s);
  }
  return s;
}

function iniettaLanterna(shader, ingombro) {
  Object.assign(shader.uniforms, uniformi);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_VERTEX)
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPosMondo = (uMondoInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + glslFragmento(ingombro))
    .replace('#include <opaque_fragment>',
      GLSL_COMPOSIZIONE + '#include <opaque_fragment>\n' + GLSL_VELA);
}

/** Materiale unlit con luci-sfera + ombre delle luci pesanti.
 *  NON serve dichiarare niente per-mesh: l'ombra si legge dall'atlante in
 *  coordinate MONDO, quindi vale identica per i chunk del mesher, per il gatto,
 *  per la mano, per i mobili e per le creature. (Prima era una maschera di bit
 *  cotta in un attributo di vertice, e tutto ciò che non passava dal mesher
 *  andava sondato a mano una volta per frame: vedi scriviLuceEnte, che questa
 *  versione ha tolto insieme al suo corredo di geometrie da sganciare.) */
/** @param ingombro true se questo materiale È un furni: allora NÉ il sole NÉ le
 *  lampade gli arrivano dagli ingombri, ma solo dai muri (SOGLIA_CIELO e
 *  SOGLIA_LUME). Un furni sta DENTRO il proprio ingombro: senza questa
 *  distinzione si annerisce da solo, ed è il difetto più insidioso di tutto il
 *  sistema — se ne accorge chi guarda, non chi scrive. */
export function patchLuci(materiale, ingombro = false) {
  materiale.onBeforeCompile = (shader) => iniettaLanterna(shader, ingombro);
  // marca per il cache-key: materiali con patch diversa non condividono programma
  materiale.customProgramCacheKey = () => 'lanterna-luci-' + (ingombro ? 'furni' : 'mondo');
  return materiale;
}

// ---- acqua (riflessi + cascate + pioggia) -----------------------------------
// Il pelo è PULITO: niente texture disegnata sopra. Il wobble del riflesso e i
// filamenti delle cascate sono PROCEDURALI (somme di seni): nessuna forma
// riconoscibile, niente "cerchi". I cerchi restano solo dove hanno senso:
// gli anelli di pioggia che nascono e si allargano.

const GLSL_ACQUA_VERTEX = /* glsl */`
  attribute vec3 aAcqua;
  attribute vec2 aRiva;          // (distanza dalla sponda, apertura) — vedi mesher
  varying vec3 vAcqua;
  varying vec2 vRiva;
  varying vec4 vRiflessoUv;
  uniform mat4 uRiflessoMat;
  uniform float uTempo;
`;
const GLSL_ACQUA_FRAGMENT = /* glsl */`
  varying vec3 vAcqua;
  varying vec2 vRiva;
  varying vec4 vRiflessoUv;
  uniform sampler2D uRiflesso;
  uniform vec4 uImpatti[${IMPATTI_MAX}];
  uniform int uImpattiNum;
  uniform sampler2D uSchiumaRT;
  uniform vec4 uSchiumaRTInfo;
  uniform float uTempo;
  uniform float uPioggia;
  uniform float uRiflessoOn;
  uniform float uRiflessoForza;
  // dichiarata QUI perché serve al blocco iniettato su <opaque_fragment>, che in
  // GLSL viene molto più in basso: la dichiarazione deve precedere l'uso
  uniform float uSchiumaEmiss;
  // QUANTO BIANCO C'È SU QUESTO PIXEL D'ACQUA, ed è più della sola schiuma: ci
  // finiscono anche le strisce dello scivolo, le scie di corrente, gli anelli di
  // pioggia e i filamenti/frangia della cascata (vedi la variabile band, in
  // fondo a GLSL_ACQUA_COLORE). È voluto — sono tutti spuma, non cose diverse —
  // ma il nome dice bianco e non schiuma proprio per non far credere che
  // uSchiumaEmiss accenda solo le rive.
  float _biancoAcqua;

  float lanternaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value-noise morbido: la base di schiuma, wobble e scie (MAI ripetitivo)
  float lanternaRumore(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(lanternaHash(i), lanternaHash(i + vec2(1.0, 0.0)), f.x),
      mix(lanternaHash(i + vec2(0.0, 1.0)), lanternaHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // increspature di pioggia: anelli che nascono e si allargano su una griglia
  // pseudo-casuale (solo pixel d'acqua, solo quando piove)
  float anelliPioggia(vec2 p) {
    float somma = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 pk = p * 0.9 + float(k) * 17.31;
      vec2 cella = floor(pk);
      float h = fract(sin(dot(cella + float(k) * 3.7, vec2(127.1, 311.7))) * 43758.5453);
      float fase = fract(uTempo * (0.8 + 0.4 * h) + h * 7.0);
      vec2 centro = cella + 0.5 + (vec2(h, fract(h * 7.13)) - 0.5) * 0.7;
      float d = length(pk - centro);
      // ANELLO NETTO, non sfumato: step sul raggio (il cerchio ha uno spessore
      // vero, non una rampa) e lo spegnimento col tempo va A GRADINI come le
      // bande delle luci-sfera — con la LORO costante, non con un 3 scritto a
      // mano che poteva scollegarsi al primo ritocco. Con smoothstep +
      // (1.0 − fase) ogni anello era un alone grigio che sbiadiva, cioè l'unica
      // sfocatura in mezzo a uno schermo di tagli netti.
      // 0.035 è lo SPESSORE dell'anello in unità mondo, cioè poco più di mezzo
      // pixel di blocco (1 px = 1/16 = 0.0625): l'increspatura di una goccia è
      // un filo, e a spessore doppio gli anelli si saldavano fra loro appena la
      // pioggia si infittiva. Il raggio corre fino a 0.45 in una fase intera,
      // quindi il filo resta sottile per tutta la vita dell'anello.
      somma += step(abs(d - fase * 0.45), 0.035) * ceil((1.0 - fase) * ${GBANDE}) / ${GBANDE};
    }
    return min(somma, 1.0);
  }

  // ANELLO d'impatto, non disco: dove la colonna sbatte l'acqua si apre e la
  // schiuma corre in fuori — il centro, che è poi la colonna stessa, resta
  // acqua. Il raggio RESPIRA e il bordo è sfrangiato dal rumore: un cerchio
  // geometrico perfetto si riconosce subito come disegnato.
  // La QUOTA è la metà del lavoro: senza, ogni pelo d'acqua nel raggio
  // sbiancava a qualsiasi altezza (il canale in cima alla cascata per colpa
  // della pozza in fondo). La tolleranza sta SOTTO il blocco intero, e non è un
  // dettaglio: su una scalinata ogni gradino ha il suo impatto, e con una
  // tolleranza più larga del gradino ognuno tingeva anche i vicini — otto anelli
  // che si saldavano nella chiazza bianca vista sulle terrazze.
  //
  // I DUE ESTREMI DELLA RAMPA HANNO DUE PADRONI DIVERSI, e vanno letti così:
  //  · 1.0 (dove l'anello è ormai spento) è il GRADINO: più largo di così ogni
  //    salto di una scalinata tingerebbe anche il vicino;
  //  · 0.55 (dove è pieno) deve stare sopra il massimo dislivello POSSIBILE fra
  //    il pelo e il centro della sua cella, che è peloDi(0) = 7/16 = 0.4375 —
  //    il valore più alto che la formula del pelo sappia produrre. Era 0.45,
  //    cioè 0.0125 di margine: funzionava, ma bastava ritoccare di un pixel la
  //    quota del pelo per far sbiadire TUTTI gli anelli senza un segnale.
  //    A 0.55 il margine è il 25% e la rampa resta comunque dentro il gradino.
  //
  // Il rumore che sfrangia il bordo si campiona UNA VOLTA fuori dal ciclo: non
  // dipende dall'indice, e dentro era l'unica cosa cara — è ciò che rende
  // sostenibile alzare IMPATTI_MAX da 8 a 32.
  // MISURATO SUL CHROMEBOOK (2026-07-27): questa funzione costava 9,6 ms dei
  // 12,1 dell'acqua, cioè l'80%. Non era il ciclo: era il RUMORE, che stava
  // fuori e si calcolava per OGNI pixel d'acqua dello schermo appena esisteva
  // un impatto nel mondo — quattro seni a pixel per sfrangiare un anello che
  // quel pixel non incontrerà mai. (La nota storica qui sotto diceva che il
  // costo era trascurabile: era stata presa a 0 impatti, dove la funzione esce
  // alla prima riga.)
  //
  // Ora si paga solo dove serve, e i tagli sono ESATTI, non approssimazioni:
  //  · la quota taglia per prima con la soglia VERA (0.72, quella dello step):
  //    era dy < 1.0 e poi uno step, cioè si calcolavano seno e distanza anche
  //    per una fascia che sarebbe stata spenta comunque;
  //  · il rumore sposta la distanza al massimo di ±0.15 (sta in [0,1], scalato
  //    0.3 e centrato), quindi un pixel oltre raggio·0.18 + 0.15 dall'anello
  //    non può accendersi NEMMENO col rumore al valore peggiore: si scarta
  //    prima, e il rumore si calcola solo al primo anello che passa il filtro.
  float anelloImpatti(vec2 pXZ, float y) {
    float s = 0.0;
    if (uImpattiNum == 0) return s;
    float sfr = 0.0;
    bool haSfr = false;
    for (int i = 0; i < ${IMPATTI_MAX}; i++) {
      if (i >= uImpattiNum) break;
      vec4 im = uImpatti[i];
      float dy = abs(y - im.y);
      if (dy <= 0.72) {
        float rr = im.w * (1.0 + 0.10 * sin(uTempo * 2.6 + float(i) * 1.7));
        float spessore = im.w * 0.18;
        float dNudo = abs(distance(pXZ, im.xz) - rr);
        if (dNudo > spessore + 0.15) continue;   // fuori portata anche col rumore al peggio
        if (!haSfr) { sfr = (lanternaRumore(pXZ * 3.2 + uTempo * vec2(0.45, 0.3)) - 0.5) * 0.3; haSfr = true; }
        float d = abs(distance(pXZ, im.xz) - rr + sfr);      // distanza DALL'ANELLO
        // SOTTILE: a spessore 0.34·r l'anello copriva più area del disco che
        // sostituiva (una corona 0.69→1.41 batte un cerchio di raggio 1.05) e
        // restava un lenzuolo, solo con un buco in mezzo.
        // ANCHE LA QUOTA TAGLIA NETTO. La rampa 1.0÷0.55 sfumava l'anello in
        // verticale: 0.72 sta comodo fra i suoi due padroni — sopra il massimo
        // dislivello possibile fra pelo e centro cella (peloDi(0) = 0.4375) e
        // sotto il gradino di una cella, che è il limite da non superare.
        s = max(s, step(d, spessore));   // la quota l'ha già filtrata il dy <= 0.72 qui sopra
      }
    }
    return s;
  }
`;
// tipo faccia: 0 sorgente calma · 1 scorre · 2 lato cascata · 3 pelo in
// pendenza (scivolo) · 5 piatto
// Il pelo è PULITO: niente pattern disegnato sopra — solo riflessi (con wobble
// organico), anelli di pioggia e strisce tenui sulle cascate. Lo scorrimento
// lo raccontano i particellari (fx/particelle.js), non la texture.
//
// IL PELO È UNO SOLO, e questo è il punto della struttura qui sotto. I tipi 0
// (calmo), 1 (scorre) e 3 (in pendenza) sono tutti la SUPERFICIE dell'acqua
// vista da sopra: riflesso, schiuma di riva, silhouette di ciò che sta a mollo,
// anelli d'impatto e increspature di pioggia valgono per tutti e tre. Cambia
// solo il DISEGNO che ci corre sopra.
// Era il difetto: il ramo del tipo 3 — nato per rompere la lastra bianca sugli
// scivoli — conteneva SOLO le sue strisce, e tutto il resto viveva nel ramo del
// pelo piatto, che il tipo 3 non attraversava mai. Misurato sullo STESSO frame,
// scambiando solo il tipo nel buffer aAcqua della pozza: con tipo 0 accendere e
// spegnere il riflesso cambiava il 79.8% delle sonde (delta medio 17.67), con
// tipo 3 lo 0.0% (delta ESATTAMENTE 0); stessa storia per la pioggia. Il colore
// medio crollava da (167, 212, 232) a (135, 199, 220): a schermo una toppa
// opaca e senza schiuma in mezzo a una superficie riflettente.
const GLSL_ACQUA_COLORE = /* glsl */`
{
  float tipoA = vAcqua.z;
  float band = 0.0;
  _biancoAcqua = 0.0;
  // bisturi: bit 8 spento = acqua PIATTA (niente riflesso, onde, schiuma,
  // correnti). Serve a sapere quanto dei 30 ms del pass principale sia lei:
  // il resto dello shader del mondo è già stato assolto (la lanterna pesa
  // l'1,5 su 31), e l'acqua è l'unico fragment davvero complesso rimasto.
  bool pelo = (uParti & 8) != 0 && (tipoA < 1.5 || (tipoA > 2.5 && tipoA < 3.5));
  if (pelo) {
    float lontano = clamp(distance(cameraPosition, vPosMondo) / 32.0, 0.0, 1.0);

    // RIFLESSO: wobble a VALUE-NOISE (mai ripetitivo) che sfuma con la
    // distanza — da lontano lo specchio resta fermo, niente pattern
    if (uRiflessoOn > 0.5 && (uParti & 16) != 0) {
      vec4 ruv = vRiflessoUv;
      // L'ONDEGGIO SI SPEGNE DEL TUTTO A 32 UNITÀ, e allora oltre non si calcola.
      // Prima sfumava a (1 − lontano·0.85), cioè restava al 15% per tutto
      // l'orizzonte: due rumori per pixel per un'increspatura che a quella
      // distanza sposta lo specchio di meno di un pixel — e nella vista a diorama
      // l'acqua lontana è la fetta più grande dello schermo. Portando la sfumata a
      // (1 − lontano) l'ampiezza arriva a ZERO proprio dove si smette di
      // calcolarla: il salto non esiste per costruzione, e il taglio è esatto.
      if (lontano < 1.0) {
        vec2 pw = vPosMondo.xz * 0.6 + vAcqua.xy * uTempo * 0.4;
        vec2 w = vec2(lanternaRumore(pw + uTempo * 0.16), lanternaRumore(pw.yx - uTempo * 0.13)) - 0.5;
        ruv.xy += w * 0.035 * (1.0 - lontano) * ruv.w;
      }
      vec3 rifl = texture2DProj(uRiflesso, ruv).rgb;
      vec3 vistaDir = normalize(cameraPosition - vPosMondo);
      float fres = pow(1.0 - clamp(vistaDir.y, 0.0, 1.0), 1.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, rifl, (0.28 + 0.42 * fres) * uRiflessoForza);
    }

    // SCHIUMA = CARATTERISTICA DELLO SHADER, per tutto ciò che tocca l'acqua:
    //  · RIVE e blocchi: dal gradiente aRiva (0 al bordo coi solidi);
    //  · TUTTO IL RESTO (furni di qualsiasi forma, gatti, palle, NPC futuri):
    //    silhouette dall'alto della sola geometria che BUCA il pelo — la
    //    schiuma segue la forma vera, niente footprint quadrati.
    // IL RUMORE SI CALCOLA SOLO DOVE PUÒ CAMBIARE QUALCOSA, e non è una
    // approssimazione: frasta entra solo in dRiva, che serve solo se la
    // schiuma di riva può accendersi. Siccome frasta sta in [0,1], il termine
    // (frasta−0.5)·0.30 sta in [−0.15, +0.15]: con vRiva.x oltre 0.39 la soglia
    // 0.24 non è raggiungibile NEMMENO col rumore al minimo, e con l'apertura
    // sotto 0.50 lo step la spegne comunque. Fuori da quella fascia il valore
    // sarebbe stato buttato — ed è la maggioranza dei pixel di un lago.
    bool serveRiva = (uParti & 128) != 0 && vRiva.y >= 0.50 && vRiva.x < 0.39;
    float frasta = serveRiva ? lanternaRumore(vPosMondo.xz * 3.4 + uTempo * vec2(0.4, 0.3)) : 0.5;
    // silhouette VIVA: il punto di campionamento ONDEGGIA col tempo (il
    // contorno non sta mai fermo) e l'anello di dilatazione "respira"
    float sagoma = 0.0;
    if (uSchiumaRTInfo.w > 0.5 && (uParti & 32) != 0) {
      vec2 uvC = (vPosMondo.xz - uSchiumaRTInfo.xy) * uSchiumaRTInfo.z;
      if (uvC.x > 0.001 && uvC.x < 0.999 && uvC.y > 0.001 && uvC.y < 0.999) {
        // SETACCIO: un livello grosso della mipmap copre ~2 unità di mondo per
        // texel. Se lì attorno non c'è NIENTE, non ci sarà niente nemmeno con
        // l'ondeggio (±0.15u) e con l'anello di dilatazione (±0.4u), quindi si
        // salta tutto: due rumori e cinque letture risparmiate su ogni pixel di
        // mare aperto, che sono la stragrande maggioranza.
        if (textureLod(uSchiumaRT, uvC, 4.0).r > 0.002) {
          vec2 wob = (vec2(
            lanternaRumore(vPosMondo.xz * 1.9 + uTempo * vec2(0.55, 0.4)),
            lanternaRumore(vPosMondo.zx * 1.9 - uTempo * vec2(0.5, 0.35))) - 0.5) * 0.3;
          vec2 uvT = uvC + wob * uSchiumaRTInfo.z;
          float o = (0.32 + 0.08 * sin(uTempo * 2.3)) * uSchiumaRTInfo.z;
          sagoma = texture2D(uSchiumaRT, uvT).r;
          sagoma = max(sagoma, texture2D(uSchiumaRT, uvT + vec2(o, 0.0)).r);
          sagoma = max(sagoma, texture2D(uSchiumaRT, uvT - vec2(o, 0.0)).r);
          sagoma = max(sagoma, texture2D(uSchiumaRT, uvT + vec2(0.0, o)).r);
          sagoma = max(sagoma, texture2D(uSchiumaRT, uvT - vec2(0.0, o)).r);
        }
      }
    }
    float maschera = (uParti & 256) != 0 ? anelloImpatti(vPosMondo.xz, vPosMondo.y) : 0.0;   // impatti cascate
    // stessa regola: vivo sfrangia la SILHOUETTE, e dove la silhouette è zero
    // il prodotto è zero comunque. La sagoma copre una manciata di pixel attorno
    // a chi sta in acqua, il rumore lo pagava tutto il lago.
    float vivo = sagoma > 0.0 ? lanternaRumore(vPosMondo.xz * 4.6 + uTempo * vec2(1.2, 0.9)) : 0.0;
    // RIVA: UNA SOGLIA SOLA E NETTA, ed è il rilievo del committente ("la
    // schiuma ai bordi è troppo sfocata, voglio qualcosa di più nitido senza
    // sfocature, netto come l'ombra del player e le fake pointlight").
    // Qui c'erano DUE smoothstep in cascata — sulla distanza e sull'apertura —
    // cioè due rampe moltiplicate fra loro: misurato sulla pozza della cascata,
    // il bordo era una transizione di 153 px (2 celle) con 25 livelli di grigio
    // distinti, contro gli 0 px e i 3 livelli della banda di una luce-sfera
    // NELLO STESSO fotogramma. Era l'unica sfocatura di tutto lo schermo.
    //
    // QUANTO NETTO, misurato con la STESSA metrica sui tre fenomeni, ognuno
    // isolato per differenza di uniform (larghezza del fronte = run di variazioni
    // consecutive; 0 px intermedi = un solo salto fra due plateau piatti):
    //   schiuma di riva ..... 0.29 px intermedi medi (n=1493, mai oltre 1)
    //   bande luci-sfera .... 0.37 (n=2994)
    //   ombra del gatto ..... 0.28 (n=1079)
    // La schiuma taglia quindi esattamente come i due metri di paragone che il
    // committente ha dato — ed è l'unica delle tre a non avere NEMMENO un fronte
    // più largo di un pixel. Ma non è letteralmente zero, e nemmeno le luci-sfera
    // lo sono: scrivere «0 px» sarebbe una promessa che il primo che rimisura
    // smonta, perché su un bordo obliquo un pixel di mezzo tono ci finisce sempre.
    // ATTENZIONE: quei numeri valgono col TILT-SHIFT SPENTO. Il blur di
    // post-processing in renderer.js lo accende il tuner adattivo di qualità, e
    // quando è acceso sfoca allo stesso modo il bordo della schiuma, le bande
    // delle sfere e il disco dell'ombra — cioè tutte e tre le misure insieme.
    //
    // LA BANDA SI ASSOTTIGLIA PER COPERTURA, NON PER OPACITÀ, e questo è il
    // punto: ogni pixel è schiuma piena o acqua, mai una via di mezzo, e a
    // sfrangiare il bordo è il rumore dentro la distanza. Il risultato è
    // speckle a taglio vivo — la stessa idea del step(0.72, …) di prima della
    // regressione, ma sui valori nuovi del mesher (che sono migliori: una
    // distanza vera invece di un 0/1, e l'apertura che i canali li riconosce).
    // L'ampiezza 0.44 è metà banda per lato: alla sponda (distanza 0.104) la
    // schiuma è quasi piena, a una cella dentro (0.541) è già finita.
    //
    // Le soglie stanno sui valori VERI prodotti dal mesher, non a occhio.
    // Distanza: le uniche tre distinte sono 0.104 (angolo sulla sponda), 0.541
    // (angolo una cella dentro) e 1 — coerenti col calcolo geometrico, perché
    // sqrt(0.5)−0.5 = 0.2071 e sqrt(2.5)−0.5 = 1.0811, entrambe diviso 2.
    // BANDA DI RIVA PIÙ STRETTA — è il rilievo del committente: su pozze piccole
    // la vecchia fascia (~0.37 celle da OGNI sponda, soglia 0.30) copriva il 43%
    // di un 3×3 e si leggeva come "vassoio bianco col centro blu". Qui è un TRIM
    // sottile (~0.24 celle): il centro resta azzurro anche su vasche piccole.
    //
    // PERCHÉ NON SCALA COL LATO DELLA POZZA, e vale scriverlo perché è il primo
    // istinto (e il brief lo suggeriva): l'unico segnale di "grandezza" che il
    // mesher fornisce è vRiva.y (apertura), ma sulla RIVA quel numero vale ~0.6
    // per QUALSIASI specchio ≥3 — la finestra 5×5 di rivaCella non vede più di 2
    // celle oltre la sponda, quindi un 3×3 e un lago hanno la stessa apertura
    // dov'è la schiuma. Distinguerli davvero vorrebbe dire allargare quella
    // finestra (le 25 letture per cella tornerebbero 100: c'è un test apposta che
    // le blocca) per un guadagno che un trim uniforme e netto già copre — una
    // pozza piccola con un filo di schiuma si legge come acqua, non come vassoio.
    // Il taglio resta UN solo step netto (nessuno zigzag del tentativo "a cresta").
    //
    // RUMORE 0.30 (era 0.44): con la banda stretta un rumore largo la spezzava in
    // chiazze slegate (buchi nel filo di schiuma); a 0.30 il bordo resta sfrangiato
    // e organico ma il filo non si interrompe.
    float dRiva = vRiva.x + (frasta - 0.5) * 0.30;
    // L'APERTURA È IL GUARDIANO DEI CANALI STRETTI e resta, ma anche lei taglia
    // netto: è un interruttore 0/1, quindi non può rimettere in mezzo nessuna
    // sfumatura — il prodotto di due step vale 0 oppure 1, mai 0.37.
    // In un canale largo una cella la sponda è addosso a TUTTI e quattro gli
    // angoli: la distanza vale ~0 su tutta la cella e qualunque soglia
    // dipingerebbe il canale di bianco pieno (il "foglio bianco" già visto).
    // I valori sono pochi e noti (vedi rivaCella): largo 1 = 0.20, largo 2 =
    // 0.40, largo 3 = 0.60, e uno specchio d'acqua non scende MAI sotto 0.60.
    // La soglia a 0.50 fa passare da 3 celle in su: sotto, la cella è tutta
    // sponda e la schiuma sarebbe una lastra, non un bordo.
    // SOGLIA 0.24 (era 0.30): la banda ora sta fra 0.104 (angolo sulla sponda,
    // sempre schiuma) e 0.541 (angolo una cella dentro, mai) — cade più vicina
    // alla sponda, quindi un filo e non una fascia. COSA COPRE, misurato a schermo
    // (vista dall'alto, giorno) come frazione di schiuma sui pixel d'acqua della
    // vasca, prima → dopo:
    //   3×3 ..... 37.6% → 24.6%  (il "vassoio bianco" diventa un bordo azzurrato)
    //   5×5 ..... 17.8% → 11.7%
    //   12×12 ... 11.6% →  6.0%
    // Il centro resta azzurro da N=3 in su; a N≤2 l'apertura (step 0.50) spegne
    // tutto. Chi volesse ritoccare: questa soglia + il rumore 0.30 sopra per la
    // larghezza, lo step(0.50) per la soglia minima di specchio che porta schiuma.
    float schiumaRiva = step(dRiva, 0.24) * step(0.50, vRiva.y);
    // silhouette e SCIA (il RT sfuma la storia): chiazze che vivono col tempo
    float schiumaSag = step(0.62, sagoma * (0.55 + 0.55 * vivo));
    float schiuma = max(max(schiumaRiva, maschera), schiumaSag);
    band = max(band, schiuma);
    diffuseColor.a = min(1.0, diffuseColor.a + schiuma * 0.55);

    // ---- DISEGNO DELLA SUPERFICIE: l'unica cosa che cambia fra i tre peli ----
    if (tipoA > 2.5) {
      // SCIVOLO: il pelo IN PENDENZA, e serve un disegno suo perché non somiglia
      // a nessuno degli altri due. Non è un lago: il rumore campionato in sola XZ
      // si stira lungo la linea di massima pendenza e diventa una lastra bianca
      // che non si spezza mai (era il difetto). Ma non è nemmeno la parete di una
      // cascata: quelle righe stanno a quota COSTANTE, e su un piano inclinato le
      // linee di livello sono rette — gradino dopo gradino esce lo stesso gallone,
      // un motivo riconoscibile che è esattamente ciò che questo shader evita.
      // Qui le strisce corrono LUNGO LA CORRENTE (la direzione è già in vAcqua.xy)
      // e la quota entra nel dominio del rumore: è la Y che rompe la ripetizione.
      vec2 dir = vAcqua.xy;
      if (dot(dir, dir) < 0.01) dir = vec2(0.7071, 0.7071);   // pendenza senza corrente
      vec2 pf = vPosMondo.xz - dir * uTempo * 1.5;
      float lungo = dot(pf, dir) + vPosMondo.y * 1.15;
      float trasv = dot(pf, vec2(-dir.y, dir.x));
      // step e non smoothstep: le strisce sono nastri a bordo vivo, non aloni.
      // 0.75 è il CENTRO della vecchia rampa 0.60÷0.90 — stessa regola di filo e
      // frangia più sotto: prendendo la mediana la quantità di bianco resta
      // quella già tarata a schermo e a cambiare è solo il contorno.
      float strisce = step(0.75, lanternaRumore(vec2(lungo * 1.05, trasv * 3.0))) * 0.7;
      band = max(band, strisce);
      diffuseColor.a = min(1.0, diffuseColor.a + strisce * 0.25);
    } else if (tipoA >= 0.5 && (uParti & 64) != 0) {
      // CORRENTE: scie allungate lungo il flusso, trascinate dalla corrente
      vec2 pf = vPosMondo.xz - vAcqua.xy * uTempo * 1.2;
      float lungoF = dot(pf, vAcqua.xy);
      float traverso = dot(pf, vec2(-vAcqua.y, vAcqua.x));
      float scia = lanternaRumore(vec2(lungoF * 0.9, traverso * 3.5));
      // 0.77 = centro della vecchia rampa 0.68÷0.86, come le strisce qui sopra
      band = max(band, step(0.77, scia) * 0.3);
    } else if ((uParti & 64) != 0 && lontano < 0.85) {
      // PELO FERMO: era l'UNICO senza niente sopra — colore e riflesso e basta —
      // e a schermo si leggeva come una lastra di vetro. Gli altri due peli hanno
      // il loro disegno (strisce sullo scivolo, scie nella corrente), questo no.
      //
      // Qui i nastri non scorrono lungo una direzione — non ce n'è una — ma
      // vanno alla DERIVA piano, e sono pochi e sottili: uno specchio d'acqua
      // fermo luccica a tratti, non ovunque. Soglia alta (0.86) e taglio netto,
      // come tutto il resto del pelo: nastri a bordo vivo, non aloni.
      //
      // SI SPENGONO CON LA DISTANZA come gli anelli di pioggia e per lo stesso
      // motivo: sotto il pixel un nastro sottile non è più un nastro, è
      // sfarfallio. La sfumata arriva a zero dove si smette di calcolarlo,
      // quindi il taglio non si vede.
      vec2 pl = vPosMondo.xz * 0.55 + vec2(uTempo * 0.050, uTempo * 0.035);
      float luccio = lanternaRumore(vec2(pl.x + pl.y * 0.35, pl.y * 2.6));
      band = max(band, step(0.86, luccio) * (1.0 - lontano / 0.85) * 0.5);
    }

    // PIOGGIA: anelli bianchi sul pelo, e SOLO DA VICINO. Il filo di un anello è
    // spesso 0.035 unità di mondo; con questo campo visivo, oltre una ventina di
    // unità quel filo sta sotto il pixel — cioè non si vede più come anello, si
    // vede come sfarfallio. Sopra lontano 0.7 (circa 22 unità) si smette di
    // calcolarlo: due seni per pixel d'acqua risparmiati su tutto l'orizzonte,
    // che è la fetta più grande. Misurato sul telefono col banco standard: il
    // temporale era la condizione PIÙ CARA di tutte (+6,5 ms a frame).
    if (uPioggia > 0.01 && lontano < 0.7) band = max(band, anelliPioggia(vPosMondo.xz) * uPioggia);
  } else if ((uParti & 8) != 0 && tipoA < 2.5) {
    // CASCATA / acqua CHE SCORRE in diagonale: NON una lastra bianca — resta
    // azzurra, con filamenti bianchi SOTTILI che corrono in giù (soglia alta:
    // prima step(0.35) copriva i 2/3 della faccia → tutta bianca)
    float colonna = lanternaRumore(vec2((vPosMondo.x + vPosMondo.z) * 1.9, floor(vPosMondo.y * 0.6)));
    float scorri = sin(vPosMondo.y * 4.8 + uTempo * 5.4 + colonna * 9.0);
    // FILAMENTI A TAGLIO VIVO: le due rampe qui sfumavano i bordi dei filamenti
    // e della frangia — le soglie sono al centro delle rampe di prima, così la
    // quantità di bianco resta quella tarata ma il contorno diventa netto.
    float filo = step(0.84, scorri) * 0.7;
    // sottile frangia al ciglio (dove trabocca), non su tutta l'altezza
    float frangia = step(0.90, lanternaRumore(vPosMondo.xz * 3.1) * 0.4 + fract(-vPosMondo.y) * 0.6) * 0.6;
    band = max(filo, frangia);
    diffuseColor.a = min(1.0, diffuseColor.a + band * 0.25);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), band);
  // TUTTO il bianco di questo pixel, schiuma di riva compresa: è quello che
  // uSchiumaEmiss dosa (vedi la dichiarazione di _biancoAcqua).
  _biancoAcqua = band;
}
`;

export function patchAcqua(materiale) {
  materiale.onBeforeCompile = (shader) => {
    iniettaLanterna(shader, false);    // l'acqua riceve l'ombra di tutto, alberi compresi
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_ACQUA_VERTEX)
      .replace('#include <begin_vertex>',
        `#include <begin_vertex>
vAcqua = aAcqua;
vRiva = aRiva;   // (distanza dalla sponda, apertura)
// ONDE: il pelo respira (3 seni mischiati a frequenze scollegate — niente
// pattern) e le facce piatte smettono di leggersi come lastre rettangolari.
//
// NESSUNA ECCEZIONE, e la ragione è che lo scarto dipende SOLO da x e z: due
// vertici nello stesso punto ricevono per forza lo stesso spostamento, quindi
// finché lo prendono TUTTI non può aprirsi una cucitura da nessuna parte. È un
// taglio verticale dell'intero corpo d'acqua, non un'increspatura di una faccia
// sola. Escluderne una classe è invece precisamente ciò che le apre: gli angoli
// delle facce vicine COINCIDONO per costruzione (vedi quotaAngolo nel mesher),
// e uno che si alza mentre l'altro resta giù è una fessura, per giunta ANIMATA.
// MISURATO sulla stessa scalinata allagata (493 celle d'acqua, 888 posizioni di
// vertice distinte), contando le posizioni condivise fra una faccia che si muove
// e una che sta ferma:
//   · escludendo tipo 2 e 3 (com'era) ......... 301 cuciture
//   · escludendo solo il tipo 2 ................ 189
//   · senza esclusioni (questa versione) ......... 0
// Il tipo 3 era la regressione segnalata (fino a 0.0531 unità di scarto, circa
// un pixel di blocco, che pulsava nel tempo); il tipo 2 portava le altre.
transformed.y += (sin(transformed.x * 0.9 + uTempo * 1.25)
                + sin(transformed.z * 1.15 - uTempo * 1.05)
                + sin((transformed.x + transformed.z) * 0.55 + uTempo * 0.8)) * 0.022;
vRiflessoUv = uRiflessoMat * vec4((modelMatrix * vec4(transformed, 1.0)).xyz, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_ACQUA_FRAGMENT)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_ACQUA_COLORE)
      // UN FILO di luce propria, non una lampada. L'additivo serve ancora — senza,
      // il bianco verrebbe moltiplicato per l'ambiente scuro e di notte
      // diventerebbe grigio-blu come l'acqua, cioè invisibile — ma la dose adesso
      // si regola da uSchiumaEmiss invece di essere murata a 0.85, che clampava
      // la schiuma a 255 a ogni ora del giorno.
      //
      // × _ombraTot, E NON È UN DETTAGLIO: questa riga viene DOPO la composizione,
      // cioè dopo che ombra delle nuvole e ombra del gatto hanno già moltiplicato
      // outgoingLight. Sommare qui un termine che quelle ombre non hanno visto
      // vuol dire schiarire di nuovo ciò che era appena stato scurito, e a dose
      // alta l'ombra sulla schiuma spariva del tutto. Moltiplicandolo per la
      // stessa ombra, il filo di luce si spegne dove si spegne tutto il resto.
      .replace('#include <opaque_fragment>',
        'outgoingLight += vec3(_biancoAcqua * uSchiumaEmiss * _ombraTot);\n#include <opaque_fragment>');
  };
  materiale.customProgramCacheKey = () => 'lanterna-acqua';
  return materiale;
}

/** IL GIORNO E LA NOTTE SONO QUESTO, e basta questo: il ciclo (daynight.js)
 *  chiama qui a ogni frame col colore dell'ora, le lampade si sommano sopra e
 *  LE MESH NON SI RICOSTRUISCONO MAI — cambia un solo numero. */
export function impostaAmbiente(colore) {
  uniformi.uAmbiente.value.copy(colore);
}

/** Interruttore dell'occlusione (Impostazioni). Spenta = le luci-sfera tornano
 *  ad attraversare i muri, cioè esattamente com'erano prima della maschera.
 *  (Si chiamava impostaLuceCotta: il nome veniva dal modello a due canali cotti
 *  nei vertici, che non esiste più — qui si cuoce solo una maschera di bit.) */
export function impostaOcclusione(attiva) {
  uniformi.uOcclusione.value = attiva ? 1 : 0;
}

/** Le uniform condivise: per ispezionarle e tararle dal vivo (debug/console). */
export function uniformiCondivise() { return uniformi; }

/** Il colore ambiente corrente (per chi si tinge a mano, es. le nuvole). */
export function ambienteAttuale() { return uniformi.uAmbiente.value; }

// ---- registro delle sorgenti ----------------------------------------------
//
// DUE CLASSI DI LUCE, ED È UNA PROPRIETÀ DICHIARATA, non dedotta da dove sta la
// sfera o da chi l'ha creata. Il committente l'ha chiesta così, e la ragione è
// che le due costano in modo radicalmente diverso:
//
//  · PESANTE (ombra: true) — fa ombra e non passa i muri. Non paga NIENTE in
//    CPU: paga a schermo, camminando la griglia dei voxel dalla lampada al
//    frammento (ombraVoxel), e solo dentro la sua sfera. Sono i lampioni e i
//    blocchi luminosi. MUOVERLA È GRATIS quanto muovere una leggera — l'ombra si
//    ricalcola per frammento a ogni fotogramma, non c'è niente di cotto da
//    invalidare. (Fino alla riscrittura pagava invece una mappa d'ombra cotta in
//    CPU e una piastrella in un atlante da 48, e spostarla voleva dire ricuocere.)
//  · LEGGERA (ombra: false) — si muove libera ogni frame, NON fa ombra,
//    trapassa i muri. Costa esattamente quanto una fake pointlight di prima:
//    zero lavoro in CPU quando si sposta (basta scriverle la posizione, la legge
//    aggiornaLuci) e nessun lavoro d'ombra nello shader. Sono i fuochi fatui,
//    gli oggetti che brillano, gli effetti.
//
// IL DEFAULT È LEGGERA di proposito: chi si dimentica di dichiarare finisce
// nella classe che non costa niente. Una luce che pesa dev'essere una scelta
// scritta, non una svista.

const sorgenti = new Set();

/**
 * Registra una sfera di luce. Ritorna l'handle
 * {pos, raggio, colore, intensita, attiva, ombra}.
 * Tutti i campi si possono cambiare dal vivo; per `pos` c'è spostaLuce, che è
 * la stessa cosa ma dice in faccia quanto costa su una luce pesante.
 */
export function creaLuce({ pos = new THREE.Vector3(), raggio = 4, colore = 0xffd889, intensita = 1, attiva = true, ombra = false } = {}) {
  const luce = { pos: pos.clone(), raggio, colore: new THREE.Color(colore), intensita, attiva, ombra: !!ombra };
  sorgenti.add(luce);
  return luce;
}

/** Luce PESANTE: ferma, con ombra. Chi la crea si prende anche il dovere di
 *  farla conoscere alla griglia (i blocchi e i furni passano dal mesher). */
export function creaLucePesante(opz = {}) { return creaLuce({ ...opz, ombra: true }); }

/** Luce LEGGERA: mobile, senza ombra. È l'API per i fuochi fatui e gli effetti —
 *  crea, sposta quanto vuoi, togli. */
export function creaLuceLeggera(opz = {}) { return creaLuce({ ...opz, ombra: false }); }

/**
 * Sposta una sorgente. Su una LEGGERA è una scrittura di tre float e basta:
 * nessun ricalcolo, nessun remesh, si può fare a ogni frame per cinquanta luci
 * senza toccare la CPU. Su una PESANTE la posizione entra invece nella mappa
 * d'ombra, che va ricotta: il mesher se ne accorge da solo, ma è lavoro vero e
 * non va fatto per frame — se una luce deve muoversi, dichiarala leggera.
 */
export function spostaLuce(luce, x, y, z) {
  if (!luce) return;
  luce.pos.set(x, y, z);
}

export function rimuoviLuce(luce) { sorgenti.delete(luce); }

/** Per il menu di debug: elenco sorgenti e contatori. */
export function elencoLuci() { return [...sorgenti]; }
export function statLuci() {
  let attive = 0, pesanti = 0;
  for (const l of sorgenti) {
    if (!l.attiva || l.intensita <= 0) continue;
    attive++;
    if (l.ombra) pesanti++;
  }
  return {
    totali: sorgenti.size, attive, pesanti,
    inviate: uniformi.uLuciNum.value, conOmbra: uniformi.uOmbreNumPesanti.value,
    // quante ne sono rimaste FUORI dal tetto e quante si stanno congedando: il
    // tetto va VISTO, come per gli anelli d'impatto e per le piastrelle d'ombra
    escluse: Math.max(0, attive - uniformi.uLuciNum.value),
    sfumate: _sfumate,
  };
}

const _ordinabili = [];

/**
 * LA FASCIA DI CONGEDO, in frazione della distanza di taglio.
 *
 * IL DIFETTO CHE TOGLIE. Quando le sorgenti sono piu' di LUCI_MAX si mandano
 * allo shader le piu' vicine e le altre spariscono — di colpo, a piena
 * intensita'. Camminando fra trenta lampade la venticinquesima si ACCENDE tutta
 * insieme appena scavalca la ventiquattresima, e con uno sciame di fuochi fatui
 * in volo (che si scambiano di posto in classifica di continuo) diventa un
 * tremolio costante ai bordi del campo. E' lo stesso difetto che gli anelli
 * d'impatto avevano ed e' stato curato con IMPATTI_FASCIA — la' congelando
 * l'insieme, qui con una dissolvenza, perche' una POZZA DI LUCE che compare e
 * scompare si vede molto piu' di un anello di schiuma.
 *
 * COME. Le ultime della classifica si spengono man mano che si avvicinano al
 * taglio: chi sta esattamente sul confine vale gia' zero, quindi il momento in
 * cui entra e esce dall'elenco non si vede per costruzione. Non c'e' nessuna
 * soglia da tarare e nessuno stato da tenere: e' una funzione continua delle
 * distanze, che sono continue.
 *
 * FRAZIONE E NON CELLE: legata alla distanza di taglio, la dissolvenza vale
 * uguale in un mondo largo e in uno sciame stretto, e lascia sempre l'82% della
 * portata a piena luce. Un valore in celle, su uno sciame tutto raccolto in
 * dieci celle, avrebbe smorzato l'intero sciame.
 *
 * QUANDO NON FA NIENTE, ed e' la meta' del suo valore: se le sorgenti attive
 * sono al massimo LUCI_MAX non c'e' nessun taglio, quindi nessuna dissolvenza.
 * L'aspetto di una lampada sola — e di qualunque scena sotto il tetto — non
 * cambia di un pixel.
 */
const FASCIA_TAGLIO = 0.18;
let _sfumate = 0;

/** Quante luci possono proiettare OMBRA nello stesso frame: è un budget, non un
 *  limite tecnico. Lo muove la scala di qualità (impostaMaxOmbre). */
let MAX_OMBRE = 6;
export function impostaMaxOmbre(n) { MAX_OMBRE = Math.max(0, n | 0); }
export function maxOmbre() { return MAX_OMBRE; }

/**
 * L'OMBRA DEL CIELO: chi la chiama è il ciclo giorno/notte (direzione e forza) e
 * la scala di qualità (i passi). Tenerli separati è voluto: l'ora del giorno
 * decide COME appare, il dispositivo decide QUANTO lontano si guarda.
 * @param dir  direzione VERSO l'astro (non serve normalizzata)
 * @param forza 0..1, INTERRUTTORE: a zero lo shader non fa niente del tutto
 * @param fatt  colore per cui si moltiplica l'ambiente dentro l'ombra (opzionale)
 * @param k    quanto scurisce l'astro adesso (0..0.85): serve a chi ha una forza
 *             propria da mettere in scala con l'ora — vedi forzaAstro()
 */
export function impostaOmbraCielo(dir, forza, fatt, k) {
  if (dir) uniformi.uSoleDir.value.copy(dir).normalize();
  if (forza !== undefined) uniformi.uSoleForza.value = Math.max(0, Math.min(1, forza));
  if (fatt) uniformi.uOmbraFatt.value.copy(fatt);
  if (k !== undefined) _astroK = Math.max(0, k);
  // LO SBIECO SI TAGLIA, e non è pignoleria: sull'orizzonte dir.y tende a zero e
  // il rapporto esplode (una nuvola a quota 20 finirebbe a centinaia di unità,
  // cioè fuori dal dominio della maschera, cioè sparita di colpo). Oltre questo
  // taglio l'astro è così basso che la sua ombra vale quasi zero comunque.
  const d = uniformi.uSoleDir.value;
  const s = Math.min(SBIECO_MAX, Math.hypot(d.x, d.z) / Math.max(d.y, 1e-3));
  const oriz = Math.hypot(d.x, d.z) || 1;
  uniformi.uOmbraSbieco.value.set(d.x / oriz * s, d.z / oriz * s);
}
const SBIECO_MAX = 2.5;
export function impostaPassiCielo(n) { uniformi.uSolePassi.value = Math.max(0, Math.min(SOLE_RAGGIO_MAX, n | 0)); }
export function passiCielo() { return uniformi.uSolePassi.value; }

/** Rampa liscia in [0,1]: agli estremi la derivata e' nulla, quindi il congedo
 *  non ha lo scalino che una rampa lineare lascia proprio dove si nota di piu'. */
function _liscia(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

// (qui viveva _tasselloDiLuce, il ponte fra la sfera disegnata e la piastrella
// cotta nell'atlante: serviva perché ogni lampada pesante aveva una mappa
// d'ombra TUTTA SUA, con un tetto di 48 e un'assegnazione da tenere stabile fra
// un frame e l'altro. Col cammino per-frammento la lampada non possiede più
// niente — l'ombra la calcola lo shader sulla griglia dei muri, che è una sola
// per tutti — quindi la domanda «quale piastrella è la tua?» non esiste più, e
// con lei sono spariti il risolutore, il suo collegamento da main.js e il tetto.)

/** Da chiamare una volta per frame: sceglie le LUCI_MAX più vicine al fuoco (player). */
export function aggiornaLuci(fuoco) {
  _ordinabili.length = 0;
  for (const l of sorgenti) {
    if (!l.attiva || l.intensita <= 0) continue;
    _ordinabili.push(l);
  }
  // dTaglio = distanza della PRIMA ESCLUSA. Finche' ci stanno tutte non c'e'
  // taglio e la dissolvenza non esiste (Infinity ⇒ fattore 1 per tutte).
  let dTaglio = Infinity;
  if (_ordinabili.length > LUCI_MAX) {
    _ordinabili.sort((a, b) => a.pos.distanceToSquared(fuoco) - b.pos.distanceToSquared(fuoco));
    dTaglio = Math.sqrt(_ordinabili[LUCI_MAX].pos.distanceToSquared(fuoco));
    _ordinabili.length = LUCI_MAX;
  }
  // sotto questa distanza si e' a piena luce; sopra si sfuma fino a zero sul taglio
  const dPiena = dTaglio === Infinity ? Infinity : dTaglio * (1 - FASCIA_TAGLIO);
  const banda = dTaglio - dPiena;
  const classe = uniformi.uLuciOmbra.value;
  let pesanti = 0;
  _sfumate = 0;
  // BUDGET DELLE OMBRE. Ogni luce PESANTE fa camminare un raggio nella griglia
  // dei solidi PER OGNI PIXEL dentro la sua sfera: il costo cresce con quante
  // sono, e cresce in fretta. Misurato col banco standard sul Chromebook: 24
  // lampade con ombra costano +17,6 ms, cioè circa 0,73 ms l'una — mentre otto
  // lampioni ne costano 7,2. E il mondo del committente ne ha 56.
  // Le più VICINE tengono l'ombra, le altre restano accese ma smettono di
  // proiettare: da lontano una pozza di luce si legge, il bordo dell'ombra
  // dentro quella pozza no. Le luci sono già ordinate per distanza qui sopra
  // quando sono più del tetto; se sono poche non c'è niente da tagliare.
  if (_ordinabili.length > MAX_OMBRE) {
    _ordinabili.sort((a, b) => a.pos.distanceToSquared(fuoco) - b.pos.distanceToSquared(fuoco));
  }
  for (let i = 0; i < _ordinabili.length; i++) {
    const l = _ordinabili[i];
    const conOmbra = l.ombra && pesanti < MAX_OMBRE;
    let k = 1;
    if (banda > 1e-6) {
      const d = l.pos.distanceTo(fuoco);
      if (d > dPiena) { k = _liscia((dTaglio - d) / banda); _sfumate++; }
    }
    uniformi.uLuciPosRaggio.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.raggio);
    uniformi.uLuciColore.value[i].set(l.colore.r, l.colore.g, l.colore.b, l.intensita * k);
    // LA CLASSE È DICHIARATA E BASTA, ed è metà del senso delle luci leggere:
    // non c'è niente da chiedere a nessuno, nessun mesher da svegliare, nessuna
    // risorsa da assegnare. Cinquanta fuochi fatui in volo costano cinquanta
    // scritture di zero.
    classe[i] = conOmbra ? 1 : 0;
    if (conOmbra) pesanti++;
  }
  uniformi.uLuciNum.value = _ordinabili.length;
  // L'EARLY-OUT DELLO SHADER: a zero il lavoro d'ombra non si fa proprio.
  // Contarle QUI e non nello shader è ciò che rende vero "se non ci sono luci
  // pesanti in vista, l'ombra costa zero" — un ciclo che le cercasse da solo
  // pagherebbe comunque il giro.
  uniformi.uOmbreNumPesanti.value = pesanti;
}

// ---- fabbriche di materiali -----------------------------------------------
// Condivisi: tutti i chunk usano le STESSE due istanze (un solo programma GPU).

let _matMondo = null, _matMondoVelo = null, _veloAcceso = false;
export function materialeMondo() {
  // DUE MATERIALI, NON UNO TRASPARENTE SEMPRE. Il `transparent` serve solo
  // all'occhio di bue, ma pagarlo di continuo costa caro davvero: un materiale
  // trasparente esce dal passo opaco, quindi si perde l'ordinamento
  // DAVANTI-DIETRO e con lui l'early-z — su un gioco fill-rate bound come
  // questo vuol dire disegnare più volte gli stessi pixel per niente.
  // Qui il mondo è OPACO di suo, e si passa al gemello trasparente solo nei
  // frame in cui il buco è davvero aperto (vedi `mondoVelato`). Scambiare il
  // riferimento a un materiale già compilato non ricompila niente: la stangata
  // sarebbe cambiare `transparent` a caldo sullo STESSO materiale.
  if (!_matMondo) {
    _matMondo = patchLuci(new THREE.MeshBasicMaterial({ vertexColors: true }));
    _matMondoVelo = patchLuci(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: true,
    }));
  }
  return _veloAcceso ? _matMondoVelo : _matMondo;
}

let _matAcqua = null;
export function materialeAcqua() {
  if (!_matAcqua) {
    _matAcqua = patchAcqua(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
    }));
  }
  return _matAcqua;
}

/** Materiali dei furni con texture: le stagioni li ritingono (vedi stagioni.js). */
export const materialiConMappa = new Set();

/** Converte un materiale qualsiasi (es. dai FBX) in unlit patchato, preservando
 *  mappa e colore. Da qui passano i MODELLI (furni e creature), cioè le cose che
 *  hanno un ingombro nella griglia: ricevono l'ombra dei muri, non quella degli
 *  ingombri — altrimenti l'albero si annerirebbe dentro il proprio (SOGLIA_CIELO). */
export function convertiUnlit(sorgente, geometria) {
  const mappa = sorgente && sorgente.map ? sorgente.map : null;
  if (mappa) {
    mappa.magFilter = THREE.NearestFilter;
    mappa.minFilter = THREE.NearestFilter;
    mappa.generateMipmaps = false;
    mappa.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshBasicMaterial({
    map: mappa,
    color: sorgente && sorgente.color ? sorgente.color.clone() : new THREE.Color(0xffffff),
    vertexColors: !!(geometria && geometria.attributes && geometria.attributes.color),
  });
  if (mappa) {
    m.userData.mapOriginale = mappa;
    materialiConMappa.add(m);
  }
  return patchLuci(m, true);
}
