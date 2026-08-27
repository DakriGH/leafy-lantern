// BANCO OMBRE E LUCI — il posto dove si GUARDA se l'illuminazione è giusta, e
// dove si va a vedere cosa fa un parametro prima di metterlo in un blocco
// nell'Officina.
//
// PERCHÉ UN ALTRO MONDO DI PROVA. `testLuci.js` risponde a una domanda stretta e
// vecchia (le due classi di lampada si distinguono? l'occlusione tiene?) e
// `collaudo.js` guarda luce e acqua insieme. Qui le domande sono quelle di oggi:
//   · l'ombra di un mobile ha la FORMA del mobile, o la forma della griglia?
//   · il terreno a terrazze fa ancora i denti di sega?
//   · un albero fa ombra alla luce del lampione accanto, e il lampione resta acceso?
//   · e soprattutto: che aspetto ha una sorgente al variare di RAGGIO, INTENSITÀ,
//     COLORE e OMBRA — cioè i quattro campi che l'Officina mette in mano a chi
//     crea un blocco luminoso.
//
// LA MATRICE È IL PEZZO CHE SERVE ALL'EDITOR. Ogni riga fa variare UNA cosa sola
// e tiene ferme le altre, che è l'unico modo di attribuire un effetto a una
// causa. I campioni sono distanziati abbastanza da non contaminarsi: le pozze si
// sommano, e due prove vicine diventano una terza cosa che non misura nulla.
//
//  ┌─ MAPPA (dall'alto, +x a destra, +z in basso) ───────────────────────────┐
//  │ 1 SAGOME AL SOLE      2 TERRAZZE        3 INGOMBRI                       │
//  │ x −46..−14            x −10..12         x 16..44                         │
//  │·············· PASSEGGIATA z −1..2, da un capo all'altro ·················│
//  │ 4 MATRICE DELLE SORGENTI (quattro righe)                                 │
//  │ x −46..44, z 6..38                                                       │
//  └──────────────────────────────────────────────────────────────────────────┘
//
// LE QUOTE seguono la convenzione delle altre scene: roccia a y=0, superficie a
// y=1, PIEDI a y=2. Le lampade dei blocchi accendono la sfera al CENTRO della
// cella, cioè mezza cella sopra la quota che si legge qui.

import { registraBlocco, BLOCCHI, CATEGORIA_PROVE } from './blocks.js?v=mtbggcsp';

const SUOLO = 0, SUPERFICIE = 1, PIEDI = 2;

/** Cella dei piedi allo spawn: in mezzo alla passeggiata, terreno piatto. */
export const SPAWN_BANCO = [0, 2, 0];

// ---- LE SORGENTI DELLA MATRICE ---------------------------------------------
// Sono blocchi VERI, registrati come farebbe l'Officina: si possono prendere dal
// zaino e piazzare, ed è metà del motivo per cui questo mondo esiste. Il colore
// del blocco racconta il colore della sua luce, così la carta si legge anche
// spenta.
//
// I NOMI DICONO IL PARAMETRO, non «lampada 3»: chi arriva qui sta cercando di
// capire cosa scrivere nel campo «raggio», e un elenco di numeri senza nome non
// lo aiuta.
const AMBRA = { cima: 0xffeab4, lato: 0xf0c063, fondo: 0xd9a744 };
const MATRICE = [
  // riga RAGGIO: cambia solo quanto è larga la pozza
  { id: 'prova:r3', nome: 'Raggio 3', ...AMBRA, luce: { colore: 0xffd889, raggio: 3, intensita: 1.1, ombra: true }, riga: 'raggio', et: 'r 3' },
  { id: 'prova:r6', nome: 'Raggio 6', ...AMBRA, luce: { colore: 0xffd889, raggio: 6, intensita: 1.1, ombra: true }, riga: 'raggio', et: 'r 6' },
  { id: 'prova:r9', nome: 'Raggio 9', ...AMBRA, luce: { colore: 0xffd889, raggio: 9, intensita: 1.1, ombra: true }, riga: 'raggio', et: 'r 9' },
  { id: 'prova:r13', nome: 'Raggio 13', ...AMBRA, luce: { colore: 0xffd889, raggio: 13, intensita: 1.1, ombra: true }, riga: 'raggio', et: 'r 13' },
  // riga INTENSITÀ: stessa larghezza, quanta luce ci mette dentro
  { id: 'prova:i04', nome: 'Intensità 0.4', ...AMBRA, luce: { colore: 0xffd889, raggio: 8, intensita: 0.4, ombra: true }, riga: 'intensita', et: 'i 0.4' },
  { id: 'prova:i08', nome: 'Intensità 0.8', ...AMBRA, luce: { colore: 0xffd889, raggio: 8, intensita: 0.8, ombra: true }, riga: 'intensita', et: 'i 0.8' },
  { id: 'prova:i13', nome: 'Intensità 1.3', ...AMBRA, luce: { colore: 0xffd889, raggio: 8, intensita: 1.3, ombra: true }, riga: 'intensita', et: 'i 1.3' },
  { id: 'prova:i20', nome: 'Intensità 2.0', ...AMBRA, luce: { colore: 0xffd889, raggio: 8, intensita: 2.0, ombra: true }, riga: 'intensita', et: 'i 2.0' },
  // riga COLORE: le primarie e due tinte da diorama
  { id: 'prova:cRosso', nome: 'Colore rosso', cima: 0xffb4b4, lato: 0xe06a6a, fondo: 0xb84a4a, luce: { colore: 0xff3020, raggio: 8, intensita: 1.1, ombra: true }, riga: 'colore', et: 'rosso' },
  { id: 'prova:cVerde', nome: 'Colore verde', cima: 0xc9ffb4, lato: 0x74d06a, fondo: 0x53a84a, luce: { colore: 0x30ff40, raggio: 8, intensita: 1.1, ombra: true }, riga: 'colore', et: 'verde' },
  { id: 'prova:cBlu', nome: 'Colore blu', cima: 0xb4d4ff, lato: 0x6a94e0, fondo: 0x4a70b8, luce: { colore: 0x3060ff, raggio: 8, intensita: 1.1, ombra: true }, riga: 'colore', et: 'blu' },
  { id: 'prova:cFreddo', nome: 'Colore bianco freddo', cima: 0xe8f4ff, lato: 0xc0d8ee, fondo: 0x9db8d4, luce: { colore: 0xd8ecff, raggio: 8, intensita: 1.1, ombra: true }, riga: 'colore', et: 'freddo' },
  // riga OMBRA: la stessa lampada, con e senza. È la coppia che spiega la scelta
  // più importante dell'Officina, e va guardata da DIETRO il muretto.
  { id: 'prova:oSi', nome: 'Ombra sì (pesante)', ...AMBRA, luce: { colore: 0xffd889, raggio: 8, intensita: 1.1, ombra: true }, riga: 'ombra', et: 'ombra SÌ' },
  { id: 'prova:oNo', nome: 'Ombra no (leggera)', cima: 0xffd6ea, lato: 0xef9ac4, fondo: 0xd47aa6, luce: { colore: 0xffd889, raggio: 8, intensita: 1.1, ombra: false }, riga: 'ombra', et: 'ombra NO' },
];

/** Registra (una volta) i blocchi della matrice. Idempotente: rigenerare il
 *  mondo non deve moltiplicare niente. */
function registraSorgenti() {
  for (const v of MATRICE) {
    if (BLOCCHI[v.id]) continue;
    registraBlocco(v.id, {
      nome: v.nome, cima: v.cima, lato: v.lato, fondo: v.fondo,
      solido: true, nav: 10, fam: 'mina', salute: 100, luce: { ...v.luce },
    }, CATEGORIA_PROVE);
  }
}

/** I tre blocchi con forma non cubica, registrati come farebbe l'Officina. */
function registraForme() {
  const F = [
    { id: 'prova:lastra', nome: 'Lastra di prova', forma: 'lastra' },
    { id: 'prova:pilastro', nome: 'Pilastro di prova', forma: 'pilastro' },
    { id: 'prova:croce', nome: 'Croce di prova', forma: 'croce' },
  ];
  for (const v of F) {
    if (BLOCCHI[v.id]) continue;
    registraBlocco(v.id, {
      nome: v.nome, cima: 0xd8cfc0, lato: 0xbdb2a0, fondo: 0x9c9284,
      solido: true, nav: 10, fam: 'mina', salute: 100, forma: v.forma,
    }, CATEGORIA_PROVE);
  }
}

/**
 * Costruisce il banco dentro `mondo` (che viene svuotato).
 * Ritorna { spawn, zone, conti, furni, sorgenti, totale }: `furni` lo piazza
 * chi chiama (il generatore non conosce l'arredo), `zone` diventa i bottoni di
 * teletrasporto del menu debug.
 */
export function generaBancoOmbre(mondo) {
  registraSorgenti();
  mondo.svuota();

  const conti = {};
  let aperta = null;
  const apri = (nome) => { aperta = nome; conti[nome] = 0; };
  const posa = (x, y, z, tipo) => { mondo.metti(x, y, z, tipo, true); conti[aperta]++; };
  const terreno = (x0, x1, z0, z1, cima = 'erba') => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) { posa(x, SUOLO, z, 'roccia'); posa(x, SUPERFICIE, z, cima); }
    }
  };
  const scatola = (x0, x1, y0, y1, z0, z1, tipo) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) posa(x, y, z, tipo);
  };
  const furni = [];

  // ---- 0. IL PAVIMENTO -------------------------------------------------------
  // Tutto su un piano solo e continuo: qui si giudicano le OMBRE, e un terreno
  // mosso le spezzerebbe rendendo ogni confronto un'opinione. Le uniche cose che
  // salgono sono quelle che devono proiettare.
  apri('pavimento');
  terreno(-48, 52, -8, 78);

  // ---- 1. SAGOME AL SOLE -----------------------------------------------------
  // La domanda: l'ombra ha la forma della cosa? Ogni campione e' isolato, con
  // attorno prato libero, perche' un'ombra si legge dal suo BORDO e un bordo
  // attaccato a un altro oggetto non si legge.
  // In fila ci sono i mobili e, di seguito, le loro controparti costruite a
  // blocchi: il cubo e la colonna sono il riferimento «ombra che sappiamo
  // giusta», quindi se una sagoma sfigura accanto a loro il difetto e' suo.
  //
  // DA CHE PARTE SI GUARDA — ed e' il motivo per cui tutto sta a SUD della
  // strada. L'astro gira in un settore DIAGONALE fisso (fx/daynight.js), quindi
  // qui le ombre cadono SEMPRE verso −x e −z. Mettendo gli oggetti a sud, la
  // loro ombra cade nel prato FRA loro e la strada: uno cammina e le vede tutte
  // senza girarci attorno. Con la fila dalla parte sbagliata si vedrebbero solo
  // i sederi degli oggetti.
  apri('sagome');
  furni.push({ id: 'albero', cella: [-42, PIEDI, 7], rot: 0 });
  furni.push({ id: 'lampione', cella: [-37, PIEDI, 7], rot: 0 });
  furni.push({ id: 'panchina', cella: [-32, PIEDI, 7], rot: 0 });
  furni.push({ id: 'albero', cella: [-27, PIEDI, 7], rot: 0 });
  scatola(-22, -22, PIEDI, PIEDI, 7, 7, 'pietra');            // cubo singolo
  scatola(-19, -19, PIEDI, PIEDI + 2, 7, 7, 'pietra');        // colonna da 3
  // una TETTOIA in disparte: sotto non deve mai arrivare il sole, ed e' il caso
  // che una regola sbagliata sui blocchi di superficie rompe per prima. Sta da
  // sola perche' il suo pezzo interessante e' l'OMBRA PIENA sotto, e un mobile
  // accanto ci butterebbe dentro la sua.
  scatola(-14, -10, PIEDI + 3, PIEDI + 3, 6, 10, 'asse');
  for (const x of [-14, -10]) for (const z of [6, 10]) scatola(x, x, PIEDI, PIEDI + 2, z, z, 'tronco');

  // ---- 2. TERRAZZE -----------------------------------------------------------
  // Il caso che ha fatto arrabbiare piu' di ogni altro: gradini da UN blocco, che
  // per anni hanno buttato ognuno la sua linguetta d'ombra su quello sotto. Qui
  // ci sono sia la scalinata fitta sia un pendio piu' dolce, cosi' si vede subito
  // se il seghettato e' tornato e da quale dei due.
  apri('terrazze');
  for (let g = 0; g < 6; g++) {
    for (let x = -4; x <= 6; x++) for (let z = 6 + g; z <= 16; z++) posa(x, PIEDI + g, z, 'erba');
  }
  for (let g = 0; g < 3; g++) {
    for (let x = 10; x <= 18; x++) for (let z = 6 + g * 3; z <= 16; z++) posa(x, PIEDI + g, z, 'erba');
  }

  // ---- 2b. TUTTI I MOBILI IN FILA --------------------------------------------
  // Ogni mobile del registro che ha un modello da guardare, uno accanto
  // all'altro col suo spazio: è la rassegna «l'ombra somiglia alla cosa?» estesa
  // a TUTTO il catalogo, macchinari compresi — se un modello nuovo entra nel
  // gioco e la sua sagoma viene fuori storta, è qui che lo si becca in un
  // colpo d'occhio, non in giro per un diorama.
  apri('catalogo');
  const CATALOGO = ['albero', 'panchina', 'lampione', 'generatore', 'scintillatore',
    'coltivatore', 'idrovora', 'campanello', 'trasmettitore', 'ripetitore'];
  CATALOGO.forEach((id, i) => furni.push({ id, cella: [-44 + i * 5, PIEDI, 20], rot: 0 }));

  // ---- 2c. LE FORME NON CUBICHE ----------------------------------------------
  // Lastra, pilastro e croce vivono nella griglia come celle piene: la loro
  // ombra oggi è quella di un CUBO intero, ed è un'incoerenza nota — sta qui
  // in fila apposta perché si veda e non si dimentichi.
  apri('forme');
  registraForme();
  posa(6, PIEDI, 20, 'prova:lastra');
  posa(10, PIEDI, 20, 'prova:pilastro');
  posa(14, PIEDI, 20, 'prova:croce');

  // ---- 3. INGOMBRI: chi emette ignora se stesso -------------------------------
  // A sinistra un lampione DA SOLO: la sua pozza dev'essere intera, il palo non
  // si fa ombra da se'. A destra lo stesso lampione con un albero addosso:
  // l'albero taglia la pozza ma la lampada resta accesa e la chioma NON si
  // annerisce. E' la coppia che dimostra la regola, e va guardata di notte.
  apri('ingombri');
  furni.push({ id: 'lampione', cella: [24, PIEDI, 8], rot: 0 });
  furni.push({ id: 'lampione', cella: [34, PIEDI, 8], rot: 0 });
  furni.push({ id: 'albero', cella: [36, PIEDI, 8], rot: 0 });
  // e un muretto con la lampada dietro: il classico «di la' dev'essere buio»
  scatola(41, 45, PIEDI, PIEDI + 2, 8, 8, 'pietra');
  posa(43, PIEDI + 1, 11, 'prova:oSi');

  // ---- 4. LA MATRICE DELLE SORGENTI ------------------------------------------
  // Una riga per parametro, un campione ogni 12 celle. Ogni campione ha:
  //   · un piedistallo, perché una lampada a terra affoga metà pozza sottoterra;
  //   · un MURETTO a nord, che è il modo di vedere l'ombra invece di indovinarla;
  //   · una toppa chiara sotto, perché il verde dell'erba tinge tutto e due
  //     colori diversi sullo stesso verde si confrontano male.
  // IL PASSO È QUINDICI e non dieci: la pozza più larga della matrice ha raggio
  // 13, e due campioni più vicini della somma dei loro raggi non si confrontano
  // più — si sommano, e quello che si guarda è una terza cosa che non è nessuno
  // dei due. Un po' si toccano lo stesso ai bordi, ma il centro di ogni campione
  // è suo.
  apri('matrice');
  const PASSO = 15, Z0 = 30, PASSO_RIGA = 15;
  const righe = [...new Set(MATRICE.map((v) => v.riga))];
  const posti = [];
  for (const v of MATRICE) {
    const i = MATRICE.filter((w) => w.riga === v.riga).indexOf(v);
    const x = -42 + i * PASSO;
    const z = Z0 + righe.indexOf(v.riga) * PASSO_RIGA;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) posa(x + dx, SUPERFICIE, z + dz, 'lanaBianca');
    posa(x, PIEDI, z, 'pietra');
    posa(x, PIEDI + 1, z, v.id);                        // la sorgente, alzata di una cella
    scatola(x - 2, x + 2, PIEDI, PIEDI + 1, z - 3, z - 3, 'mattoni');   // il muretto dell'ombra
    posti.push({ id: v.id, riga: v.riga, etichetta: v.et, cella: [x, PIEDI, z + 4] });
  }

  const totale = Object.values(conti).reduce((a, b) => a + b, 0);
  return {
    spawn: SPAWN_BANCO,
    conti,
    totale,
    furni,
    sorgenti: posti,
    zone: ZONE,
  };
}

/** Riferimenti di posizione (celle dei PIEDI): il menu debug ne fa bottoni.
 *  Il punto interessante non è quasi mai l'ingresso, quindi ce n'è più d'uno. */
// I punti sono tutti a NORD-OVEST di quello che c'è da vedere: è lì che cadono
// le ombre, e un banco di prova visto dalla parte sbagliata non prova niente.
export const ZONE = {
  'Sagome al sole': [-36, PIEDI, 1],
  'Sagome: da vicino': [-31, PIEDI, 4],
  'Tettoia (ombra piena)': [-13, PIEDI, 3],
  'Terrazze': [-2, PIEDI, 2],
  'Ingombri (di notte)': [26, PIEDI, 2],
  'Catalogo dei mobili': [-40, PIEDI, 15],
  'Forme non cubiche': [8, PIEDI, 16],
  'Matrice: raggio': [-36, PIEDI, 23],
  'Matrice: intensita': [-36, PIEDI, 38],
  'Matrice: colore': [-36, PIEDI, 53],
  'Matrice: ombra si/no': [-36, PIEDI, 68],
};
