// SCENA DI COLLAUDO — un mondo costruito a mano per guardare TUTTI i fenomeni
// di luce e acqua in un colpo solo.
//
// Perché esiste: i mondi procedurali (arcipelago/open world) sono comodi per i
// test di carico ma pessimi per il lavoro grafico — un fenomeno o non c'è, o è
// dall'altra parte della mappa, o cambia al seme successivo. Qui la geometria è
// FISSA e le zone sono a distanza di camminata: se una modifica allo shader
// rompe le ombre sui gradini te ne accorgi nello stesso screenshot in cui vedi
// la cascata.
//
// CONVENZIONE DELLE QUOTE: il piano di base ha i blocchi a y=0 (roccia) e y=1
// (erba), quindi la superficie calpestabile — dove stanno i PIEDI — è y=2.
// Tutte le zone crescono sopra questo piano.
//
//   ┌─ MAPPA (vista dall'alto, +x a destra, +z verso il basso) ──────────────┐
//   │  terrazze   grotta   tettoia   muro        pozza  cascata  rampa       │
//   │  x -30..-23 x -18..-12 x -6..-2 x 2..10   x 17..21 x 22..28 x 29..33   │
//   │  ······················ passeggiata z -1..2 ···························│
//   │            piano nudo: x -10..10, z 3..15 (qui NON deve esserci ombra) │
//   └────────────────────────────────────────────────────────────────────────┘
//
// TELETRASPORTI UTILI (celle dei piedi, da usare con controller.spawn([x,y,z])):
//   spawn / passeggiata ...... [  0, 2,  0]
//   1. terrazze (piede) ...... [-26, 2, -2]   in cima: [-30, 10, -7]
//   2. grotta (porta) ........ [-15, 2, -3]   dentro:  [-15,  2, -7]
//   3. tettoia (sotto) ....... [ -4, 2, -7]
//   4. muro (lato in ombra) .. [  6, 2, -4]   lato luce: [  6, 2, -10]
//   5. cascata (ai piedi) .... [ 19, 2, -6]   in cima:   [ 25, 8, -3]
//   6. piano nudo ............ [  0, 2,  9]

// Confini del piano di base. Largo abbastanza da contenere tutte le zone con
// una passeggiata continua che le collega tutte a piedi.
// LA PASSEGGIATA LIBERA È z −1..2, non z −3..2 come diceva prima questa riga:
// il rilievo della cascata occupa z −10..−2 per x 22..33, quindi a z=−3 e z=−2
// la strada è murata da sei blocchi di roccia su tutto il lato est. Verificato
// cella per cella: a z −1..2 non c'è nulla in mezzo per nessuna x.
const BASE = { x0: -34, x1: 36, z0: -12, z1: 2 };
const PIANO_NUDO = { x0: -10, x1: 10, z0: 3, z1: 15 };

/** Cella dei piedi dello spawn: passeggiata centrale, terreno perfettamente piatto. */
export const SPAWN_COLLAUDO = [0, 2, 0];

/** Costruisce la scena di collaudo dentro `mondo` (che viene svuotato).
 *  Ritorna un rapporto con il conteggio dei blocchi per zona e le coordinate:
 *  serve per VERIFICARE dal browser che tutte e sei le zone esistano davvero,
 *  senza doversi fidare di uno screenshot. */
export function generaCollaudo(mondo) {
  mondo.svuota();

  // Contatore per zona: apri('nome') apre un bucket, ogni posa() successiva ci
  // finisce dentro. Serve a VERIFICARE dal browser che ogni zona sia stata
  // costruita davvero, con i numeri invece che a occhio su uno screenshot.
  const conti = {};
  let aperta = null;
  const apri = (nome) => { aperta = nome; conti[nome] = 0; };
  const posa = (x, y, z, tipo) => {
    mondo.metti(x, y, z, tipo, true);
    conti[aperta]++;
  };

  // ---- 0. PIANO DI BASE + PIANO NUDO ---------------------------------------
  // Due strati: roccia sotto, erba sopra. La superficie è a y=1, i piedi a y=2.
  apri('base');
  for (let x = BASE.x0; x <= BASE.x1; x++) {
    for (let z = BASE.z0; z <= BASE.z1; z++) {
      posa(x, 0, z, 'roccia');
      posa(x, 1, z, 'erba');
    }
  }

  // ---- 6. PIANO NUDO -------------------------------------------------------
  // Rettangolo d'erba perfettamente piatto, attaccato al piano di base e
  // LONTANO da ogni blocco luminoso (la lucciola più vicina è a 12 celle, con
  // raggio 5). È il controllo negativo: qui qualunque ombra è un falso positivo.
  apri('pianoNudo');
  for (let x = PIANO_NUDO.x0; x <= PIANO_NUDO.x1; x++) {
    for (let z = PIANO_NUDO.z0; z <= PIANO_NUDO.z1; z++) {
      posa(x, 0, z, 'roccia');
      posa(x, 1, z, 'erba');
    }
  }

  // ---- 1. TERRAZZE ---------------------------------------------------------
  // Scalinata di gradini da 1 blocco: x=-23 è il gradino più basso, x=-30 il
  // più alto. È la geometria che ha fatto fallire i tentativi precedenti di
  // ombre — OGNI gradino è un occlusore per quello sotto, e un errore di un
  // solo blocco nel campionamento si vede come banding sulle alzate.
  apri('terrazze');
  for (let x = -30; x <= -23; x++) {
    const altezza = -23 - x + 1;                 // x=-23 → 1 … x=-30 → 8
    for (let z = -10; z <= -4; z++) {
      for (let i = 0; i < altezza; i++) {
        const cima = i === altezza - 1;
        posa(x, 2 + i, z, cima ? 'erba' : 'terra');
      }
    }
  }

  // ---- 2. GROTTA -----------------------------------------------------------
  // Stanza 7×7 esterni (interno 5×5), alta 3 (aria a y=2,3,4), tetto a y=5, con
  // una lucciola dentro. Serve a vedere una LAMPADA prevalere sul cielo.
  //
  // COSA PROVA, ADESSO. Qui c'era un criterio scritto sul canale CIELO cotto nei
  // vertici ("l'angolo più lontano deve stare ALMENO 8 livelli sotto il prato
  // aperto", con misure tipo "cielo 13 sulla porta, 11 alla lucciola, 7
  // nell'angolo"). Quel canale non esiste più — il giorno e la notte li fa
  // uAmbiente, che è un colore globale — quindi il criterio non è nemmeno
  // misurabile, e lasciarlo scritto voleva dire mandare chi legge a cercare un
  // numero che nessuno produce più. Il modello di oggi è una MASCHERA
  // D'OCCLUSIONE per lampada: per ogni faccia, quali sfere ci arrivano davvero.
  // LE DUE PROVE VERE, ed è ancora una prova severa:
  //  · dentro la stanza la lucciola ARRIVA — occlusaFaccia(-15,1,-7,[0,1,0]) = 0,
  //    cioè nessuna lampada bloccata sul pavimento sotto di lei;
  //  · fuori NO: la stessa faccia sul prato aperto (0,1,9) vale 1, e così la
  //    passeggiata. La stanza è l'unico posto illuminato, e le pareti reggono.
  // La porta 1×2 resta aperta perché ci si deve poter entrare, e non toglie
  // niente alla prova: l'ambiente entra ovunque per costruzione (è un colore, non
  // una propagazione) e quello che si guarda qui è la sfera.
  apri('grotta');
  const G = { x0: -18, x1: -12, z0: -10, z1: -4 };
  for (let x = G.x0; x <= G.x1; x++) {
    for (let z = G.z0; z <= G.z1; z++) {
      const bordo = x === G.x0 || x === G.x1 || z === G.z0 || z === G.z1;
      if (bordo) for (let y = 2; y <= 4; y++) posa(x, y, z, 'pietra');
      posa(x, 5, z, 'pietra');                   // tetto su tutta la pianta
    }
  }
  // porta alta 2 sulla parete +z (quella che dà sulla passeggiata)
  mondo.togli(-15, 2, G.z1, true);
  mondo.togli(-15, 3, G.z1, true);
  conti.grotta -= 2;
  posa(-15, 2, -7, 'lucciola');                  // la luce, al centro della stanza

  // ---- 3. TETTOIA ----------------------------------------------------------
  // Piattaforma 5×5 sospesa: il pavimento è il piano di base (superficie y=1),
  // quindi 4 blocchi d'aria (y=2,3,4,5) e la piattaforma a y=6.
  //
  // NON CI SI DEVE ASPETTARE NESSUNA OMBRA, e nemmeno il "pianoro morbido" di
  // occlusione del cielo che questo commento descriveva prima: quel canale è
  // stato cancellato insieme all'occlusione ambientale e all'ombra per faccia.
  // Ombre direzionali del sole non ce ne sono mai state (è una scelta: su un
  // terreno a terrazze ogni gradino sarebbe un occlusore e i prati si
  // riempirebbero di rettangoli scuri), e la maschera d'occlusione riguarda le
  // sole LAMPADE — qui la più vicina è a 11 celle con raggio 5, cioè fuori
  // portata.
  // VERIFICATO a runtime, ed è il punto: occlusaFaccia(-4,1,-7,[0,1,0]) sotto il
  // tetto e occlusaFaccia(0,1,9,[0,1,0]) sul piano nudo danno lo stesso identico
  // valore (1, "nessuna lampada arriva"). Lo shader produce quindi lo STESSO
  // pixel nei due punti: per la luce, questa zona non distingue più niente.
  // COSA PROVA ANCORA, e non è poco: il RIPARO DALLE OMBRE DELLE NUVOLE.
  // lanternaOmbra() legge la heightmap del cielo e si spegne sotto un tetto, per
  // cui passando una nuvola la passeggiata si scurisce e sotto la tettoia no.
  // È l'unico fenomeno che questa zona esercita — se un giorno servisse provare
  // la maschera per-lampada, qui va messa una lampada, non un tetto.
  apri('tettoia');
  for (let x = -6; x <= -2; x++) for (let z = -9; z <= -5; z++) posa(x, 6, z, 'asse');

  // ---- 4. MURO CON LAMPIONE DIETRO -----------------------------------------
  // Muro pieno largo 9 (x 2..10) e alto 5 (y 2..6) sul piano z=-7, con la
  // lucciola dal lato -z. Il test è brutale: dal lato +z (la passeggiata) NON
  // si deve vedere nulla della luce. Se trapassa, l'occlusione è rotta.
  apri('muro');
  for (let x = 2; x <= 10; x++) for (let y = 2; y <= 6; y++) posa(x, y, -7, 'mattoni');
  posa(6, 2, -9, 'pietra');                      // colonnina, per alzare la luce
  posa(6, 3, -9, 'pietra');
  posa(6, 4, -9, 'lucciola');                    // a metà altezza del muro

  // ---- 5. CASCATA ----------------------------------------------------------
  // Rilievo x 22..28 alto fino a y=7 (superficie y=7, piedi y=8), con un canale
  // scavato lungo z=-6 in cui sta la SORGENTE d'acqua a y=6. Come in
  // worldgen.js: il letto è INCASSATO di un blocco, così le sponde contengono
  // il flusso e l'acqua trabocca solo dal ciglio ovest (x=22) — da lì cade 5
  // blocchi nella pozza. La cascata nasce dalla sim, non è disegnata a mano.
  apri('cascata');
  for (let x = 22; x <= 28; x++) {
    for (let z = -10; z <= -2; z++) {
      for (let y = 2; y <= 7; y++) posa(x, y, z, y === 7 ? 'erba' : 'roccia');
    }
  }
  // rampa di gradini da 1 per salire in cima al rilievo (x=33 → x=29)
  for (let x = 29; x <= 33; x++) {
    const cima = 7 - (x - 28);                   // x=29 → 6 … x=33 → 2
    for (let z = -10; z <= -2; z++) {
      for (let y = 2; y <= cima; y++) posa(x, y, z, y === cima ? 'erba' : 'roccia');
    }
  }
  // canale: scavo due blocchi e ci metto la sorgente sul fondo
  for (let x = 22; x <= 28; x++) {
    mondo.togli(x, 7, -6, true);
    mondo.togli(x, 6, -6, true);
    conti.cascata -= 2;
    posa(x, 6, -6, 'acqua');
  }
  // pozza di raccolta: scavo l'erba e riempio a filo del terreno
  for (let x = 17; x <= 21; x++) {
    for (let z = -8; z <= -4; z++) {
      mondo.togli(x, 1, z, true);
      conti.base--;
      posa(x, 1, z, 'acqua');
    }
  }

  // (niente `mondo.sporco = true` qui: Mondo non ha nessun campo con quel nome
  //  — ha `sporchi`/`sporchiAcqua`, che metti() aggiorna da solo — ed era una
  //  riga senza effetto copiata da worldgen.js, dov'è altrettanto morta.)

  return {
    spawn: SPAWN_COLLAUDO,
    conti,
    totale: mondo.contaBlocchi,
    // celle da svegliare nella sim dell'acqua dopo la generazione, altrimenti
    // la sorgente resta immobile e la cascata non parte mai
    acqua: sorgenti(),
    zone: ZONE,
  };
}

/** Le sorgenti d'acqua da passare a sim.pianificaAttorno() dopo la generazione. */
function sorgenti() {
  const c = [];
  for (let x = 22; x <= 28; x++) c.push([x, 6, -6]);
  for (let x = 17; x <= 21; x++) for (let z = -8; z <= -4; z++) c.push([x, 1, z]);
  return c;
}

/** Riferimenti di posizione per teletrasportarsi (celle dei PIEDI).
 *  Li usa il menu debug: generata la scena, compaiono i bottoni delle zone —
 *  prima questa tabella esisteva, veniva restituita in `r.zone` e main.js la
 *  ignorava, quindi l'unico modo di usarla era digitare controller.spawn([…])
 *  in console. Documentata e non cablata. */
export const ZONE = {
  spawn:     { nome: 'Spawn / passeggiata', piedi: [0, 2, 0] },
  terrazze:  { nome: '1. Terrazze',   piedi: [-26, 2, -2],  cima:   [-30, 10, -7] },
  grotta:    { nome: '2. Grotta',     piedi: [-15, 2, -3],  dentro: [-15, 2, -7] },
  tettoia:   { nome: '3. Tettoia',    piedi: [-4, 2, -7] },
  muro:      { nome: '4. Muro',       piedi: [6, 2, -4],    retro:  [6, 2, -10] },
  cascata:   { nome: '5. Cascata',    piedi: [19, 2, -6],   cima:   [25, 8, -3] },
  pianoNudo: { nome: '6. Piano nudo', piedi: [0, 2, 9] },
};

// (via eAcqua(): esportata e mai importata da nessuna parte. Chi controlla
//  dal browser ha già mondo.tipo() e defDi().)
