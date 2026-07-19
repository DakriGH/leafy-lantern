// Registry dei furni — lo schema eredita le BlockDefinition Unity (SPEC §5):
// footprint a layer con offset di celle dal pivot, stati, luci, navigazione.
// I layer di Def_Lamppost.asset (3 piani, cella centrale) sono riportati qui pari pari.

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
