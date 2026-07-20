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
//
// ===========================================================================
// LE MANOPOLE — `def.opzioni`, `m.config`, `def.riepilogo`
// ===========================================================================
//
// IL PROBLEMA. Il gancio qui sopra sa far VIVERE una macchina, ma il giocatore
// non poteva né configurarla né vedere cosa stesse facendo: un motore senza
// volante. E `m.stato` era un sacco solo, in cui finivano mescolate due cose
// molto diverse — i contatori di lavoro e le scelte di chi gioca — con la
// conseguenza che NIENTE si salvava: configuravi, ricaricavi, perdevi tutto.
//
// DUE SACCHI, NON UNO. La separazione è la parte architetturale:
//
//   m.stato   RUNTIME EFFIMERO. Contatori, fasi, riferimenti ai mesh, cache.
//             Ricostruibile: NON si salva, e a ogni caricamento riparte vuoto
//             (`avvia` lo riempie). Resta il sacco libero di sempre.
//
//   m.config  LE MANOPOLE DEL GIOCATORE. SI SALVA col furni e sopravvive al
//             ricaricamento. Non è libero: contiene esattamente le chiavi
//             dichiarate in `def.opzioni`, sempre di tipo valido e nei limiti
//             (ci pensa `normalizzaConfig`, che gira sia alla nascita sia al
//             caricamento). Un def può leggerlo senza mai controllare niente:
//             `m.config.raggio` è un numero valido per costruzione.
//
// DOVE VIVE DAVVERO. `m.config` è LO STESSO OGGETTO di `istanza.config` (il
// furni). Non è un dettaglio: l'entità-macchina viene distrutta e ricreata dal
// reconcile a ogni caricamento, mentre l'istanza-furni è ciò che save.js
// serializza. Appoggiando la config al furni, la persistenza esce gratis da
// entrambi i lati — si salva perché sta nel furni, e sopravvive al reconcile
// perché la macchina nuova ci si riaggancia invece di ricrearla.
//
// IL CONTRATTO PER CHI SCRIVE UNA MACCHINA (tutto facoltativo):
//
//   def.opzioni = [ …manopole… ]   — dichiarative, il pannello si costruisce da
//     solo (ui/pannelloMacchina.js): una macchina nuova ha la sua interfaccia
//     GRATIS, senza scrivere una riga di UI. Tre tipi:
//       {chiave:'attiva', etichetta:'Accesa', tipo:'interruttore', default:true}
//       {chiave:'raggio', etichetta:'Raggio', tipo:'numero', min:1, max:10, passo:1, default:4}
//       {chiave:'ritmo',  etichetta:'Ritmo',  tipo:'scelta', default:'medio',
//        valori:[{v:'lento',testo:'🐌 Lento'}, {v:'medio',testo:'🚶 Medio'}]}
//     Il valore vive in `m.config[chiave]`; `default` è applicato alla nascita.
//
//   def.riepilogo(m, servizi) -> string   — UNA riga leggibile su cosa sta
//     facendo ADESSO ("Pieno 4/4 — dorme", "Niente acqua entro 3 celle"). È la
//     finestra sul lavoro della macchina, e il posto giusto per esporre un
//     NUMERO che cresce: è così che si verifica che una manopola faccia effetto
//     davvero, invece di fidarsi dell'impressione a schermo.
//
//   def.onConfig(m, servizi, chiave)  — reazione immediata al giro di manopola,
//     per ciò che non basta rileggere al prossimo tick (es. il Coltivatore che
//     deve NASCONDERE i frutti in eccesso quando la capienza si abbassa).
//     Non serve per far ripartire una macchina addormentata: a quello pensa già
//     `impostaConfig`, che la sveglia da sé.

const PRIORITA_MACCHINA = 0;   // stesso rango dei pensieri creatura: tie-break per seq (deterministico)

// QUARANTENA. Un def-macchina è codice di CONTENUTO (registry.js, un domani
// l'Officina): può contenere un baco. Se `aggiorna` lancia, l'eccezione risalirebbe
// per agenda.scarica → orologio.passi → passo(): un macchinario storto ucciderebbe
// il LOOP, cioè tutto il gioco. Perciò ogni chiamata al def passa da qui: al primo
// errore la macchina viene marchiata `rotta`, esclusa da agenda e risvegli, e
// l'errore viene URLATO in console (regola della casa: mai inghiottire — ma il
// resto del diorama continua a girare). `rotta` è per-ISTANZA, non per-def: le
// altre copie dello stesso macchinario restano vive finché non incappano anche loro.
function chiamaDef(m, nomeGancio, servizi, ...extra) {
  try {
    return { ok: true, valore: m.def[nomeGancio](m, servizi, ...extra) };
  } catch (e) {
    m.rotta = true;
    m.dormiente = true;
    console.error(`[lantern] macchina "${m.defId}" disattivata: ${nomeGancio} ha lanciato`, e);
    return { ok: false, valore: null };
  }
}

/** True se questo def FURNI porta un comportamento → merita una macchina ECS.
 *  NB: anche le sole `opzioni`/`riepilogo` bastano — un furni che si configura
 *  ma non fa nulla da sé è comunque una macchina (nasce dormiente, costo zero),
 *  altrimenti il pannello non avrebbe nessuna entità da cui leggere la config. */
export function eMacchina(def) {
  return !!def && (typeof def.aggiorna === 'function' || typeof def.onInteragisci === 'function' || haPannello(def));
}

// ---- LE MANOPOLE: dichiarazione → valori validi ----------------------------

/** Le manopole dichiarate dal def (mai null: semplifica ogni chiamante). */
export function opzioniDi(def) {
  return def && Array.isArray(def.opzioni) ? def.opzioni : [];
}

/** True se questa macchina ha qualcosa DA MOSTRARE in un pannello. */
export function haPannello(def) {
  return !!def && (opzioniDi(def).length > 0 || typeof def.riepilogo === 'function');
}

/** La manopola con quella chiave, o undefined. */
export function opzioneDi(def, chiave) {
  return opzioniDi(def).find((o) => o && o.chiave === chiave);
}

/**
 * UN valore riportato dentro i limiti della sua manopola. È il guardiano che
 * permette ai def di NON controllare mai niente: passa da qui tutto ciò che
 * entra in `m.config`, sia il default alla nascita sia il numero che arriva da
 * un salvataggio vecchio o da un pannello. Fuori scala → dentro i limiti;
 * spazzatura → il default; default assurdo → un ripiego sensato.
 */
export function normalizzaValore(op, v) {
  if (!op) return undefined;
  if (op.tipo === 'interruttore') return v === undefined || v === null ? !!op.default : !!v;

  if (op.tipo === 'numero') {
    let n = Number(v);
    if (!Number.isFinite(n)) n = Number(op.default);
    if (!Number.isFinite(n)) n = 0;
    const min = Number.isFinite(op.min) ? op.min : -Infinity;
    const max = Number.isFinite(op.max) ? op.max : Infinity;
    const passo = Number.isFinite(op.passo) && op.passo > 0 ? op.passo : 0;
    // il passo si àncora al MINIMO, non allo zero: con min=1 passo=2 i valori
    // leciti sono 1,3,5… (quello che si aspetta chi guarda lo slider partire da
    // sinistra), non 0,2,4 con gli estremi fuori griglia.
    if (passo && Number.isFinite(min)) n = min + Math.round((n - min) / passo) * passo;
    n = Math.min(max, Math.max(min, n));
    return Math.round(n * 1e6) / 1e6;      // via la polvere del virgola mobile
  }

  if (op.tipo === 'scelta') {
    const valori = Array.isArray(op.valori) ? op.valori : [];
    if (valori.some((x) => x && x.v === v)) return v;
    if (valori.some((x) => x && x.v === op.default)) return op.default;
    return valori.length ? valori[0].v : undefined;
  }

  // tipo sconosciuto: non si inventa niente, si tiene ciò che c'è (o il default)
  return v === undefined ? op.default : v;
}

/**
 * La config COMPLETA e VALIDA di un def, partendo da quella grezza (un
 * salvataggio, o niente). Le chiavi che il def non dichiara più vengono
 * SCARTATE: un salvataggio vecchio non trascina manopole che non esistono più.
 */
export function normalizzaConfig(def, grezza) {
  const out = {};
  const src = grezza && typeof grezza === 'object' ? grezza : {};
  for (const op of opzioniDi(def)) {
    if (!op || typeof op.chiave !== 'string') continue;
    out[op.chiave] = normalizzaValore(op, src[op.chiave]);
  }
  return out;
}

/** La config di partenza di un def (tutti i `default`). */
export function configDefault(def) { return normalizzaConfig(def, null); }

/**
 * GIRA UNA MANOPOLA, e fa in modo che si senta SUBITO. Tre cose in ordine:
 * scrive il valore (normalizzato), avvisa il def se gli interessa (`onConfig`),
 * e RISVEGLIA la macchina — perché il caso più comune è proprio quello di una
 * macchina addormentata (il Coltivatore pieno, lo Scintillatore spento) che
 * deve ripartire all'istante, non al prossimo evento che passa di lì.
 * Torna true se qualcosa è davvero cambiato.
 */
export function impostaConfig(servizi, m, chiave, valore) {
  if (!m || m.rotta) return false;
  const op = opzioneDi(m.def, chiave);
  if (!op) return false;
  const v = normalizzaValore(op, valore);
  if (m.config[chiave] === v) return false;
  m.config[chiave] = v;
  if (typeof m.def.onConfig === 'function') chiamaDef(m, 'onConfig', servizi, chiave);
  // solo chi ha un `aggiorna` ha senso svegliarlo: per gli altri sarebbe una
  // voce d'agenda che nasce solo per essere buttata via al primo scarico.
  if (typeof m.def.aggiorna === 'function') svegliaMacchina(servizi, m, 1);
  return true;
}

/**
 * La riga di riepilogo, pronta da mostrare (mai null).
 *
 * QUI LA QUARANTENA È PIÙ MITE DI QUELLA DI `aggiorna`, ed è voluto: un
 * riepilogo è un TESTO: se il suo codice lancia non c'è nessun motivo di
 * spegnere una macchina che magari sta lavorando benissimo. Perciò l'errore si
 * URLA in console (una volta sola: gira a ripetizione mentre il pannello è
 * aperto, e mille righe uguali nascondono la prima) e si mostra a schermo, ma
 * la macchina resta viva.
 */
export function riepilogoDi(m, servizi) {
  if (!m) return '';
  if (m.rotta) return '⚠ Guasta: il suo codice ha lanciato (vedi console).';
  if (typeof m.def.riepilogo !== 'function') return '';
  try {
    const t = m.def.riepilogo(m, servizi);
    return typeof t === 'string' ? t : '';
  } catch (e) {
    if (!m.riepilogoRotto) {
      m.riepilogoRotto = true;
      console.error(`[lantern] macchina "${m.defId}": riepilogo ha lanciato`, e);
    }
    return '⚠ Riepilogo non disponibile (il def ha lanciato: vedi console).';
  }
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
 *   { id, defId, def, cella, istanza, stato, config, rng, dormiente }
 * Se il def ha `aggiorna`, prenota il primo risveglio in agenda (avviaTraTick);
 * altrimenti l'entità nasce DORMIENTE (reagirà solo alle interazioni). Torna l'id.
 */
export function creaEntitaMacchina(ecs, servizi, istanza) {
  const def = istanza.def;
  const e = ecs.crea();
  // LA CONFIG STA SUL FURNI, non sulla macchina. Il reconcile distrugge e
  // ricrea le entità-macchina a ogni caricamento; l'istanza-furni no, ed è lei
  // che save.js serializza. Normalizzando QUI si copre in un colpo solo il
  // furni appena posato (config assente → tutti i default) e quello che torna
  // da un salvataggio (config grezza → ripulita e riportata nei limiti).
  istanza.config = normalizzaConfig(def, istanza.config);
  const m = {
    id: e,
    defId: istanza.defId,
    def,
    cella: istanza.cella,
    istanza,
    stato: {},                                   // RUNTIME effimero: contatori, fasi, mesh… non si salva
    config: istanza.config,                      // LE MANOPOLE: stesso oggetto del furni → si salva
    rng: servizi.rng.diramazione(e),             // sotto-Rng deterministico per-macchina
    dormiente: true,
    rotta: false,                                // messa in quarantena da un'eccezione del def
  };
  ecs.aggiungi(e, 'macchina', m);
  if (typeof def.avvia === 'function') chiamaDef(m, 'avvia', servizi);
  if (typeof def.aggiorna === 'function' && !m.rotta) {
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
  if (!m || m.rotta) return;                     // in quarantena: la voce si esaurisce qui
  const def = m.def;
  if (typeof def.aggiorna !== 'function') { m.dormiente = true; return; }

  // L'INVARIANTE VA RIMESSA A POSTO *PRIMA* DELL'AGGIORNA. La voce è già stata
  // estratta dall'agenda: in questo istante la macchina NON ha prenotazioni
  // pendenti, quindi è a tutti gli effetti dormiente. Se lasciassimo il flag a
  // false, una `svegliaMacchina` arrivata DURANTE l'aggiorna (una macchina che
  // ne sveglia un'altra — la catena trasmettitore→ripetitore) la vedrebbe
  // "già attiva" e verrebbe scartata come doppio-booking: risveglio PERSO, e se
  // poi l'aggiorna ritorna falsy la macchina si addormenta ignorando la chiamata.
  m.dormiente = true;
  const esito = chiamaDef(m, 'aggiorna', servizi);
  if (!esito.ok) return;                         // ha lanciato: già messa in quarantena
  if (!ecs.vivo(id)) return;                     // si è auto-distrutta durante l'aggiorna
  const prossimo = esito.valore;
  if (typeof prossimo === 'number' && prossimo > 0) {
    // Se durante l'aggiorna qualcuno l'ha GIÀ risvegliata, la sua prenotazione
    // vale: riprogrammare qui creerebbe la seconda voce (doppio-booking).
    if (m.dormiente) {
      servizi.agenda.programma(prossimo | 0, PRIORITA_MACCHINA, id);
      m.dormiente = false;
    }
  }
  // altrimenti resta dormiente: nessuna voce → costo ZERO
}

/**
 * Risveglia una macchina DORMIENTE prenotandole un risveglio fra `traTick` tick.
 * No-op se è già attiva (ha già una voce in agenda): evita il doppio-booking, che
 * romperebbe l'invariante "attiva ⟺ esattamente una voce pendente". Utile da
 * dentro `onInteragisci` per far ripartire una macchina che si era addormentata.
 */
export function svegliaMacchina(servizi, m, traTick = 1) {
  if (!m || m.rotta || !m.dormiente) return false;
  if (!servizi.ecs.vivo(m.id)) return false;     // handle stantìo: il furni non c'è più
  servizi.agenda.programma(Math.max(0, traTick | 0), PRIORITA_MACCHINA, m.id);
  m.dormiente = false;
  return true;
}

/**
 * IL TOCCO, con la stessa quarantena dell'aggiorna. Trova la macchina che
 * rispecchia quell'istanza di furni e le passa l'interazione; torna true se il
 * def l'ha GESTITA (il chiamante si ferma e non prosegue col legacy).
 * Sta qui e non in main perché è l'altra metà del contratto: un `onInteragisci`
 * che lancia non deve buttare giù il gestore dei click.
 */
export function toccaMacchina(gestore, servizi, istanza) {
  if (!istanza || typeof istanza.def.onInteragisci !== 'function') return false;
  const m = macchinaDi(gestore, servizi, istanza);
  if (!m) return false;
  return !!chiamaDef(m, 'onInteragisci', servizi).valore;
}

/**
 * Il "cruscotto" della macchina che rispecchia quell'istanza di furni, o null
 * (furni senza comportamento, reconcile non ancora passato, macchina in
 * quarantena). È il punto d'ingresso di chi vuole GUARDARE una macchina invece
 * di toccarla — il pannello delle manopole, per esempio.
 */
export function macchinaDi(gestore, servizi, istanza) {
  if (!istanza) return null;
  const id = gestore.perFurni(istanza);
  if (id == null) return null;                   // reconcile non ancora passato
  const m = servizi.ecs.leggi(id, 'macchina');
  return m && !m.rotta ? m : null;
}

/**
 * Distrugge l'entità-macchina: prima lascia al def la sua pulizia (`rimuovi` —
 * es. il Generatore despawna la palla), poi libera l'entità. La voce d'agenda
 * eventualmente pendente si esaurirà da sola (guidaMacchina salta gli id morti).
 */
export function distruggiEntitaMacchina(ecs, servizi, id) {
  if (!ecs.vivo(id)) return;
  const m = ecs.leggi(id, 'macchina');
  // la pulizia del def NON deve poter impedire la distruzione dell'entità: se
  // lancia, la quarantena la assorbe e si libera comunque lo slot (altrimenti
  // un def storto farebbe accumulare entità-zombie a ogni furni rimosso).
  if (m && !m.rotta && typeof m.def.rimuovi === 'function') chiamaDef(m, 'rimuovi', servizi);
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
