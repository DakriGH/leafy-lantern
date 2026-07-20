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

import { creaEntitaPalla, distruggiPalla } from '../gioco/palla.js?v=mrt21mqg';
import { svegliaMacchina } from '../gioco/macchine.js?v=mrt21mqg';
import { defDi } from '../world/blocks.js?v=mrt21mqg';

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
    // COMPORTAMENTO (ex `sincronizzaPalle` di main.js). Il generatore è una
    // macchina "one-shot che poi dorme": sputa la sua palla e va in DORMIENZA —
    // la palla vive di vita propria nel sistemaPalle (fisica a passo fisso,
    // respawn interno), non serve svegliare il generatore mai più. È la prova più
    // pulita del punto dell'agenda: dopo il primo tick, ZERO costo.
    aggiorna(m, servizi) {
      const ecs = servizi.ecs;
      if (m.stato.palla == null || !ecs.vivo(m.stato.palla)) {
        m.stato.palla = creaEntitaPalla(ecs, servizi.scena, m.cella, m.def.palla.raggioMax, servizi.rng);
      }
      return null;                // dorme: niente da fare finché il furni esiste
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
    ritmi: [40, 20, 10],          // tick fra una scintilla e l'altra (2s · 1s · 0.5s); il tocco li cicla
    aggiorna(m, servizi) {
      const st = m.stato;
      if (st.ritmo == null) st.ritmo = 0;
      st.battito = (st.battito || 0) + 1;
      // "heartbeat" VISIBILE: alterna la scala del gruppo del furni (per-istanza,
      // niente materiali condivisi da mutare). Discreto ma chiaro: pulsa a ogni tick.
      if (m.istanza && m.istanza.gruppo) m.istanza.gruppo.scale.setScalar((st.battito & 1) ? 1.16 : 1.0);
      // scintilla: una manciata di particelle azzurrine verso l'alto dalla cima
      const p = servizi.particelle;
      if (p) {
        const cx = m.cella[0] + 0.5, cy = m.cella[1] + 1.2, cz = m.cella[2] + 0.5;
        for (let i = 0; i < 4; i++) {
          const a = m.rng.prossimo() * Math.PI * 2, vr = 0.4 + m.rng.prossimo() * 0.6;
          p.emetti(cx, cy, cz, Math.cos(a) * vr, 1.2 + m.rng.prossimo() * 0.8, Math.sin(a) * vr, 0.5, 0.5, 0, [0.7, 0.95, 1]);
        }
      }
      return m.def.ritmi[st.ritmo];   // riprenota: macchina SEMPRE attiva (a differenza del generatore)
    },
    onInteragisci(m, servizi) {
      const st = m.stato;
      st.ritmo = ((st.ritmo || 0) + 1) % m.def.ritmi.length;   // cambia il ritmo delle scintille
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
    capienza: 4,
    tickPerFrutto: 30,      // 1,5 s
    tickNotte: 40,          // di notte ricontrolla ogni 2 s senza produrre
    // `avvia` = setup una tantum: qui aggancia i 4 mesh-frutto che loader.js ha
    // già messo nel modello (nascosti). Mostrarli/nasconderli è per-ISTANZA e non
    // tocca materiali condivisi: la regola grafica della casa resta intatta.
    avvia(m) {
      m.stato.frutti = pezzi(m, 'frutto');
      m.stato.n = 0;
      for (const f of m.stato.frutti) f.visible = false;
    },
    aggiorna(m, servizi) {
      const st = m.stato, def = m.def;
      if (st.n >= def.capienza) return null;               // PIENO: dorme, zero costo
      if (servizi.notte) return def.tickNotte;             // reagisce al mondo: di notte non matura
      const f = st.frutti[st.n];
      if (f) f.visible = true;
      st.n++;
      sbuffo(servizi, m, centro(m, 0.55), 3, [0.55, 0.9, 0.45], 0.7);
      return st.n >= def.capienza ? null : def.tickPerFrutto;
    },
    onInteragisci(m, servizi) {
      const st = m.stato;
      if (!st.n) return true;                              // niente da raccogliere: tocco consumato
      for (const f of st.frutti) f.visible = false;
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
    raggio: 3,
    tickPompa: 6,           // 0,3 s quando lavora
    tickRiposo: 40,         // 2 s quando è all'asciutto (annusa e basta)
    avvia(m) { m.stato.getto = pezzi(m, 'getto'); },
    aggiorna(m, servizi) {
      const def = m.def, mondo = servizi.mondo;
      const [cx, cy, cz] = m.cella;
      let acqua = null;
      // scansione a cubetto attorno alla base: piccola e a raggio fisso, così il
      // costo è costante e non dipende da quanta acqua c'è nel diorama.
      for (let dx = -def.raggio; dx <= def.raggio && !acqua; dx++) {
        for (let dy = -1; dy <= 1 && !acqua; dy++) {
          for (let dz = -def.raggio; dz <= def.raggio && !acqua; dz++) {
            const t = mondo.tipo(cx + dx, cy + dy, cz + dz);
            if (t && defDi(t).acqua) acqua = [cx + dx + 0.5, cy + dy + 0.9, cz + dz + 0.5];
          }
        }
      }
      for (const g of m.stato.getto || []) g.visible = !!acqua;
      if (!acqua) return def.tickRiposo;
      // getto in cima + una gocciolina che salta su dalla pozza trovata: si VEDE
      // da dove sta attingendo.
      sbuffo(servizi, m, centro(m, 1.35), 2, [0.55, 0.8, 1], 0.8);
      sbuffo(servizi, m, acqua, 1, [0.6, 0.85, 1], 1.1);
      return def.tickPompa;
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
    raggio: 4,
    tickSuono: 8,           // 0,4 s a gatto vicino
    tickVeglia: 20,         // 1 s di guardia quando è lontano
    avvia(m) { m.stato.campana = pezzi(m, 'campana'); m.stato.muto = false; },
    aggiorna(m, servizi) {
      const def = m.def, st = m.stato;
      if (st.muto) return null;                            // silenziato: dorme sul serio
      const p = servizi.player;
      if (!p || !p.pos) return def.tickVeglia;
      const dx = p.pos.x - (m.cella[0] + 0.5), dz = p.pos.z - (m.cella[2] + 0.5);
      const vicino = (dx * dx + dz * dz) <= def.raggio * def.raggio;
      // dondolio della campana: scala per-istanza, alternata a ogni rintocco
      st.dondolo = vicino ? !st.dondolo : false;
      for (const c of st.campana) c.rotation.z = st.dondolo ? 0.22 : -0.05;
      if (!vicino) return def.tickVeglia;
      sbuffo(servizi, m, centro(m, 0.95), 3, [1, 0.92, 0.55], 0.9);
      if (servizi.audio) servizi.audio.sfx('raccogli');
      return def.tickSuono;
    },
    onInteragisci(m, servizi) {
      const st = m.stato;
      st.muto = !st.muto;
      for (const c of st.campana) c.rotation.z = 0;
      sbuffo(servizi, m, centro(m, 0.95), 6, st.muto ? [0.5, 0.5, 0.55] : [1, 0.9, 0.5], 1.1);
      if (servizi.audio) servizi.audio.sfx('ui');
      if (!st.muto) svegliaMacchina(servizi, m, 1);        // riacceso: torna in agenda
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
    raggio: 10,
    salti: 6,               // quanti ripetitori attraversa l'onda prima di spegnersi
    onInteragisci(m, servizi) {
      sbuffo(servizi, m, centro(m, 1.5), 8, [0.9, 0.7, 1], 1.2);
      if (servizi.audio) servizi.audio.sfx('ui');
      const vicini = macchineVicine(servizi, m, 'ripetitore', m.def.raggio);
      const primo = vicini[0];
      if (!primo) return true;                             // nessun ripetitore: solo lo sbuffo
      primo.stato.salti = m.def.salti;
      primo.stato.daCella = m.cella;
      svegliaMacchina(servizi, primo, 2);
      return true;
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
    raggio: 10,
    tickAcceso: 4,          // resta illuminato 0,2 s
    tickSalto: 3,           // ritardo prima che si accenda il successivo (l'onda si VEDE viaggiare)
    avvia(m) {
      m.stato.acceso = pezzi(m, 'acceso');
      m.stato.spento = pezzi(m, 'spento');
      m.stato.salti = 0;
      for (const a of m.stato.acceso) a.visible = false;
    },
    aggiorna(m, servizi) {
      const st = m.stato, def = m.def;
      if (!st.salti) {                                     // fine corsa (o primo tick a vuoto): spegni e dormi
        for (const a of st.acceso) a.visible = false;
        for (const s of st.spento) s.visible = true;
        return null;
      }
      for (const a of st.acceso) a.visible = true;
      for (const s of st.spento) s.visible = false;
      sbuffo(servizi, m, centro(m, 0.85), 4, [1, 0.95, 0.6], 1);
      const restanti = st.salti - 1;
      st.salti = 0;                                        // consumato: al prossimo giro si spegne
      if (restanti > 0) {
        // il prossimo anello: il più vicino che DORME (uno già acceso è occupato)
        // e che non sia chi ci ha appena passato il testimone.
        for (const altra of macchineVicine(servizi, m, 'ripetitore', def.raggio)) {
          if (!altra.dormiente || altra.stato.salti) continue;
          if (st.daCella && altra.cella[0] === st.daCella[0] && altra.cella[1] === st.daCella[1] && altra.cella[2] === st.daCella[2]) continue;
          altra.stato.salti = restanti;
          altra.stato.daCella = m.cella;
          svegliaMacchina(servizi, altra, def.tickSalto);
          break;
        }
      }
      return def.tickAcceso;                               // una sola riprenotazione: quella dello spegnimento
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
