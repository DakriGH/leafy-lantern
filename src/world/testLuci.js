// MONDO «TEST DELLE LUCI» — costruito per rispondere COI NUMERI, non a occhio.
//
// PERCHE' NON BASTA collaudo.js. Quella scena guarda luce E acqua insieme e fu
// scritta quando l'occlusione era una maschera di bit: mostra CHE le ombre
// esistono. Qui la domanda e' piu' stretta — le DUE CLASSI di luce si
// distinguono davvero? l'occlusione tiene nei casi difficili? i colori si
// sommano bene? cosa succede quando finiscono le 48 piastrelle dell'atlante?
// Ogni zona e' un esperimento con il suo controllo, e generaTestLuci() rende un
// rapporto coi conteggi: si verifica dal browser senza fidarsi di uno screenshot.
//
// CONVENZIONE DELLE QUOTE, come in collaudo.js: roccia a y=0, superficie a y=1,
// quindi i PIEDI stanno a y=2. Le lampade dei blocchi accendono la sfera al
// CENTRO della cella, cioe' mezza cella piu' in alto della quota che si legge qui.
//
//  ┌─ MAPPA (vista dall'alto, +x a destra, +z in basso) ─────────────────────┐
//  │ NORD  z −16..−2                                                         │
//  │  1 CONFRONTO   │ 2 OCCLUSIONE (7 prove)        │ 4 COLORATE + OMBRA     │
//  │  x −125..−85   │ x −84..38                     │ x 42..92               │
//  │··············· PASSEGGIATA LIBERA  z −1..3, x −125..92 ··················│
//  │ SUD   z 4..40                                                           │
//  │  6 FUOCHI FATUI │ 3 COLORATE (pavimento bianco) │ 5 SCALA: 36 stanzette │
//  │  x −125..−63    │ x −62..30                     │ x 31..92              │
//  └─────────────────────────────────────────────────────────────────────────┘
//
// PERCHE' TUTTO E' COSI' LARGO. Le lampade nuove hanno raggio 8: due prove a
// meno di 16 celle si contaminano a vicenda e la seconda non misura piu'
// niente. Il passo delle prove di occlusione e' 18 apposta, e i muri sono larghi
// 17 (8 celle per lato piu' il centro) perche' con un muro piu' stretto della
// sfera la luce gli GIRA ATTORNO e il "davanti dev'essere buio" non sarebbe piu'
// vero nemmeno con l'occlusione perfetta.
//
// LE LAMPADE DEL MONDO, in numeri (li rende anche il rapporto):
//   PESANTI (fanno ombra: il raggio cammina la griglia dei muri)
//     zona 1 ....  1     zona 2 ....  6     zona 4 ....  4
//     zona 3 ....  9     zona 5 .... 36     TOTALE ... 56
//   LEGGERE (trapassano i muri, per mestiere)
//     zona 1 ....  1     zona 2 ....  1 (la stanza chiusa gemella)
//     zona 6 ....  3 nidi (alone proprio) + 3 × 7 fuochi fatui in volo
//
// NON C'E' PIU' NESSUN TETTO, e due zone sono state ripensate per questo.
// Fino alla riscrittura delle ombre ogni lampada pesante possedeva una
// PIASTRELLA in un atlante da 48: oltre quel numero le lampade in eccesso
// tornavano a trapassare i muri, e questo mondo era costruito apposta per farlo
// VEDERE — 56 pesanti, cioe' 8 di troppo. Col cammino per-frammento l'ombra esce
// da una griglia dei muri unica per tutte le lampade del mondo: non c'e' niente
// da assegnare e niente da esaurire, quindi le 56 lampade fanno ombra tutte e 56.
//   · ZONA 5 (36 stanzette) non documenta piu' un tetto che finisce: adesso e' la
//     prova di SCALA, cioe' che 36 lampade pesanti vicine si comportino tutte
//     come una sola — ognuna con la sua luce dentro la sua stanza e la striscia
//     netta del paletto. Se un giorno il costo tornasse a dipendere dal numero di
//     lampade, e' qui che si vedrebbe per primo.
//   · ZONA 4 aveva due muri gemelli apposta per confrontare l'ombra CON e SENZA
//     piastrella: il muro B (x=78) trapelava perche' le sue erano proprio le due
//     lampade rimaste senza. Adesso i due muri sono lo stesso esperimento
//     ripetuto, ed e' voluto: sono l'A/B del trapelamento a distanze diverse
//     dall'origine del mondo, e devono dare ZERO tutti e due.

const SUOLO = 0, SUPERFICIE = 1, PIEDI = 2;

/** Cella dei piedi allo spawn: passeggiata centrale, terreno piatto. */
export const SPAWN_TEST_LUCI = [0, 2, 1];

/**
 * Costruisce il mondo di test dentro `mondo` (che viene svuotato).
 * Ritorna { spawn, zone, conti, lampade, totale, acqua }.
 */
export function generaTestLuci(mondo) {
  mondo.svuota();

  const conti = {};
  const lampade = { pesanti: 0, leggere: 0, perZona: {} };
  let aperta = null;
  const apri = (nome) => { aperta = nome; conti[nome] = 0; lampade.perZona[nome] = { pesanti: 0, leggere: 0 }; };
  const posa = (x, y, z, tipo) => {
    mondo.metti(x, y, z, tipo, true);
    conti[aperta]++;
    // CONTA LE LAMPADE MENTRE LE POSA: contarle dopo vorrebbe dire riscandire
    // il mondo con defDi(), cioe' rifare a valle un conto che qui e' gratis —
    // ed e' il numero su cui si regge tutta la zona 5.
    const d = LUCI_DEI_BLOCCHI[tipo];
    if (d) {
      if (d.ombra) { lampade.pesanti++; lampade.perZona[aperta].pesanti++; }
      else { lampade.leggere++; lampade.perZona[aperta].leggere++; }
    }
  };
  const togli = (x, y, z) => { mondo.togli(x, y, z, true); conti[aperta]--; };
  /** Prisma pieno, estremi compresi. */
  const scatola = (x0, x1, y0, y1, z0, z1, tipo) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) posa(x, y, z, tipo);
  };
  /** Terreno a due strati: roccia sotto, `cima` sopra. */
  const terreno = (x0, x1, z0, z1, cima = 'erba') => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) { posa(x, SUOLO, z, 'roccia'); posa(x, SUPERFICIE, z, cima); }
    }
  };
  /** Piedistallo di pietra + lampada in cima. La sfera va ALZATA da terra: a
   *  quota dei piedi meta' della pozza finisce sottoterra e ogni ombra nasce
   *  radente, che e' il caso peggiore per qualunque mappa d'ombra — buono da
   *  provare una volta (2e), pessimo come condizione di tutte le prove. */
  const suPalo = (x, z, yLamp, tipo) => {
    for (let y = PIEDI; y < yLamp; y++) posa(x, y, z, 'pietra');
    posa(x, yLamp, z, tipo);
  };

  // ---- 0. TERRENI ----------------------------------------------------------
  // La PASSEGGIATA z −1..3 e' l'unica cosa continua da un capo all'altro: tutte
  // le zone la toccano, quindi si raggiungono a piedi. Verificato zona per zona:
  // nessuna struttura scende sotto z=−2 dal lato nord, nessuna sale sopra z=4 dal
  // lato sud.
  apri('passeggiata');
  terreno(-125, 92, -1, 3);

  apri('terreni');
  terreno(-125, -85, -14, -2);            // zona 1
  terreno(-84, 38, -14, -2);              // zona 2
  terreno(42, 92, -16, -2);               // zona 4
  terreno(-125, -63, 4, 32);              // zona 6
  terreno(-62, 30, 4, 34, 'lanaBianca');  // zona 3: pavimento CHIARO, si legge la mescolanza
  terreno(31, 92, 4, 40, 'lanaBianca');   // zona 5: bianco per leggere le pozze dall'alto

  // ---- 1. CONFRONTO DIRETTO ------------------------------------------------
  // DUE MURI IDENTICI, DUE LAMPADE IDENTICHE: una PESANTE e una LEGGERA. E'
  // l'esperimento piu' importante del mondo di test, e tutto sta nel fatto che
  // le due lampade non differiscono per NIENTE tranne il campo `ombra` — stesso
  // colore, stesso raggio, stessa intensita', perfino le stesse facce del blocco
  // (vedi blocks.js, e non cambiarle).
  //   · a sinistra (lampada a x=−115): PESANTE — davanti al muro c'e' il buio;
  //   · a destra   (lampada a x=−95):  LEGGERA — il muro non la ferma.
  // I marcatori di lana a z=−4 sono il controllo a colpo d'occhio: il BIANCO
  // (sotto la pesante) resta al colore dell'ambiente, il ROSSO (sotto la leggera)
  // e' dentro la pozza. Distanza dalla lampada: √(2² + 5²) = 5.4 celle su un
  // raggio di 8, quindi dentro per costruzione e non per fortuna.
  // I DUE MURI NON SI TOCCANO (fessura x −106..−104) e la fessura non fa passare
  // niente: dista 10 celle da entrambe le lampade, cioe' 2 oltre il raggio.
  apri('confronto');
  scatola(-123, -107, PIEDI, 6, -6, -6, 'mattoni');      // muro della PESANTE
  suPalo(-115, -9, 4, 'lampadaPesante');
  posa(-115, PIEDI, -4, 'lanaBianca');
  scatola(-103, -87, PIEDI, 6, -6, -6, 'mattoni');       // muro della LEGGERA
  suPalo(-95, -9, 4, 'lampadaLeggera');
  posa(-95, PIEDI, -4, 'lanaRossa');

  // ---- 2. OCCLUSIONE -------------------------------------------------------
  apri('occlusione');

  // 2a — MURO PIENO (lampada a x=−76). Il controllo negativo di tutta la zona:
  // davanti non deve arrivare NIENTE. Il muro e' largo 17 e alto 8, cioe' piu'
  // della sfera in tutte le direzioni: qui non c'e' scampatoia geometrica, se si
  // vede luce davanti l'occlusione e' rotta.
  scatola(-84, -68, PIEDI, 9, -7, -7, 'mattoni');
  suPalo(-76, -10, 4, 'lampadaPesante');

  // 2b — FINESTRA (lampada a x=−58). Un TETTO pieno a quota 6 con UN buco 1×1, e
  // la lampada appoggiata sopra il buco: sotto dev'esserci il buio e in mezzo al
  // buio un QUADRATO di luce netto, ingrandito 3.67 volte (il foro sta 1.5 celle
  // sotto la lampada, il pavimento 5.5). Se i bordi del quadrato sono a scalini,
  // la mappa d'ombra e' tornata ad agganciarsi alla griglia dei voxel.
  //
  // PERCHE' UN TETTO E NON UN MURO CON UNO SCHERMO DAVANTI, che e' stata la prima
  // versione: la faccia illuminata di uno schermo e' quella rivolta ALLA LAMPADA,
  // cioe' quella che da' le spalle a chi guarda dalla passeggiata. Misurato: dalla
  // passeggiata lo schermo leggeva 111.4 di luminanza su tutta la lastra, cioe'
  // ambiente puro, e sembrava che il fascio non ci fosse. Col tetto il fascio
  // cade sul PAVIMENTO, che si guarda da sopra e da qualunque lato.
  //
  // IL TETTO E' LARGO 17: piu' stretto del raggio, la luce gli girerebbe attorno
  // dalle teste e sotto non ci sarebbe piu' nessun buio da bucare. In z invece
  // sborda apposta (fino a z=−2): la luce che scavalca il bordo sud finisce sulla
  // passeggiata, fuori dalla zona coperta, e non sporca la lettura.
  scatola(-66, -50, 6, 6, -13, -2, 'pietra');
  togli(-58, 6, -8);                                      // il foro
  posa(-58, 7, -8, 'lampadaPesante');                     // appoggiata sopra il foro

  // 2c — FESSURA (lampada a x=−40). Qui il taglio e' VERTICALE e alto quanto il
  // muro: attraverso la fessura passa una LAMA di luce che si posa sul pavimento
  // davanti al muro, e tutto il resto del pavimento resta al buio. E' il
  // dettaglio da UNA CELLA — il caso in cui la vecchia maschera cotta nei vertici
  // si sfaldava per costruzione, perche' un bit per cella non sa disegnare niente
  // di piu' fine di una cella.
  scatola(-48, -32, PIEDI, 8, -7, -7, 'mattoni');         // largo 17, come il tetto di 2b
  suPalo(-40, -10, 4, 'lampadaPesante');
  for (let y = PIEDI; y <= 8; y++) togli(-40, y, -7);

  // 2d — COLONNA SOTTILE (lampada a x=−22). Pilastro 1×1 alto 2 dentro la pozza.
  //
  // LA COLONNA E' BASSA E LA LAMPADA STA SOPRA DI LEI, ed e' tutta la differenza
  // fra una prova che si legge e una che non dice niente. Prima la colonna era
  // alta 6 e piu' alta della lampada: la sua ombra non finiva mai, correva fino
  // al bordo della pozza e a schermo si vedeva solo una pozza tagliata via —
  // misurato, luce da x=−24 in poi e buio prima, indistinguibile dal bordo della
  // sfera. Con la lampada a quota 5 e la colonna alta 2 la luce SCAVALCA la cima
  // e si riposa piu' in la': l'ombra diventa una striscia CHIUSA, con luce di
  // qua e di la', che e' l'unica forma su cui si possa misurare una lunghezza.
  // La colonna e' spostata di 2 celle in x cosi' la striscia cade in DIAGONALE:
  // una striscia vista di punta dalla passeggiata non si misura.
  scatola(-24, -24, PIEDI, 3, -7, -7, 'pietra');
  suPalo(-22, -10, 5, 'lampadaPesante');

  // 2e — SPORGENZA (lampada a x=−4). Una mensola con la lampada SOTTO, appoggiata
  // al muro di fondo. Il conto e' semplice e severo: sotto la mensola tutto
  // illuminato, SOPRA la mensola e sul muro sopra di essa tutto buio. E' il caso
  // che una diffusione a secchielli sbaglia sempre — la luce gira attorno agli
  // ostacoli, che e' esattamente cio' che un'ombra deve impedire.
  scatola(-12, 4, PIEDI, 9, -7, -7, 'mattoni');           // muro di fondo, alto
  scatola(-12, 4, 6, 6, -6, -3, 'asse');                  // la mensola
  posa(-4, PIEDI, -6, 'pietra');
  posa(-4, 3, -6, 'lampadaPesante');

  // 2f/2g — LE DUE STANZE CHIUSE (x 14 e x 32). Gemelle identiche, sigillate su
  // sei lati (il pavimento e' il terreno). Dentro la prima una lampada PESANTE,
  // dentro la seconda una LEGGERA. Da fuori: la prima e' invisibile, la seconda
  // si vede attraverso i muri e illumina il prato attorno. E' il confronto della
  // zona 1 portato al caso limite — qui non c'e' un muro da aggirare, c'e' una
  // scatola chiusa.
  // DISTANZA 18 FRA LE DUE, e serve: la leggera trapassa tutto per mestiere, e a
  // 10 celle avrebbe illuminato anche i dintorni della gemella pesante rovinando
  // proprio la prova che quella non trapela.
  for (const [cx, tipo] of [[14, 'lampadaPesante'], [32, 'lampadaLeggera']]) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      for (let z = -10; z <= -4; z++) {
        const bordo = x === cx - 3 || x === cx + 3 || z === -10 || z === -4;
        if (bordo) for (let y = PIEDI; y <= 5; y++) posa(x, y, z, 'pietra');
        posa(x, 6, z, 'pietra');                          // tetto su tutta la pianta
      }
    }
    posa(cx, PIEDI, -7, 'pietra');
    posa(cx, 3, -7, tipo);
  }

  // ---- 4. COLORATE + OMBRA -------------------------------------------------
  // IL CASO LIMITE DICHIARATO DAL COMMITTENTE: due lampade di colore DIVERSO ai
  // lati opposti dello STESSO muro. Col modello a bit di prima la maschera era
  // una sola per cella e i colori si sarebbero mescolati attraverso il muro.
  // Com'e' messa OGGI: lo shader cammina il muro UNA VOLTA PER OGNI LAMPADA
  // (uLuciOmbra[i] dice quali), quindi il trapelamento non c'e' per costruzione
  // — non c'e' nessun dato condiviso fra le due lampade in cui possa mescolarsi.
  //   muro A (x 56): ROSSO dietro (z −10), BLU davanti (z −4)
  //   muro B (x 78): ROSSO dietro,         VERDE davanti
  // Muri larghi 17 e alti 8: piu' della sfera, quindi se sul lato blu compare del
  // rosso non e' luce che ha girato l'angolo — e' trapelamento.
  //
  // I DUE MURI SONO LO STESSO ESPERIMENTO RIPETUTO, ed e' voluto. Fino alla
  // riscrittura non lo erano: il muro B trapelava (+64 di rosso sulla faccia
  // verde) perche' le sue due lampade erano proprio quelle rimaste senza
  // piastrella nell'atlante, ed era diventato per caso l'A/B fra "con mappa" e
  // "senza mappa". Sparito il tetto, sparita anche quella differenza — quindi
  // adesso i due muri misurano la stessa cosa a due distanze diverse
  // dall'origine, e DEVONO dare ZERO tutti e due. Se un giorno il muro B
  // ricominciasse a trapelare e il muro A no, il sospetto e' la precisione delle
  // coordinate mondo, non piu' un tetto che finisce.
  //
  // COME SI MISURA: si spegne SOLO la lampada dell'altro lato e si guarda se il
  // pixel cambia. E' l'unico modo di separare il trapelamento dal colore proprio
  // della lampada di qua, che non e' mai una primaria pura.
  apri('coloreOmbra');
  for (const [cx, davanti] of [[56, 'lampadaBlu'], [78, 'lampadaVerde']]) {
    scatola(cx - 8, cx + 8, PIEDI, 9, -7, -7, 'mattoni');
    suPalo(cx, -10, 4, 'lampadaRossa');
    suPalo(cx, -4, 4, davanti);
  }

  // ---- 3. COLORATE: LA MESCOLANZA ------------------------------------------
  // Lampade APPESE a mezz'aria sopra un pavimento di lana bianca. Appese e non
  // posate per una ragione precisa: un blocco-lampada e' SOLIDO, e a terra
  // farebbe da occlusore alla lampada vicina, striando di ombra proprio la zona
  // di sovrapposizione che si vuole leggere. A quota 7 (centro 7.5, pavimento a
  // 2) la sfera da 8 lascia a terra una pozza di raggio √(8² − 5.5²) = 5.81
  // celle; le coppie stanno a 8, quindi si sovrappongono per ~3.6 celle.
  //   riga z=11 ... ROSSO+VERDE (x −52, −44)   VERDE+BLU (x −20, −12)
  //   riga z=27 ... ROSSO+BLU  (x −52, −44)    TERNA R/V/B attorno a (−16, 27)
  // Le righe distano 16 (11+5.81 = 16.8 contro 27−5.81 = 21.2): non si toccano,
  // ogni gruppo si legge isolato.
  apri('colorate');
  const appesa = (x, z, tipo) => posa(x, 7, z, tipo);
  appesa(-52, 11, 'lampadaRossa'); appesa(-44, 11, 'lampadaVerde');
  appesa(-20, 11, 'lampadaVerde'); appesa(-12, 11, 'lampadaBlu');
  appesa(-52, 27, 'lampadaRossa'); appesa(-44, 27, 'lampadaBlu');
  // LA TERNA: triangolo attorno a (−16, 27). Tutte e tre le pozze coprono il
  // centro (le lampade distano 4.0, 3.6 e 3.6 celle in pianta contro un raggio a
  // terra di 5.81), quindi li' ci sono per forza R+V+B insieme — e' il punto in
  // cui si vede se la somma resta un colore o diventa bianco.
  appesa(-16, 23, 'lampadaRossa');
  appesa(-13, 29, 'lampadaVerde');
  appesa(-19, 29, 'lampadaBlu');

  // ---- 6. FUOCHI FATUI -----------------------------------------------------
  // Tre nidi. Quello di mezzo sta dentro un recinto senza tetto ed e' li' per una
  // prova sola: i fatui sono luci LEGGERE, quindi il recinto NON le ferma — da
  // fuori si vede l'alone passare attraverso i muri, e i corpicini stessi escono
  // e rientrano. E' il contrario esatto della zona 1, con la stessa geometria.
  apri('fuochiFatui');
  posa(-108, PIEDI, 12, 'fuochiFatui');
  posa(-76, PIEDI, 12, 'fuochiFatui');
  for (let x = -95; x <= -89; x++) {
    for (let z = 17; z <= 23; z++) {
      if (x === -95 || x === -89 || z === 17 || z === 23) for (let y = PIEDI; y <= 5; y++) posa(x, y, z, 'pietra');
    }
  }
  posa(-92, PIEDI, 20, 'fuochiFatui');

  // ---- 5. SCALA: 36 STANZETTE ----------------------------------------------
  // Griglia 6×6 di stanze 4×4 con muri condivisi alti 3 e SENZA tetto (si
  // ispeziona dall'alto, in volo). In ognuna una lucciola (raggio 5) e un
  // paletto alto 2.
  //
  // COSA SI GUARDA, E NON E' PIU' QUELLO DI PRIMA. Questa zona era costruita per
  // far vedere il TETTO DELL'ATLANTE finire: le ultime lampade restavano senza
  // piastrella, la loro luce sconfinava nelle stanze vicine e la striscia del
  // paletto spariva — un cambio d'aspetto netto, dall'alto, in mezzo a 36 celle
  // altrimenti identiche. Col cammino per-frammento non c'e' niente da esaurire
  // e tutte e 36 si comportano uguale, quindi la zona misura un'altra cosa:
  //
  //  · UNIFORMITA' — 36 stanzette identiche devono essere IDENTICHE. Dall'alto
  //    e' un motivo regolare, e qualunque cella che si stacchi (luce che
  //    sconfina, striscia che manca, striscia storta) si vede subito senza
  //    dover misurare niente: e' la stessa lettura di prima, con l'esito opposto.
  //  · SCALA DEL COSTO — 36 lampade pesanti tutte vicine sono la densita' piu'
  //    alta del gioco. Se un giorno il costo per pixel tornasse a dipendere dal
  //    NUMERO di lampade invece che dalla sovrapposizione delle pozze, e' qui
  //    che si vedrebbe per primo: si vola sopra la griglia e si guardano gli fps.
  apri('scala');
  const X0 = 34, Z0 = 6, PASSO = 5, N = 6;
  for (let i = 0; i <= N; i++) scatola(X0 + i * PASSO, X0 + i * PASSO, PIEDI, 4, Z0, Z0 + N * PASSO, 'pietra');
  for (let j = 0; j <= N; j++) scatola(X0, X0 + N * PASSO, PIEDI, 4, Z0 + j * PASSO, Z0 + j * PASSO, 'pietra');
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const cx = X0 + i * PASSO + 2, cz = Z0 + j * PASSO + 2;
      posa(cx, PIEDI, cz, 'lucciola');
      posa(cx + 1, PIEDI, cz + 1, 'pietra');              // il paletto che fa la striscia
      posa(cx + 1, 3, cz + 1, 'pietra');
    }
  }

  return {
    spawn: SPAWN_TEST_LUCI,
    conti,
    lampade,
    totale: mondo.contaBlocchi,
    acqua: [],                        // qui non c'e' acqua: e' un mondo di sola luce
    zone: ZONE,
  };
}

// LE LUCI DEI BLOCCHI, RICOPIATE A MANO E DI PROPOSITO. Importare BLOCCHI da
// blocks.js legherebbe il conteggio al registro RUNTIME, che l'Officina puo'
// riscrivere: un blocco custom che sovrascrive `lucciola` cambierebbe i numeri
// del rapporto senza che nessuno se ne accorga. Qui serve sapere cosa il mondo
// di test HA POSATO, non cosa il registro dice adesso.
// Se in blocks.js cambia la classe di uno di questi, va cambiata anche qui —
// test/test-luci.test.mjs fallisce apposta se le due tabelle divergono.
const LUCI_DEI_BLOCCHI = {
  lucciola: { ombra: true },
  lampadaPesante: { ombra: true },
  lampadaRossa: { ombra: true },
  lampadaVerde: { ombra: true },
  lampadaBlu: { ombra: true },
  lampadaLeggera: { ombra: false },
  fuochiFatui: { ombra: false },
};

/** Riferimenti di posizione (celle dei PIEDI). Li usa il menu debug: generata la
 *  scena compaiono i bottoni. Il punto interessante quasi mai e' l'ingresso,
 *  quindi ogni zona ne ha piu' d'uno. */
export const ZONE = {
  spawn:       { nome: 'Spawn', piedi: [0, 2, 1] },
  confronto:   { nome: '1. Confronto', piedi: [-105, 2, -3], pesante: [-115, 2, -3], leggera: [-95, 2, -3] },
  muroPieno:   { nome: '2a. Muro pieno', piedi: [-76, 2, -3], dietro: [-76, 2, -12] },
  finestra:    { nome: '2b. Finestra', piedi: [-58, 2, 0], sottoIlTetto: [-58, 2, -4], nelFascio: [-58, 2, -8] },
  fessura:     { nome: '2c. Fessura', piedi: [-40, 2, 0], nellaLama: [-40, 2, -4] },
  colonna:     { nome: '2d. Colonna', piedi: [-22, 2, -3] },
  sporgenza:   { nome: '2e. Sporgenza', piedi: [-4, 2, -2], sotto: [-4, 2, -4] },
  stanze:      { nome: '2f. Stanze chiuse', piedi: [23, 2, -7], dentroPesante: [14, 2, -6], dentroLeggera: [32, 2, -6] },
  coloreOmbra: { nome: '4. Colorate + ombra', piedi: [56, 2, -2], dietro: [56, 2, -12], muroB: [78, 2, -2] },
  colorate:    { nome: '3. Colorate', coppia1: [-48, 2, 11], coppia2: [-16, 2, 11], coppia3: [-48, 2, 27], terna: [-16, 2, 27] },
  fuochiFatui: { nome: '6. Fuochi fatui', piedi: [-108, 2, 14], recinto: [-92, 2, 14], terzo: [-76, 2, 14] },
  scala:       { nome: '5. Scala (36 stanze)', piedi: [36, 2, 3], prima: [37, 2, 8], ultima: [60, 2, 33] },
};
