// Palla di prova (dal furni Generatore): un oggetto FISICO per collaudare
// l'acqua — cade, rimbalza, GALLEGGIA sul pelo, viene trascinata dalla
// corrente, il gatto la spinge. Se si allontana troppo dal suo generatore
// (o cade nel vuoto) sparisce e rinasce lì sopra.
//
// FASE 2 DELLA RIFONDAZIONE ECS. La palla è la PRIMA entità migrata sul cuore
// ECS + tick fisso (src/ecs). Non è più un oggetto con stato+mesh accoppiati
// aggiornato ogni frame: ora è un'ENTITÀ con componenti, la cui fisica gira a
// passo FISSO (20 Hz) mentre la resa la disegna INTERPOLATA a qualsiasi fps.
//
// I componenti della palla:
//  · posizione     {x,y,z}  — dove è AL TICK corrente (stato di simulazione)
//  · velocita      {x,y,z}  — la sua velocità (unità/s)
//  · posizionePrec {x,y,z}  — dov'era all'INIZIO del tick: la resa interpola fra
//                             questa e posizione, così non si vedono scatti a 20Hz
//  · sfera  { raggio, casa, raggioMax, aTerra, eraInAcqua } — dati/stato di collisione
//  · vista  { mesh }        — il mesh three (NON serializzabile: lo ricrea il gioco)
//
// DUE SISTEMI, DUE MONDI:
//  · sistemaPalle(ctx)     — la FISICA, three-agnostica: legge/scrive solo i
//                            componenti (oggetti piani) e il mondo voxel. Gira a
//                            passo fisso. È il trapianto 1:1 della vecchia fisica.
//  · sistemaResaPalle(ctx) — la RESA, che PUÒ toccare three: a ogni frame mette
//                            il mesh a lerp(posizionePrec, posizione, alpha).

import * as THREE from 'three';
import { defDi, livelloAcqua } from '../world/blocks.js?v=mrsi80i0';
import { patchLuci } from '../fx/materials.js?v=mrsi80i0';

export const RAGGIO = 0.3;
const GRAVITA = 26;
// i 4 vicini ortogonali per la corrente dell'acqua (stesso gradiente del mesher)
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Registra i componenti della palla sull'ECS del gioco. Va chiamato UNA volta,
 * all'avvio, prima di creare entità-palla. `vista` è non-serializzabile: il mesh
 * three non va nel salvataggio, lo ricrea il gioco al caricamento.
 */
export function registraComponentiPalle(ecs) {
  ecs.registra('posizione')
    .registra('velocita')
    .registra('posizionePrec')
    .registra('sfera')
    .registra('vista', { serializzabile: false });
  return ecs;
}

/** Crea il mesh three della palla e lo aggiunge alla scena. */
function creaMeshPalla(scena) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(RAGGIO, 14, 12),
    patchLuci(new THREE.MeshBasicMaterial({ color: 0xff6f61 })),
  );
  scena.add(mesh);   // l'ombra-cono la disegna lo shader (impostaOmbrePg in main)
  return mesh;
}

/**
 * Crea un'ENTITÀ palla completa (componenti + mesh) e la posiziona sul suo
 * generatore. `casa` = [x,y,z] cella del generatore. Torna l'id-entità.
 */
export function creaEntitaPalla(ecs, scena, casa, raggioMax = 12, rng = null) {
  const mesh = creaMeshPalla(scena);
  const e = ecs.crea();
  const pos = { x: 0, y: 0, z: 0 };
  const prec = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const sf = { raggio: RAGGIO, casa: [casa[0], casa[1], casa[2]], raggioMax, aTerra: false, eraInAcqua: false };
  ecs.aggiungi(e, 'posizione', pos);
  ecs.aggiungi(e, 'velocita', vel);
  ecs.aggiungi(e, 'posizionePrec', prec);
  ecs.aggiungi(e, 'sfera', sf);
  ecs.aggiungi(e, 'vista', { mesh });
  respawnStato(pos, prec, vel, sf, rng);
  mesh.position.set(pos.x, pos.y, pos.z);   // niente frame a (0,0,0) prima della prima resa
  return e;
}

/** Distrugge l'entità palla: toglie il mesh dalla scena e libera l'entità. */
export function distruggiPalla(ecs, scena, entita) {
  const v = ecs.leggi(entita, 'vista');
  if (v && v.mesh) scena.remove(v.mesh);
  ecs.distruggi(entita);
}

/**
 * Calcio: una spinta netta nella direzione data (interazione col tasto E/F).
 * Nell'ECS è una scrittura sul componente velocita dell'entità — applicata
 * LOCALMENTE e SUBITO (il prossimo tick la integra). È il gancio dove, col
 * layer di rete, passerà invece un COMANDO sul bus; per ora niente rete.
 */
export function calciaPalla(ecs, entita, dx, dz, forza = 5.5) {
  const vel = ecs.leggi(entita, 'velocita');
  if (!vel) return;
  const d = Math.hypot(dx, dz) || 1;
  vel.x = (dx / d) * forza;
  vel.z = (dz / d) * forza;
  vel.y = Math.max(vel.y, 2.6);
}

// Riporta pos/prec/vel/sf allo stato di nascita sul generatore. La posizionePrec
// segue la nuova posizione: così sul teletrasporto la resa NON interpola una scia
// lunga dal punto vecchio al generatore (si vedrebbe un lampo).
function respawnStato(pos, prec, vel, sf, rng) {
  pos.x = sf.casa[0] + 0.5; pos.y = sf.casa[1] + 1.4; pos.z = sf.casa[2] + 0.5;
  prec.x = pos.x; prec.y = pos.y; prec.z = pos.z;
  // RNG deterministico se fornito (regola ECS: niente Math.random nella sim), con
  // ripiego a Math.random per usi fuori dalla corsia deterministica.
  const r = rng ? () => rng.prossimo() : Math.random;
  vel.x = (r() - 0.5) * 0.8; vel.y = 0; vel.z = (r() - 0.5) * 0.8;
}

/**
 * SISTEMA FISICA (three-agnostico) — avanza tutte le palle di UN passo FISSO.
 * ctx: { ecs, mondo, player, particelle, rng, dt }. dt è il passo fisso (s).
 * È il trapianto 1:1 della vecchia Palla.aggiorna/_muovi sui componenti.
 */
export function sistemaPalle(ctx) {
  const { ecs, mondo, player, particelle, rng, dt } = ctx;
  for (const e of ecs.ognuna('posizione', 'velocita', 'posizionePrec', 'sfera')) {
    const pos = ecs.leggi(e, 'posizione');
    const vel = ecs.leggi(e, 'velocita');
    const prec = ecs.leggi(e, 'posizionePrec');
    const sf = ecs.leggi(e, 'sfera');
    const R = sf.raggio;

    // PRIMA di muovere: fotografo la posizione di partenza per l'interpolazione
    // della resa. Da qui in poi 'pos' è il bersaglio di FINE tick.
    prec.x = pos.x; prec.y = pos.y; prec.z = pos.z;

    const cx = Math.floor(pos.x), cy = Math.floor(pos.y), cz = Math.floor(pos.z);
    const t = mondo.tipo(cx, cy, cz);
    const inAcqua = !!(t && defDi(t).acqua);

    if (inAcqua) {
      const L = livelloAcqua(t) || 0;
      const pelo = cy + (15 - 2 * L) / 16;
      const sommersa = Math.max(0, Math.min(1, (pelo - pos.y + R) * 2.2));
      vel.y += sommersa * 42 * dt - GRAVITA * 0.3 * dt;     // spinta di Archimede toon
      const k = 1 - Math.min(1, dt * 1.8);                  // resistenza dell'acqua
      vel.x *= k; vel.y *= k; vel.z *= k;
      // CORRENTE: stesso gradiente dei livelli usato dal mesher
      let fx = 0, fz = 0;
      for (let d = 0; d < DIR4.length; d++) {
        const dx = DIR4[d][0], dz = DIR4[d][1];
        const tv = mondo.tipo(cx + dx, cy, cz + dz);
        if (tv && defDi(tv).acqua) { const dL = livelloAcqua(tv) - L; fx += dL * dx; fz += dL * dz; }
        else if (!mondo.pieno(cx + dx, cy, cz + dz) && !mondo.pieno(cx + dx, cy - 1, cz + dz)) { fx += 1.5 * dx; fz += 1.5 * dz; }
      }
      const lg = Math.hypot(fx, fz);
      if (lg > 0.01) { vel.x += (fx / lg) * 3.4 * dt; vel.z += (fz / lg) * 3.4 * dt; }
      // tuffo: goccioline (la schiuma attorno la fa lo shader dell'acqua). Sono
      // FX puri, non stato di sim: l'aleatorietà (Math.random) resta cosmetica.
      if (!sf.eraInAcqua && Math.abs(vel.y) > 1.2 && particelle) {
        for (let j = 0; j < 7; j++) {
          const a = Math.random() * Math.PI * 2, vr = 0.6 + Math.random() * 0.9;
          particelle.emetti(pos.x, pelo + 0.03, pos.z, Math.cos(a) * vr, 1.6 + Math.random(), Math.sin(a) * vr, 0.45, 0.55, 0);
        }
      }
    } else {
      vel.y -= GRAVITA * dt;
    }
    sf.eraInAcqua = inAcqua;

    // spinta del gatto (contatto)
    if (player) {
      const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.45 && Math.abs(pos.y - player.pos.y) < 1.1) {
        const d = Math.max(0.12, Math.sqrt(d2));
        vel.x = (dx / d) * 2.6 + player.vel.x * 0.6;
        vel.z = (dz / d) * 2.6 + player.vel.z * 0.6;
        if (sf.aTerra) vel.y = Math.max(vel.y, 2.2);
      }
    }

    sf.aTerra = false;
    muoviAsse(mondo, pos, vel, sf, 'x', vel.x * dt);
    muoviAsse(mondo, pos, vel, sf, 'z', vel.z * dt);
    muoviAsse(mondo, pos, vel, sf, 'y', vel.y * dt);
    if (sf.aTerra) {
      const kf = 1 - Math.min(1, dt * 2.6);   // attrito che la fa rotolare via piano
      vel.x *= kf; vel.z *= kf;
    }

    // troppo lontana da casa o caduta nel vuoto: rinasce sul generatore
    const lontano = Math.hypot(pos.x - (sf.casa[0] + 0.5), pos.z - (sf.casa[2] + 0.5));
    if (lontano > sf.raggioMax || pos.y < -8) respawnStato(pos, prec, vel, sf, rng);
  }
}

// Collisione AABB su UN asse, identica alla vecchia Palla._muovi ma su oggetti
// piani (asse = 'x' | 'y' | 'z'). Muove di `delta`, e se sfonda un blocco solido
// rincula sul bordo e riflette la velocità (rimbalzello a terra, sponda ai lati).
function muoviAsse(mondo, pos, vel, sf, asse, delta) {
  if (!delta) return;
  const R = sf.raggio;
  pos[asse] += delta;
  const s = Math.sign(delta);
  const punta = pos[asse] + s * R;
  const cx = asse === 'x' ? Math.floor(punta) : Math.floor(pos.x);
  const cy = asse === 'y' ? Math.floor(punta) : Math.floor(pos.y);
  const cz = asse === 'z' ? Math.floor(punta) : Math.floor(pos.z);
  if (!mondo.solido(cx, cy, cz)) return;
  const cella = asse === 'x' ? cx : asse === 'y' ? cy : cz;
  pos[asse] = s > 0 ? cella - R - 0.001 : cella + 1 + R + 0.001;
  if (asse === 'y') {
    if (s < 0) {
      sf.aTerra = true;
      vel.y = Math.abs(vel.y) > 1.6 ? -vel.y * 0.38 : 0;   // rimbalzello
    } else {
      vel.y = 0;
    }
  } else {
    vel[asse] *= -0.32;   // sponda
  }
}

/**
 * SISTEMA RESA (può toccare three) — a OGNI frame mette il mesh a
 * lerp(posizionePrec, posizione, alpha), così la palla è fluida anche se la
 * fisica gira a 20Hz e il render a 60+. ctx: { ecs, alpha, dtFrame }.
 *
 * La query include 'sfera' (esclusiva delle palle) di proposito: da quando le
 * CREATURE condividono i componenti cinematici + 'vista', una query su solo
 * 'vista' pescherebbe anche loro (e di notte una farfalla ha mesh null → crash).
 * 'sfera' isola le palle senza costi.
 */
export function sistemaResaPalle(ctx) {
  const { ecs, alpha, dtFrame } = ctx;
  for (const e of ecs.ognuna('posizione', 'posizionePrec', 'velocita', 'sfera', 'vista')) {
    const pos = ecs.leggi(e, 'posizione');
    const prec = ecs.leggi(e, 'posizionePrec');
    const vel = ecs.leggi(e, 'velocita');
    const m = ecs.leggi(e, 'vista').mesh;
    m.position.set(
      prec.x + (pos.x - prec.x) * alpha,
      prec.y + (pos.y - prec.y) * alpha,
      prec.z + (pos.z - prec.z) * alpha,
    );
    // rotolamento fake: cosmetico, avanza col tempo di FRAME e la velocità
    m.rotation.x += vel.z * dtFrame * 3;
    m.rotation.z -= vel.x * dtFrame * 3;
  }
}
