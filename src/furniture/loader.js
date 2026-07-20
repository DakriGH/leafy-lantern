// Carica i FBX Unity a runtime. La scala si calibra su GrassCell.fbx
// (il supercubo di riferimento: deve misurare 18/16 = 1.125) — SPEC §7.
// Se un modello manca o fallisce, si costruisce un sostituto procedurale:
// il gioco non si rompe mai per un asset.

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MEZZO_SUPER } from '../config.js?v=mrt4nxiv';
import { convertiUnlit, patchLuci } from '../fx/materials.js?v=mrt4nxiv';

const fbx = new FBXLoader();

// --- aggiramento dello sniffer di FBXLoader per i file ASCII di Blockbench ---
// Il riconoscimento ASCII campiona i caratteri alle posizioni triangolari (0,1,3,6,10,…)
// e boccia il file se UNO coincide col magic binario "Kaydara\FBX\Binary\\".
// Nei FBX di Blockbench la 'X' di "…Blockbench FBX Exporter" cade proprio sulla
// posizione 55 (la decima campionata) → "Unknown format". Spostiamo il testo di
// qualche riga vuota finché nessun campione collide, poi passiamo dal parse().
const MAGIC_BINARIO = ['K', 'a', 'y', 'd', 'a', 'r', 'a', '\\', 'F', 'B', 'X', '\\', 'B', 'i', 'n', 'a', 'r', 'y', '\\', '\\'];

function passaSniffer(testo) {
  for (let i = 0; i < MAGIC_BINARIO.length; i++) {
    if (testo[i * (i + 1) / 2] === MAGIC_BINARIO[i]) return false;
  }
  return true;
}

// Un fetch senza timeout può restare appeso PER SEMPRE: essendo il primo await
// dell'avvio, il gioco restava bloccato su "Accendo la lanterna…" senza dire
// nulla (visto su Chromebook). Meglio rinunciare al modello e usare il
// sostituto procedurale che non partire affatto.
const TIMEOUT_MS = 8000;
// Se la rete non risponde, aspettare il timeout per OGNI modello significa
// moltiplicarlo per quanti sono. Al primo che scade si alza bandiera bianca e
// gli altri usano subito il sostituto: l'avvio resta di pochi secondi.
let _reteMorta = false;

async function caricaFbx(percorso) {
  if (_reteMorta) throw new Error(`salto ${percorso}: la rete non risponde`);
  const taglia = new AbortController();
  const timer = setTimeout(() => taglia.abort(), TIMEOUT_MS);
  let risposta;
  try {
    risposta = await fetch(percorso, { signal: taglia.signal });
  } catch (e) {
    if (taglia.signal.aborted) {
      _reteMorta = true;                       // gli altri non ci riprovano
      throw new Error(`timeout (${TIMEOUT_MS / 1000}s) su ${percorso}`);
    }
    throw new Error(`rete: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status} su ${percorso}`);
  const buffer = await risposta.arrayBuffer();
  const dir = percorso.slice(0, percorso.lastIndexOf('/') + 1);

  const testa = new TextDecoder().decode(buffer.slice(0, 20));
  if (testa.startsWith('Kaydara FBX Binary')) return fbx.parse(buffer, dir);

  let testo = new TextDecoder().decode(buffer);
  // Il TextParser di three esplode sulle proprietà scalari a livello zero
  // (FileId, CreationTime, Creator, References): sono metadati, via.
  // Restano solo gli apri-nodo (riga con '{'), i commenti e le righe indentate.
  testo = testo.split(/\r?\n/)
    .filter((riga) => !/^\w+\s*:/.test(riga) || riga.includes('{'))
    .join('\n');
  let tentativi = 0;
  while (!passaSniffer(testo) && tentativi++ < 40) testo = '\n' + testo;
  return fbx.parse(new TextEncoder().encode(testo).buffer, dir);
}

/** Bbox affidabile ANCHE fuori scena: scansione manuale dei vertici con le
 *  matrixWorld composte. Box3.setFromObject su rami staccati ignora pezzi
 *  della catena FBX (PreRotation) e ha già causato furni sepolti/spostati. */
function bboxDi(oggetto) {
  oggetto.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  oggetto.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

/** Bbox del singolo mesh, stessa tecnica. */
function bboxMesh(o) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const p = o.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
    box.expandByPoint(v);
  }
  return box;
}

function rendiUnlit(radice) {
  radice.traverse((figlio) => {
    if (!figlio.isMesh) return;
    if (Array.isArray(figlio.material)) {
      figlio.material = figlio.material.map((m) => convertiUnlit(m, figlio.geometry));
    } else {
      figlio.material = convertiUnlit(figlio.material, figlio.geometry);
    }
  });
}

/** Normalizza un modello: scala calibrata, base a y=0, centro XZ sul pivot.
 *  Il bbox si misura in unità RAW prima di scalare e l'offset si calcola
 *  aritmeticamente (×scala): nessuna dipendenza dall'ordine di aggiornamento
 *  delle matrici di three.
 *  Con `allineaBase` il centro orizzontale è quello dei vertici più BASSI
 *  (tronco, basamento): chiome e bracci asimmetrici non spostano la hitbox. */
function normalizza(gruppo, scala, allineaBase = false) {
  const raw = bboxDi(gruppo);
  const centro = raw.getCenter(new THREE.Vector3());

  if (allineaBase) {
    // la "base" è la mesh che raggiunge il punto più basso (tronco, basamento):
    // il suo bbox è simmetrico attorno all'asse, chiome e bracci non contano
    gruppo.updateWorldMatrix(true, true);
    let migliore = null;
    gruppo.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position || o.geometry.attributes.position.count === 0) return;
      const box = bboxMesh(o);
      if (!migliore || box.min.y < migliore.minY - 1e-6) {
        migliore = { minY: box.min.y, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
      }
    });
    if (migliore) { centro.x = migliore.cx; centro.z = migliore.cz; }
  }

  // Il bbox misurato INCLUDE la position originale della radice FBX (il pivot
  // di Blockbench): va corretta relativamente, non azzerata — sovrascriverla
  // faceva sprofondare i modelli (albero −18 px sotto il manto).
  const pivot = gruppo.position.clone();
  gruppo.scale.setScalar(scala);
  gruppo.position.set(
    -(centro.x - pivot.x) * scala,
    -(raw.min.y - pivot.y) * scala,
    -(centro.z - pivot.z) * scala,
  );
  const involucro = new THREE.Group();
  involucro.add(gruppo);
  involucro.userData.dimensioni = raw.getSize(new THREE.Vector3()).multiplyScalar(scala);
  return involucro;
}

// ---- sostituti procedurali ------------------------------------------------

function fallback(defId) {
  const g = new THREE.Group();
  const mat = (c) => patchLuci(new THREE.MeshBasicMaterial({ color: c }));
  if (defId === 'albero') {
    const tronco = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), mat(0x7a5230));
    tronco.position.y = 0.55;
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.1, 6), mat(0x2e7d4f));
    c1.position.y = 1.5;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.95, 6), mat(0x39975f));
    c2.position.y = 2.15;
    g.add(tronco, c1, c2);
  } else if (defId === 'lampione') {
    const palo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.12), mat(0x2a3350));
    palo.position.y = 1.15;
    const testa = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), mat(0x2a3350));
    testa.position.y = 2.4;
    g.add(palo, testa);
  } else if (defId === 'generatore') {
    // piedistallo con anello: la palla nasce sopra
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.82), mat(0x3a4a6b));
    base.position.y = 0.25;
    const bordo = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.92), mat(0x53689a));
    bordo.position.y = 0.55;
    const anello = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 20), mat(0x9fd8ff));
    anello.rotation.x = Math.PI / 2;
    anello.position.y = 0.66;
    g.add(base, bordo, anello);
  } else if (defId === 'scintillatore') {
    // colonnina scura con un orb azzurro in cima: la macchina-demo pulsa e
    // sputa scintille da lì (il comportamento è nel def, vedi registry.js)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), mat(0x2b2f45));
    base.position.y = 0.3;
    const stelo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mat(0x3a4a6b));
    stelo.position.y = 0.8;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), mat(0x9fe8ff));
    orb.position.y = 1.15;
    g.add(base, stelo, orb);
  } else if (defId === 'coltivatore') {
    // cassone di legno con 4 germogli: i frutti nascono INVISIBILI e li accende
    // il def-macchina uno alla volta (name='frutto' → li ritrova con pezzi()).
    // Visuale a blocchi e colori piatti come tutto il resto: nessuna texture.
    const cassa = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.86), mat(0x8a6234));
    cassa.position.y = 0.17;
    const terra = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.72), mat(0x5a4028));
    terra.position.y = 0.36;
    g.add(cassa, terra);
    for (const [fx, fz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
      const gambo = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), mat(0x3f7a3a));
      const bacca = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat(0x8fd45a));
      gambo.position.set(fx, 0.48, fz);
      bacca.position.set(fx, 0.64, fz);
      const frutto = new THREE.Group();
      frutto.name = 'frutto';        // il gancio del def: pezzi(m,'frutto')
      frutto.add(gambo, bacca);
      frutto.visible = false;
      g.add(frutto);
    }
  } else if (defId === 'idrovora') {
    // pompa: basamento, tubo, becco laterale e un GETTO azzurro che il def alza
    // solo quando trova acqua nei paraggi (name='getto').
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.7), mat(0x46506b));
    base.position.y = 0.14;
    const tubo = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), mat(0x5d7391));
    tubo.position.y = 0.73;
    const becco = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.14), mat(0x5d7391));
    becco.position.set(0.24, 1.06, 0);
    const getto = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), mat(0x74c8f0));
    getto.name = 'getto';
    getto.position.set(0.38, 0.84, 0);
    getto.visible = false;
    g.add(base, tubo, becco, getto);
  } else if (defId === 'campanello') {
    // colonnina + campana d'ottone: la campana DONDOLA (rotation.z per-istanza)
    // quando il gatto si avvicina.
    const piede = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.44), mat(0x3a3f52));
    piede.position.y = 0.1;
    const palo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), mat(0x555c74));
    palo.position.y = 0.55;
    // la campana sta in un GRUPPO col perno in alto: ruotando il gruppo su Z
    // dondola attorno all'attacco, non attorno al proprio centro.
    const campana = new THREE.Group();
    campana.name = 'campana';
    campana.position.set(0, 0.92, 0);
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.28, 6), mat(0xe0b45c));
    cupola.position.y = -0.16;
    const battaglio = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(0x8a6a2c));
    battaglio.position.y = -0.34;
    campana.add(cupola, battaglio);
    g.add(piede, palo, campana);
  } else if (defId === 'trasmettitore') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.6), mat(0x3d3350));
    base.position.y = 0.12;
    const asta = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), mat(0x6b5b8f));
    asta.position.y = 0.79;
    const piatto = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 6, 1, true), mat(0xc0a6f0));
    piatto.position.y = 1.42;
    piatto.rotation.x = Math.PI;
    g.add(base, asta, piatto);
  } else if (defId === 'ripetitore') {
    // due cubetti sovrapposti allo STESSO posto: 'spento' grigio e 'acceso'
    // giallo. Il def scambia le visibilità → cambio di colore per-istanza senza
    // toccare i materiali condivisi (che sono di tutte le copie).
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.56), mat(0x33384a));
    base.position.y = 0.15;
    const spento = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mat(0x5a6070));
    spento.name = 'spento';
    spento.position.y = 0.5;
    const acceso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat(0xffe27a));
    acceso.name = 'acceso';
    acceso.position.y = 0.5;
    acceso.visible = false;
    g.add(base, spento, acceso);
  } else {
    const seduta = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), mat(0xc98a4b));
    seduta.position.y = 0.42;
    for (const sx of [-0.65, 0.65]) {
      const gamba = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.42), mat(0xa06f3a));
      gamba.position.set(sx, 0.21, 0);
      g.add(gamba);
    }
    g.add(seduta);
  }
  const involucro = new THREE.Group();
  involucro.add(g);
  involucro.userData.dimensioni = bboxDi(involucro).getSize(new THREE.Vector3());
  return involucro;
}

// ---- API -------------------------------------------------------------------

/**
 * Carica tutti i modelli dei FURNI. Muta i def: aggiunge `modello3d`,
 * eventuale footprint auto-misurato e l'altezza della luce.
 */
export async function caricaModelli(FURNI, avanza = () => {}) {
  let scala = 0.01; // ripiego: Unity esporta in cm
  try {
    const cella = await caricaFbx('Prefabs/OriginalMesh/GrassCell.fbx');
    const box = bboxDi(cella);
    const lato = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    if (lato > 0.0001) scala = (MEZZO_SUPER * 2) / lato;
    console.log(`[lantern] calibrazione GrassCell: lato ${lato.toFixed(3)} → scala ${scala.toFixed(5)}`);
  } catch (e) {
    console.warn('[lantern] GrassCell.fbx non caricabile, uso scala 0.01', e);
  }

  for (const def of Object.values(FURNI)) {
    avanza(def.nome);
    if (def.procedurale) {
      def.modello3d = fallback(def.id);       // modello costruito in codice, per scelta
    } else {
      try {
        const modello = await caricaFbx(def.modello);
        rendiUnlit(modello);
        def.modello3d = normalizza(modello, scala, def.allineaBase);
      } catch (e) {
        console.warn(`[lantern] ${def.modello} non caricabile, uso il sostituto procedurale`, e);
        def.modello3d = fallback(def.id);
      }
    }
    const dim = def.modello3d.userData.dimensioni;
    console.log(`[lantern] ${def.id}: ${dim.x.toFixed(2)} × ${dim.y.toFixed(2)} × ${dim.z.toFixed(2)}`);

    // footprint orizzontale auto-misurato (es. panchina 2×1)
    if (def.autoFootprint) {
      const w = Math.max(1, Math.min(5, Math.round(dim.x - 0.15) || 1));
      const d = Math.max(1, Math.min(5, Math.round(dim.z - 0.15) || 1));
      const celle = [];
      for (let ix = 0; ix < w; ix++)
        for (let iz = 0; iz < d; iz++)
          celle.push([ix - Math.floor((w - 1) / 2), iz - Math.floor((d - 1) / 2)]);
      def.layers = [{ y: 0, celle }];
      if (w > 1 || d > 1) console.log(`[lantern] footprint auto di ${def.id}: ${w}×${d}`);
    }

    // visuali di stato dedicate (es. LampostON/OFF.fbx), stessa scala calibrata
    for (const stato of def.stati || []) {
      if (stato.modello) {
        try {
          const m = await caricaFbx(stato.modello);
          rendiUnlit(m);
          stato.modello3d = normalizza(m, scala, def.allineaBase);
        } catch (e) {
          console.warn(`[lantern] stato ${def.id}/${stato.nome}: ${stato.modello} non caricabile, uso il base`, e);
          stato.modello3d = null;
        }
      }
      // punto luce: in testa al modello (per il lampione)
      if (stato.luce && !stato.luce.offset) stato.luce.offset = [0, Math.max(0.5, dim.y - 0.35), 0];
    }
  }
}
