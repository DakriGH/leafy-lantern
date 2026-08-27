// LO ZOO DELLE PROVE — un mondo solo dove si guarda TUTTO quello che questo
// motore sa fare, sempre identico, su qualunque dispositivo.
//
// PERCHE' ESISTE (committente, 26/08/2026): «creami una stanza dove testo tutte
// queste cose, un zoo di test grandissimo, cosi' lo testo su Pages da
// dispositivi diversi anche io». Serve a DUE cose insieme, e sono due mestieri
// diversi che qui devono convivere:
//   · a lui per GIUDICARE a occhio, dal telefono e dal Chromebook;
//   · a noi per MISURARE — cioe' confrontare due schermate a distanza di giorni
//     e poter dire che la differenza e' la modifica e non l'inquadratura.
// Da qui discendono le tre regole che comandano tutto il file: DETERMINISTICO
// (mai Math.random), COORDINATE RESE (ogni stazione dice da dove si guarda), e
// STAZIONI SEPARATE (niente si contamina con il vicino).
//
// LO ZOO NON SOSTITUISCE NIENTE. I cinque mondi di prova storici — collaudo.js,
// bancoOmbre.js, testLuci.js, mostra.js, testMacchine.js — restano dove sono coi
// loro test: proteggono bug storici, e la potatura e' un giro a parte. Questo
// file li AFFIANCA e ne eredita le lezioni, che sono citate stazione per
// stazione.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ LA REGOLA DI STILE CHE COMANDA LA STAZIONE 2 (decisa il 25/08/2026)
//
// Il committente, guardando un A/B a pixel: «voglio delle ombre in cel shading
// senza avere face shading dei vari elementi, ma il reagire alla luce si'».
// Tradotta in una frase sola: LA LUMINOSITA' DIPENDE DA DOVE STA UNA SUPERFICIE
// RISPETTO ALLE LUCI, NON DA COME E' GIRATA.
// Di fabbrica `soleTerm` e' spento (main.js, OPZ_DEFAULT) e il fragment salta
// tutto il blocco (fx/materials.js: `if (uSoleTerm > 0.0)`). Restano accesi:
// l'ombra portata del sole (fx/campoSole.js), le pozze delle luci-sfera, le
// ombre delle nuvole, il cono dei personaggi e l'ambiente dell'ora.
// La stazione 2 e' il banco che giudica proprio questa regola.
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠ DA CHE PARTE SI GUARDA — e qui la lezione di bancoOmbre.js va CORRETTA, non
// solo copiata. Quel file dice «l'astro gira in un settore diagonale fisso, le
// ombre cadono sempre verso −x e −z». Non e' piu' vero: da fx/daynight.js
// l'astro fa il mezzo giro vero (asse di levata a 0.70 rad, `INCLINA` di lato),
// quindi le ombre RUOTANO durante la giornata:
//     alba      dir sole (+x,+z)  → ombra verso (−x, −z)
//     mezzogiorno dir sole (−x,+z) → ombra verso (+x, −z)
//     tramonto  dir sole (−x,−z)  → ombra verso (+x, +z)
// La costante fra mattina E mezzogiorno e' il −z: per due terzi della giornata
// l'ombra cade verso z calanti. Percio' in questo zoo TUTTO STA A SUD DI CHI
// GUARDA: le passeggiate corrono in x, le stazioni crescono verso +z, e il punto
// `sguardo` di ogni stazione sta sulla passeggiata a NORD di quello che c'e' da
// vedere. Cosi' l'ombra cade FRA l'oggetto e l'occhio invece che dietro.
// Il primo banco ombre aveva la fila dalla parte sbagliata e mostrava solo i
// sederi degli oggetti: e' in memoria, e non si ripete.
//
// ⚠ LA MISURA CHE DECIDE LA TAGLIA DELLO ZOO, e non e' il numero di blocchi.
// Le ombre delle lampade camminano una texture 3D larga quanto la SCATOLA DEL
// MONDO (world/mesher.js `_collegaVoxel`, fx/materials.js). Il minimo GARANTITO
// da WebGL2 per il lato di una texture 3D e' 256 — ed e' proprio quello che puo'
// dare il telefono o il Chromebook su cui questo zoo deve essere giudicato. Se
// un lato della scatola supera quel numero, `voxTroppoLarga` scatta e le ombre
// spariscono IN SILENZIO: lo zoo sembrerebbe rotto proprio sui dispositivi per
// cui e' stato costruito. Con `scatolaPerMondo` (margine 2 per lato, 6 sopra e
// 6 sotto) la regola operativa e':
//     estensione in x e in z ≤ 251 blocchi   ·   celle totali ≤ 2e6 (LUCE_LIMITE_CELLE)
// Lo zoo sta a 158 × 146 di pianta e ~690k celle: c'e' margine per crescere, ma
// non e' infinito. test/zoo.test.mjs monta la guardia su questo numero.
//
// CONVENZIONE DELLE QUOTE, la stessa di tutti gli altri mondi di prova: roccia a
// y=0, superficie a y=1, quindi i PIEDI stanno a y=2. Le lampade dei blocchi
// accendono la sfera al CENTRO della cella, mezza cella sopra la quota scritta.
//
//  ┌─ MAPPA (dall'alto, +x a destra, +z in basso) ────────────────────────────┐
//  │ ······· PASSEGGIATA A  z −1..2 ·············································│
//  │ 1 PIANO NUDO   │ 2 FACE SHADING  │ 3 OMBRE PORTATE      z 3..34          │
//  │ x 0..26        │ x 36..88        │ x 96..140                             │
//  │ ······· PASSEGGIATA B  z 35..38 ············································│
//  │ 4 LUCI  x 0..70  z 39..80        │ 5 MATRICE DELLE SORGENTI  x 80..135    │
//  │                                  │            z 39..101                   │
//  │ ······· PASSEGGIATA C  z 102..105 ··········································│
//  │ 6 ACQUA        │ 7 VEGETAZIONE   │ 8 MATERIALI (in arrivo)   z 106..145   │
//  │ x 0..48        │ x 58..100       │ x 110..152                            │
//  │ (il CORRIDOIO x −6..−3 corre da nord a sud e unisce le tre passeggiate)   │
//  └───────────────────────────────────────────────────────────────────────────┘

import { registraBlocco, BLOCCHI, CATEGORIA_PROVE } from './blocks.js?v=mtatm933';

const SUOLO = 0, SUPERFICIE = 1, PIEDI = 2;

/** Cella dei piedi allo spawn: sulla passeggiata A, davanti al piano nudo —
 *  cioe' davanti alla stazione che viene prima di tutte. */
export const SPAWN_ZOO = [13, PIEDI, 0];

// ---- LA PIANTA, IN UN POSTO SOLO -------------------------------------------
// I riquadri sono l'UNICA fonte di verita' sulla pianta: ci pavimenta sopra il
// generatore, li rende `generaZoo` e ci sopra ci gira la prova «le stazioni non
// si sovrappongono». Cambiare un numero qui basta a spostare una stazione.
const CORRIDOIO = { x0: -6, x1: -3, z0: -1, z1: 145 };
const PASSEGGIATE = [
  { id: 'A', x0: -6, x1: 140, z0: -1, z1: 2 },
  { id: 'B', x0: -6, x1: 135, z0: 35, z1: 38 },
  { id: 'C', x0: -6, x1: 152, z0: 102, z1: 105 },
];
const RIQUADRI = {
  pianoNudo:   { x0: 0,   x1: 26,  z0: 3,   z1: 34 },
  facce:       { x0: 36,  x1: 88,  z0: 3,   z1: 34 },
  ombre:       { x0: 96,  x1: 140, z0: 3,   z1: 34 },
  luci:        { x0: 0,   x1: 70,  z0: 39,  z1: 80 },
  matrice:     { x0: 80,  x1: 135, z0: 39,  z1: 101 },
  acqua:       { x0: 0,   x1: 48,  z0: 106, z1: 145 },
  vegetazione: { x0: 58,  x1: 100, z0: 106, z1: 145 },
  materiali:   { x0: 110, x1: 152, z0: 106, z1: 140 },
};

// ---- IL CASO: hash sulle coordinate, MAI Math.random ------------------------
// Uno zoo che viene diverso a ogni generazione non e' un banco, e' un parco: due
// schermate a distanza di giorni non si potrebbero piu' confrontare, e il
// committente che guarda dal telefono vedrebbe un mondo e io un altro.
// E' LA STESSA FORMULA di fx/erba.js e world/worldgen.js (`hash2`), ricopiata a
// mano e non importata: quelle due non la esportano, e un hash e' quattro righe
// — meno di quanto costerebbe legare lo zoo agli interni di un altro modulo.
// Math.imul e gli operatori a 32 bit sono esatti per specifica: lo stesso
// ingresso da' lo stesso bit su ogni motore JavaScript, che e' il punto.
function rumore(x, z, sale) {
  let h = (x * 374761393 + z * 668265263 + sale * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- LE SORGENTI DELLA MATRICE ---------------------------------------------
// Sono blocchi VERI, registrati come farebbe l'Officina: si prendono dallo zaino
// e si piazzano, ed e' meta' del motivo per cui la stazione 5 esiste. Il colore
// del blocco racconta il colore della sua luce, cosi' la carta si legge anche
// spenta, e i NOMI DICONO IL PARAMETRO: chi arriva qui sta cercando di capire
// cosa scrivere nel campo «raggio», e «lampada 3» non lo aiuta.
//
// ⚠ PREFISSO `zoo:` E NON `prova:`, cioe' una copia dei campioni del Banco
// ombre invece di un riuso. E' voluto, per la stessa ragione per cui
// testLuci.js si ricopia a mano la tabella delle classi di luce: lo zoo deve
// sopravvivere alla POTATURA dei mondi vecchi. Importare `MATRICE` da
// bancoOmbre.js vorrebbe dire che il giorno in cui quel file viene cancellato lo
// zoo smette di costruirsi — cioe' che il banco nuovo dipende dal banco che sta
// per essere buttato. I numeri invece sono gli stessi, e sono quelli buoni.
const AMBRA = { cima: 0xffeab4, lato: 0xf0c063, fondo: 0xd9a744 };
const MATRICE = [
  // riga RAGGIO: cambia solo quanto e' larga la pozza
  { id: 'zoo:r3',  nome: 'Zoo · raggio 3',  ...AMBRA, riga: 'raggio', et: 'r 3',  luce: { colore: 0xffd889, raggio: 3,  intensita: 1.1, ombra: true } },
  { id: 'zoo:r6',  nome: 'Zoo · raggio 6',  ...AMBRA, riga: 'raggio', et: 'r 6',  luce: { colore: 0xffd889, raggio: 6,  intensita: 1.1, ombra: true } },
  { id: 'zoo:r9',  nome: 'Zoo · raggio 9',  ...AMBRA, riga: 'raggio', et: 'r 9',  luce: { colore: 0xffd889, raggio: 9,  intensita: 1.1, ombra: true } },
  { id: 'zoo:r13', nome: 'Zoo · raggio 13', ...AMBRA, riga: 'raggio', et: 'r 13', luce: { colore: 0xffd889, raggio: 13, intensita: 1.1, ombra: true } },
  // riga INTENSITA': stessa larghezza, quanta luce ci mette dentro
  { id: 'zoo:i04', nome: 'Zoo · intensita 0.4', ...AMBRA, riga: 'intensita', et: 'i 0.4', luce: { colore: 0xffd889, raggio: 8, intensita: 0.4, ombra: true } },
  { id: 'zoo:i08', nome: 'Zoo · intensita 0.8', ...AMBRA, riga: 'intensita', et: 'i 0.8', luce: { colore: 0xffd889, raggio: 8, intensita: 0.8, ombra: true } },
  { id: 'zoo:i13', nome: 'Zoo · intensita 1.3', ...AMBRA, riga: 'intensita', et: 'i 1.3', luce: { colore: 0xffd889, raggio: 8, intensita: 1.3, ombra: true } },
  { id: 'zoo:i20', nome: 'Zoo · intensita 2.0', ...AMBRA, riga: 'intensita', et: 'i 2.0', luce: { colore: 0xffd889, raggio: 8, intensita: 2.0, ombra: true } },
  // riga COLORE: le primarie e una tinta fredda da diorama
  { id: 'zoo:cRosso',  nome: 'Zoo · colore rosso',  cima: 0xffb4b4, lato: 0xe06a6a, fondo: 0xb84a4a, riga: 'colore', et: 'rosso',  luce: { colore: 0xff3020, raggio: 8, intensita: 1.1, ombra: true } },
  { id: 'zoo:cVerde',  nome: 'Zoo · colore verde',  cima: 0xc9ffb4, lato: 0x74d06a, fondo: 0x53a84a, riga: 'colore', et: 'verde',  luce: { colore: 0x30ff40, raggio: 8, intensita: 1.1, ombra: true } },
  { id: 'zoo:cBlu',    nome: 'Zoo · colore blu',    cima: 0xb4d4ff, lato: 0x6a94e0, fondo: 0x4a70b8, riga: 'colore', et: 'blu',    luce: { colore: 0x3060ff, raggio: 8, intensita: 1.1, ombra: true } },
  { id: 'zoo:cFreddo', nome: 'Zoo · bianco freddo', cima: 0xe8f4ff, lato: 0xc0d8ee, fondo: 0x9db8d4, riga: 'colore', et: 'freddo', luce: { colore: 0xd8ecff, raggio: 8, intensita: 1.1, ombra: true } },
  // riga OMBRA: la stessa lampada, con e senza. E' la coppia che spiega la
  // scelta piu' importante dell'Officina. LA RIGA HA DUE CAMPIONI E NON QUATTRO,
  // e non e' una dimenticanza: `ombra` e' un booleano, ha due valori. Riempirla
  // con due doppioni avrebbe fatto sembrare che ci fosse dell'altro da vedere.
  { id: 'zoo:oSi', nome: 'Zoo · ombra si (pesante)', ...AMBRA, riga: 'ombra', et: 'ombra SI', luce: { colore: 0xffd889, raggio: 8, intensita: 1.1, ombra: true } },
  { id: 'zoo:oNo', nome: 'Zoo · ombra no (leggera)', cima: 0xffd6ea, lato: 0xef9ac4, fondo: 0xd47aa6, riga: 'ombra', et: 'ombra NO', luce: { colore: 0xffd889, raggio: 8, intensita: 1.1, ombra: false } },
];

/** Registra (una volta) i campioni della matrice.
 *
 *  ⚠ TERZO ARGOMENTO OBBLIGATORIO: `CATEGORIA_PROVE`. Senza, `registraBlocco`
 *  li mette in `CATEGORIA_OFFICINA` — la scheda dove il giocatore ritrova i
 *  blocchi che ha inventato LUI: bastava aprire il mondo di prova una volta e da
 *  quel momento «Raggio 3» e compagni restavano li' in mezzo, in OGNI mondo, per
 *  sempre. E' un guasto vero, gia' successo due volte (bancoOmbre.js, poi
 *  mostra.js ancora ieri), e test/zoo.test.mjs pretende che qui non si ripeta.
 *  Idempotente: rigenerare lo zoo non deve moltiplicare niente. */
function registraSorgenti() {
  for (const v of MATRICE) {
    if (BLOCCHI[v.id]) continue;
    registraBlocco(v.id, {
      nome: v.nome, cima: v.cima, lato: v.lato, fondo: v.fondo,
      solido: true, nav: 10, fam: 'mina', salute: 100, luce: { ...v.luce },
    }, CATEGORIA_PROVE);
  }
}

// LE CLASSI DI LUCE DEI BLOCCHI DI CASA, RICOPIATE A MANO E DI PROPOSITO — la
// stessa scelta (e la stessa motivazione) di testLuci.js. Leggere `BLOCCHI` a
// runtime legherebbe il conteggio al registro VIVO, che l'Officina puo'
// riscrivere: un blocco custom che sovrascrive `lucciola` cambierebbe i numeri
// del rapporto senza che nessuno se ne accorga. Qui serve sapere cosa lo zoo HA
// POSATO. I campioni `zoo:` invece li conosciamo per definizione (MATRICE).
const CLASSE_LUCE = {
  lucciola: true, lampadaPesante: true, lampadaRossa: true, lampadaVerde: true, lampadaBlu: true,
  lampadaLeggera: false, fuochiFatui: false,
};
for (const v of MATRICE) CLASSE_LUCE[v.id] = v.luce.ombra;

/** I materiali della fila del face shading: uno per famiglia, tutti lisci e
 *  tutti diversi di tinta. Non c'e' `lucciola` ne' altre luci: qui la fila deve
 *  stare al BUIO DI FABBRICA (solo ambiente), o non si giudica piu' niente. */
const MATERIALI_FACCE = ['erba', 'terra', 'sabbia', 'ghiaia', 'roccia', 'pietra', 'mattoni', 'legno', 'tronco', 'asse'];

/** Le piazzole della stazione 8, ancora vuote. */
const PIAZZOLE = [
  { id: 'metallo',  nome: 'Metallo (riflesso speculare)' },
  { id: 'fango',    nome: 'Fango (opaco, sporco)' },
  { id: 'bagnato',  nome: 'Bagnato (velo d\'acqua sopra un solido)' },
  { id: 'specchio', nome: 'Specchio (riflesso pieno)' },
  { id: 'emissivo', nome: 'Emissivo (brilla senza illuminare)' },
];

/**
 * Costruisce lo zoo dentro `mondo` (che viene SVUOTATO).
 *
 * Rende:
 *   spawn      cella dei piedi da cui si entra
 *   stazioni   [{ numero, id, nome, cartello, riquadro, piedi, sguardo }]
 *   zone       { chiave: { nome, piedi, sguardo, … } } — i bottoni del menu debug
 *   furni      [{ id, cella, rot }]  ← li piazza CHI CHIAMA: il generatore non
 *              conosce l'arredo e non deve conoscerlo (come in bancoOmbre.js)
 *   sorgenti   [{ id, riga, etichetta, cella }] i campioni della matrice
 *   piazzole   [{ id, nome, cella, stato }] i materiali «in arrivo»
 *   acqua      celle da svegliare con sim.pianificaAttorno() dopo la generazione
 *   lampade    { pesanti, leggere } quante ne ha posate lo zoo
 *   conti      blocchi NUOVI per zona (la somma fa `totale`)
 *   dipinti    celle RIDIPINTE per zona (non cambiano il totale)
 *   scatola    l'estensione del mondo + le celle della griglia di luce
 */
export function generaZoo(mondo) {
  registraSorgenti();
  mondo.svuota();

  // DUE CONTATORI E NON UNO, la lezione di testMacchine.js: qui si POSANO
  // blocchi nuovi e si RIDIPINGONO celle che esistono gia' (l'acqua sopra il
  // prato, le toppe di lana). Con un contatore solo la somma delle zone non
  // tornerebbe mai col totale del mondo, e il rapporto sarebbe inutile.
  const conti = {};
  const dipinti = {};
  const lampade = { pesanti: 0, leggere: 0 };
  let aperta = null;
  const apri = (nome) => { aperta = nome; if (conti[nome] === undefined) { conti[nome] = 0; dipinti[nome] = 0; } };
  const contaLuce = (tipo) => {
    const c = CLASSE_LUCE[tipo];
    if (c === undefined) return;
    if (c) lampade.pesanti++; else lampade.leggere++;
  };
  /** Posa una cella NUOVA. */
  const posa = (x, y, z, tipo) => { mondo.metti(x, y, z, tipo, true); conti[aperta]++; contaLuce(tipo); };
  /** Ridipinge una cella che c'e' gia'. Se non c'era e' una posa: cosi'
   *  l'invariante «somma dei conti = contaBlocchi» non si rompe mai. */
  const dipingi = (x, y, z, tipo) => {
    if (!mondo.tipo(x, y, z)) { posa(x, y, z, tipo); return; }
    mondo.metti(x, y, z, tipo, true); dipinti[aperta]++; contaLuce(tipo);
  };
  const scava = (x, y, z) => { if (mondo.togli(x, y, z, true)) conti[aperta]--; };
  /** Prisma pieno, estremi compresi. */
  const scatola = (x0, x1, y0, y1, z0, z1, tipo) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) posa(x, y, z, tipo);
  };
  /** Terreno a due strati (roccia + `cima`). Salta le colonne gia' lastricate:
   *  le passeggiate e il corridoio si incrociano, e senza questa riga le celle
   *  in comune verrebbero contate due volte. */
  const terreno = (x0, x1, z0, z1, cima = 'erba') => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (mondo.tipo(x, SUOLO, z)) continue;
        posa(x, SUOLO, z, 'roccia');
        posa(x, SUPERFICIE, z, cima);
      }
    }
  };
  /** Piedistallo di pietra + lampada in cima. La sfera va ALZATA da terra: a
   *  quota dei piedi meta' pozza finisce sottoterra e ogni ombra nasce radente,
   *  che e' il caso peggiore per qualunque cammino (lezione di testLuci.js). */
  const suPalo = (x, z, yLamp, tipo) => {
    for (let y = PIEDI; y < yLamp; y++) posa(x, y, z, 'pietra');
    posa(x, yLamp, z, tipo);
  };

  const furni = [];
  const sorgenti = [];
  const piazzole = [];
  const acqua = [];

  // ---- 0. LE PASSEGGIATE ----------------------------------------------------
  // Sono la struttura portante, non decorazione: ogni stazione le tocca, quindi
  // si raggiungono tutte a piedi senza scavalcare un gradino, e i punti
  // `sguardo` stanno su di esse. Il CORRIDOIO a ovest unisce le tre da nord a
  // sud: senza, per passare dalla passeggiata B alla C bisognerebbe attraversare
  // una stazione — cioe' camminare in mezzo a quello che si sta guardando.
  apri('passeggiate');
  terreno(CORRIDOIO.x0, CORRIDOIO.x1, CORRIDOIO.z0, CORRIDOIO.z1);
  for (const p of PASSEGGIATE) terreno(p.x0, p.x1, p.z0, p.z1);

  // ---- 1. IL PIANO NUDO -----------------------------------------------------
  // LA STAZIONE PIU' IMPORTANTE DELLO ZOO, ed e' quella dove non c'e' niente.
  // E' il controllo negativo: una distesa d'erba perfettamente piatta, senza un
  // blocco sopra, senza una lampada a portata, senza un mobile che proietti.
  // Qui QUALUNQUE cosa si veda e' un difetto — ed e' esattamente il posto dove
  // tutti e quattro i tentativi di illuminazione falliti facevano macchie
  // (memoria: «Piano nudo: cielo [15], lume [0], uniforme»).
  //
  // PERCHE' VIENE PRIMA DI TUTTE: si entra qui. Se la prima cosa che si vede
  // arrivando ha delle chiazze, non serve andare a guardare il resto.
  //
  // ⚠ E PERCHE' NON HA UN BALCONE come la stazione 2: una terrazza da cui
  // guardare dall'alto sarebbe comoda, ma sarebbe anche un occlusore alto
  // quattro blocchi attaccato al prato che deve restare pulito — la sua ombra
  // portata cadrebbe proprio qui dentro. Un controllo negativo con dentro
  // un'ombra vera non e' piu' un controllo negativo.
  apri('pianoNudo');
  {
    const r = RIQUADRI.pianoNudo;
    terreno(r.x0, r.x1, r.z0, r.z1);
  }

  // ---- 2. FACE SHADING ------------------------------------------------------
  // LA STAZIONE CHE GIUDICA LA REGOLA scritta in cima al file. Due file, e ognuna
  // risponde a meta' della frase del committente:
  //
  //  · FILA DEI MATERIALI (z=10) — «face shading NO». Un cubo isolato per
  //    materiale, quattro celle di prato attorno a ciascuno, e nessuna lampada
  //    entro dodici celle: qui c'e' solo l'ambiente dell'ora. Le sei facce dello
  //    stesso cubo devono leggersi allo STESSO tono. Se la cima e' piu' chiara
  //    dei fianchi, il chiaroscuro per faccia e' tornato — e si vede in un colpo
  //    d'occhio su dieci cubi in fila, senza misurare niente.
  //  · COPPIA DELLA LAMPADA (z=22) — «reagire alla luce SI'». Due cubi
  //    IDENTICI, stesso materiale e stessa quota: uno a tre celle dalla lampada
  //    (raggio 8, dentro la pozza) e uno a diciassette (fuori). Devono essere
  //    diversi, e la differenza dev'essere tutta di POSIZIONE.
  //    Il confronto vero e' fra le due file: cubi uguali che cambiano perche'
  //    stanno in un altro POSTO si', cubi uguali che cambiano faccia per faccia no.
  //
  // ⚠ IL BALCONE, e non e' un vezzo. Un cubo posato a y=2 ha la cima a y=3, cioe'
  // sopra l'occhio di chi lo guarda dal prato: da terra la faccia superiore non
  // si vede proprio, e la meta' piu' importante del confronto sparisce. La
  // terrazza a nord (cima y=5, piedi y=6) mette l'occhio quattro blocchi sopra le
  // cime. Sta a NORD apposta: la sua ombra cade verso z calanti per due terzi
  // della giornata, cioe' dalla parte OPPOSTA ai campioni, e non li tocca mai.
  apri('facce');
  {
    const r = RIQUADRI.facce;
    terreno(r.x0, r.x1, r.z0, r.z1);
    // il balcone e la sua scaletta (x 36..39, un gradino per cella)
    for (let i = 0; i < 4; i++) scatola(36 + i, 36 + i, PIEDI, PIEDI + i, 4, 6, 'pietra');
    scatola(40, 85, PIEDI, PIEDI + 3, 4, 6, 'pietra');
    // la fila dei materiali: un cubo solo, cinque celle di passo
    MATERIALI_FACCE.forEach((tipo, i) => posa(40 + i * 5, PIEDI, 10, tipo));
    // la coppia della lampada: due cubi di pietra identici, la lampada in mezzo
    suPalo(50, 22, PIEDI + 2, 'lampadaPesante');
    posa(47, PIEDI, 22, 'pietra');            // dentro la pozza (3 celle)
    posa(67, PIEDI, 22, 'pietra');            // fuori dalla pozza (17 celle)
  }

  // ---- 3. OMBRE PORTATE -----------------------------------------------------
  // Le domande, in ordine: l'ombra COMBACIA con l'oggetto? e' a UN tono? ha i
  // denti di sega? Ogni pezzo e' isolato, perche' un'ombra si legge dal suo
  // BORDO e un bordo attaccato a un altro oggetto non si legge.
  //
  //  · TERRAZZE a gradini da UN blocco — il caso che per anni ha buttato la sua
  //    linguetta d'ombra su ogni gradino sotto («le ombre sono seghettate»: erano
  //    le linguette, memoria del 28/07). Salgono verso +x, quindi le linguette
  //    del mattino cadono verso ovest, sui gradini bassi, in piena vista.
  //  · PILA ALTA 2×2 — l'ombra lunga: dev'essere un rettangolo netto, non una
  //    scia sfrangiata.
  //  · COLONNA 1×1 — l'ombra sottile. E' la grana minima della griglia: se la
  //    colonna proietta un muro largo tre celle, il cammino sta agganciandosi ai
  //    voxel invece che alla geometria.
  //  · SPORTO — una mensola che sborda tre celle da un muro. L'ombra deve
  //    staccarsi dal muro e posarsi piu' avanti sul prato: e' il caso che una
  //    diffusione a secchielli sbaglia sempre.
  //  · SAGOME VERE (albero, lampione, panchina) — «l'ombra ha la forma della
  //    cosa?». In fondo alla fila ci sono un CUBO SINGOLO e una COLONNA DA 3 di
  //    pietra: sono il riferimento «ombra che sappiamo giusta», e se una sagoma
  //    sfigura accanto a loro il difetto e' suo (idea presa da bancoOmbre.js).
  apri('ombre');
  {
    const r = RIQUADRI.ombre;
    terreno(r.x0, r.x1, r.z0, r.z1);
    for (let x = 100; x <= 107; x++) {
      const altezza = x - 99;                              // x=100 → 1 … x=107 → 8
      for (let z = 8; z <= 18; z++) {
        for (let i = 0; i < altezza; i++) posa(x, PIEDI + i, z, i === altezza - 1 ? 'erba' : 'terra');
      }
    }
    scatola(112, 113, PIEDI, PIEDI + 11, 10, 11, 'pietra');   // la pila
    scatola(118, 118, PIEDI, PIEDI + 7, 10, 10, 'pietra');    // la colonna 1×1
    scatola(124, 132, PIEDI, PIEDI + 6, 14, 14, 'mattoni');   // il muro dello sporto
    scatola(124, 132, PIEDI + 7, PIEDI + 7, 11, 13, 'asse');  // la mensola che sborda
    furni.push({ id: 'albero', cella: [100, PIEDI, 24], rot: 0 });
    furni.push({ id: 'lampione', cella: [107, PIEDI, 24], rot: 0 });
    furni.push({ id: 'panchina', cella: [114, PIEDI, 24], rot: 0 });
    furni.push({ id: 'albero', cella: [121, PIEDI, 24], rot: 0 });
    posa(128, PIEDI, 24, 'pietra');                           // riferimento: cubo
    scatola(134, 134, PIEDI, PIEDI + 2, 24, 24, 'pietra');    // riferimento: colonna da 3
  }

  // ---- 4. LUCI --------------------------------------------------------------
  // Quattro esperimenti, ognuno col suo controllo.
  //
  //  · LA COPPIA DEL CONFRONTO (z=48). Due muri identici, due lampade identiche:
  //    `lampadaPesante` e `lampadaLeggera` non differiscono per NIENTE tranne il
  //    campo `ombra` — stesso colore, stesso raggio, stessa intensita', perfino
  //    le stesse facce (blocks.js lo documenta apposta e dice di non toccarle).
  //    Quindi tutto cio' che si vede di diverso a schermo E' il costo dell'ombra.
  //    I muri sono larghi 17 (8 celle per lato piu' il centro): con un muro piu'
  //    stretto della sfera la luce ci GIRA ATTORNO e «davanti dev'essere buio»
  //    non sarebbe piu' vero nemmeno con l'occlusione perfetta.
  //    I marcatori di lana a z=46 sono la lettura a colpo d'occhio: il BIANCO
  //    (sotto la pesante) resta al colore dell'ambiente, il ROSSO (sotto la
  //    leggera) e' dentro la pozza. La fessura fra i due muri (x 17..19) dista
  //    10.4 celle da entrambe le lampade, cioe' oltre il raggio: non trapela.
  //    ⚠ LE LAMPADE STANNO A SUD DEI MURI e i marcatori a NORD, cioe' il
  //    contrario di testLuci.js. Li' si guardava da sud, qui si guarda da nord:
  //    la parte da vedere e' sempre quella FRA il muro e l'occhio.
  //  · LA FESSURA (x=52). Un taglio verticale largo una cella in un muro alto 7:
  //    passa una LAMA di luce che si posa sul prato davanti, e tutto il resto
  //    resta al buio. E' il dettaglio da UNA CELLA, il caso in cui la vecchia
  //    maschera cotta nei vertici si sfaldava per costruzione.
  //  · I FUOCHI FATUI (x=65). Un nido dentro un recinto SENZA TETTO: i fatui sono
  //    luci LEGGERE, quindi il recinto non le ferma — da fuori si vede l'alone
  //    passare attraverso i muri e i corpicini uscire e rientrare. E' il
  //    contrario esatto della coppia, con la stessa geometria.
  //  · LE COLORATE (z 60..76). Lampade APPESE a quota 7 sopra un pavimento di
  //    lana bianca. Appese e non posate: un blocco-lampada e' SOLIDO, e a terra
  //    farebbe da occlusore alla vicina, striando d'ombra proprio la zona di
  //    sovrapposizione che si vuole leggere. Da 5.5 celle di quota una sfera da 8
  //    lascia a terra una pozza di raggio 5.81; la fila sta a passo 8, quindi le
  //    coppie si sovrappongono per ~3.6 celle e le estreme (rosso e blu, 16
  //    celle) no. La TERNA a est e' il triangolo dove R+V+B stanno tutti e tre
  //    insieme: e' il punto in cui si vede se la somma resta un colore o va al
  //    neutro (va al neutro: e' la fisica, ed e' documentato).
  apri('luci');
  {
    const r = RIQUADRI.luci;
    terreno(r.x0, r.x1, r.z0, r.z1);
    // la coppia: muro + lampada dietro, due volte
    for (const [x0, cx, tipo, marcatore] of [[0, 8, 'lampadaPesante', 'lanaBianca'], [20, 28, 'lampadaLeggera', 'lanaRossa']]) {
      scatola(x0, x0 + 16, PIEDI, PIEDI + 4, 48, 48, 'mattoni');
      suPalo(cx, 51, PIEDI + 2, tipo);
      dipingi(cx, SUPERFICIE, 46, marcatore);
    }
    // la fessura: muro alto 7 con un taglio verticale al centro
    for (let x = 44; x <= 60; x++) {
      if (x === 52) continue;                              // il taglio
      scatola(x, x, PIEDI, PIEDI + 6, 48, 48, 'mattoni');
    }
    suPalo(52, 51, PIEDI + 3, 'lampadaPesante');
    // i fuochi fatui, in un recinto senza tetto
    for (let x = 62; x <= 68; x++) {
      for (let z = 45; z <= 51; z++) {
        if (x === 62 || x === 68 || z === 45 || z === 51) scatola(x, x, PIEDI, PIEDI + 3, z, z, 'pietra');
      }
    }
    posa(65, PIEDI, 48, 'fuochiFatui');
    // le colorate: pavimento chiaro (la mescolanza sul verde non si legge)
    for (let x = 0; x <= 48; x++) for (let z = 60; z <= 76; z++) dipingi(x, SUPERFICIE, z, 'lanaBianca');
    posa(6, 7, 68, 'lampadaRossa');
    posa(14, 7, 68, 'lampadaVerde');
    posa(22, 7, 68, 'lampadaBlu');
    posa(38, 7, 65, 'lampadaRossa');                       // la terna
    posa(41, 7, 70, 'lampadaVerde');
    posa(35, 7, 70, 'lampadaBlu');
  }

  // ---- 5. LA MATRICE DELLE SORGENTI -----------------------------------------
  // E' il pezzo che serve all'EDITOR, e la sua forma e' presa di peso da
  // bancoOmbre.js perche' li' era gia' giusta: ogni riga fa variare UNA cosa
  // sola e tiene ferme le altre, che e' l'unico modo di attribuire un effetto a
  // una causa. Ogni campione ha
  //   · un piedistallo, perche' una lampada a terra affoga meta' pozza sottoterra;
  //   · una toppa 7×7 di lana chiara sotto, perche' il verde dell'erba tinge
  //     tutto e due colori diversi sullo stesso verde si confrontano male;
  //   · un MURETTO, che e' il modo di VEDERE l'ombra invece di indovinarla.
  //
  // ⚠ IL PASSO E' QUINDICI E NON DIECI. La pozza piu' larga della matrice ha
  // raggio 13: due campioni piu' vicini della somma dei loro raggi non si
  // confrontano piu', si SOMMANO, e quello che si guarda e' una terza cosa che
  // non e' nessuno dei due. Un po' si toccano lo stesso ai bordi, ma il centro di
  // ogni campione e' suo.
  //
  // ⚠ IL MURETTO STA A NORD DELLA LAMPADA, cioe' specchiato rispetto a
  // bancoOmbre.js — e li' era corretto quanto qui e' corretto il contrario. La
  // luce va dalla lampada in fuori: col muretto a nord l'ombra cade verso z
  // calanti, cioe' verso chi guarda dalla passeggiata. Nel banco vecchio si
  // guardava da sud e c'era scritto «va guardata da DIETRO il muretto»: qui il
  // punto `sguardo` di ogni riga E' gia' dietro il muretto, e il punto `piedi` e'
  // dall'altra parte, dove si vede la pozza intera.
  apri('matrice');
  {
    const r = RIQUADRI.matrice;
    terreno(r.x0, r.x1, r.z0, r.z1);
    const PASSO = 15, X0 = 84, Z0 = 52;
    const righe = [...new Set(MATRICE.map((v) => v.riga))];
    for (const v of MATRICE) {
      const i = MATRICE.filter((w) => w.riga === v.riga).indexOf(v);
      const x = X0 + i * PASSO;
      const z = Z0 + righe.indexOf(v.riga) * PASSO;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) dipingi(x + dx, SUPERFICIE, z + dz, 'lanaBianca');
      posa(x, PIEDI, z, 'pietra');
      posa(x, PIEDI + 1, z, v.id);                         // la sorgente, alzata di una cella
      scatola(x - 2, x + 2, PIEDI, PIEDI + 1, z - 3, z - 3, 'mattoni');
      sorgenti.push({ id: v.id, riga: v.riga, etichetta: v.et, cella: [x, PIEDI, z + 5] });
    }
  }

  // ---- 6. ACQUA -------------------------------------------------------------
  // Cinque casi, e ognuno ha fatto sanguinare almeno una volta:
  //  · LAGO CON RIVA — la banda di schiuma sul bordo. E' larga a misura fissa
  //    (la finestra 5×5 del mesher non vede oltre due celle): su un lago si legge.
  //  · POZZA PICCOLA 2×2 — la stessa banda su una pozza minuscola, dove faceva
  //    il «vassoio bianco con centro blu». E' il caso limite dichiarato in
  //    memoria: se la riva torna larga, si vede QUI per primo.
  //  · FOSSO LARGO UNA CELLA — l'acqua stretta, dove riva e riflesso si pestano.
  //  · BASSA CONTRO PROFONDA — due specchi affiancati, uno da un blocco e uno da
  //    tre, per giudicare se il colore dell'acqua dipende dalla profondita'.
  //    Il fondo del profondo scende a y=−2: e' l'unica parte dello zoo sotto
  //    quota zero, ed e' voluto — il resto e' piatto per non sprecare scatola.
  //  · CASCATA — il flusso vero, che nasce dalla SIM e non e' disegnato a mano:
  //    letto incassato di un blocco (le sponde contengono), traboccamento dal
  //    solo ciglio ovest, cinque blocchi di caduta, pozza di raccolta sotto.
  //    Le celle sorgente tornano in `acqua`: senza sim.pianificaAttorno() la
  //    cascata resta un dato immobile e non parte mai (lezione di collaudo.js).
  apri('acqua');
  {
    const r = RIQUADRI.acqua;
    terreno(r.x0, r.x1, r.z0, r.z1);
    const allaga = (x0, x1, z0, z1, y = SUPERFICIE) => {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { dipingi(x, y, z, 'acqua'); acqua.push([x, y, z]); }
    };
    allaga(2, 14, 114, 126);                                // lago con riva
    allaga(24, 25, 114, 115);                               // pozza piccola 2×2
    allaga(19, 19, 112, 132);                               // fosso largo una cella
    allaga(24, 30, 120, 126);                               // acqua BASSA: un blocco
    // acqua PROFONDA: si scava una vasca da tre e si riempie fino a filo terreno
    scatola(34, 42, PIEDI - 4, PIEDI - 3, 112, 120, 'roccia');   // y=−2 e y=−1: fondo e sponde
    for (let x = 35; x <= 41; x++) {
      for (let z = 113; z <= 119; z++) {
        scava(x, SUPERFICIE, z); scava(x, SUOLO, z); scava(x, PIEDI - 3, z);
        for (let y = PIEDI - 3; y <= SUPERFICIE; y++) { posa(x, y, z, 'acqua'); acqua.push([x, y, z]); }
      }
    }
    // la cascata: rilievo, canale incassato, rampa per salirci
    for (let x = 32; x <= 43; x++) {
      for (let z = 130; z <= 142; z++) {
        for (let y = PIEDI; y <= PIEDI + 5; y++) posa(x, y, z, y === PIEDI + 5 ? 'erba' : 'roccia');
      }
    }
    for (let i = 0; i < 5; i++) {
      const cima = PIEDI + 4 - i;                           // x=44 → y6 … x=48 → y2
      for (let z = 130; z <= 142; z++) {
        for (let y = PIEDI; y <= cima; y++) posa(44 + i, y, z, y === cima ? 'erba' : 'roccia');
      }
    }
    for (let x = 32; x <= 43; x++) {
      scava(x, PIEDI + 5, 136); scava(x, PIEDI + 4, 136);
      posa(x, PIEDI + 4, 136, 'acqua'); acqua.push([x, PIEDI + 4, 136]);
    }
    allaga(24, 31, 132, 140);                               // la pozza di raccolta
  }

  // ---- 7. VEGETAZIONE -------------------------------------------------------
  // Erba e foglie non sono blocchi: sono due campi seminati (fx/erba.js,
  // fx/foglie.js) che si seminano da soli attorno al giocatore, per HASH delle
  // coordinate e mai con un random — rientrando in una zona il prato dev'essere
  // identico a com'era. Questa stazione da' loro i tre terreni che li mettono in
  // difficolta':
  //  · PRATO PIATTO con qualche ciuffo piazzato a mano (i `ciuffo` sono furni:
  //    l'erba come OGGETTO, non come effetto d'ambiente);
  //  · DISLIVELLI ERBOSI a pianori di quattro celle, alti da 0 a 3. L'altezza
  //    viene dall'hash su (x/4, z/4): pianori e non rumore per cella, perche' un
  //    rumore fine darebbe aghi e non colline — e perche' e' proprio il terreno a
  //    gradini quello su cui si giudicano insieme l'erba E le linguette d'ombra;
  //  · IL BOSCHETTO: sei alberi a celle fisse, per le foglie e per l'ombra della
  //    chioma (che e' la SAGOMA del modello, non la hitbox — memoria del 28/07).
  apri('vegetazione');
  {
    const r = RIQUADRI.vegetazione;
    terreno(r.x0, r.x1, r.z0, r.z1);
    for (let x = 58; x <= 70; x++) {
      for (let z = 110; z <= 126; z++) {
        if (rumore(x, z, 11) > 0.93) furni.push({ id: 'ciuffo', cella: [x, PIEDI, z], rot: 0 });
      }
    }
    for (let x = 74; x <= 88; x++) {
      for (let z = 110; z <= 128; z++) {
        const h = Math.floor(rumore(Math.floor(x / 4), Math.floor(z / 4), 23) * 3.99);
        for (let i = 0; i < h; i++) posa(x, PIEDI + i, z, i === h - 1 ? 'erba' : 'terra');
      }
    }
    for (const [x, z] of [[60, 132], [66, 136], [72, 131], [78, 137], [84, 132], [90, 136]]) {
      furni.push({ id: 'albero', cella: [x, PIEDI, z], rot: 0 });
    }
  }

  // ---- 8. MATERIALI (in arrivo) ---------------------------------------------
  // CINQUE PIAZZOLE VUOTE, e il vuoto e' il contenuto. Il sistema dei materiali
  // e' in progetto proprio ora: queste piazzole servono a farcelo trovare pronto
  // — quando ci sara' un metallo, si posa qui dentro e si confronta con gli altri
  // quattro senza costruire niente.
  // Ogni piazzola: interno 5×5 di lana bianca (fondo neutro, che non tinge il
  // campione), cornice a strisce gialle e grigie (la lettura universale di
  // «cantiere»: si riconosce da lontano e non serve saper leggere), e un cippo
  // giallo a nord che marca l'ingresso.
  // L'ETICHETTA NON E' NEL MONDO ma in `piazzole` (vedi la nota sui cartelli in
  // fondo al file): il nome della piazzola lo mostra la GUI, che sa gia' farlo.
  apri('materiali');
  {
    const r = RIQUADRI.materiali;
    terreno(r.x0, r.x1, r.z0, r.z1);
    PIAZZOLE.forEach((p, i) => {
      const cx = 114 + i * 8, cz = 122;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const cornice = Math.abs(dx) === 3 || Math.abs(dz) === 3;
          const tinta = cornice ? (((cx + dx + cz + dz) & 1) ? 'lanaGialla' : 'roccia') : 'lanaBianca';
          dipingi(cx + dx, SUPERFICIE, cz + dz, tinta);
        }
      }
      scatola(cx, cx, PIEDI, PIEDI + 1, cz - 4, cz - 4, 'lanaGialla');    // il cippo
      piazzole.push({ id: p.id, nome: p.nome, stato: 'in arrivo', cella: [cx, PIEDI, cz], sguardo: [cx, PIEDI, cz - 8] });
    });
  }

  const totale = mondo.contaBlocchi;
  return {
    spawn: SPAWN_ZOO,
    stazioni: STAZIONI,
    zone: ZONE,
    furni,
    sorgenti,
    piazzole,
    acqua,
    lampade,
    conti,
    dipinti,
    totale,
    scatola: misuraScatola(mondo),
  };
}

/** L'estensione del mondo appena costruito e le celle che la griglia di luce
 *  dovra' allocare. NON e' una curiosita': e' il numero che decide se le ombre
 *  si accendono o no sul dispositivo del committente (vedi la nota in cima). Il
 *  conto ripete `scatolaPerMondo` invece di importarlo perche' qui serve una
 *  MISURA da mettere nel rapporto, non una griglia: importare luce.js in un
 *  generatore di mondi lo legherebbe al motore di luce per un'addizione. */
function misuraScatola(mondo) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  mondo.perOgni((x, y, z) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  });
  if (!isFinite(minX)) return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, larghezza: 0, altezza: 0, profondita: 0, celle: 0 };
  const larghezza = (maxX - minX) + 5;        // margine 2 per lato
  const altezza = (maxY - minY) + 13;         // 6 sopra + 6 sotto
  const profondita = (maxZ - minZ) + 5;
  return { minX, minY, minZ, maxX, maxY, maxZ, larghezza, altezza, profondita, celle: larghezza * altezza * profondita };
}

// ---- LE STAZIONI, CON I DUE PUNTI DI VISTA ----------------------------------
// ⚠ SENZA QUESTA TABELLA LO ZOO NON E' UN BANCO, E' UN PARCO. Chi misura e chi
// fotografa deve inquadrare la STESSA identica cosa ogni volta, o la differenza
// fra due schermate e' l'inquadratura e non la modifica.
// Ogni stazione ha DUE punti, e sono due cose diverse:
//   `sguardo`  sulla passeggiata a NORD: e' da qui che si giudica, ed e' il
//              punto da riusare per gli screenshot di confronto;
//   `piedi`    dentro la stazione: e' da qui che si va a vedere da vicino.
// Alcune ne hanno altri, perche' il punto interessante quasi mai e' l'ingresso.
const STAZIONI = [
  {
    numero: 1, id: 'pianoNudo', nome: '1. Piano nudo', riquadro: RIQUADRI.pianoNudo,
    cartello: 'Qui non deve comparire NIENTE: ogni macchia e\' un difetto',
    sguardo: [13, PIEDI, 0], piedi: [13, PIEDI, 18],
  },
  {
    numero: 2, id: 'facce', nome: '2. Face shading', riquadro: RIQUADRI.facce,
    cartello: 'Le facce dello stesso cubo: stesso tono. Vicino/lontano dalla lampada: diverso',
    sguardo: [62, PIEDI + 4, 5], piedi: [62, PIEDI, 14],
    vicinoAllaLampada: [47, PIEDI, 26], lontanoDallaLampada: [67, PIEDI, 26],
  },
  {
    numero: 3, id: 'ombre', nome: '3. Ombre portate', riquadro: RIQUADRI.ombre,
    cartello: 'L\'ombra combacia con l\'oggetto? e\' a un tono? ha i denti di sega?',
    sguardo: [118, PIEDI, 0], piedi: [118, PIEDI, 6],
    terrazze: [100, PIEDI, 6], sporto: [128, PIEDI, 8], sagome: [110, PIEDI, 21],
  },
  {
    numero: 4, id: 'luci', nome: '4. Luci', riquadro: RIQUADRI.luci,
    cartello: 'Pesante contro leggera, occlusione, colori che si sommano, fuochi fatui',
    sguardo: [18, PIEDI, 36], piedi: [18, PIEDI, 44],
    pesante: [8, PIEDI, 45], leggera: [28, PIEDI, 45], fessura: [52, PIEDI, 44],
    fuochiFatui: [65, PIEDI, 42], colorate: [24, PIEDI, 58], nellaMescolanza: [14, PIEDI, 68],
  },
  {
    numero: 5, id: 'matrice', nome: '5. Matrice delle sorgenti', riquadro: RIQUADRI.matrice,
    cartello: 'Una riga per parametro: raggio, intensita, colore, ombra si/no',
    sguardo: [84, PIEDI, 45], piedi: [84, PIEDI, 57],
    raggio: [84, PIEDI, 57], intensita: [84, PIEDI, 72], colore: [84, PIEDI, 87], ombra: [84, PIEDI, 102],
    dietroIlMuretto: [99, PIEDI, 60],
  },
  {
    numero: 6, id: 'acqua', nome: '6. Acqua', riquadro: RIQUADRI.acqua,
    cartello: 'Riva, pozza piccola, fosso stretto, bassa contro profonda, cascata',
    sguardo: [24, PIEDI, 104], piedi: [24, PIEDI, 110],
    lago: [8, PIEDI, 110], fosso: [17, PIEDI, 120], profonda: [38, PIEDI, 110],
    cascata: [28, PIEDI, 129], inCima: [38, PIEDI + 6, 133],
  },
  {
    numero: 7, id: 'vegetazione', nome: '7. Vegetazione', riquadro: RIQUADRI.vegetazione,
    cartello: 'Prato, dislivelli erbosi, boschetto: erba e foglie',
    sguardo: [79, PIEDI, 104], piedi: [79, PIEDI, 108],
    dislivelli: [76, PIEDI, 108], boschetto: [75, PIEDI, 130],
  },
  {
    numero: 8, id: 'materiali', nome: '8. Materiali (in arrivo)', riquadro: RIQUADRI.materiali,
    cartello: 'Cinque piazzole vuote: metallo, fango, bagnato, specchio, emissivo',
    sguardo: [130, PIEDI, 104], piedi: [130, PIEDI, 114],
  },
];

/** Le zone nella forma che il menu debug sa gia' mangiare (`ui/debug.js`,
 *  mostraZone): un oggetto per stazione con `nome` e tanti punti quanti se ne
 *  vogliono, ognuno dei quali diventa un bottone. E' la forma di collaudo.js e
 *  testLuci.js, non quella piatta di bancoOmbre.js — che con `mostraZone` non
 *  produce nessun bottone, perche' i suoi valori sono array e non oggetti. */
export const ZONE = {
  ingresso: { nome: 'Ingresso', piedi: SPAWN_ZOO },
  ...Object.fromEntries(STAZIONI.map((s) => {
    const { numero, id, riquadro, cartello, ...punti } = s;
    return [id, punti];
  })),
};

// ---- I CARTELLI: perche' NON sono nel mondo ---------------------------------
//
// La domanda era aperta: cartelli 3D o etichette nei dati? Cartelli nei DATI, e
// le ragioni sono tre, in ordine di peso.
//
// 1. UN CARTELLO 3D VUOLE THREE, E QUESTO FILE NON DEVE VEDERLO. `ui/targhetta.js`
//    e' uno `Sprite` con una `CanvasTexture` disegnata al volo — ottimo per come
//    e' fatto, ma vuole `document`, `THREE` e un gruppo a cui appendersi. Tutti e
//    cinque i mondi di prova di questo progetto sono geometria pura piu' id di
//    blocchi, e proprio per questo si provano in Node senza DOM e senza WebGL: e'
//    la ragione per cui `test/zoo.test.mjs` puo' contare i blocchi e verificare i
//    teletrasporti in dieci millisecondi. Importare three qui dentro
//    scambierebbe quella prova con una decorazione.
// 2. IL CICLO DI VITA NON SAREBBE DI NESSUNO. Uno sprite creato dal generatore
//    dovrebbe essere distrutto da chi cambia mondo — cioe' da main.js, che
//    dovrebbe tenersi l'elenco. E' esattamente il genere di filo teso fra due
//    moduli che questo progetto sta cercando di togliere, non di aggiungere.
// 3. LA GUI SA GIA' FARLO. `mostraZone` prende `zone` e ne fa bottoni col nome
//    scritto sopra; `stazioni[].cartello` porta la frase che dice cosa si
//    giudica in quella stazione. Il testo esiste, e' leggibile, e non costa un
//    fotogramma.
//
// Nel MONDO l'etichetta c'e' lo stesso, ed e' quella che un mondo di voxel sa
// scrivere davvero: il COLORE. La lana sotto i campioni della matrice, i
// marcatori bianco/rosso della coppia pesante-leggera, le strisce da cantiere
// delle piazzole vuote. E' la stessa scelta dei tappeti di testMacchine.js —
// «l'unica ETICHETTA che un mondo di voxel sa scrivere» — e da lontano si legge
// meglio di un cartello.
