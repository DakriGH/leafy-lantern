// Registry dei furni — lo schema eredita le BlockDefinition Unity (SPEC §5):
// footprint a layer con offset di celle dal pivot, stati, luci, navigazione.
// I layer di Def_Lamppost.asset (3 piani, cella centrale) sono riportati qui pari pari.
//
// FASE 3b — COMPORTAMENTO NEL DEF. Un furni può ora portare un comportamento nel
// tempo (`aggiorna`) e una reazione al tocco (`onInteragisci`): diventa una
// MACCHINA guidata dall'agenda, senza una riga speciale in main.js. Il contratto
// completo è documentato in gioco/macchine.js. Qui sotto due esempi vivi: il
// Generatore (che PRIMA era cablato in main come `sincronizzaPalle`) e lo
// Scintillatore-demo (nato solo per provare che il gancio regge).

import { creaEntitaPalla, distruggiPalla } from '../gioco/palla.js?v=mrt9jcee';
import { svegliaMacchina, impostaConfig } from '../gioco/macchine.js?v=mrt9jcee';
import { defDi } from '../world/blocks.js?v=mrt9jcee';

// ---- COMODITÀ PER LE MANOPOLE ---------------------------------------------
// Tre ritmi con gli stessi tre nomi ovunque: chi impara "🐌 / 🚶 / ⚡" su una
// macchina lo ritrova su tutte. La TABELLA dei tick sta poi nel singolo def,
// perché "svelto" per un coltivatore (0,6 s) non è "svelto" per una pompa.
const RITMI = [
  { v: 'lento', testo: '🐌 Lento' },
  { v: 'medio', testo: '🚶 Medio' },
  { v: 'svelto', testo: '⚡ Svelto' },
];
const GIRO_RITMI = RITMI.map((r) => r.v);        // per i tocchi che li CICLANO

/** Secondi, come li legge un umano: i tick sono 20 al secondo (Orologio). */
const inSecondi = (tick) => (tick / 20).toFixed(1).replace('.', ',');

// ---- ATTREZZI DI CONTENUTO (servono ai def-macchina, non escono da qui) ------
// Stanno qui e non in macchine.js apposta: sono comodità per SCRIVERE macchine,
// non pezzi del gancio. Il gancio resta minuscolo e generico.

/** I mesh del furni con quel `name` (li prepara loader.js): la visuale per-istanza. */
function pezzi(m, nome) {
  const trovati = [];
  if (m.istanza && m.istanza.gruppo) m.istanza.gruppo.traverse((o) => { if (o.name === nome) trovati.push(o); });
  return trovati;
}

/** Il centro della cella del furni, in coordinate mondo (dove sparare particelle). */
function centro(m, dy = 1) {
  return [m.cella[0] + 0.5, m.cella[1] + dy, m.cella[2] + 0.5];
}

/** Sbuffo di particelle: `n` scintille in cono verso l'alto dal punto dato. */
function sbuffo(servizi, m, [x, y, z], n, colore, spinta = 1) {
  const p = servizi.particelle;
  if (!p) return;
  for (let i = 0; i < n; i++) {
    const a = m.rng.prossimo() * Math.PI * 2, vr = (0.3 + m.rng.prossimo() * 0.6) * spinta;
    p.emetti(x, y, z, Math.cos(a) * vr, (0.9 + m.rng.prossimo() * 0.9) * spinta, Math.sin(a) * vr, 0.55, 0.45, 0, colore);
  }
}

/**
 * Le altre MACCHINE di un certo tipo entro `raggio` celle, dalla più vicina.
 * È il "vedersi fra macchine" che rende possibili i meccanismi composti: si
 * interroga l'ECS, non una lista globale, quindi non c'è nulla da tenere in pari.
 * COSTO: scansione lineare su tutte le macchine (O(n)). Va benissimo per le
 * decine di macchine di un diorama; per migliaia servirebbe un indice spaziale.
 */
function macchineVicine(servizi, m, defId, raggio) {
  const ecs = servizi.ecs, out = [];
  for (const id of ecs.ognuna('macchina')) {
    if (id === m.id) continue;
    const altra = ecs.leggi(id, 'macchina');
    if (!altra || altra.defId !== defId || altra.rotta) continue;
    const dx = altra.cella[0] - m.cella[0], dy = altra.cella[1] - m.cella[1], dz = altra.cella[2] - m.cella[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= raggio * raggio) out.push({ m: altra, d2 });
  }
  out.sort((a, b) => a.d2 - b.d2);
  return out.map((v) => v.m);
}

export const FURNI = {
  albero: {
    id: 'albero', nome: 'Albero', icona: '🌳',
    modello: 'Prefabs/OriginalMesh/Tree.fbx',
    // il tronco blocca 1×1 per 3 piani: la chioma sborda liberamente (fluttua, come tutto)
    layers: [{ y: 0, celle: [[0, 0]] }, { y: 1, celle: [[0, 0]] }, { y: 2, celle: [[0, 0]] }],
    ruotabile: true,
    allineaBase: true,            // centra il TRONCO sulla cella, non il bbox della chioma
  },
  panchina: {
    id: 'panchina', nome: 'Panchina', icona: '🪑',
    modello: 'Prefabs/OriginalMesh/Bench.fbx',
    layers: [{ y: 0, celle: [[0, 0]] }],
    autoFootprint: true,          // il footprint orizzontale si misura dal modello
    ruotabile: true,
    seduta: { altezzaPx: 8 },     // M5: click in Esplora = il gatto si accomoda
  },
  lampione: {
    id: 'lampione', nome: 'Lampione', icona: '🏮',
    modello: 'Prefabs/OriginalMesh/Lampost.fbx',
    layers: [{ y: 0, celle: [[0, 0]] }, { y: 1, celle: [[0, 0]] }, { y: 2, celle: [[0, 0]] }],
    ruotabile: true,
    allineaBase: true,            // centra il BASAMENTO (il braccio della testa è asimmetrico)
    autoNotte: true,              // segue il ciclo: Acceso di notte
    stati: [
      { nome: 'Spento', modello: 'Prefabs/OriginalMesh/States/LampostOFF.fbx' },
      // ombra: true = luce PESANTE (vedi blocks.js): un lampione sta piantato
      // per terra, quindi si merita la sua mappa d'ombra e non passa i muri.
      { nome: 'Acceso', modello: 'Prefabs/OriginalMesh/States/LampostON.fbx',
        luce: { colore: 0xffd889, raggio: 4.6, intensita: 1.0, ombra: true } },
    ],
  },
  generatore: {
    id: 'generatore', nome: 'Generatore palla', icona: '⚽',
    procedurale: true,            // modello costruito in codice (niente FBX)
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    palla: { raggioMax: 12 },     // la palla sparisce oltre e rinasce qui sopra
    // UNA SOLA MANOPOLA, e tocca un dato che vive FUORI dalla macchina (nel
    // componente `sfera` della palla). È il caso interessante: non basta
    // rileggere la config al prossimo tick, bisogna anche RIVERSARLA sulla
    // palla già in campo — e il tick "prossimo" arriva solo perché
    // `impostaConfig` risveglia la macchina apposta.
    opzioni: [
      { chiave: 'raggio', etichetta: 'Guinzaglio della palla', tipo: 'numero',
        min: 4, max: 30, passo: 1, default: 12 },
    ],
    // COMPORTAMENTO (ex `sincronizzaPalle` di main.js). Il generatore è una
    // macchina "one-shot che poi dorme": sputa la sua palla e va in DORMIENZA —
    // la palla vive di vita propria nel sistemaPalle (fisica a passo fisso,
    // respawn interno), non serve svegliare il generatore mai più. È la prova più
    // pulita del punto dell'agenda: dopo il primo tick, ZERO costo.
    aggiorna(m, servizi) {
      const ecs = servizi.ecs;
      if (m.stato.palla == null || !ecs.vivo(m.stato.palla)) {
        m.stato.palla = creaEntitaPalla(ecs, servizi.scena, m.cella, m.config.raggio, servizi.rng);
      } else {
        const sf = ecs.leggi(m.stato.palla, 'sfera');
        if (sf) sf.raggioMax = m.config.raggio;   // manopola girata: la palla in campo si adegua
      }
      return null;                // dorme: niente da fare finché il furni esiste
    },
    riepilogo(m, servizi) {
      const ecs = servizi.ecs;
      const viva = m.stato.palla != null && ecs.vivo(m.stato.palla);
      if (!viva) return 'Nessuna palla in campo: ne fabbrico una al prossimo tick.';
      const p = ecs.leggi(m.stato.palla, 'posizione');
      const d = p ? Math.hypot(p.x - (m.cella[0] + 0.5), p.z - (m.cella[2] + 0.5)) : 0;
      return `Palla in campo a ${d.toFixed(1).replace('.', ',')} celle da qui · torna a casa oltre ${m.config.raggio}.`;
    },
    // il furni rimosso porta via la sua palla (ex ramo di cleanup di sincronizzaPalle)
    rimuovi(m, servizi) {
      if (m.stato.palla != null) distruggiPalla(servizi.ecs, servizi.scena, m.stato.palla);
    },
  },
  // ---- MACCHINA-DEMO: prova che il gancio regge senza righe speciali in main ----
  // Un congegno che PULSA e lancia scintille a intervalli PROGRAMMATI (agenda), e
  // al tocco cambia ritmo. È definito SOLO qui: main.js non lo nomina mai. Visuale
  // procedurale (loader.js → fallback 'scintillatore'), stile unlit come il resto.
  scintillatore: {
    id: 'scintillatore', nome: 'Scintillatore', icona: '✨',
    procedurale: true,
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    // tick fra una scintilla e l'altra: 2 s · 1 s · 0,5 s
    tickRitmo: { lento: 40, medio: 20, svelto: 10 },
    opzioni: [
      { chiave: 'attivo', etichetta: 'Accesa', tipo: 'interruttore', default: true },
      { chiave: 'ritmo', etichetta: 'Ritmo', tipo: 'scelta', valori: RITMI, default: 'medio' },
      { chiave: 'quante', etichetta: 'Scintille per colpo', tipo: 'numero', min: 1, max: 12, passo: 1, default: 4 },
    ],
    aggiorna(m, servizi) {
      const st = m.stato, cfg = m.config;
      // SPENTA = DORMIENTE VERA, non un tick sprecato a non far niente: ritorna
      // falsy e sparisce dall'agenda. La riaccende `impostaConfig`, che sveglia
      // la macchina appena si gira l'interruttore.
      if (!cfg.attivo) {
        if (m.istanza && m.istanza.gruppo) m.istanza.gruppo.scale.setScalar(1);
        return null;
      }
      st.battito = (st.battito || 0) + 1;
      // "heartbeat" VISIBILE: alterna la scala del gruppo del furni (per-istanza,
      // niente materiali condivisi da mutare). Discreto ma chiaro: pulsa a ogni tick.
      if (m.istanza && m.istanza.gruppo) m.istanza.gruppo.scale.setScalar((st.battito & 1) ? 1.16 : 1.0);
      // scintilla: una manciata di particelle azzurrine verso l'alto dalla cima
      const p = servizi.particelle;
      if (p) {
        const cx = m.cella[0] + 0.5, cy = m.cella[1] + 1.2, cz = m.cella[2] + 0.5;
        for (let i = 0; i < cfg.quante; i++) {
          const a = m.rng.prossimo() * Math.PI * 2, vr = 0.4 + m.rng.prossimo() * 0.6;
          p.emetti(cx, cy, cz, Math.cos(a) * vr, 1.2 + m.rng.prossimo() * 0.8, Math.sin(a) * vr, 0.5, 0.5, 0, [0.7, 0.95, 1]);
        }
      }
      return m.def.tickRitmo[cfg.ritmo];   // riprenota: macchina SEMPRE attiva (a differenza del generatore)
    },
    // IL CONTATORE `battito` NEL RIEPILOGO NON È DECORAZIONE: è il numero con
    // cui si VERIFICA che la manopola del ritmo faccia effetto (in 10 secondi
    // "lento" ne fa 5, "svelto" 20), invece di fidarsi dell'impressione a schermo.
    riepilogo(m) {
      const cfg = m.config;
      if (!cfg.attivo) return `Spenta (dorme, costo zero) · ${m.stato.battito || 0} battiti finora.`;
      return `Scintilla ogni ${inSecondi(m.def.tickRitmo[cfg.ritmo])} s · ${cfg.quante} scintille per colpo · ${m.stato.battito || 0} battiti finora.`;
    },
    onInteragisci(m, servizi) {
      // Il tocco CICLA il ritmo, com'è sempre stato — ma adesso scrive nella
      // stessa manopola del pannello, quindi le due strade non divergono mai
      // (giri il ritmo col dito, apri il pannello e lo trovi già spostato).
      // Se è spenta il tocco la RIACCENDE invece: "tocco e non succede niente"
      // è il modo migliore per far credere che la macchina sia rotta.
      if (!m.config.attivo) impostaConfig(servizi, m, 'attivo', true);
      else {
        const giro = GIRO_RITMI, idx = Math.max(0, giro.indexOf(m.config.ritmo));
        impostaConfig(servizi, m, 'ritmo', giro[(idx + 1) % giro.length]);
      }
      const p = servizi.particelle;
      if (p) {
        const cx = m.cella[0] + 0.5, cy = m.cella[1] + 1.2, cz = m.cella[2] + 0.5;
        for (let i = 0; i < 12; i++) {
          const a = m.rng.prossimo() * Math.PI * 2, vr = 0.8 + m.rng.prossimo();
          p.emetti(cx, cy, cz, Math.cos(a) * vr, 2 + m.rng.prossimo() * 1.5, Math.sin(a) * vr, 0.6, 0.6, 0, [1, 0.9, 0.6]);
        }
      }
      if (servizi.audio) servizi.audio.sfx('ui');
      return true;                    // gestita: il chiamante si ferma qui
    },
  },

  // ==========================================================================
  // QUATTRO MACCHINE VERE — una per ogni capacità del gancio. NESSUNA di queste
  // è nominata in main.js: vivono tutte qui dentro (più la visuale procedurale
  // in loader.js). È il collaudo del contratto di macchine.js.
  // ==========================================================================

  // 1) PRODUZIONE + STOP A CAPIENZA (stato proprio, dormienza a magazzino pieno).
  //    Il Coltivatore fa maturare un frutto ogni `tickPerFrutto`; arrivato a
  //    `capienza` RITORNA falsy e sparisce dall'agenda (costo ZERO finché è
  //    pieno). Il tocco raccoglie e lo RISVEGLIA. Legge anche `servizi.notte`:
  //    di notte le piante non crescono, e invece di restare inutilmente svelta
  //    si riprenota rado (poll lento) — l'adattamento del ritmo alle condizioni.
  coltivatore: {
    id: 'coltivatore', nome: 'Coltivatore', icona: '🌱',
    procedurale: true,
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    capienzaMax: 4,         // quanti mesh-frutto ha il modello: il tetto della manopola
    tickRitmo: { lento: 60, medio: 30, svelto: 12 },
    tickNotte: 40,          // di notte ricontrolla ogni 2 s senza produrre
    opzioni: [
      { chiave: 'capienza', etichetta: 'Capienza del cesto', tipo: 'numero', min: 1, max: 4, passo: 1, default: 4 },
      { chiave: 'ritmo', etichetta: 'Velocità di maturazione', tipo: 'scelta', valori: RITMI, default: 'medio' },
      { chiave: 'diNotte', etichetta: 'Matura anche di notte', tipo: 'interruttore', default: false },
    ],
    // `avvia` = setup una tantum: qui aggancia i 4 mesh-frutto che loader.js ha
    // già messo nel modello (nascosti). Mostrarli/nasconderli è per-ISTANZA e non
    // tocca materiali condivisi: la regola grafica della casa resta intatta.
    avvia(m) {
      m.stato.frutti = pezzi(m, 'frutto');
      m.stato.n = 0;
      for (const f of m.stato.frutti) f.visible = false;
    },
    // ABBASSARE LA CAPIENZA DEVE VEDERSI SUBITO, ed è il caso che `onConfig`
    // esiste per coprire: nessun `aggiorna` verrà a spegnere i frutti in
    // eccesso, perché la macchina è già oltre la capienza e quindi DORME. Senza
    // questo gancio resterebbero accesi sul modello e il pannello direbbe «3/2».
    onConfig(m, servizi, chiave) {
      if (chiave !== 'capienza') return;
      const st = m.stato;
      while (st.n > m.config.capienza) { st.n--; if (st.frutti[st.n]) st.frutti[st.n].visible = false; }
    },
    aggiorna(m, servizi) {
      const st = m.stato, def = m.def, cfg = m.config;
      if (st.n >= cfg.capienza) return null;               // PIENO: dorme, zero costo
      // reagisce al mondo: di notte non matura — a meno che la manopola non dica
      // il contrario, e allora il poll lento non serve più
      if (servizi.notte && !cfg.diNotte) return def.tickNotte;
      const f = st.frutti[st.n];
      if (f) f.visible = true;
      st.n++;
      sbuffo(servizi, m, centro(m, 0.55), 3, [0.55, 0.9, 0.45], 0.7);
      return st.n >= cfg.capienza ? null : def.tickRitmo[cfg.ritmo];
    },
    riepilogo(m, servizi) {
      const st = m.stato, cfg = m.config;
      const cesto = `${st.n || 0}/${cfg.capienza}`;
      const bottino = `raccolti finora ${st.raccolti || 0}`;
      if ((st.n || 0) >= cfg.capienza) return `Pieno ${cesto} — dorme finché non raccogli · ${bottino}.`;
      if (servizi.notte && !cfg.diNotte) return `È notte: non matura (${cesto}) · ${bottino}.`;
      return `Maturi ${cesto} · il prossimo fra ${inSecondi(m.def.tickRitmo[cfg.ritmo])} s · ${bottino}.`;
    },
    onInteragisci(m, servizi) {
      const st = m.stato;
      if (!st.n) return true;                              // niente da raccogliere: tocco consumato
      for (const f of st.frutti) f.visible = false;
      st.raccolti = (st.raccolti || 0) + st.n;
      st.n = 0;
      sbuffo(servizi, m, centro(m, 0.7), 10, [0.7, 1, 0.5], 1.4);
      if (servizi.audio) servizi.audio.sfx('raccogli');
      svegliaMacchina(servizi, m, 1);                      // magazzino vuoto: riparte a produrre
      return true;
    },
  },

  // 2) REAGISCE AL MONDO (`servizi.mondo`). L'Idrovora annusa l'ACQUA attorno a
  //    sé: se ce n'è, pompa in fretta (getto alzato + goccioline); se non ce n'è,
  //    si mette in poll LENTO invece di girare a vuoto. Dimostra due cose: che una
  //    macchina può LEGGERE la griglia del mondo, e che il ritmo è una decisione
  //    per-tick (l'agenda non impone un periodo fisso).
  idrovora: {
    id: 'idrovora', nome: 'Idrovora', icona: '🚰',
    procedurale: true,
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    tickRitmo: { lento: 14, medio: 6, svelto: 2 },   // quando lavora
    tickRiposo: 40,         // 2 s quando è all'asciutto (annusa e basta)
    // IL RAGGIO È LA MANOPOLA PIÙ ONESTA DEL LOTTO: allargandolo la pompa trova
    // l'acqua da più lontano e il getto si accende: si vede a occhio se la
    // manopola ha fatto effetto, senza leggere un numero.
    opzioni: [
      { chiave: 'attiva', etichetta: 'Accesa', tipo: 'interruttore', default: true },
      { chiave: 'raggio', etichetta: 'Raggio di ricerca (celle)', tipo: 'numero', min: 1, max: 8, passo: 1, default: 3 },
      { chiave: 'ritmo', etichetta: 'Portata', tipo: 'scelta', valori: RITMI, default: 'medio' },
    ],
    avvia(m) { m.stato.getto = pezzi(m, 'getto'); },
    aggiorna(m, servizi) {
      const def = m.def, cfg = m.config, mondo = servizi.mondo;
      if (!cfg.attiva) {
        for (const g of m.stato.getto || []) g.visible = false;
        m.stato.trovata = null;
        return null;                                       // spenta: dorme sul serio
      }
      const [cx, cy, cz] = m.cella;
      const R = cfg.raggio;
      let acqua = null;
      // scansione a cubetto attorno alla base: piccola e a raggio DICHIARATO, così
      // il costo dipende dalla manopola e non da quanta acqua c'è nel diorama.
      for (let dx = -R; dx <= R && !acqua; dx++) {
        for (let dy = -1; dy <= 1 && !acqua; dy++) {
          for (let dz = -R; dz <= R && !acqua; dz++) {
            const t = mondo.tipo(cx + dx, cy + dy, cz + dz);
            if (t && defDi(t).acqua) acqua = [cx + dx + 0.5, cy + dy + 0.9, cz + dz + 0.5];
          }
        }
      }
      for (const g of m.stato.getto || []) g.visible = !!acqua;
      m.stato.trovata = acqua;                             // per il riepilogo: DA DOVE sta attingendo
      if (!acqua) return def.tickRiposo;
      // getto in cima + una gocciolina che salta su dalla pozza trovata: si VEDE
      // da dove sta attingendo.
      m.stato.getti = (m.stato.getti || 0) + 1;
      sbuffo(servizi, m, centro(m, 1.35), 2, [0.55, 0.8, 1], 0.8);
      sbuffo(servizi, m, acqua, 1, [0.6, 0.85, 1], 1.1);
      return def.tickRitmo[cfg.ritmo];
    },
    riepilogo(m) {
      const st = m.stato, cfg = m.config;
      if (!cfg.attiva) return `Spenta (dorme, costo zero) · ${st.getti || 0} getti finora.`;
      if (!st.trovata) return `Niente acqua entro ${cfg.raggio} ${cfg.raggio === 1 ? 'cella' : 'celle'}: annuso ogni ${inSecondi(m.def.tickRiposo)} s. Allarga il raggio o portale dell'acqua.`;
      const [ax, ay, az] = st.trovata;
      return `Pompa da (${Math.floor(ax)}, ${Math.floor(ay)}, ${Math.floor(az)}) ogni ${inSecondi(m.def.tickRitmo[cfg.ritmo])} s · ${st.getti || 0} getti finora.`;
    },
  },

  // 3) REAGISCE AL GIOCATORE (`servizi.player`). Il Campanello guarda dov'è il
  //    gatto: vicino → scampanella svelto, lontano → poll lento. E col tocco si
  //    METTE IN SILENZIO: allora ritorna falsy e sparisce DAVVERO dall'agenda
  //    (dormienza totale), finché un altro tocco non lo risveglia.
  //    ONESTÀ: "si sveglia quando il gatto si avvicina" qui è un POLL, non un
  //    trigger. Un vero trigger di prossimità vorrebbe un indice spaziale che
  //    sveglia le macchine quando il player entra nella cella: non c'è, e finché
  //    non c'è "dorme se lontano" significa "costa una voce d'agenda al secondo".
  campanello: {
    id: 'campanello', nome: 'Campanello', icona: '🔔',
    procedurale: true,
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    tickRitmo: { lento: 20, medio: 8, svelto: 3 },   // a gatto vicino
    tickVeglia: 20,         // 1 s di guardia quando è lontano
    // «muto» NON è più un campo di `stato`: è diventato la manopola `attivo`, ed
    // è il primo pezzo di configurazione che il gioco ha mai SALVATO. Prima
    // silenziavi il campanello, ricaricavi la pagina e ricominciava a suonare.
    opzioni: [
      { chiave: 'attivo', etichetta: 'Suona', tipo: 'interruttore', default: true },
      { chiave: 'raggio', etichetta: 'Raggio d’ascolto (celle)', tipo: 'numero', min: 1, max: 12, passo: 1, default: 4 },
      { chiave: 'ritmo', etichetta: 'Ritmo dei rintocchi', tipo: 'scelta', valori: RITMI, default: 'medio' },
    ],
    avvia(m) { m.stato.campana = pezzi(m, 'campana'); },
    aggiorna(m, servizi) {
      const def = m.def, st = m.stato, cfg = m.config;
      if (!cfg.attivo) {                                   // silenziato: dorme sul serio
        for (const c of st.campana || []) c.rotation.z = 0;
        st.lontananza = null;
        return null;
      }
      const p = servizi.player;
      if (!p || !p.pos) return def.tickVeglia;
      const dx = p.pos.x - (m.cella[0] + 0.5), dz = p.pos.z - (m.cella[2] + 0.5);
      const d = Math.hypot(dx, dz);
      st.lontananza = d;                                   // per il riepilogo
      const vicino = d <= cfg.raggio;
      // dondolio della campana: scala per-istanza, alternata a ogni rintocco
      st.dondolo = vicino ? !st.dondolo : false;
      for (const c of st.campana) c.rotation.z = st.dondolo ? 0.22 : -0.05;
      if (!vicino) return def.tickVeglia;
      st.rintocchi = (st.rintocchi || 0) + 1;
      sbuffo(servizi, m, centro(m, 0.95), 3, [1, 0.92, 0.55], 0.9);
      if (servizi.audio) servizi.audio.sfx('raccogli');
      return def.tickRitmo[cfg.ritmo];
    },
    riepilogo(m) {
      const st = m.stato, cfg = m.config;
      const conto = `${st.rintocchi || 0} rintocchi finora`;
      if (!cfg.attivo) return `Silenziato (dorme, costo zero) · ${conto}.`;
      if (st.lontananza == null) return `In guardia · ${conto}.`;
      const d = st.lontananza.toFixed(1).replace('.', ',');
      return st.lontananza <= cfg.raggio
        ? `Il gatto è a ${d} celle (raggio ${cfg.raggio}): SUONA ogni ${inSecondi(m.def.tickRitmo[cfg.ritmo])} s · ${conto}.`
        : `In guardia: il gatto è a ${d} celle, fuori dal raggio ${cfg.raggio} · ${conto}.`;
    },
    onInteragisci(m, servizi) {
      const st = m.stato;
      impostaConfig(servizi, m, 'attivo', !m.config.attivo);   // il tocco resta l'interruttore rapido
      for (const c of st.campana) c.rotation.z = 0;
      sbuffo(servizi, m, centro(m, 0.95), 6, m.config.attivo ? [1, 0.9, 0.5] : [0.5, 0.5, 0.55], 1.1);
      if (servizi.audio) servizi.audio.sfx('ui');
      return true;
    },
  },

  // 4a) CATENA — il capo. Il Trasmettitore non ha `aggiorna`: nasce DORMIENTE e
  //     costa zero per sempre. Al tocco cerca il Ripetitore più vicino, gli
  //     scrive nello stato quanti SALTI restano e lo risveglia: da lì parte
  //     l'onda. È la prova che due macchine si compongono senza saperlo l'una
  //     dell'altra a livello di codice — si trovano tramite l'ECS.
  trasmettitore: {
    id: 'trasmettitore', nome: 'Trasmettitore', icona: '📡',
    procedurale: true,
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    opzioni: [
      { chiave: 'salti', etichetta: 'Salti dell’onda', tipo: 'numero', min: 1, max: 12, passo: 1, default: 6 },
      { chiave: 'raggio', etichetta: 'Portata (celle)', tipo: 'numero', min: 2, max: 16, passo: 1, default: 10 },
    ],
    onInteragisci(m, servizi) {
      sbuffo(servizi, m, centro(m, 1.5), 8, [0.9, 0.7, 1], 1.2);
      if (servizi.audio) servizi.audio.sfx('ui');
      m.stato.onde = (m.stato.onde || 0) + 1;
      const vicini = macchineVicine(servizi, m, 'ripetitore', m.config.raggio);
      const primo = vicini[0];
      if (!primo) return true;                             // nessun ripetitore: solo lo sbuffo
      primo.stato.salti = m.config.salti;
      primo.stato.daCella = m.cella;
      svegliaMacchina(servizi, primo, 2);
      return true;
    },
    // IL RIEPILOGO QUI FA UNA SCANSIONE (macchineVicine è O(n) sulle macchine
    // del mondo) e gira a ripetizione mentre il pannello è aperto. Con le decine
    // di macchine di un diorama non si sente; se un giorno se ne contassero
    // migliaia, è QUESTA la riga da mettere in cache, non il gancio.
    riepilogo(m, servizi) {
      const n = macchineVicine(servizi, m, 'ripetitore', m.config.raggio).length;
      const onde = `${m.stato.onde || 0} onde lanciate`;
      if (!n) return `Nessun ripetitore entro ${m.config.raggio} celle: l’onda non parte · ${onde}.`;
      return `${n} ripetitor${n === 1 ? 'e' : 'i'} a portata · onda da ${m.config.salti} salti · ${onde}.`;
    },
  },

  // 4b) CATENA — l'anello. Il Ripetitore dorme finché non riceve `stato.salti`.
  //     Allora si ACCENDE, passa il testimone al ripetitore più vicino (escluso
  //     chi glielo ha appena passato) con un salto in meno, e si riprenota UNA
  //     volta per spegnersi. Poi torna a dormire. L'onda muore da sé quando i
  //     salti finiscono o non c'è più nessuno da svegliare: nessun rischio di
  //     ciclo infinito, che con macchine che si risvegliano a vicenda è LA
  //     trappola da evitare.
  ripetitore: {
    id: 'ripetitore', nome: 'Ripetitore', icona: '🔆',
    procedurale: true,
    layers: [{ y: 0, celle: [[0, 0]] }],
    ruotabile: false,
    tickAcceso: 4,          // resta illuminato 0,2 s
    opzioni: [
      { chiave: 'raggio', etichetta: 'Portata (celle)', tipo: 'numero', min: 2, max: 16, passo: 1, default: 10 },
      // il ritardo del salto è la manopola più SCENOGRAFICA: alzalo e l'onda
      // rallenta abbastanza da seguirla con gli occhi lungo tutta la catena.
      { chiave: 'ritardo', etichetta: 'Ritardo del salto (tick)', tipo: 'numero', min: 1, max: 20, passo: 1, default: 3 },
    ],
    avvia(m) {
      m.stato.acceso = pezzi(m, 'acceso');
      m.stato.spento = pezzi(m, 'spento');
      m.stato.salti = 0;
      for (const a of m.stato.acceso) a.visible = false;
    },
    aggiorna(m, servizi) {
      const st = m.stato, def = m.def, cfg = m.config;
      if (!st.salti) {                                     // fine corsa (o primo tick a vuoto): spegni e dormi
        for (const a of st.acceso) a.visible = false;
        for (const s of st.spento) s.visible = true;
        return null;
      }
      for (const a of st.acceso) a.visible = true;
      for (const s of st.spento) s.visible = false;
      st.passaggi = (st.passaggi || 0) + 1;
      sbuffo(servizi, m, centro(m, 0.85), 4, [1, 0.95, 0.6], 1);
      const restanti = st.salti - 1;
      st.salti = 0;                                        // consumato: al prossimo giro si spegne
      if (restanti > 0) {
        // il prossimo anello: il più vicino che DORME (uno già acceso è occupato)
        // e che non sia chi ci ha appena passato il testimone.
        for (const altra of macchineVicine(servizi, m, 'ripetitore', cfg.raggio)) {
          if (!altra.dormiente || altra.stato.salti) continue;
          if (st.daCella && altra.cella[0] === st.daCella[0] && altra.cella[1] === st.daCella[1] && altra.cella[2] === st.daCella[2]) continue;
          altra.stato.salti = restanti;
          altra.stato.daCella = m.cella;
          svegliaMacchina(servizi, altra, cfg.ritardo);
          break;
        }
      }
      return def.tickAcceso;                               // una sola riprenotazione: quella dello spegnimento
    },
    riepilogo(m, servizi) {
      const st = m.stato, cfg = m.config;
      const conto = `${st.passaggi || 0} onde passate di qui`;
      if (st.salti) return `Acceso: passo ${st.salti} salt${st.salti === 1 ? 'o' : 'i'} al prossimo · ${conto}.`;
      const n = macchineVicine(servizi, m, 'ripetitore', cfg.raggio).length;
      return `In attesa di un'onda · ${n} vicin${n === 1 ? 'o' : 'i'} entro ${cfg.raggio} celle · ${conto}.`;
    },
  },
};

/** Ruota un offset [dx,dz] di rot×90° attorno al pivot (coerente con rotation.y). */
export function ruotaOffset([dx, dz], rot) {
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [dx, dz] = [dz, -dx];
  return [dx, dz];
}

/** Celle mondo occupate da un furni con quel def/cella/rotazione. */
export function celleOccupate(def, [x, y, z], rot) {
  const celle = [];
  for (const layer of def.layers) {
    for (const off of layer.celle) {
      const [dx, dz] = ruotaOffset(off, rot);
      celle.push([x + dx, y + layer.y, z + dz]);
    }
  }
  return celle;
}

/** Baricentro (locale, pre-rotazione) del footprint: dove va centrato il modello. */
export function centroide(def) {
  const layer0 = def.layers.find((l) => l.y === 0);
  if (!layer0 || !layer0.celle.length) return [0, 0];
  let sx = 0, sz = 0;
  for (const [dx, dz] of layer0.celle) { sx += dx; sz += dz; }
  return [sx / layer0.celle.length, sz / layer0.celle.length];
}

/** Solo le celle del piano d'appoggio (per la regola del supporto pieno). */
export function celleAppoggio(def, [x, y, z], rot) {
  const layer0 = def.layers.find((l) => l.y === 0);
  if (!layer0) return [];
  return layer0.celle.map((off) => {
    const [dx, dz] = ruotaOffset(off, rot);
    return [x + dx, y, z + dz];
  });
}
