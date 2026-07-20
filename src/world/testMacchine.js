// MONDO «TEST DEI MACCHINARI» — tutte le macchine, montate e già funzionanti.
//
// PERCHE' ESISTE. Le macchine di registry.js erano provabili solo così: apri lo
// zaino, cerca il pezzo, posalo, poi accorgiti che l'Idrovora non fa niente
// perche' non c'e' acqua a tre celle, e che la catena non parte perche' i
// ripetitori sono troppo lontani. Quasi tutte queste macchine hanno bisogno di
// QUALCOSA ATTORNO per lavorare, e finche' quel qualcosa te lo devi costruire
// ogni volta, "provare i macchinari" e' mezz'ora di lavoro prima di vedere il
// primo frutto. Qui ogni postazione arriva col suo contorno gia' montato.
//
// CONVENZIONE DELLE QUOTE, come in collaudo.js e testLuci.js: roccia a y=0,
// superficie a y=1, quindi i PIEDI (e i furni, che si appoggiano sulla
// superficie) stanno a y=2.
//
//  ┌─ MAPPA (vista dall'alto, +x a destra, +z in basso) ─────────────────────┐
//  │ FILA DELLE MACCHINE  z=−2                                              │
//  │  ⚽−26   ✨−16   🌱−8   🚰 0   📡18 → 🔆24 🔆30 🔆36 🔆42               │
//  │                          (pozza)      └─ LA CATENA, passo 6 ─────┘     │
//  │·········· PASSEGGIATA  z −1..3 — il 🔔 Campanello sta QUI (x=8) ········│
//  │                                                                         │
//  │ SPIAZZO LIBERO  z 6..18, x −20..44: piano e vuoto, per posarne altre    │
//  └─────────────────────────────────────────────────────────────────────────┘
//
// LE DISTANZE NON SONO A CASO (e sono la parte che si rompe per prima se
// qualcuno "riordina" la mappa):
//
//  · CATENA, PASSO 6 CONTRO PORTATA 10. Il Ripetitore passa il testimone al piu'
//    vicino che dorme, ESCLUSO chi glielo ha appena dato. Col passo 6 ogni
//    anello ha il successivo a 6 (dentro la portata 10) e il secondo successivo
//    a 12 (fuori): la scelta e' obbligata e l'onda cammina dritta invece di
//    rimbalzare avanti e indietro. Se qualcuno stringesse il passo a 4, il
//    secondo successivo cadrebbe a 8, cioe' DENTRO la portata, e l'onda
//    potrebbe saltare un anello. Il test test/test-macchine.test.mjs fallisce
//    apposta se questa condizione cade.
//  · POZZA A 3 CELLE DALL'IDROVORA, cioe' dentro il raggio di FABBRICA (3): la
//    pompa deve lavorare appena arrivi, senza toccare niente. E' anche la prova
//    piu' comoda della manopola del raggio — portalo a 1 e il getto si spegne,
//    riportalo a 3 e riparte.
//  · CAMPANELLO NELLA PASSEGGIATA. Reagisce al gatto entro 4 celle: messo di
//    lato non suonerebbe mai a meno di andarlo a cercare. Sta in mezzo alla
//    strada apposta — ci passi e suona.
//  · GENERATORE IN UNO SPIAZZO SGOMBRO. La palla e' un oggetto fisico che
//    rotola: attorno serve piano libero, o finisce subito contro qualcosa.
//
// FURNI E NON BLOCCHI. Questo e' l'unico mondo di prova che ha bisogno anche
// dell'ARREDO (le macchine sono furni), quindi `genera` prende due argomenti e
// non uno solo: e' voluto, e main lo chiama di conseguenza.

const SUOLO = 0, SUPERFICIE = 1, PIEDI = 2;

/** Cella dei piedi allo spawn: in mezzo alla passeggiata, davanti alla fila. */
export const SPAWN_TEST_MACCHINE = [-8, 2, 1];

/** Dove sta ogni postazione: la fila delle macchine e' tutta a z=−2. */
export const POSTAZIONI = [
  { defId: 'generatore', cella: [-26, PIEDI, -2], nome: 'Generatore palla', tappeto: 'lanaBlu' },
  { defId: 'scintillatore', cella: [-16, PIEDI, -2], nome: 'Scintillatore', tappeto: 'lanaBianca' },
  { defId: 'coltivatore', cella: [-8, PIEDI, -2], nome: 'Coltivatore', tappeto: 'lanaVerde' },
  { defId: 'idrovora', cella: [0, PIEDI, -2], nome: 'Idrovora', tappeto: 'lanaBlu' },
  { defId: 'campanello', cella: [8, PIEDI, 1], nome: 'Campanello', tappeto: 'lanaGialla' },
  { defId: 'trasmettitore', cella: [18, PIEDI, -2], nome: 'Trasmettitore', tappeto: 'lanaRossa' },
  { defId: 'ripetitore', cella: [24, PIEDI, -2], nome: 'Ripetitore 1', tappeto: 'lanaGialla' },
  { defId: 'ripetitore', cella: [30, PIEDI, -2], nome: 'Ripetitore 2', tappeto: 'lanaGialla' },
  { defId: 'ripetitore', cella: [36, PIEDI, -2], nome: 'Ripetitore 3', tappeto: 'lanaGialla' },
  { defId: 'ripetitore', cella: [42, PIEDI, -2], nome: 'Ripetitore 4', tappeto: 'lanaGialla' },
];

/** La pozza dell'Idrovora: incassata a filo del terreno, come in collaudo.js. */
export const POZZA = { x0: -2, x1: 2, z0: -6, z1: -4 };

/** Lo spiazzo libero: la cornice e' di lana, dentro non c'e' niente. */
export const SPIAZZO = { x0: -20, x1: 44, z0: 6, z1: 18 };

/**
 * Costruisce il mondo di prova dentro `mondo` (svuotato) e ci posa le macchine
 * in `arredo` (svuotato). `arredo` puo' essere null: serve ai test in Node, che
 * non hanno ne' three ne' i modelli caricati e guardano solo la geometria.
 * Ritorna { spawn, zone, conti, macchine, acqua, totale }.
 */
export function generaTestMacchine(mondo, arredo = null) {
  mondo.svuota();
  if (arredo) arredo.svuota();

  // DUE CONTATORI E NON UNO, perche' qui si fanno due cose diverse: si POSANO
  // blocchi nuovi (il piano) e si RIDIPINGONO celle che esistono gia' (tappeti,
  // pozza, bindella, cornice). Con un contatore solo la somma delle zone non
  // tornerebbe mai col totale del mondo — mescolare le due cose era il modo
  // sicuro di rendere il rapporto inutile.
  const conti = {};        // blocchi NUOVI per zona: la somma fa `totale`
  const dipinti = {};      // celle RIDIPINTE per zona: non cambiano il totale
  let aperta = null;
  const apri = (nome) => { aperta = nome; conti[nome] = 0; dipinti[nome] = 0; };
  const posa = (x, y, z, tipo) => { mondo.metti(x, y, z, tipo, true); conti[aperta]++; };
  // `metti` sovrascrive e conta solo le celle nuove: ridipingere e' gratis per
  // `contaBlocchi`, quindi qui si tiene il proprio conto a parte.
  const dipingi = (x, y, z, tipo) => { mondo.metti(x, y, z, tipo, true); dipinti[aperta]++; };
  /** Terreno a due strati: roccia sotto, `cima` sopra. */
  const terreno = (x0, x1, z0, z1, cima = 'erba') => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) { posa(x, SUOLO, z, 'roccia'); posa(x, SUPERFICIE, z, cima); }
    }
  };

  // ---- 0. IL PIANO ---------------------------------------------------------
  // Un unico rettangolo piatto: tutte le postazioni e lo spiazzo libero ci
  // stanno dentro, quindi non c'e' un solo gradino da scavalcare per andare da
  // una macchina all'altra. Largo fino a x=48 per contenere l'ultimo ripetitore
  // (x=42) con del margine attorno.
  apri('piano');
  terreno(-32, 48, -8, 18);

  // ---- 1. I TAPPETI DELLE POSTAZIONI ---------------------------------------
  // Ogni macchina sta su una piazzola 3x3 di lana colorata. Non e' decorazione:
  // e' l'unica ETICHETTA che un mondo di voxel sa scrivere. Da lontano si conta
  // a colpo d'occhio quante postazioni ci sono e dove finisce la catena (tutti
  // i ripetitori sono gialli, il trasmettitore rosso).
  apri('tappeti');
  for (const p of POSTAZIONI) {
    const [px, , pz] = p.cella;
    for (let x = px - 1; x <= px + 1; x++) {
      for (let z = pz - 1; z <= pz + 1; z++) dipingi(x, SUPERFICIE, z, p.tappeto);
    }
  }

  // ---- 2. LA POZZA DELL'IDROVORA -------------------------------------------
  // Incassata a filo del terreno: si scava l'erba e si mette l'acqua alla stessa
  // quota, cosi' le sponde la contengono e non si allaga il mondo di prova.
  // Dista 2 celle dalla pompa (bordo z=−4 contro macchina a z=−2): dentro il
  // raggio 3 di fabbrica, che e' il punto — deve pompare appena arrivi.
  apri('pozza');
  for (let x = POZZA.x0; x <= POZZA.x1; x++) {
    for (let z = POZZA.z0; z <= POZZA.z1; z++) dipingi(x, SUPERFICIE, z, 'acqua');
  }

  // ---- 3. LA CATENA, SEGNATA A TERRA ---------------------------------------
  // Una riga di lana bianca fra un anello e l'altro: l'onda che parte dal
  // trasmettitore la si vede correre LUNGO questa riga, e chi guarda capisce
  // prima di toccare che quei cinque aggeggi sono una cosa sola. Si salta ogni
  // cella gia' coperta da un tappeto, altrimenti la bindella ci passerebbe
  // SOPRA e cancellerebbe proprio i colori che distinguono le postazioni.
  apri('bindella');
  const suUnTappeto = (x, z) => POSTAZIONI.some((p) => Math.abs(p.cella[0] - x) <= 1 && Math.abs(p.cella[2] - z) <= 1);
  for (let x = 18; x <= 42; x++) {
    if (!suUnTappeto(x, -2)) dipingi(x, SUPERFICIE, -2, 'lanaBianca');
  }

  // ---- 4. LO SPIAZZO LIBERO ------------------------------------------------
  // Richiesta esplicita: "spazio piano per piazzarne altre". Delimitato da una
  // cornice di lana bianca in modo che si veda dov'e' — dentro non c'e' NIENTE,
  // ed e' esattamente il punto.
  apri('spiazzo');
  for (let x = SPIAZZO.x0; x <= SPIAZZO.x1; x++) {
    for (const z of [SPIAZZO.z0, SPIAZZO.z1]) dipingi(x, SUPERFICIE, z, 'lanaBianca');
  }
  for (let z = SPIAZZO.z0; z <= SPIAZZO.z1; z++) {
    for (const x of [SPIAZZO.x0, SPIAZZO.x1]) dipingi(x, SUPERFICIE, z, 'lanaBianca');
  }

  // ---- 5. LE MACCHINE ------------------------------------------------------
  // `piazza` e non `puoiPiazzare`+`piazza`: qui il terreno lo abbiamo appena
  // costruito noi e sappiamo che e' piano e libero. Silenzioso (true) perche'
  // non e' il giocatore che sta arredando: nessun evento da mandare in rete.
  const macchine = [];
  if (arredo) {
    for (const p of POSTAZIONI) {
      const ist = arredo.piazza(p.defId, p.cella, 0, true);
      if (ist) macchine.push({ defId: p.defId, cella: p.cella, nome: p.nome });
    }
  }

  return {
    spawn: SPAWN_TEST_MACCHINE,
    conti,
    dipinti,
    macchine,
    postazioni: POSTAZIONI,
    totale: mondo.contaBlocchi,
    // celle da svegliare nella sim dell'acqua dopo la generazione (come in
    // collaudo.js): senza, la pozza resta un dato immobile e il pelo dell'acqua
    // non si assesta.
    acqua: celleAcqua(),
    zone: ZONE,
  };
}

/** Le celle d'acqua della pozza, per sim.pianificaAttorno(). */
function celleAcqua() {
  const c = [];
  for (let x = POZZA.x0; x <= POZZA.x1; x++) {
    for (let z = POZZA.z0; z <= POZZA.z1; z++) c.push([x, SUPERFICIE, z]);
  }
  return c;
}

/** Riferimenti di posizione (celle dei PIEDI). Li usa il menu debug: generata
 *  la scena compaiono i bottoni. Ogni macchina ha il SUO, perche' il punto
 *  interessante di questo mondo e' stare DAVANTI a una macchina precisa — e per
 *  il campanello e la catena c'e' anche il posto da cui si guarda lo spettacolo. */
export const ZONE = {
  spawn:         { nome: 'Spawn', piedi: SPAWN_TEST_MACCHINE },
  generatore:    { nome: '⚽ Generatore', piedi: [-26, PIEDI, 0] },
  scintillatore: { nome: '✨ Scintillatore', piedi: [-16, PIEDI, 0] },
  coltivatore:   { nome: '🌱 Coltivatore', piedi: [-8, PIEDI, 0] },
  idrovora:      { nome: '🚰 Idrovora', piedi: [0, PIEDI, 0], allaPozza: [0, PIEDI, -3] },
  campanello:    { nome: '🔔 Campanello', piedi: [8, PIEDI, 3], lontano: [8, PIEDI, 12] },
  catena:        { nome: '📡 Catena', piedi: [18, PIEDI, 0], meta: [30, PIEDI, 0], fondo: [42, PIEDI, 0] },
  spiazzo:       { nome: '🧱 Spiazzo libero', piedi: [12, PIEDI, 12] },
};
