// Salvataggio del diorama: localStorage + export/import JSON (SPEC §5).

import { CHIAVE_SALVATAGGIO } from './config.js?v=mtbkj5ea';
import { stagioneCorrente, impostaStagione } from './world/stagioni.js?v=mtbkj5ea';

// ---- LA VERSIONE DEL FORMATO, E CHI LA LEGGE --------------------------------
// ⚠ `serializza` NON è solo il formato di salvataggio: è ANCHE il carico utile
// del benvenuto P2P (`main.js` lo spedisce a chi entra in casa). Un formato che
// cambia rompe quindi TRE cose insieme, e tutte in silenzio: i mondi salvati, la
// visita a casa di un amico, e la sincronizzazione con chi ha una build diversa.
// Per mesi il numero c'era (`v: 1`) e non lo guardava NESSUNO: un diorama scritto
// da una build più nuova entrava lo stesso in `applica`, che lo svuotava tutto e
// poi si schiantava a metà — un mondo perso senza mai dire perché.
//
// Adesso il rifiuto è DICHIARATO (regola della casa 7): si controlla PRIMA di
// toccare il mondo, e si lancia un errore con dentro un messaggio da mostrare a
// schermo. È lo stesso modo di `ecs/agenda.js` e `ecs/registro.js`, che lo
// facevano già bene da un pezzo.
export const VERSIONE_SALVATAGGIO = 1;
/** La più vecchia che questo motore sa ancora leggere. */
export const VERSIONE_MINIMA = 1;

/**
 * La versione dichiarata da un diorama.
 * Un salvataggio SENZA `v` vale 1: quando la versione non la leggeva nessuno,
 * un file poteva nascere a mano o da una build antica senza quel campo, e sono
 * tutti di formato 1. Vale come ipotesi dichiarata, non come indovinello.
 */
export function versioneDi(dati) {
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return null;
  const v = dati.v;
  if (v === undefined || v === null) return VERSIONE_MINIMA;
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
}

/**
 * Rifiuto dichiarato: lancia con un messaggio da far vedere al giocatore.
 * Va chiamata PRIMA di svuotare qualunque cosa.
 */
export function controllaFormato(dati) {
  const v = versioneDi(dati);
  if (v === null) throw new Error('Questo non è un diorama di Leafy-Lantern 😿');
  if (v > VERSIONE_SALVATAGGIO) {
    throw new Error(`Diorama di formato ${v}: viene da una versione più NUOVA del gioco `
      + `(questa legge fino al ${VERSIONE_SALVATAGGIO}). Aggiorna la pagina e riprova.`);
  }
  if (v < VERSIONE_MINIMA) {
    throw new Error(`Diorama di formato ${v}: troppo vecchio per questa versione `
      + `(si legge dal ${VERSIONE_MINIMA} in su).`);
  }
  return v;
}

export function serializza(mondo, arredo, ciclo, inventario = null, extra = {}) {
  const blocchi = [];
  for (const { x, y, z, tipo } of mondo.tutti()) blocchi.push([x, y, z, tipo]);
  return {
    v: VERSIONE_SALVATAGGIO,
    nome: 'Il mio diorama',
    tempo: ciclo.t,
    stagione: stagioneCorrente(),
    inventario: inventario ? inventario.serializza() : undefined,
    ...extra,
    blocchi,
    // `config` = LE MANOPOLE di un furni-macchina (gioco/macchine.js). Si salva
    // solo se c'è davvero qualcosa dentro: la stragrande maggioranza dei furni
    // non è una macchina, e un `"config":{}` per ognuno sarebbe peso morto in
    // un salvataggio che sta in localStorage.
    furni: arredo.istanze.map((i) => {
      const f = { id: i.defId, cella: i.cella, rot: i.rot, stato: i.stato };
      if (i.config && Object.keys(i.config).length) f.config = i.config;
      return f;
    }),
  };
}

export function applica(dati, mondo, arredo, ciclo, inventario = null) {
  // PRIMA di svuotare: se il formato non si conosce si rifiuta e basta, con il
  // mondo che c'è ancora tutto. Svuotare e POI accorgersene è come si perdeva
  // un diorama senza nemmeno un messaggio.
  controllaFormato(dati);
  arredo.svuota();
  mondo.svuota();
  for (const [x, y, z, tipo] of dati.blocchi || []) mondo.metti(x, y, z, tipo, true);
  for (const f of dati.furni || []) {
    // la config viaggia GREZZA fin qui: la ripulisce e la riporta nei limiti
    // `creaEntitaMacchina`, quando il reconcile ricostruirà la macchina.
    const ist = arredo.piazza(f.id, f.cella, f.rot || 0, true, f.config || null);
    if (ist && f.stato) arredo.setStato(ist, f.stato);
  }
  if (typeof dati.tempo === 'number') ciclo.t = dati.tempo;
  if (dati.stagione) impostaStagione(dati.stagione);
  if (inventario) inventario.applica(dati.inventario);
}

/**
 * Scrive il diorama nell'autosave. Rende `true` se ce l'ha fatta.
 *
 * ⚠ QUI SI PERDEVANO LE PARTITE, IN SILENZIO. Il salvataggio poteva fallire —
 * localStorage ha un tetto (di solito 5 MB) e un diorama grande ne occupa due,
 * senza contare snapshot e partite salvate — e l'errore finiva in un
 * `console.warn`. Sul telefono, che è dove si gioca, la console non la guarda
 * nessuno: si costruiva per un'ora, si chiudeva la scheda, e non c'era più
 * niente. Nessun avviso, nessun indizio, nessun modo di sospettarlo prima.
 *
 * È esattamente il caso che la regola della casa vieta («mai inghiottire
 * eccezioni»): adesso il fallimento si RESTITUISCE, e chi chiama lo dice a
 * schermo. Il diorama in RAM è ancora intatto — se lo si sa, lo si può ancora
 * salvare come file con «Esporta».
 */
export function salvaLocale(dati) {
  try { localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(dati)); return true; }
  catch (e) { console.warn('[lantern] salvataggio non riuscito', e); return false; }
}

export function caricaLocale() {
  try {
    const raw = localStorage.getItem(CHIAVE_SALVATAGGIO);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function cancellaLocale() {
  try { localStorage.removeItem(CHIAVE_SALVATAGGIO); } catch { /* pazienza */ }
}

// ---- SLOT di salvataggio (gestione basilare, come le "partite" dei giochi) --
// Un indice leggero (nome + data + numero blocchi) + un dato pieno per slot.
// L'autosave resta su CHIAVE_SALVATAGGIO: gli slot sono partite a parte,
// nominabili, che si caricano/sovrascrivono/cancellano a mano.

const CHIAVE_INDICE = 'lantern.slots.v1';
const chiaveSlot = (id) => 'lantern.slot.' + id;

/** L'indice degli slot: { id → {nome, quando, blocchi} }, ordinato per recenti. */
export function elencoSlot() {
  let idx = {};
  try { idx = JSON.parse(localStorage.getItem(CHIAVE_INDICE) || '{}'); } catch { idx = {}; }
  return Object.entries(idx)
    .map(([id, meta]) => ({ id, ...meta }))
    .sort((a, b) => (b.quando || 0) - (a.quando || 0));
}

function scriviIndice(idx) {
  try { localStorage.setItem(CHIAVE_INDICE, JSON.stringify(idx)); } catch { /* pieno */ }
}

/** Salva `dati` in uno slot (id nuovo se assente). Ritorna l'id, o null se pieno. */
export function salvaSlot(dati, nome, id = null) {
  if (!id) id = 's' + Date.now().toString(36);
  try {
    localStorage.setItem(chiaveSlot(id), JSON.stringify(dati));
  } catch (e) {
    console.warn('[lantern] slot non salvato (storage pieno?)', e);
    return null;
  }
  let idx = {};
  try { idx = JSON.parse(localStorage.getItem(CHIAVE_INDICE) || '{}'); } catch { idx = {}; }
  idx[id] = { nome: nome || 'Partita', quando: Date.now(), blocchi: (dati.blocchi || []).length };
  scriviIndice(idx);
  return id;
}

export function caricaSlot(id) {
  try {
    const raw = localStorage.getItem(chiaveSlot(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function rinominaSlot(id, nome) {
  let idx = {};
  try { idx = JSON.parse(localStorage.getItem(CHIAVE_INDICE) || '{}'); } catch { idx = {}; }
  if (idx[id]) { idx[id].nome = nome; scriviIndice(idx); }
}

export function cancellaSlot(id) {
  try { localStorage.removeItem(chiaveSlot(id)); } catch { /* pazienza */ }
  let idx = {};
  try { idx = JSON.parse(localStorage.getItem(CHIAVE_INDICE) || '{}'); } catch { idx = {}; }
  delete idx[id];
  scriviIndice(idx);
}

export function esportaFile(dati) {
  const blob = new Blob([JSON.stringify(dati, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diorama-lantern.json';
  a.click();
  // ⚠ NON SI REVOCA SUBITO. `click()` avvia il download in modo ASINCRONO: se
  // l'indirizzo del blob sparisce nella stessa riga, su alcuni browser il file
  // esce vuoto o non esce affatto — ed è l'unica via di scampo che ha chi si
  // trova la memoria piena. Un secondo è più che sufficiente.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- LA PILA DEGLI SNAPSHOT (due livelli, e adesso sono DUE davvero) --------
// PERCHÉ ESISTE. Il bottone del menu debug si è sempre chiamato «📸 Snapshot» e
// il suo titolo ha sempre promesso «(2 livelli)». Nel codice il secondo livello
// era una chiave SCRITTA E MAI LETTA: due sole occorrenze in tutto il repo, la
// definizione e la riga che ci scriveva sopra.
//
// Il conto di quella bugia: primo clic su «🧪 Sala prove» → il mondo vero finisce
// nella cima della pila; secondo clic su «🔦 Collaudo» → la cima diventa la sala
// prove e il mondo vero scivola nel livello di sotto, che nessuno rileggeva mai.
// «↩️ Ripristina» riportava la sala prove. Due clic, e il diorama del giocatore
// era irrecuperabile pur essendo ancora lì, scritto nel localStorage.
//
// Qui la pila si comporta come una pila: `spingi` mette sopra, `togli` toglie
// dalla cima E RIALZA il livello di sotto. Due «↩️ Ripristina» tornano dove si
// era due mondi fa.
//
// E scrive con un ordine preciso, perché è roba che sta in un cassetto che si
// riempie (localStorage ha un tetto, di solito 5 MB, e un diorama grande ne
// occupa due):
//   1. prima si sposta la cima nel livello di sotto — se non ci sta, non è
//      successo NIENTE e si dice di no;
//   2. poi si scrive la cima nuova — se non ci sta, si rimette a posto il
//      livello di sotto e si dice di no.
// In nessuno dei due casi si resta con una pila che racconta una bugia, e in
// nessuno dei due l'errore viene inghiottito: `spingiSnapshot` RESTITUISCE
// l'esito, e chi chiama lo mostra a schermo (regola della casa 7).
export const CHIAVE_SNAPSHOT = 'lantern.snapshot.v1';
export const CHIAVE_SNAPSHOT_PREC = 'lantern.snapshot.prec.v1';

/** Il deposito vero, risolto al momento della chiamata (nei test se ne passa uno finto). */
const deposito = (dep) => dep || globalThis.localStorage;

/** Quanti mondi ci sono nella pila: 0, 1 o 2. */
export function livelliSnapshot(dep = null) {
  const d = deposito(dep);
  return (d.getItem(CHIAVE_SNAPSHOT) ? 1 : 0) + (d.getItem(CHIAVE_SNAPSHOT_PREC) ? 1 : 0);
}

/**
 * Mette `dati` sulla cima della pila, facendo scendere di un livello quello che
 * c'era. Rende `{ ok, motivo }` — `ok:false` vuol dire che NON è cambiato niente.
 */
export function spingiSnapshot(dati, dep = null) {
  const d = deposito(dep);
  let testo;
  try { testo = JSON.stringify(dati); }
  catch (e) { return { ok: false, motivo: 'Il diorama non si riesce nemmeno a scrivere 😿' }; }

  const cima = d.getItem(CHIAVE_SNAPSHOT);
  const sotto = d.getItem(CHIAVE_SNAPSHOT_PREC);

  if (cima !== null) {
    try { d.setItem(CHIAVE_SNAPSHOT_PREC, cima); }
    catch { return { ok: false, motivo: 'Snapshot troppo grande 😿 (non c\'è posto per due livelli)' }; }
  }
  try {
    d.setItem(CHIAVE_SNAPSHOT, testo);
  } catch {
    // rimettiamo il livello di sotto com'era: la pila non deve mai mentire
    try {
      if (sotto === null) d.removeItem(CHIAVE_SNAPSHOT_PREC);
      else d.setItem(CHIAVE_SNAPSHOT_PREC, sotto);
    } catch { /* peggio di così non si può fare */ }
    return { ok: false, motivo: 'Snapshot troppo grande 😿' };
  }
  return { ok: true, motivo: '' };
}

/**
 * Legge la cima SENZA toglierla (testo grezzo, o null se la pila è vuota).
 *
 * PERCHÉ ESISTE, ed è il punto: ripristinare vuol dire togliere dalla pila E
 * rimettere il mondo dentro il gioco, e la seconda può fallire (formato
 * sconosciuto, JSON rotto, arredo illeggibile). Chi toglieva PRIMA di sapere
 * se il mondo si applicava bruciava lo snapshot proprio nel momento in cui
 * serviva — cioè ricadeva nel guasto che tutta questa pila esiste per curare.
 * Con `sbircia` si guarda, si prova ad applicare, e si toglie SOLO dopo.
 */
export function sbirciaSnapshot(dep = null) {
  const d = deposito(dep);
  const cima = d.getItem(CHIAVE_SNAPSHOT);
  if (cima !== null) return cima;
  // stessa indulgenza di togliSnapshot: pila sporca di una versione vecchia
  return d.getItem(CHIAVE_SNAPSHOT_PREC);
}

/**
 * Toglie la cima e la rende (testo grezzo, o null se la pila è vuota).
 * Il livello di sotto RISALE: è questo che mancava, ed è tutto il difetto.
 */
export function togliSnapshot(dep = null) {
  const d = deposito(dep);
  const cima = d.getItem(CHIAVE_SNAPSHOT);
  const sotto = d.getItem(CHIAVE_SNAPSHOT_PREC);
  if (cima === null && sotto === null) return null;
  try {
    if (cima === null) {
      // cima vuota ma sotto pieno (pila sporca di una versione vecchia): si
      // recupera comunque quello che c'è, invece di dire «niente da ripristinare»
      d.removeItem(CHIAVE_SNAPSHOT_PREC);
      return sotto;
    }
    if (sotto === null) d.removeItem(CHIAVE_SNAPSHOT);
    else { d.setItem(CHIAVE_SNAPSHOT, sotto); d.removeItem(CHIAVE_SNAPSHOT_PREC); }
  } catch { /* il cassetto è pieno: il dato lo restituiamo lo stesso */ }
  return cima;
}

// ---- OPZIONI: VERSIONE E MIGRAZIONI -----------------------------------------
// PERCHÉ ESISTE. `Object.assign({}, OPZ_DEFAULT, salvate)` fonde le opzioni del
// giocatore SOPRA i valori di fabbrica. Detto così sembra ovvio; l'effetto è
// che chi ha toccato il menu Grafica UNA volta si porta i suoi valori PER
// SEMPRE, e quindi ogni default migliore arriva solo ai profili vergini —
// cioè NON alle persone che si lamentano degli fps, che il menu l'hanno
// aperto di sicuro. È il rischio numero uno del piano (docs/LEAFY-V2.md §12):
// misurare bene una cura che al committente non arriva mai.
//
// La cura non è «buttare le preferenze»: è poterle SCAVALCARE UNA VOLTA, in
// modo dichiarato e per una chiave alla volta.
//
// LA TABELLA. Ogni voce è UN GRADINO da `da` a `da + 1`, applicati in ordine.
// Campi (tutti facoltativi tranne `da` e `perche`):
//   da        versione di partenza del gradino
//   perche    una riga in italiano: perché questo gradino esiste. NON è
//             decorazione — è l'unica cosa che fra un anno spiegherà a qualcuno
//             perché il suo interruttore si è mosso da solo.
//   alDefault { chiave: vecchioValore } — la chiave torna al default NUOVO
//             SOLO SE vale ancora il vecchio default, cioè solo se il giocatore
//             non l'ha mai scelta davvero. È il modo di far arrivare un default
//             migliore a tutti senza calpestare chi ha deciso.
//   imponi    ['chiave'] — torna al default nuovo COMUNQUE. Da usare solo
//             quando il vecchio valore è ROTTO (non «peggiore»: rotto).
//   rinomina  { vecchia: 'nuova' } — la chiave ha cambiato nome, il dato resta.
//   via       ['chiave'] — la chiave non esiste più: si butta.
//   viaLeIgnote  true — butta tutte le chiavi che i default non conoscono più.
export const MIGRAZIONI_OPZIONI = [
  {
    da: 1,
    perche: 'Inaugura la versione delle opzioni. Fino a qui il blocco salvato non '
      + 'aveva un numero, e si portava dietro anche le chiavi di interruttori '
      + 'tolti dal gioco (i tasti touch vecchi, i pannelli spariti): peso morto '
      + 'che sopravviveva a ogni pubblicazione. Da questo gradino in poi un '
      + 'default nuovo può raggiungere chi ha già toccato il menu, dichiarandolo qui.',
    viaLeIgnote: true,
  },
  {
    da: 2,
    perche: 'IL CHIAROSCURO PER FACCIA SI SPEGNE DI FABBRICA. Decisione d\'arte del '
      + 'committente, presa il 26/08/2026 guardando un A/B a pixel: «voglio delle '
      + 'ombre in cel shading senza avere face shading dei vari elementi, ma il '
      + 'reagire alla luce sì». Tradotta: la luminosità dipende da DOVE sei '
      + 'rispetto alle luci, non da COME è girata la faccia. Restano l\'ombra '
      + 'portata, le pozze delle lampade e l\'ambiente dell\'ora; se ne va il '
      + 'dot(normale, sole) che scuriva i fianchi. Misurato: cambia il 33,57% dei '
      + 'pixel, e lo stesso cubo smette di mostrare tre verdi su tre facce. '
      + 'Questo gradino esiste perché senza di lui il default nuovo NON '
      + 'raggiungerebbe chi ha già aperto il menu Grafica — cioè proprio chi lo '
      + 'sta aspettando. L\'interruttore «🌗 Chiaroscuro» resta: si riaccende '
      + 'quando si vuole.',
    alDefault: { soleTerm: true },
  },
];

/** La versione corrente delle opzioni: 1 + i gradini. Aggiungere una voce la alza da sola. */
export const VERSIONE_OPZIONI = MIGRAZIONI_OPZIONI.reduce((v, m) => Math.max(v, m.da + 1), 1);

/**
 * Fonde le opzioni salvate sui valori di fabbrica, facendo passare per i
 * gradini che mancano.
 *
 * @param salvate      l'oggetto letto dal deposito (o null: profilo vergine)
 * @param predefinite  i valori di fabbrica di QUESTA build
 * @param gradini      la tabella (i test ne passano una loro)
 * @returns { opzioni, versione, applicati:[perche…], avvisi:[…] }
 */
export function migraOpzioni(salvate, predefinite, gradini = MIGRAZIONI_OPZIONI) {
  const versioneOra = gradini.reduce((v, m) => Math.max(v, m.da + 1), 1);
  const applicati = [];
  const avvisi = [];

  if (!salvate || typeof salvate !== 'object' || Array.isArray(salvate)) {
    return { opzioni: { ...predefinite }, versione: versioneOra, applicati, avvisi };
  }

  const { v: vGrezza, ...utente } = salvate;
  // senza numero = scritte prima che la versione esistesse, cioè versione 1
  let versione = (typeof vGrezza === 'number' && Number.isFinite(vGrezza)) ? vGrezza : 1;

  if (versione > versioneOra) {
    // Opzioni da una build più nuova. Non si rifiuta il gioco per un menu: si
    // tengono e si dice che c'è qualcosa che non capiamo (regola della casa 7).
    avvisi.push(`Le impostazioni salvate sono di una versione più nuova (${versione} contro ${versioneOra}): `
      + 'tenute come sono, ma qualcosa potrebbe non avere effetto.');
    return { opzioni: { ...predefinite, ...utente }, versione, applicati, avvisi };
  }

  for (const g of gradini) {
    if (g.da < versione) continue;                 // gradino già salito
    if (g.rinomina) {
      for (const [vecchia, nuova] of Object.entries(g.rinomina)) {
        if (vecchia in utente) { utente[nuova] = utente[vecchia]; delete utente[vecchia]; }
      }
    }
    for (const k of g.via || []) delete utente[k];
    if (g.alDefault) {
      for (const [k, vecchioDefault] of Object.entries(g.alDefault)) {
        // uguale al vecchio default = mai scelta davvero: la si lascia decidere
        // alla build nuova. Diversa = il giocatore ha deciso, e non si tocca.
        if (k in utente && utente[k] === vecchioDefault) delete utente[k];
      }
    }
    for (const k of g.imponi || []) delete utente[k];
    if (g.viaLeIgnote) {
      for (const k of Object.keys(utente)) if (!(k in predefinite)) delete utente[k];
    }
    applicati.push(g.perche);
    versione = g.da + 1;
  }

  return { opzioni: { ...predefinite, ...utente }, versione, applicati, avvisi };
}

/** Legge le opzioni dal deposito senza mai lanciare (un JSON storto non deve dare pagina nera). */
export function leggiOpzioni(chiave, dep = null) {
  try {
    const raw = deposito(dep).getItem(chiave);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Scrive le opzioni col numero di versione attaccato. Rende true se ce l'ha fatta. */
export function scriviOpzioni(chiave, opzioni, versione = VERSIONE_OPZIONI, dep = null) {
  try { deposito(dep).setItem(chiave, JSON.stringify({ ...opzioni, v: versione })); return true; }
  catch { return false; }
}
