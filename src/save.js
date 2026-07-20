// Salvataggio del diorama: localStorage + export/import JSON (SPEC §5).

import { CHIAVE_SALVATAGGIO } from './config.js?v=mrt9jcee';
import { stagioneCorrente, impostaStagione } from './world/stagioni.js?v=mrt9jcee';

export function serializza(mondo, arredo, ciclo, inventario = null, extra = {}) {
  const blocchi = [];
  for (const { x, y, z, tipo } of mondo.tutti()) blocchi.push([x, y, z, tipo]);
  return {
    v: 1,
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

export function salvaLocale(dati) {
  try { localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(dati)); }
  catch (e) { console.warn('[lantern] salvataggio non riuscito', e); }
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'diorama-lantern.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
