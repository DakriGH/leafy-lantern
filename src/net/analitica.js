// CHI STA GIOCANDO — il ping di presenza verso il NOSTRO server.
//
// Richiesta del committente: «vorrei capire quante persone hanno giocato o sono
// connesse, github non ce lo dice». Non è pigrizia di GitHub: le Pages servono
// file statici e non eseguono niente, quindi un contatore o sta su un server o
// non esiste. Le due strade erano un contatore di terzi (due righe, ma l'IP di
// ogni giocatore finisce a qualcuno che non controlliamo e il giorno che chiude
// il numero sparisce) oppure il server di segnalazione che è GIÀ nostro. La
// seconda, e non solo per i dati: per un metaverso la presenza serve comunque, e
// così «quanti sono connessi ORA» esce gratis invece che «quante visite in
// totale», che è il numero meno utile dei due.
//
// COSA VIENE MANDATO, per intero e senza sorprese:
//   · un id CASUALE della sessione, generato qui, che cambia a ogni partita e
//     non è collegato a niente (serve solo a non contare due volte lo stesso
//     browser mentre gioca);
//   · telefono sì/no, la build, gli fps mediani.
// Niente nome, niente posizione, niente cookie, niente identificatore che
// sopravviva alla partita.
//
// È SPENTO FINCHÉ NON C'È UN INDIRIZZO. `ANALITICA_URL` in config.js nasce vuoto:
// senza, questo file non apre nemmeno una connessione. Nessun dato lascia il
// dispositivo di nessuno finché non sei tu a scriverci il tuo server.
//
// E NON DEVE MAI DISTURBARE IL GIOCO: `keepalive` per sopravvivere alla chiusura
// della scheda, errori ingoiati (un server spento non è un problema del
// giocatore), e un ping ogni trenta secondi — il server considera «vivo» chi si
// è fatto sentire negli ultimi novanta, quindi due ping persi sono tollerati.

import { ANALITICA_URL } from '../config.js?v=mtbj9tmp';

const OGNI_MS = 30_000;
// ⚠ A SCHEDA NASCOSTA SI RALLENTA DI DIECI VOLTE. Il committente ha descritto il
// caso vero: «i player potrebbero stare ore col gioco aperto nelle tab». Un ping
// ogni trenta secondi per otto ore sono mille richieste a testa per dire una cosa
// che non cambia — e le richieste sono la risorsa che Deno conta. Chi ha la
// scheda in secondo piano NON sta giocando: resta contato (il server dimentica
// dopo novanta secondi di silenzio... quindi il ping lento lo terrebbe fuori, ed
// è giusto così: «connessi ora» deve dire chi sta guardando lo schermo).
const OGNI_NASCOSTO_MS = 5 * 60_000;

let _id = null;
let _timer = null;
let _fps = () => 0;

/** Id di sessione: casuale, nuovo a ogni partita, buttato alla chiusura. */
function nuovoId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 18);
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
}

async function ping(fine = false) {
  if (!ANALITICA_URL) return;
  const corpo = JSON.stringify({
    id: _id,
    mobile: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    build: (globalThis.VERSIONE_CODICE || 'sviluppo'),
    fps: Math.round(_fps() || 0),
  });
  try {
    // `keepalive` permette all'ultimo ping di partire anche mentre la scheda
    // si chiude: senza, il giocatore resterebbe «connesso» per un minuto e
    // mezzo dopo essere uscito, e il numero a schermo direbbe una bugia.
    await fetch(ANALITICA_URL.replace(/\/+$/, '') + '/vivo', {
      method: 'POST', body: corpo, keepalive: true,
      headers: { 'content-type': 'application/json' },
    });
  } catch { /* server spento o offline: non è un problema di chi gioca */ }
  if (fine) return;
}

/**
 * Accende la presenza. `leggiFps` è una funzione che rende gli fps correnti —
 * la passa main, che è l'unico a saperli.
 */
export function avviaAnalitica(leggiFps) {
  if (!ANALITICA_URL || _timer) return false;
  _id = nuovoId();
  if (typeof leggiFps === 'function') _fps = leggiFps;
  ping();
  // il ritmo segue la visibilità: si riarma a ogni cambio invece di tenere due
  // timer, così non si sovrappongono mai
  const riarma = () => {
    clearInterval(_timer);
    _timer = setInterval(ping, document.visibilityState === 'visible' ? OGNI_MS : OGNI_NASCOSTO_MS);
  };
  riarma();
  document.addEventListener('visibilitychange', () => { riarma(); if (document.visibilityState === 'visible') ping(); });
  // l'ultimo saluto quando la scheda si chiude o va in background: la pagina
  // può non essere più eseguita dopo, quindi vale solo con keepalive
  addEventListener('pagehide', () => ping(true));
  return true;
}

/** Il pannello: lo apre il tasto in Impostazioni. Null se non configurato. */
export function urlPannello() {
  if (!ANALITICA_URL) return null;
  return ANALITICA_URL.replace(/^ws/, 'http').replace(/\/+$/, '') + '/pannello';
}

/** Lo stato attuale, per mostrarlo dentro il gioco senza aprire il pannello. */
export async function leggiStato() {
  if (!ANALITICA_URL) return null;
  try {
    const r = await fetch(ANALITICA_URL.replace(/^ws/, 'http').replace(/\/+$/, '') + '/stato');
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
