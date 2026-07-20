// Creature ambientali: piccole vite che rendono viva l'isola.
//  · FARFALLE di giorno: svolazzano sopra l'erba, ali che battono, scappano
//    piano dal gatto;
//  · LUCCIOLE di notte: puntini che brillano e vagano lenti.
// Un pool piccolo attorno al gatto (cap ridotto su mobile): nascono su terreno
// solido, muoiono quando ti allontani. Unlit come tutto il resto.
//
// FASE 3a DELLA RIFONDAZIONE ECS. Le creature sono la SECONDA famiglia migrata
// sul cuore ECS + tick fisso (dopo le palle) e la PRIMA a usare l'AGENDA per la
// sua "mente". Prima erano record `{x,y,z,vx,...,mesh}` in un array, aggiornati
// e disegnati INSIEME ogni frame con dt variabile; ora ognuna è un'ENTITÀ con
// componenti, la cui fisica gira a passo FISSO (20 Hz) e la resa la disegna
// INTERPOLATA a qualunque fps.
//
// I componenti della creatura (i primi quattro sono il CORE cinematico condiviso
// con le palle: li registra palla.js — l'intero senso dell'ECS è che entità
// diverse condividano gli stessi mattoni):
//  · posizione     {x,y,z}  — dove è AL TICK corrente
//  · velocita      {x,y,z}  — la sua velocità (unità/s)
//  · posizionePrec {x,y,z}  — dov'era a inizio tick: la resa interpola prec→pos
//  · vista  { mesh }        — il Group farfalla three, o null (di notte / non ancora
//                             creato). NON serializzabile: lo (ri)crea la resa.
//  · creatura { tipo, colore, fase, faseAli, dirX, dirZ, seme } — la "mente" e i
//                             dati d'animazione (vedi sotto).
//
// DUE MONDI, TRE PEZZI:
//  · sistemaCreature(servizi) — il MOVIMENTO, three-agnostico: legge/scrive solo
//    componenti piani e il mondo voxel. Gira OGNI tick fisso. È il trapianto del
//    vecchio moto (vagabondaggio + fuga dal gatto + saliscendi).
//  · pensaCreatura(id, servizi) — la DECISIONE (scegliere dove vagare). NON gira
//    ogni tick: è PROGRAMMATA nell'agenda ogni N tick. È il confine chiave della
//    Fase 3a (vedi il blocco "AGENDA: pensa-a-scatti, muovi-di-continuo" sotto).
//  · Creature.resa(ctx) — la RESA (tocca three): mette il mesh a lerp(prec,pos,
//    alpha) e anima le ali sul tempo di PARETE. Riempie il Points delle lucciole.
//
// AGENDA: PENSA-A-SCATTI, MUOVI-DI-CONTINUO.
//   Il MOVIMENTO è continuo: ogni tick la creatura sterza verso il suo bersaglio
//   di vagabondaggio e avanza. Il PENSIERO — scegliere un NUOVO bersaglio — è raro
//   e SCHEDULATO: alla nascita `agenda.programma(traQuantiTick, ...)`, e a ogni
//   decisione si riprenota il prossimo pensiero. Così mille creature ferme-di-
//   testa non costano mille "a cosa penso?" per tick: pensano solo quando tocca a
//   loro. La varianza sul "traQuantiTick" viene dall'Rng della creatura, così non
//   si sincronizzano tutte sullo stesso tick. È ESATTAMENTE il modello che useranno
//   i macchinari: stato che evolve di continuo, logica che si sveglia a intervalli.
//
// DETERMINISMO: niente Math.random nella sim. Ogni creatura ha un sotto-Rng
//   RIPRODUCIBILE derivato dal suo id (`rng.diramazione(id)`), il cui stato vive
//   nel componente (`creatura.seme`) e avanza a ogni pescata. Stesso seme globale
//   + stessi id → stesse traiettorie, ovunque e a qualunque fps.

import * as THREE from 'three';
import { patchLuci } from '../fx/materials.js?v=mrt21mqg';
import { Rng } from '../ecs/orologio.js?v=mrt21mqg';

const RAGGIO = 22;                 // entro quanto vivono attorno al gatto
const TAU = Math.PI * 2;
const COLORI_FARFALLA = [0xffd36e, 0xff8fb3, 0x8fd0ff, 0xc79bff, 0xa6ff9b];

// Ogni quanti tick una creatura ri-decide dove vagare: base + varianza casuale.
// A 20 Hz sono ~0.8 s..~2.0 s, il ritmo con cui prima la direzione cambiava per
// via del rumore sinusoidale — ora scelto a scatti programmati.
const PENSIERO_MIN = 16;
const PENSIERO_VAR = 24;
const PRIORITA_PENSIERO = 0;

function meshFarfalla(colore) {
  const g = new THREE.Group();
  const mat = patchLuci(new THREE.MeshBasicMaterial({ color: colore, side: THREE.DoubleSide }));
  const ala = new THREE.Shape();
  ala.moveTo(0, 0); ala.quadraticCurveTo(0.12, 0.12, 0.16, 0); ala.quadraticCurveTo(0.12, -0.1, 0, 0);
  const geo = new THREE.ShapeGeometry(ala);
  const sx = new THREE.Mesh(geo, mat), dx = new THREE.Mesh(geo, mat);
  dx.scale.x = -1;
  g.add(sx, dx);
  g.userData = { sx, dx };
  return g;
}

// --- RNG per-creatura --------------------------------------------------------
// Lo stato (uint32) del sotto-Rng vive nel componente (`creatura.seme`). tira()
// ricostruisce l'Rng da quello stato, pesca UN float e RISCRIVE lo stato evoluto:
// così la sequenza CONTINUA in modo deterministico fra nascita, pensieri e save.
// Ricreare l'Rng ogni pescata è un micro-alloc trascurabile: si pesca di rado
// (poche volte alla nascita, due per pensiero, un pensiero ogni ~1 s).
function tira(cre) {
  const r = new Rng(cre.seme);
  const v = r.prossimo();
  cre.seme = r.stato();
  return v;
}

/**
 * Registra il componente `creatura` sull'ECS. I componenti CINEMATICI condivisi
 * (posizione, velocita, posizionePrec, vista) li registra palla.js: vanno
 * registrati PRIMA (in gioco palla.js è caricato per primo; nei test si chiama
 * registraComponentiPalle prima di questo). È il punto: palle e creature sono
 * fatte degli stessi mattoni.
 */
export function registraComponentiCreature(ecs) {
  ecs.registra('creatura');   // serializzabile: è stato di sim puro (niente three)
  return ecs;
}

/**
 * Prenota il PROSSIMO pensiero della creatura nell'agenda, fra un numero di tick
 * base + varianza (dall'Rng della creatura, per non sincronizzarle). `cosa` è
 * l'id-entità: pensaCreatura lo riceverà quando la voce scadrà.
 */
function programmaPensiero(servizi, id, cre) {
  const n = PENSIERO_MIN + Math.floor(tira(cre) * PENSIERO_VAR);
  servizi.agenda.programma(n, PRIORITA_PENSIERO, id);
}

/**
 * Crea un'ENTITÀ creatura (solo componenti: NIENTE three — la sim è agnostica; il
 * mesh lo crea la resa quando serve) e le prenota il primo pensiero. La nascita
 * usa il sotto-Rng della creatura (deterministico), non Math.random. Torna l'id,
 * o null se sotto (x,z) non c'è terreno su cui posarsi.
 * servizi: { ecs, rng, agenda, ... }. `mondo` per l'appoggio, `fuoco` = il gatto.
 */
export function creaEntitaCreatura(ecs, servizi, fuoco, mondo) {
  const e = ecs.crea();
  // seme del sotto-Rng: derivato dall'id → indipendente e riproducibile.
  const cre = { tipo: 'farfalla', colore: 0, fase: 0, faseAli: 0, dirX: 0, dirZ: 0, seme: servizi.rng.diramazione(e).stato() };
  const a = tira(cre) * TAU, r = 6 + tira(cre) * (RAGGIO - 6);
  const x = Math.round(fuoco.x + Math.cos(a) * r), z = Math.round(fuoco.z + Math.sin(a) * r);
  const y = mondo.appoggioInColonna ? mondo.appoggioInColonna(x, z, 30, 40) : null;
  if (y === null) { ecs.distruggi(e); return null; }   // niente appoggio: rinuncia (riprova al prossimo frame)
  cre.colore = COLORI_FARFALLA[(tira(cre) * COLORI_FARFALLA.length) | 0];
  cre.faseAli = tira(cre) * TAU;      // offset del battito d'ali (desincronizza la resa)
  cre.fase = tira(cre) * 6;           // fase di SIM del saliscendi (desincronizza la quota)
  const pos = { x: x + 0.5, y: y + 0.8 + tira(cre) * 1.2, z: z + 0.5 };
  ecs.aggiungi(e, 'posizione', pos);
  ecs.aggiungi(e, 'velocita', { x: 0, y: 0, z: 0 });
  ecs.aggiungi(e, 'posizionePrec', { x: pos.x, y: pos.y, z: pos.z });
  ecs.aggiungi(e, 'creatura', cre);
  ecs.aggiungi(e, 'vista', { mesh: null });   // il Group farfalla lo crea la resa (di giorno)
  programmaPensiero(servizi, e, cre);
  return e;
}

/**
 * IL PENSIERO (scaricato dall'AGENDA, NON ogni tick). Sceglie un nuovo bersaglio
 * di vagabondaggio e riprenota il prossimo pensiero. Se l'entità è stata
 * despawnata (troppo lontana) la voce si esaurisce qui: si salta e NON si
 * riprogramma, così le voci morte si drenano da sole.
 */
export function pensaCreatura(id, servizi) {
  const ecs = servizi.ecs;
  if (!ecs.vivo(id)) return;                 // despawnata: fine della voce
  const cre = ecs.leggi(id, 'creatura');
  if (!cre) return;
  // bersaglio dolce in [-1,1] su x e z: la stessa scala del vecchio bersaglio
  // sinusoidale, ma SCELTO a scatti invece di variare ogni frame.
  cre.dirX = tira(cre) * 2 - 1;
  cre.dirZ = tira(cre) * 2 - 1;
  programmaPensiero(servizi, id, cre);
}

/**
 * SISTEMA MOVIMENTO (three-agnostico) — avanza TUTTE le creature di un passo
 * FISSO. servizi: { ecs, mondo, player, dt, notte }. dt è il passo fisso (s).
 * È il trapianto del vecchio moto: sterzo verso il bersaglio (scelto dal
 * pensiero), fuga dolce dal gatto, saliscendi attorno a una quota comoda.
 */
export function sistemaCreature(servizi) {
  const { ecs, mondo, dt } = servizi;
  const notte = !!servizi.notte;
  const fuoco = servizi.player ? servizi.player.pos : null;
  const faseR = notte ? 2 : 9;          // le lucciole ondeggiano più lente
  const velScala = notte ? 0.5 : 1.4;   // e vagano più piano
  const quotaBase = notte ? 1.0 : 1.4;
  for (const e of ecs.ognuna('posizione', 'velocita', 'posizionePrec', 'creatura')) {
    const pos = ecs.leggi(e, 'posizione');
    const vel = ecs.leggi(e, 'velocita');
    const prec = ecs.leggi(e, 'posizionePrec');
    const cre = ecs.leggi(e, 'creatura');

    // PRIMA di muovere: fotografo la posizione di partenza per l'interpolazione.
    prec.x = pos.x; prec.y = pos.y; prec.z = pos.z;

    // il "tipo" segue il ciclo giorno/notte (oggi non è per-creatura: di giorno
    // farfalle, di notte lucciole, come da sempre). Tenerlo sul componente lo
    // rende auto-descrittivo e pronto a tipi fissi in futuro.
    cre.tipo = notte ? 'lucciola' : 'farfalla';
    cre.fase += dt * faseR;             // fase di SIM: pilota il saliscendi (è POSIZIONE, quindi interpolata)

    // sterzo verso il bersaglio di vagabondaggio (scelto dal pensiero schedulato)
    vel.x += (cre.dirX - vel.x) * dt * 2;
    vel.z += (cre.dirZ - vel.z) * dt * 2;
    // fuga dolce dal gatto (se troppo vicino)
    if (fuoco) {
      const dx = pos.x - fuoco.x, dz = pos.z - fuoco.z, dm = Math.hypot(dx, dz);
      if (dm < 2.5) { vel.x += (dx / (dm || 1)) * dt * 6; vel.z += (dz / (dm || 1)) * dt * 6; }
    }
    pos.x += vel.x * velScala * dt;
    pos.z += vel.z * velScala * dt;
    // quota: ondeggia attorno a un'altezza comoda sopra il terreno sottostante
    const suolo = mondo.appoggioInColonna ? mondo.appoggioInColonna(Math.floor(pos.x), Math.floor(pos.z), 30, 40) : null;
    const target = (suolo !== null ? suolo : pos.y - 1) + quotaBase + Math.sin(cre.fase) * 0.3;
    pos.y += (target - pos.y) * dt * 2.5;
  }
}

export class Creature {
  constructor(scena, mondo, mobile = false) {
    this.scena = scena;
    this.mondo = mondo;
    this.max = mobile ? 6 : 12;
    // lucciole: UN solo Points additivo per tutte (cheap), riempito dalla resa.
    const N = this.max;
    this._lucPos = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this._lucPos, 3));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.lucciole = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xbfff8a, size: 0.13, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.lucciole.frustumCulled = false;
    this.lucciole.visible = false;
    scena.add(this.lucciole);
  }

  /**
   * POOL attorno al gatto: ricicla le lontane, popola fino a `max`. NON è un
   * sistema a tick fisso — gira per-frame (come sincronizzaPalle), perché dipende
   * dalla posizione del gatto, che è per-frame. Crea/distrugge ENTITÀ (non
   * record). La casualità di nascita è nel sotto-Rng di ogni creatura (via
   * diramazione(id)), quindi spawnare a frame diversi NON tocca lo stream globale.
   */
  sincronizza(ecs, servizi, fuoco) {
    const via = (RAGGIO + 8) ** 2;
    for (const e of [...ecs.ognuna('posizione', 'creatura')]) {
      const p = ecs.leggi(e, 'posizione');
      if ((p.x - fuoco.x) ** 2 + (p.z - fuoco.z) ** 2 > via) this.distruggi(ecs, e);
    }
    let n = ecs.conta('creatura');
    while (n < this.max) {
      const e = creaEntitaCreatura(ecs, servizi, fuoco, this.mondo);
      if (e === null) break;   // nessun terreno adatto ora: riprova al prossimo frame
      n++;
    }
  }

  /** Distrugge un'entità creatura: via il mesh farfalla (se c'è) e l'entità. La
   *  voce d'agenda del suo pensiero si esaurirà da sola (pensaCreatura salta le
   *  entità morte). */
  distruggi(ecs, e) {
    const v = ecs.leggi(e, 'vista');
    if (v && v.mesh) this.scena.remove(v.mesh);
    ecs.distruggi(e);
  }

  /** Via tutte (prima dell'AR: il mondo trasloca nel pivot scalato). Si ripopola
   *  da sola quando si torna dal mondo normale. */
  svuota(ecs) {
    for (const e of [...ecs.ognuna('creatura')]) this.distruggi(ecs, e);
    this.lucciole.visible = false;
  }

  /**
   * SISTEMA RESA (può toccare three) — a OGNI frame mette il mesh a
   * lerp(posizionePrec, posizione, alpha), fluido anche se la sim gira a 20 Hz.
   * ctx: { ecs, alpha, dtFrame, notte }.
   *
   * DUE TEMPI, DI PROPOSITO: la POSIZIONE si interpola (prec→pos con alpha) — è
   * l'unica cosa che va interpolata. Il BATTITO D'ALI è animazione COSMETICA e
   * gira sul tempo di PARETE (9 rad/s come prima, con offset per creatura): NON
   * si interpola, perché interpolarlo due volte darebbe uno sfarfallio innaturale.
   * Il saliscendi in quota è già dentro la posizione (fase di sim), quindi arriva
   * qui bello interpolato senza doppie mani.
   */
  resa(ctx) {
    const { ecs, alpha } = ctx;
    const notte = !!ctx.notte;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const cap = this._lucPos.length / 3;
    let nLuc = 0;
    for (const e of ecs.ognuna('posizione', 'posizionePrec', 'velocita', 'creatura', 'vista')) {
      const pos = ecs.leggi(e, 'posizione');
      const prec = ecs.leggi(e, 'posizionePrec');
      const vel = ecs.leggi(e, 'velocita');
      const cre = ecs.leggi(e, 'creatura');
      const vista = ecs.leggi(e, 'vista');
      const ix = prec.x + (pos.x - prec.x) * alpha;
      const iy = prec.y + (pos.y - prec.y) * alpha;
      const iz = prec.z + (pos.z - prec.z) * alpha;
      if (notte) {
        // di notte: lucciola nel Points condiviso, niente farfalla
        if (nLuc < cap) {
          this._lucPos[nLuc * 3] = ix; this._lucPos[nLuc * 3 + 1] = iy; this._lucPos[nLuc * 3 + 2] = iz;
          nLuc++;
        }
        if (vista.mesh) { this.scena.remove(vista.mesh); vista.mesh = null; }
      } else {
        if (!vista.mesh) { vista.mesh = meshFarfalla(cre.colore); this.scena.add(vista.mesh); }
        const m = vista.mesh;
        m.position.set(ix, iy, iz);
        m.rotation.y = Math.atan2(vel.x, vel.z);
        const flap = Math.sin(now * 0.009 + cre.faseAli) * 0.9 + 0.5;
        m.userData.sx.rotation.y = flap;
        m.userData.dx.rotation.y = -flap;
      }
    }
    // lucciole: un solo draw call, con la stessa pulsazione d'opacità di prima
    this.lucciole.visible = notte && nLuc > 0;
    if (this.lucciole.visible) {
      this.lucciole.geometry.setDrawRange(0, nLuc);
      this.lucciole.geometry.attributes.position.needsUpdate = true;
      this.lucciole.material.opacity = 0.5 + Math.sin(now * 0.003) * 0.35;
    }
  }
}
