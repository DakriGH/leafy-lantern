// Carica i FBX Unity a runtime. La scala si calibra su GrassCell.fbx
// (il supercubo di riferimento: deve misurare 18/16 = 1.125) — SPEC §7.
// Se un modello manca o fallisce, si costruisce un sostituto procedurale:
// il gioco non si rompe mai per un asset.

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MEZZO_SUPER } from '../config.js?v=mrsf4ny9';
import { convertiUnlit, patchLuci } from '../fx/materials.js?v=mrsf4ny9';

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
