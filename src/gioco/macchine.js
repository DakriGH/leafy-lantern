// Macchine — il gancio GENERICO dei macchinari (Fase 3b della rifondazione ECS).
//
// IL PROBLEMA CHE RISOLVE. Fino a ieri un mobile con logica UNICA (il Generatore
// che sputa la palla) viveva come CASO SPECIALE dentro main.js: una Map dedicata,
// una `sincronizzaPalle()` cablata, if-chain nelle interazioni. Aggiungere un
// secondo macchinario significava aggiungere un altro caso speciale. Qui nasce il
// gancio che mancava: un furni può dichiarare un COMPORTAMENTO nel suo def
// (`aggiorna` e/o `onInteragisci`) e diventare — senza una riga in main — una
// ENTITÀ ECS con componente `macchina`, guidata dall'AGENDA.
//
// IL MODELLO È QUELLO DELLE CREATURE (vedi creature.js). Una creatura MUOVE di
// continuo (sistema a passo fisso) ma PENSA a scatti PROGRAMMATI in agenda. Una
// macchina fa lo stesso: l'eventuale effetto continuo va in un sistema a passo
// fisso; il "decidere/agire a intervalli" (accendere, sputare una palla, lanciare
// una scintilla) è una voce d'agenda. Il guadagno è la DORMIENZA: una macchina che
// non ha nulla da fare NON è in agenda e costa ZERO tick, finché qualcosa non la
// risveglia. Mille macchinari fermi non pesano nulla.
//
// IL CONTRATTO (così il committente sa inventare macchine senza toccare main):
//
//   def.aggiorna(macchina, servizi) -> number | falsy
//     Chiamato dal DRIVER quando scade il tick programmato in agenda. Può:
//       · leggere/scrivere il PROPRIO stato   (macchina.stato — un sacco libero)
//       · leggere posizione/celle             (macchina.cella, macchina.istanza)
//       · emettere particelle/suoni           (servizi.particelle, servizi.audio)
//       · creare/muovere/distruggere ENTITÀ   (servizi.ecs, servizi.scena)
//       · pescare a caso in modo deterministico (macchina.rng — vedi sotto)
//     RITORNA quanti tick attendere prima del prossimo `aggiorna`:
//       · un intero > 0  → il driver RIPRENOTA la macchina fra quei tick;
//       · 0/null/undefined/false → la macchina DORME (nessuna voce in agenda,
//         costo ZERO) finché un'interazione o una sincronizzazione non la sveglia.
//
//   def.onInteragisci(macchina, servizi) -> boolean | falsy
//     Chiamato quando il giocatore TOCCA il furni (tasto E o click in Esplora),
//     PRIMA delle interazioni cablate (stati/seduta). Stesse facoltà di aggiorna.
//     RITORNA true se ha GESTITO il tocco (il chiamante si ferma), falsy per
//     lasciar proseguire alla logica legacy. Per risvegliare una macchina
//     dormiente da qui, chiama `svegliaMacchina(servizi, macchina, traTick)`.
//
//   def.avvia(macchina, servizi)   (facoltativo) — setup una tantum alla nascita
//     dell'entità-macchina (es. trovare un mesh nel gruppo). Non riprenota nulla.
//   def.rimuovi(macchina, servizi) (facoltativo) — pulizia alla distruzione
//     (es. il Generatore distrugge la sua palla). Chiamato una volta.
//   def.avviaTraTick               (facoltativo) — tick prima del primo aggiorna
//     (default 1). La palla del generatore compare così ~1 tick dopo la posa.
//
// DETERMINISMO. Ogni macchina riceve `macchina.rng`, un sotto-Rng RIPRODUCIBILE
// derivato dal suo id (`servizi.rng.diramazione(id)`): due macchine hanno serie
// diverse, e la stessa macchina dà la stessa serie a parità di seme globale. Lo
// stato dell'Rng vive nell'istanza in memoria; oggi le macchine NON si salvano
// (sono lo specchio ECS dei furni, ricostruito a ogni load dalla sincronizza),
// quindi la riproducibilità è per-sessione. La persistenza/rete delle macchine è
// lavoro futuro (il layer di comandi), non serve al gancio.

const PRIORITA_MACCHINA = 0;   // stesso rango dei pensieri creatura: tie-break per seq (deterministico)

/** True se questo def FURNI porta un comportamento → merita una macchina ECS. */
export function eMacchina(def) {
  return !!def && (typeof def.aggiorna === 'function' || typeof def.onInteragisci === 'function');
}

/**
 * Registra il componente `macchina` sull'ECS. NON serializzabile: contiene
 * riferimenti three (l'istanza del furni col suo gruppo) e viene comunque
 * RICOSTRUITO dalla sincronizza a ogni caricamento partendo dai furni salvati.
 * Va chiamato UNA volta all'avvio, dopo i componenti core.
 */
export function registraComponentiMacchine(ecs) {
  ecs.registra('macchina', { serializzabile: false });
  return ecs;
}

/**
 * Crea l'ENTITÀ-macchina che RISPECCHIA un'istanza di furni con comportamento.
 * Il componente `macchina` è il "cruscotto" passato a aggiorna/onInteragisci:
 *   { id, defId, def, cella, istanza, stato, rng, dormiente }
 * Se il def ha `aggiorna`, prenota il primo risveglio in agenda (avviaTraTick);
 * altrimenti l'entità nasce DORMIENTE (reagirà solo alle interazioni). Torna l'id.
 */
export function creaEntitaMacchina(ecs, servizi, istanza) {
  const def = istanza.def;
  const e = ecs.crea();
  const m = {
    id: e,
    defId: istanza.defId,
    def,
    cella: istanza.cella,
    istanza,
    stato: {},                                   // sacco libero del def (contatori, id figli, fase…)
    rng: servizi.rng.diramazione(e),             // sotto-Rng deterministico per-macchina
    dormiente: true,
  };
  ecs.aggiungi(e, 'macchina', m);
  if (typeof def.avvia === 'function') def.avvia(m, servizi);
  if (typeof def.aggiorna === 'function') {
    const primo = Number.isFinite(def.avviaTraTick) ? def.avviaTraTick : 1;
    servizi.agenda.programma(Math.max(0, primo | 0), PRIORITA_MACCHINA, e);
    m.dormiente = false;
  }
  return e;
}

/**
 * IL DRIVER (scaricato dall'AGENDA, NON ogni tick) — l'analogo di pensaCreatura.
 * Invoca `def.aggiorna(macchina, servizi)` e, in base a ciò che ritorna,
 * RIPRENOTA la macchina o la lascia dormire. Se l'entità è stata distrutta
 * (furni rimosso) la voce si esaurisce qui: si salta, senza riprogrammare, così
 * le voci morte si drenano da sole (come per le creature despawnate).
 */
export function guidaMacchina(id, servizi) {
  const ecs = servizi.ecs;
  if (!ecs.vivo(id)) return;                     // furni rimosso: fine della voce
  const m = ecs.leggi(id, 'macchina');
  if (!m) return;
  const def = m.def;
  const prossimo = (typeof def.aggiorna === 'function') ? def.aggiorna(m, servizi) : null;
  if (typeof prossimo === 'number' && prossimo > 0) {
    servizi.agenda.programma(prossimo | 0, PRIORITA_MACCHINA, id);
    m.dormiente = false;
  } else {
    m.dormiente = true;                          // dorme: nessuna voce → costo ZERO
  }
}

/**
 * Risveglia una macchina DORMIENTE prenotandole un risveglio fra `traTick` tick.
 * No-op se è già attiva (ha già una voce in agenda): evita il doppio-booking, che
 * romperebbe l'invariante "attiva ⟺ esattamente una voce pendente". Utile da
 * dentro `onInteragisci` per far ripartire una macchina che si era addormentata.
 */
export function svegliaMacchina(servizi, m, traTick = 1) {
  if (!m || !m.dormiente) return false;
  servizi.agenda.programma(Math.max(0, traTick | 0), PRIORITA_MACCHINA, m.id);
  m.dormiente = false;
  return true;
}

/**
 * Distrugge l'entità-macchina: prima lascia al def la sua pulizia (`rimuovi` —
 * es. il Generatore despawna la palla), poi libera l'entità. La voce d'agenda
 * eventualmente pendente si esaurirà da sola (guidaMacchina salta gli id morti).
 */
export function distruggiEntitaMacchina(ecs, servizi, id) {
  if (!ecs.vivo(id)) return;
  const m = ecs.leggi(id, 'macchina');
  if (m && typeof m.def.rimuovi === 'function') m.def.rimuovi(m, servizi);
  ecs.distruggi(id);
}

/**
 * GESTORE — il registro istanza-furni → entità-macchina, e il RECONCILE che le
 * tiene in pari coi furni piazzati. È l'unico "collante" fra il mondo dei furni
 * (arredo) e la corsia ECS: sostituisce la vecchia `sincronizzaPalle`, ma è
 * GENERICO — non sa nulla di palle né di scintille. Un macchinario nuovo si
 * aggiunge scrivendo il suo def; qui non cambia una riga.
 *
 * Perché un reconcile e non un hook su piazza/rimuovi: il reconcile cattura TUTTI
 * i modi in cui un furni nasce o muore (posa locale, arrivo dalla rete, load da
 * salvataggio, rigenerazione del mondo) con un solo passaggio idempotente.
 */
export class GestoreMacchine {
  constructor() {
    this.perIstanza = new Map();   // istanza furni → id entità-macchina
  }

  /** L'entità-macchina che rispecchia quell'istanza di furni, o undefined. */
  perFurni(istanza) { return this.perIstanza.get(istanza); }

  /**
   * Allinea le macchine ai furni: crea quelle mancanti (furni-con-comportamento
   * appena comparsi), distrugge le orfane (furni sparito). Idempotente: chiamala
   * quando vuoi (all'avvio, dopo un load, o periodicamente nel loop).
   */
  sincronizza(ecs, servizi, istanze) {
    const vive = new Set();
    for (const ist of istanze) {
      if (!eMacchina(ist.def)) continue;
      vive.add(ist);
      if (!this.perIstanza.has(ist)) this.perIstanza.set(ist, creaEntitaMacchina(ecs, servizi, ist));
    }
    for (const [ist, id] of [...this.perIstanza]) {
      if (!vive.has(ist)) {
        distruggiEntitaMacchina(ecs, servizi, id);
        this.perIstanza.delete(ist);
      }
    }
  }

  /** Via tutte le macchine (prima di un mondo nuovo). I furni li svuota arredo. */
  svuota(ecs, servizi) {
    for (const id of this.perIstanza.values()) distruggiEntitaMacchina(ecs, servizi, id);
    this.perIstanza.clear();
  }
}
