// Costanti condivise — la fonte di verità numerica è docs/SPEC-TECNICA.md

export const PX = 1 / 16;          // 1 pixel: 1 cella = 16 px = 1.0 unità
export const MEZZA_CELLA = 0.5;    // F: dove finisce la faccia piatta
export const MEZZO_SUPER = 0.5625; // H = 9 px: il supercubo sborda di 1 px per lato

export const FISICA = {
  gravita: 30,
  salto: 9.0,          // apice ≈ 1.35 celle: scavalca un blocco
  velocita: 4.4,
  velocitaAria: 3.2,
  nuoto: 2.8,          // velocità a nuoto
  cadutaMax: 22,
  coyote: 0.1,
  larghezza: 0.55,     // AABB player
  altezza: 1.35,
  passoMax: 1 / 30,    // passo fisico massimo
};

export const CAMERA = {
  fov: 38,
  distanza: 16, distMin: 5, distMax: 90,   // zoom largo per gli open world
  lontano: 700,                            // far plane: render distance ampia
  // ⚠ pitchMin È NEGATIVO: la camera può scendere SOTTO il giocatore e guardare
  // in su, cioè si può vedere il cielo. Prima si fermava a +0.15 rad sopra
  // l'orizzonte e il cielo — cupola, gradiente, sole, luna, stelle, nuvole — era
  // roba che esisteva solo di sfondo, mai inquadrabile: ecco perché per tre giri
  // il committente ha detto «non hai ancora aggiornato il cielo» mentre il cielo
  // c'era. Una cosa che non si può guardare non esiste.
  //
  // QUANTO IN GIÙ: −0.55 rad sono 32° sotto l'orizzonte, che con mezzo campo
  // visivo (19°) porta lo sguardo a 51° — mezzo cielo, nuvole comprese, e il
  // sole per tutta la giornata tranne l'ora attorno al culmine. Più giù non si
  // va, e l'ho provato: a −0.85 la camera finisce DENTRO la collina e si guarda
  // la pancia dei blocchi. La compressione della distanza (Rig.aggiorna) tiene
  // l'occhio vicino al gatto proprio per questo.
  yaw: -Math.PI / 4, pitch: 0.62, pitchMin: -0.55, pitchMax: 1.35,
  inseguimento: 5,     // lerp verso il player
};

export const TEMPO = {
  durataCiclo: 480,    // secondi per un giorno intero
  inizio: 0.42,        // si parte in mattinata
};

export const LUCI_MAX = 24;      // cap luci-sfera per frame

// ---- DOVE STA IL NOSTRO SERVER DI PRESENZA ---------------------------------
// Vuoto = SPENTO, e nessun dato lascia il dispositivo di nessuno. Mettici l'URL
// del signaling deployato (es. 'https://leafy.deno.dev') e il gioco comincia a
// dire «ci sono»; il conto si guarda su <quell'URL>/pannello. Vedi
// src/net/analitica.js per l'elenco esatto di cosa viene mandato: un id casuale
// di sessione, telefono sì/no, la build e gli fps. Nient'altro.
export const ANALITICA_URL = '';
// ANELLI DI POSTERIZZAZIONE della luce-sfera, ED È L'ASPETTO DEL GIOCO: la
// caduta è lineare e viene tagliata a 3 bande nette. Non è un'approssimazione
// da raffinare — è la scelta grafica. Un tentativo l'aveva sostituita con una
// rampa a 5 gradini agganciata ai livelli di un flood fill: bocciato.
//
// LA USANO IN TRE, e devono restare d'accordo: le bande delle luci-sfera
// (fx/materials.js, lanternaAccumulo), il fade in profondità dell'ombra del
// gatto (ombraPg) e lo spegnimento degli anelli di pioggia. Sono i "gradini"
// che il committente ha indicato come metro della nettezza, quindi vanno tutti
// dallo stesso numero: prima gli ultimi due avevano un 3 scritto a mano e si
// sarebbero scollegati al primo ritocco qui.
// Non deve essere per forza intera: materials.js la porta in GLSL con toFixed(1)
// apposta, perché scritta a mano come `${BANDE_LUCE}.0` un valore come 3.5
// diventerebbe «3.5.0» e lo shader non compilerebbe — cioè mondo invisibile.
export const BANDE_LUCE = 3;

export const RAGGIO_CLICK = 90;  // portata del raycast di mira
export const CHIAVE_SALVATAGGIO = 'lantern.diorama.v1';

export const ACQUA = {
  portata: 4,        // quante celle si sparge in orizzontale (regole Minecraft)
  tickMs: 200,       // cadenza della simulazione
  budget: 400,       // celle riesaminate al massimo per tick
  yMin: -6,          // fondo del mondo per l'acqua: sotto, svanisce nel vuoto
                     // (senza, una cascata oltre il bordo cade all'INFINITO:
                     //  migliaia di celle, remesh continui = il lag segnalato)
};

export const NET = { posaMs: 100 };   // presenza P2P a 10 Hz

export const NUVOLE = {
  // erano 7 per non moltiplicare le draw call: ogni scatola era una Mesh. Ora
  // tutte le nuvole stanno in UNA geometria sola (fx/nuvole.js), quindi il
  // numero non si paga più a chiamate ma solo a triangoli — e sono 80 a nuvola.
  numero: 10,
  ombra: 0.28,       // quanto scurisce la texture sotto la nuvola
  // ALTE SOPRA LE COLLINE. A quota 15-21 le nuvole finivano DENTRO il terreno
  // dell'open world (le creste arrivano a 25) e si vedevano appoggiate sulle
  // cime come nebbia. Il cielo dev'essere sopra il mondo, non dentro.
  quotaMin: 34, quotaMax: 48,
  raggio: 55,        // oltre questo drift, la nuvola rientra dall'altro lato
};

export const SCAVO = {
  manoDanno: 50,     // 2 colpi a mano...
  attrezzoDanno: 100, // ...1 con l'attrezzo della famiglia giusta (toolModifiers ×2)
  salute: 100,
  resetMs: 4000,     // dopo 4 s senza colpi il blocco si "rimargina"
};
