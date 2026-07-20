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

import { creaEntitaPalla, distruggiPalla } from '../gioco/palla.js?v=mrsjdrr0';

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
