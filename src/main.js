// Leafy‑Lantern — P0 sandbox. La regia: collega mondo, player, furni, luci e HUD.

import * as THREE from 'three';
import { PX, RAGGIO_CLICK, ACQUA, NET, SCAVO } from './config.js';
import { Rig } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { raggioGriglia, raggioDaSchermo } from './engine/raycast.js';
import { Cadenza } from './engine/cadenza.js';
import { BLOCCHI, CATEGORIE_BLOCCHI, defDi, tipoBase, livelloAcqua } from './world/blocks.js';
import { Mondo } from './world/world.js';
import { SimAcqua } from './world/acqua.js';
import { Lobby } from './net/lobby.js';
import { Segnalatore } from './net/segnalatore.js';
import { Ruota } from './ui/ruota.js';
import { Bersaglio, POSE } from './gioco/bersaglio.js';
import { Zaino } from './ui/zaino.js';
import { Mesher, geometriaSingola } from './world/mesher.js';
import { generaIsola, generaArcipelago, generaOpenWorld, SPAWN, ARREDO_INIZIALE } from './world/worldgen.js';
import { generaMostra } from './world/mostra.js';
import { generaCollaudo } from './world/collaudo.js';
import { generaTestLuci } from './world/testLuci.js';
import { FuochiFatui } from './fx/fuochiFatui.js';
import { STAGIONI, impostaStagione, stagioneCorrente, ritingiFogliame, avviaTransizione, aggiornaTransizione } from './world/stagioni.js';
import { Meteo } from './fx/meteo.js';
import { Inventario, ATTREZZI } from './gioco/inventario.js';
import { Scavo, DUREZZE } from './gioco/scavo.js';
import { CicloGiorno } from './fx/daynight.js';
import { aggiornaLuci, aggiornaTempo, impostaPioggia, impostaRiflesso, impostaOmbrePg, impostaForzaRiflesso, impostaSchiumaAcqua, impostaSchiumaTop, creaLuce, creaLuceLeggera, spostaLuce, rimuoviLuce, impostaOcclusione, uniformiCondivise, impostaLatoMassimoVoxel, memoriaVoxel, statLuci } from './fx/materials.js';
import { SchiumaTop, LAYER_SCHIUMA } from './fx/schiumaTop.js';
import { ModalitaAR } from './ar/ar.js';
import { Nuvole } from './fx/nuvole.js';
import { SegnaPercorso } from './fx/percorso.js';
import { ComandiTouch } from './ui/comandi-touch.js';
import { RiflessoAcqua } from './fx/riflesso.js';
import { Pioggia } from './fx/pioggia.js';
import { Particelle } from './fx/particelle.js';
import { Audio } from './fx/audio.js';
import { Creature } from './gioco/creature.js';
import { RICETTE, puoiCraftare, crafta } from './gioco/craft.js';
import { Palla } from './gioco/palla.js';
import { Gatto } from './player/player.js';
import { ManoStrumento } from './player/mano.js';
import { dropDi } from './gioco/drop.js';
import { Controller } from './player/controller.js';
import { FURNI, centroide } from './furniture/registry.js';
import { caricaModelli } from './furniture/loader.js';
import { Arredo } from './furniture/furniture.js';
import { HUD } from './ui/hud.js';
import { MenuDebug } from './ui/debug.js';
import { Officina, caricaOfficina, registraDaRete, rimuoviDaRete } from './ui/officina.js';
import { ModalitaXR } from './ar/ar-xr.js';
import { serializza, applica, salvaLocale, caricaLocale, cancellaLocale, esportaFile, elencoSlot, salvaSlot, caricaSlot, rinominaSlot, cancellaSlot } from './save.js';

// Gli ERRORI si vedono A SCHERMO (sul telefono non c'è console): qualsiasi
// eccezione non gestita finisce in un banner rosso leggibile e riferibile.
function bannerErrore(msg) {
  let el = document.getElementById('erroreBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'erroreBanner';
    el.style.cssText =
      'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);transform:translateX(-50%);' +
      'z-index:90;max-width:92vw;padding:10px 14px;border-radius:12px;font:700 12px system-ui;' +
      'background:rgba(120,26,26,.96);color:#ffe9e4;border:2px solid #ff9d8a;box-shadow:0 3px 0 rgba(0,0,0,.4)';
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  }
  el.textContent = '💥 ' + msg + ' (tocca per chiudere)';
}
addEventListener('error', (e) => bannerErrore(e.message || 'errore sconosciuto'));
addEventListener('unhandledrejection', (e) => bannerErrore((e.reason && e.reason.message) || String(e.reason)));

// ---- overlay di CARICAMENTO riusabile: mostra, LASCIA DIPINGERE, poi esegue
// il lavoro pesante (che congela il thread) e nasconde. Niente più gioco
// frizzato senza spiegazione. `lavoro` può essere sincrono o async.
async function conCaricamento(testo, lavoro) {
  const el = document.getElementById('loading');
  document.getElementById('loadingTxt').textContent = testo;
  el.classList.add('attivo');
  // due rAF (con paracadute) così l'overlay compare PRIMA del blocco
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  await new Promise((ok) => setTimeout(ok, 0));
  try { return await lavoro(); }
  finally {
    // un altro frame perché il risultato sia già a schermo quando sparisce
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('attivo')));
  }
}

const CHIAVE_SNAPSHOT = 'lantern.snapshot.v1';
const CHIAVE_SNAPSHOT_PREC = 'lantern.snapshot.prec.v1';

// ---- impianto ---------------------------------------------------------------

const rig = new Rig(document.getElementById('scena'));
// contesto WebGL perso/ripristinato: senza avviso si vedrebbe solo schermo nero
// (NB: qui, DOPO la nascita di rig — assegnarlo più in alto sarebbe una
// temporal dead zone e il gioco non partirebbe proprio)
rig.onContesto = (perso) => {
  if (perso) bannerErrore('Grafica azzerata dal sistema: schermo nero. Attendi qualche secondo o ricarica la pagina.');
  else { const b = document.getElementById('erroreBanner'); if (b) b.remove(); }
};
// l'input vive su #scena (il DIV, non il canvas): in AR il canvas del gioco
// è nascosto e il livello MindAR lascia passare i click (pointer-events:none)
// — così ci si muove e si costruisce anche in AR
const input = new Input(document.getElementById('scena'), rig);
const mondo = new Mondo();
const mesher = new Mesher(rig.scena);
const ciclo = new CicloGiorno(rig.scena);
const hud = new HUD();
const arredo = new Arredo(rig.scena, mondo);
// QUANTO PUÒ ESSERE LARGA LA GRIGLIA DEI MURI IN GPU. Le ombre camminano una
// texture 3D di occupazione (fx/materials.js) e le schede hanno un tetto sul
// lato — il minimo garantito da WebGL2 è 256, le schede vere danno 2048: lo si
// CHIEDE invece di indovinarlo, e il mesher spegne le ombre dicendolo nel
// pannello se un giorno un mondo lo superasse.
//
// QUI VIVEVANO DUE PONTI, e sono spariti insieme alle mappe d'ombra cotte:
//  · mesher.sorgentiExtra — l'elenco dei lampioni d'arredo, che il mesher
//    doveva conoscere per cuocere a ognuno la sua mappa (e per accorgersi di
//    quelli spenti: una lampada spenta non doveva lasciare la maschera aperta);
//  · impostaRisolutoreTassello — quale piastrella dell'atlante guardare per ogni
//    sfera, visto che le sfere si riordinano a ogni frame e le piastrelle no.
// Nessuno dei due serve più: l'ombra la calcola lo shader camminando i MURI, e i
// muri non sanno né vogliono sapere chi li illumina.
try {
  const gl = rig.renderer.getContext();
  impostaLatoMassimoVoxel(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE));
} catch { /* nessun contesto: resta il minimo garantito da WebGL2 */ }
const gatto = new Gatto();
rig.scena.add(gatto.gruppo);
const mano = new ManoStrumento(gatto.gruppo);
let _usoContatore = 0;    // incrementa a ogni colpo: i remoti animano lo swing
const riflesso = new RiflessoAcqua(rig.renderer);
const schiumaTop = new SchiumaTop(rig.renderer, rig.mobile);
const modalitaAR = new ModalitaAR(rig);
const modalitaXR = new ModalitaXR(rig);
// in AR i click mirano con la camera del telefono, e il raggio va riportato
// nello spazio celle (il mondo sta su un pivot scalato sul marker)
function raggioGioco(sx, sy) {
  const cam = modalitaXR.attiva ? modalitaXR.camera : (modalitaAR.attiva ? modalitaAR.camera : rig.camera);
  const r = raggioDaSchermo(cam, sx, sy);
  if (modalitaXR.attiva) modalitaXR.trasformaRaggio(r.origine, r.direzione);
  else if (modalitaAR.attiva) modalitaAR.trasformaRaggio(r.origine, r.direzione);
  return r;
}
const pioggia = new Pioggia(rig.scena);
const meteo = new Meteo(pioggia);
const particelle = new Particelle(rig.scena);
const audio = new Audio();
const creature = new Creature(rig.scena, mondo, rig.mobile);
const fuochiFatui = new FuochiFatui(rig.scena);
// l'audio si sblocca al PRIMO gesto (i browser lo esigono), poi applica il
// volume/musica salvati
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, () => { audio.sblocca(); if (typeof applicaOpzioni === 'function') applicaOpzioni(false); }, { once: true, passive: true });
}
const palle = new Map();          // istanza generatore → Palla
// la camera si ferma sui BLOCCHI (non sui furni: esili, e facevano vibrare)
rig.solido = (x, y, z) => {
  const t = mondo.tipo(x, y, z);
  return !!t && !defDi(t).acqua;
};
const nuvole = new Nuvole(rig.scena, rig.mobile ? 4 : undefined);
const segnaPercorso = new SegnaPercorso(rig.scena);
nuvole.intervalloOmbra = rig.mobile ? 0.066 : 0.033;   // maschera ombre: 15Hz su telefono
const controller = new Controller(mondo, input);
const inventario = new Inventario();
const scavo = new Scavo(rig.scena);
const sim = new SimAcqua(mondo);
const lobby = new Lobby();

const badge = (id) => (id === 'secchio' ? (inventario.secchioPieno ? '💧' : '') : inventario.quanti(id));
// dichiarato QUI (non dove viene creato) perche' onCambio puo' scattare
// durante l'avvio: un const dichiarato piu' sotto sarebbe in temporal dead
// zone e persino `zaino &&` lancerebbe ReferenceError.
let zaino = null;
inventario.onCambio = () => {
  hud.aggiornaConteggi(badge);
  ruota.aggiornaConteggi(badge);
  if (zaino && zaino.aperto) datiZaino();   // conteggi vivi anche a zaino aperto
};

// RUOTA degli strumenti: unico comando per scegliere cosa hai in mano. Scegliere
// un oggetto entra in costruzione, scegliere «Esplora» torna in esplorazione —
// così la modalità non è più un pulsante a parte.
/** Dove sta il gatto sullo schermo, in pixel: la ruota si apre LÌ. */
const _proj = new THREE.Vector3();
function ancoraGatto() {
  const cam = modalitaXR.attiva ? modalitaXR.camera : (modalitaAR.attiva ? modalitaAR.camera : rig.camera);
  _proj.set(controller.pos.x, controller.pos.y + 0.9, controller.pos.z).project(cam);
  return { x: (_proj.x * 0.5 + 0.5) * innerWidth, y: (-_proj.y * 0.5 + 0.5) * innerHeight };
}

const ruota = new Ruota({
  onScegli: (i) => { impostaSelezione(i); if (!costruisci) impostaModo(true); audio.sfx('ui'); },
  onEsplora: () => { impostaModo(false); audio.sfx('ui'); },
  onUsa: () => usaStrumento(),
  ancora: ancoraGatto,
});

/** Il tocco sulla bolla: fa quello che ha senso per ciò che hai in mano.
 *  zampa → interagisci · blocco/mobile → piazza · attrezzo → rompe ·
 *  secchio → raccoglie o versa. Niente più tasti separati. */
function usaStrumento() {
  if (!costruisci) { interagisci(); return; }
  const voce = VOCI[selezione];
  const cella = cellaBersaglio();
  if (voce && voce.id === 'secchio') {
    // il secchio agisce sulla cella bersaglio: normale verso l'alto, come se
    // ci si versasse sopra
    usaSecchio({ cella, normale: [0, 1, 0] });
    return;
  }
  costruisciSuCella(cella, !voce || voce.genere === 'attrezzo');
}

// Seconda bolla: DOVE costruire rispetto al gatto. Solo icone, nessuna scritta.
const ruotaPosa = new Ruota({ id: 'btnPosa', conEsplora: false });
function impostaPosa(id) {
  opzioni.posa = id;
  bersaglio.posa = id;
  ruotaPosa.mostraIcona(posaCorrente().icona);
  applicaOpzioni();
  aggiornaGhost();
}

ciclo.onFase = (eNotte) => arredo.aggiornaNotte(eNotte);
// NON C'È PIÙ NIENTE DA AVVISARE, ed è il guadagno più concreto di tutta la
// riscrittura delle ombre. Un lampione che si accende cambiava la MASCHERA
// d'occlusione, non solo la sua sfera: l'arredo alzava una bandierina qui
// (arredo.onLuce) e il loop faceva ricuocere le mappe della zona. Misurato
// allora: 3,5 ms per accensione con 77 lampioni, e il costo cresceva col
// quadrato — da cui la bandierina invece della chiamata diretta.
// Adesso l'ombra la calcola lo shader camminando i MURI, e premere un
// interruttore i muri non li sposta: accendere un lampione costa la scrittura di
// una uniform, esattamente come per una luce leggera qualsiasi.

// ---- hotbar e selezione ------------------------------------------------------

function voceDa(id) {
  if (BLOCCHI[id]) return { genere: 'blocco', id, nome: BLOCCHI[id].nome, cima: BLOCCHI[id].cima, lato: BLOCCHI[id].lato };
  if (FURNI[id]) return { genere: 'furni', id, nome: FURNI[id].nome, emoji: FURNI[id].icona };
  if (ATTREZZI[id]) return { genere: 'attrezzo', id, nome: ATTREZZI[id].nome, emoji: ATTREZZI[id].emoji };
  return null;
}

let hotbarIds = ['erba', 'terra', 'sabbia', 'roccia', 'legno', 'acqua', 'albero', 'panchina', 'lampione'];
let VOCI = [];

function ricostruisciHotbar() {
  VOCI = hotbarIds.map(voceDa).filter(Boolean);
  hud.costruisciHotbar(VOCI);       // la hotbar resta nel DOM (nascosta): la ruota la rispecchia
  hud.aggiornaConteggi(badge);
  hud.seleziona(selezione);
  // nella ruota solo ciò che si usa GIOCANDO: lo Zaino sì, l'Officina no
  // (è un editor, vive nel menu ⚙️ — nella ruota era fuori posto)
  ruota.imposta(VOCI, badge, [
    { emoji: '🎒', nome: 'Zaino', fn: () => { audio.sfx('apri'); apriZaino(true); } },
  ]);
  ruota.segnaAttivo(costruisci ? selezione : -1);
  if (zaino.aperto) datiZaino();          // lo zaino aperto resta in pari
}

let selezione = 0;
let rotSel = 0;
let costruisci = false;
let modalitaRompi = false;

// ---- ghost di anteprima ------------------------------------------------------

const ghostMatBlocco = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false,
});
const ghostMatFurni = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0.45, depthWrite: false, color: 0x7dffa0,
});
const ghostBlocchi = new Map();   // tipo → Mesh
const ghostFurni = new Map();     // defId → Group
const VERDE = new THREE.Color(0.65, 1, 0.75), ROSSO = new THREE.Color(1, 0.4, 0.4);
let ghostAttivo = null;
let mira = { x: innerWidth / 2, y: innerHeight / 2 };

function ghostPerBlocco(tipo) {
  if (!ghostBlocchi.has(tipo)) {
    const m = new THREE.Mesh(geometriaSingola(tipo), ghostMatBlocco);
    m.visible = false;
    rig.scena.add(m);
    ghostBlocchi.set(tipo, m);
  }
  return ghostBlocchi.get(tipo);
}

/** Al cambio stagione i ghost dei blocchi vanno ricostruiti (colori diversi). */
function svuotaGhostBlocchi() {
  for (const m of ghostBlocchi.values()) {
    rig.scena.remove(m);
    m.geometry.dispose();
  }
  ghostBlocchi.clear();
  nascondiGhost();
}
function ghostPerFurni(defId) {
  if (!ghostFurni.has(defId)) {
    const g = FURNI[defId].modello3d.clone();
    g.traverse((o) => { if (o.isMesh) o.material = ghostMatFurni; });
    const [cX, cZ] = centroide(FURNI[defId]);
    g.position.set(cX, 0, cZ);
    const involucro = new THREE.Group();
    involucro.add(g);
    involucro.visible = false;
    rig.scena.add(involucro);
    ghostFurni.set(defId, involucro);
  }
  return ghostFurni.get(defId);
}
function nascondiGhost() {
  if (ghostAttivo) ghostAttivo.visible = false;
  ghostAttivo = null;
}

// ---- mira sulla griglia --------------------------------------------------------
// Il raggio di mira ATTRAVERSA l'acqua: prima i flussi (celle quasi vuote)
// bloccavano la selezione dei blocchi dietro/sotto — costruire vicino all'acqua
// era una lotteria. Solo il secchio "vede" l'acqua, e solo le SORGENTI.

function puntaGriglia(sx, sy) {
  const { origine, direzione } = raggioGioco(sx, sy);
  return raggioGriglia(origine, direzione, RAGGIO_CLICK, (x, y, z) => {
    const t = mondo.tipo(x, y, z);
    return !!t && !defDi(t).acqua;
  });
}

/** Mira del secchio: solidi + sorgenti d'acqua (i flussi sono trasparenti). */
function puntaGrigliaSecchio(sx, sy) {
  const { origine, direzione } = raggioGioco(sx, sy);
  return raggioGriglia(origine, direzione, RAGGIO_CLICK, (x, y, z) => {
    const t = mondo.tipo(x, y, z);
    if (!t) return false;
    return !defDi(t).acqua || livelloAcqua(t) === 0;
  });
}
function puntaFurni(sx, sy) {
  const { raycaster } = raggioDaSchermo(modalitaXR.attiva ? modalitaXR.camera : (modalitaAR.attiva ? modalitaAR.camera : rig.camera), sx, sy);
  const colpi = raycaster.intersectObjects(arredo.radice.children, true);
  for (const c of colpi) {
    const ist = arredo.istanzaDa(c.object);
    if (ist) return { istanza: ist, dist: c.distance };
  }
  return null;
}

/** Anteprima sulla CELLA BERSAGLIO (tocco): verde = si può, rosso = no.
 *  Serve anche per rompere: prima non si vedeva su cosa si stesse agendo. */
function ghostSuBersaglio() {
  const [x, y, z] = cellaBersaglio();
  const voce = VOCI[selezione];
  const rompendo = modalitaRompi || !voce || voce.genere === 'attrezzo';
  if (!rompendo && voce.genere === 'furni') {
    const g = ghostPerFurni(voce.id);
    if (ghostAttivo !== g) nascondiGhost();
    ghostAttivo = g;
    g.position.set(x + 0.5, y + PX, z + 0.5);
    g.rotation.y = rotSel * Math.PI / 2;
    ghostMatFurni.color.copy(arredo.puoiPiazzare(voce.id, [x, y, z], rotSel, controller).ok ? VERDE : ROSSO);
    g.visible = true;
    return;
  }
  // per rompere si usa la sagoma del blocco che c'è davvero (se c'è)
  const tipo = rompendo ? tipoBase(mondo.tipo(x, y, z) || '') : voce.id;
  if (rompendo && !tipo) { nascondiGhost(); return; }
  const g = ghostPerBlocco(tipo || 'erba');
  if (ghostAttivo !== g) nascondiGhost();
  ghostAttivo = g;
  g.position.set(x + 0.5, y + 0.5, z + 0.5);
  if (rompendo) ghostMatBlocco.color.copy(ROSSO);
  else {
    const tIn = mondo.tipo(x, y, z);
    const libera = (!tIn || defDi(tIn).acqua) && !mondo.furniIn(x, y, z) && !controller.occupaCella(x, y, z);
    ghostMatBlocco.color.copy(libera ? VERDE : ROSSO);
  }
  g.visible = true;
}

function aggiornaGhost() {
  if (!costruisci) { nascondiGhost(); return; }
  // col tocco il bersaglio è relativo al gatto: si vede SEMPRE dove si agirà
  if (opzioni.comandiTouch) { ghostSuBersaglio(); return; }
  if (modalitaRompi) { nascondiGhost(); return; }
  const voce = VOCI[selezione];
  if (!voce || voce.genere === 'attrezzo') { nascondiGhost(); return; }
  const colpo = puntaGriglia(mira.x, mira.y);
  if (!colpo) { nascondiGhost(); return; }

  if (voce.genere === 'blocco') {
    const [x, y, z] = [
      colpo.cella[0] + colpo.normale[0],
      colpo.cella[1] + colpo.normale[1],
      colpo.cella[2] + colpo.normale[2],
    ];
    const g = ghostPerBlocco(voce.id);
    if (ghostAttivo !== g) nascondiGhost();
    ghostAttivo = g;
    g.position.set(x + 0.5, y + 0.5, z + 0.5);
    const tIn = mondo.tipo(x, y, z);
    const libera = (!tIn || defDi(tIn).acqua) && !mondo.furniIn(x, y, z) && !controller.occupaCella(x, y, z);
    ghostMatBlocco.color.copy(libera ? VERDE : ROSSO);
    g.visible = true;
  } else {
    if (colpo.normale[1] !== 1) { nascondiGhost(); return; }   // i furni si piazzano sulle cime
    const cella = [colpo.cella[0], colpo.cella[1] + 1, colpo.cella[2]];
    const g = ghostPerFurni(voce.id);
    if (ghostAttivo !== g) nascondiGhost();
    ghostAttivo = g;
    g.position.set(cella[0] + 0.5, cella[1] + PX, cella[2] + 0.5);
    g.rotation.y = rotSel * Math.PI / 2;
    ghostMatFurni.color.copy(arredo.puoiPiazzare(voce.id, cella, rotSel, controller).ok ? VERDE : ROSSO);
    g.visible = true;
  }
}

// ---- azioni -------------------------------------------------------------------

let sedutaPendente = null;   // { istanza, uscita } quando il gatto sta andando a sedersi

controller.onArrivo = () => {
  if (sedutaPendente) {
    siediSu(sedutaPendente.istanza, sedutaPendente.uscita);
    sedutaPendente = null;
  }
};

function siediSu(istanza, uscita) {
  let sx = 0, sz = 0;
  for (const [x, , z] of istanza.celle) { sx += x + 0.5; sz += z + 0.5; }
  const pos = new THREE.Vector3(
    sx / istanza.celle.length,
    istanza.cella[1] + istanza.def.seduta.altezzaPx * PX,
    sz / istanza.celle.length,
  );
  controller.siedi(pos, uscita);
  audio.sfx('siedi');
  hud.toast('😺 Che relax — muovi per girarti, interagisci per alzarti');
}

/** Va a sedersi su un furni-seduta: cella libera accanto, poi si accomoda. */
function andaESiedi(ist) {
  const candidate = [];
  for (const [cx0, cy0, cz0] of ist.celle) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const y = mondo.appoggioInColonna(cx0 + dx, cz0 + dz, cy0 + 2, 8);
      if (y !== null) candidate.push([cx0 + dx, y, cz0 + dz]);
    }
  }
  candidate.sort((a, b) =>
    (a[0] + 0.5 - controller.pos.x) ** 2 + (a[2] + 0.5 - controller.pos.z) ** 2 -
    ((b[0] + 0.5 - controller.pos.x) ** 2 + (b[2] + 0.5 - controller.pos.z) ** 2));
  for (const cella of candidate) {
    if (!controller.vaiA(cella)) continue;
    if (controller.percorso) sedutaPendente = { istanza: ist, uscita: cella };
    else siediSu(ist, cella);
    return true;
  }
  return false;
}

/** INTERAGISCI (tasto E/F o pulsante touch): agisce su ciò che hai intorno —
 *  accende il lampione, calcia la palla, ti siedi sulla sedia. Da seduto,
 *  lo stesso tasto ti fa ALZARE. Non serve mirare: sceglie l'oggetto più
 *  vicino al gatto. */
function interagisci() {
  if (controller.seduto) { controller.alzati(); hud.toast('🐾 In piedi!'); return; }
  const px = controller.pos.x, pz = controller.pos.z, py = controller.pos.y;

  // palla più vicina (entro ~1.6) → calcio nella direzione gatto→palla
  let palla = null, dPalla = 1.6 * 1.6;
  for (const p of palle.values()) {
    const d = (p.pos.x - px) ** 2 + (p.pos.z - pz) ** 2;
    if (d < dPalla && Math.abs(p.pos.y - py) < 1.6) { dPalla = d; palla = p; }
  }
  // furni interagibile più vicino (entro ~2.2): lampione (stati) o sedia (seduta)
  let furni = null, dFurni = 2.2 * 2.2;
  for (const ist of arredo.istanze) {
    if (!ist.def.stati && !ist.def.seduta) continue;
    let dmin = Infinity;
    for (const [cx0, , cz0] of ist.celle) {
      const d = (cx0 + 0.5 - px) ** 2 + (cz0 + 0.5 - pz) ** 2;
      if (d < dmin) dmin = d;
    }
    if (dmin < dFurni) { dFurni = dmin; furni = ist; }
  }

  if (palla && (!furni || dPalla <= dFurni)) {
    palla.spingi(palla.pos.x - px, palla.pos.z - pz);
    particelle.emetti(palla.pos.x, palla.pos.y, palla.pos.z, 0, 1.4, 0, 0.4, 0.5, 0, [1, 1, 0.6]);
    audio.sfx('palla');
    hud.toast('⚽ Spinta!');
    return;
  }
  if (furni) {
    if (furni.def.stati) {
      arredo.alterna(furni);
      hud.toast(`${furni.def.nome}: ${furni.def.stati[furni.stato].nome}`);
      segnaSalvataggio();
      return;
    }
    if (furni.def.seduta && andaESiedi(furni)) return;
  }
  hud.toast('Niente da fare qui intorno 🐾');
}

function clickEsplora(sx, sy) {
  sedutaPendente = null;
  const furni = puntaFurni(sx, sy);
  const blocco = puntaGriglia(sx, sy);
  if (furni && (!blocco || furni.dist < blocco.dist)) {
    if (furni.istanza.def.stati) {
      arredo.alterna(furni.istanza);
      hud.toast(`${furni.istanza.def.nome}: ${furni.istanza.def.stati[furni.istanza.stato].nome}`);
      segnaSalvataggio();
      return;
    }
    // trova una cella libera accanto al furni, la più vicina al gatto
    const ist = furni.istanza;
    const candidate = [];
    for (const [cx0, cy0, cz0] of ist.celle) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const y = mondo.appoggioInColonna(cx0 + dx, cz0 + dz, cy0 + 2, 8);
        if (y !== null) candidate.push([cx0 + dx, y, cz0 + dz]);
      }
    }
    candidate.sort((a, b) =>
      (a[0] + 0.5 - controller.pos.x) ** 2 + (a[2] + 0.5 - controller.pos.z) ** 2 -
      ((b[0] + 0.5 - controller.pos.x) ** 2 + (b[2] + 0.5 - controller.pos.z) ** 2));

    for (const cella of candidate) {
      if (controller.seduto) controller.alzati();
      if (!controller.vaiA(cella)) continue;
      if (ist.def.seduta) {
        if (controller.percorso) sedutaPendente = { istanza: ist, uscita: cella };
        else siediSu(ist, cella);          // era già lì
      }
      return;
    }
    hud.toast('Non riesco ad avvicinarmi 😿');
    return;
  }
  if (!blocco) return;
  if (controller.seduto) controller.alzati();
  const target = [
    blocco.cella[0] + blocco.normale[0],
    blocco.cella[1] + blocco.normale[1],
    blocco.cella[2] + blocco.normale[2],
  ];
  if (!controller.vaiA(target)) {
    // il percorso a piedi non c'è: se il punto è in acqua (o ci sei tu), NUOTA
    const tT = mondo.tipo(...target);
    const tSotto = mondo.tipo(target[0], target[1] - 1, target[2]);
    const acquatico = (tT && defDi(tT).acqua) || (tSotto && defDi(tSotto).acqua);
    if (acquatico || controller.inAcqua) {
      controller.metaNuoto = [target[0] + 0.5, target[1], target[2] + 0.5];
      controller.fermaPercorso();
    } else {
      hud.toast('Non ci arrivo 😿');
    }
  }
}

function usaSecchio(colpo) {
  if (!colpo) return;
  const [x, y, z] = colpo.cella;
  const t = mondo.tipo(x, y, z);
  if (!inventario.secchioPieno) {
    if (t === 'acqua') {
      mondo.togli(x, y, z);                  // evento normale: sincronizzato in P2P
      inventario.impostaSecchio(true);
      spruzzo(x + 0.5, y + 0.9, z + 0.5, 5);
      hud.toast('🪣 Secchio pieno');
      segnaSalvataggio();
    } else {
      hud.toast('Punta una SORGENTE: i flussi spariscono quando la raccogli');
    }
  } else {
    const target = (t && defDi(t).acqua)
      ? [x, y, z]
      : [x + colpo.normale[0], y + colpo.normale[1], z + colpo.normale[2]];
    const tt = mondo.tipo(...target);
    if (tt && !defDi(tt).acqua) { hud.toast('Qui non ci sta'); return; }
    mondo.metti(target[0], target[1], target[2], 'acqua');   // versa (anche sui furni: waterlog)
    inventario.impostaSecchio(false);
    spruzzo(target[0] + 0.5, target[1] + 0.9, target[2] + 0.5, 8);
    hud.toast('💧 Versata');
    segnaSalvataggio();
  }
}

function attrezzoAttuale() {
  const v = VOCI[selezione];
  return v && v.genere === 'attrezzo' && ATTREZZI[v.id] && ATTREZZI[v.id].famiglia ? v.id : null;
}

/** Rompe un blocco a colpi (salute + attrezzo). Furni sopra e acqua a parte. */
function rompiBlocco([x, y, z]) {
  if (mondo.furniIn(x, y + 1, z)) { hud.toast('C’è un furni appoggiato sopra'); return; }
  const tipo = mondo.tipo(x, y, z);
  if (!tipo) return;
  const base = tipoBase(tipo);
  const def = defDi(tipo);

  // acqua e creativa (∞): via subito, senza salute
  if (def.acqua) { mondo.togli(x, y, z); segnaSalvataggio(); return; }
  if (inventario.infinito) {
    scavo.scordaCella(x, y, z);
    if (mondo.togli(x, y, z)) inventario.aggiungi(base);
    segnaSalvataggio();
    return;
  }

  // a colpi: 2 a mano, 1 con l'attrezzo della famiglia giusta
  mano.usa(); _usoContatore++;
  if (scavo.colpisci(x, y, z, def, attrezzoAttuale(), performance.now())) {
    if (mondo.togli(x, y, z)) {
      // DROP per strumento (tabella in gioco/drop.js) + detriti del colore del blocco
      const att = ATTREZZI[attrezzoAttuale()];
      const giusto = !!(att && att.famiglia && att.famiglia === def.fam);
      for (const d of dropDi(base, def, giusto)) inventario.aggiungi(d.id, d.quanti);
      detritiBlocco(x, y, z, def);
      if (!giusto && dropDi(base, def, false)[0]?.id !== base) {
        hud.toast(`Con l'attrezzo giusto avresti preso ${def.nome} 🤏`);
      }
    }
    segnaSalvataggio();
  }
}

/** Sbriciolamento: detriti del COLORE del blocco (feedback ambientale). */
function detritiBlocco(x, y, z, def) {
  const c = new THREE.Color(def.cima || 0xaaaaaa);
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * Math.PI * 2, vr = 0.6 + Math.random() * 1.2;
    particelle.emetti(
      x + 0.5 + (Math.random() - 0.5) * 0.6, y + 0.6, z + 0.5 + (Math.random() - 0.5) * 0.6,
      Math.cos(a) * vr, 1.4 + Math.random() * 1.6, Math.sin(a) * vr,
      0.55, 0.5, 0, [c.r, c.g, c.b],
    );
  }
}

// ---- BERSAGLIO: la matematica sta in gioco/bersaglio.js (modulo puro) --------
const bersaglio = new Bersaglio();
const posaCorrente = () => bersaglio.posaCorrente;
const cellaBersaglio = () => bersaglio.cella(controller.pos);
/** Piazza o rompe su una cella PRECISA (niente raggio: bersaglio esplicito). */
function costruisciSuCella(cella, rompi) {
  const [x, y, z] = cella;
  if (rompi) {
    const ist = arredo.istanze.find((i) => i.celle.some((c) => c[0] === x && c[1] === y && c[2] === z));
    if (ist) {
      arredo.rimuovi(ist); inventario.aggiungi(ist.defId);
      audio.sfx('raccogli'); segnaSalvataggio(); return;
    }
    if (!mondo.tipo(x, y, z)) { hud.toast('Qui non c’è niente da rompere'); audio.sfx('errore'); return; }
    rompiBlocco([x, y, z]);
    return;
  }
  const voce = VOCI[selezione];
  if (!voce || voce.genere === 'attrezzo') { hud.toast('Scegli un blocco dalla bolla 🫧'); return; }
  if (voce.genere === 'blocco') {
    const tIn = mondo.tipo(x, y, z);
    if (tIn && !defDi(tIn).acqua) { hud.toast('Lì è già occupato'); audio.sfx('errore'); return; }
    if (mondo.furniIn(x, y, z) && !defDi(voce.id).acqua) { hud.toast('C’è un mobile'); return; }
    if (controller.occupaCella(x, y, z)) { hud.toast('Ci sei sopra tu!'); return; }
    if (!inventario.consuma(voce.id)) { hud.toast(`${voce.nome} finita: rompine per raccoglierne`); audio.sfx('errore'); return; }
    mondo.metti(x, y, z, voce.id);
    mano.posa();                                  // il gatto allunga la zampa
    if (tIn && defDi(tIn).acqua) spruzzo(x + 0.5, y + 0.9, z + 0.5, 6);
    segnaSalvataggio();
  } else {
    const esito = arredo.puoiPiazzare(voce.id, cella, rotSel, controller);
    if (!esito.ok) { hud.toast(esito.motivo); audio.sfx('errore'); return; }
    if (!inventario.consuma(voce.id)) { hud.toast(`${voce.nome} finita`); return; }
    arredo.piazza(voce.id, cella, rotSel);
    mano.posa();
    segnaSalvataggio();
  }
}

function clickCostruisci(sx, sy, destro) {
  if (!destro && VOCI[selezione] && VOCI[selezione].genere === 'attrezzo' && VOCI[selezione].id === 'secchio') {
    usaSecchio(puntaGrigliaSecchio(sx, sy));
    return;
  }
  if (destro) {
    const furni = puntaFurni(sx, sy);
    const blocco = puntaGriglia(sx, sy);
    if (furni && (!blocco || furni.dist < blocco.dist)) {
      arredo.rimuovi(furni.istanza);
      inventario.aggiungi(furni.istanza.defId);      // raccolta
      audio.sfx('raccogli');
      segnaSalvataggio();
      return;
    }
    if (!blocco) return;
    rompiBlocco(blocco.cella);
    return;
  }

  const voce = VOCI[selezione];
  const colpo = puntaGriglia(sx, sy);
  if (!colpo) return;

  if (voce.genere === 'blocco') {
    const [x, y, z] = [
      colpo.cella[0] + colpo.normale[0],
      colpo.cella[1] + colpo.normale[1],
      colpo.cella[2] + colpo.normale[2],
    ];
    // l'acqua non blocca: piazzare un blocco lì dentro la SOSTITUISCE (diga!)
    // e l'ACQUA si versa anche nelle celle dei furni (waterlog dei non-solidi)
    const tIn = mondo.tipo(x, y, z);
    if (tIn && !defDi(tIn).acqua) return;
    if (mondo.furniIn(x, y, z) && !defDi(voce.id).acqua) return;
    if (controller.occupaCella(x, y, z)) { hud.toast('Ci sei sopra tu!'); return; }
    if (!inventario.consuma(voce.id)) { hud.toast(`${voce.nome} finita: rompine per raccoglierne`); return; }
    mondo.metti(x, y, z, voce.id);
    if (tIn && defDi(tIn).acqua) spruzzo(x + 0.5, y + 0.9, z + 0.5, 6);   // tuffo del blocco
    segnaSalvataggio();
  } else {
    if (colpo.normale[1] !== 1) { hud.toast('I furni si piazzano sopra i blocchi'); return; }
    const cella = [colpo.cella[0], colpo.cella[1] + 1, colpo.cella[2]];
    const esito = arredo.puoiPiazzare(voce.id, cella, rotSel, controller);
    if (!esito.ok) { hud.toast(esito.motivo); return; }
    if (!inventario.consuma(voce.id)) { hud.toast(`${voce.nome} finita: raccoglila col tasto destro`); return; }
    arredo.piazza(voce.id, cella, rotSel);
    segnaSalvataggio();
  }
}

input.onClick = (sx, sy, bottone) => {
  // in AR avanzata il PRIMO tocco appoggia il diorama sulla superficie puntata
  if (modalitaXR.attiva && !modalitaXR.piazzato) { modalitaXR.piazzaAlReticolo(); return; }
  if (bottone === 1) return;
  if (costruisci) clickCostruisci(sx, sy, bottone === 2 || modalitaRompi);
  else if (bottone === 0) clickEsplora(sx, sy);
};
input.onMuovi = (sx, sy) => { mira.x = sx; mira.y = sy; };

// ---- comandi touch: joystick + tasti (salta/scendi/distruggi/piazza) ----------
// Distruggi e Piazza agiscono al CENTRO dello schermo (il mirino): si orbita
// la camera per inquadrare la cella e si tocca il tasto.
// Qui resta SOLO joystick + salto: rompere/piazzare/interagire li fa la bolla
const comandiTouch = new ComandiTouch(input, {});

input.onTasto = (codice, e) => {
  if (codice === 'KeyB') impostaModo(!costruisci);
  else if (codice === 'KeyE' || codice === 'KeyF') interagisci();
  else if (codice === 'KeyH') hud.mostraAiuto();
  else if (codice === 'KeyI') apriZaino();
  else if (codice === 'F3') { e.preventDefault(); apriMenu('avanzate'); }
  else if (codice === 'KeyV') {
    controller.imposta_volo(!controller.vola);
    hud.toast(controller.vola ? '✈️ Volo: WASD + Spazio/Shift' : 'Volo spento');
    menuDebug.sincronizza();
  }
  else if (codice === 'Escape') hud.mostraAiuto(false);
  else if (codice === 'KeyR') { rotSel = (rotSel + 1) % 4; aggiornaGhost(); }
  else if (codice === 'KeyT') { impostaTempoGioco((ciclo.t + 0.04) % 1); }
  else if (codice === 'KeyU') {
    // MAI due pannelli sovrapposti: il tasto U saltava chiudiPannelli e
    // l'Officina finiva sotto il Menu
    if (officina) {
      const apre = !officina.el.classList.contains('aperto');
      if (apre) chiudiPannelli('officina');
      officina.apri(apre);
    }
  }
  else if (/^Digit[1-9]$/.test(codice)) {
    const i = Number(codice.slice(5)) - 1;
    if (i < VOCI.length) impostaSelezione(i);
  }
  if (codice === 'Space') e.preventDefault();
};

function impostaModo(attivo) {
  costruisci = attivo;
  hud.setModo(attivo);
  document.getElementById('barraCostruisci').classList.toggle('visibile', attivo);
  ruota.segnaAttivo(attivo ? selezione : -1);   // il pulsante mostra cosa hai in mano
  document.body.classList.toggle('mostra-posa', !!opzioni.comandiTouch && attivo);
  if (!attivo) nascondiGhost(); else aggiornaGhost();
}
function impostaSelezione(i) {
  selezione = i;
  hud.seleziona(i);
  if (costruisci) ruota.segnaAttivo(i);
  aggiornaGhost();
}
function impostaRompi(attivo) {
  modalitaRompi = attivo;
  document.getElementById('btnPiazza').classList.toggle('attivo', !attivo);
  document.getElementById('btnRompi').classList.toggle('attivo', attivo);
  aggiornaGhost();
}

// ---- pannello "Gioca insieme" (P2P guidato) -----------------------------------
// Stesso handshake WebRTC del menu debug, ma tenuto per mano: due bottoni,
// codici auto-copiati negli appunti, stato leggibile. Zero gergo.

const elStanza = document.getElementById('stanza');
const fasiStanza = { host: document.getElementById('stanzaHost'), ospite: document.getElementById('stanzaOspite') };

function apriFaseStanza(quale) {
  elStanza.classList.toggle('in-fase', quale !== null);
  for (const [k, el] of Object.entries(fasiStanza)) el.classList.toggle('aperto', k === quale);
}
async function copiaTesto(testo, okEl) {
  let ok = false;
  try { await navigator.clipboard.writeText(testo); ok = true; } catch { /* fallback sotto */ }
  if (okEl) okEl.textContent = ok ? '✓ copiato!' : '(seleziona il riquadro e copia a mano)';
  return ok;
}
// incolla dagli appunti in una textarea (con fallback: la lascia da riempire a mano)
async function incollaIn(idTextarea) {
  try {
    const t = await navigator.clipboard.readText();
    if (t) { document.getElementById(idTextarea).value = t.trim(); hud.toast('📥 Incollato'); return; }
  } catch { /* niente permesso: manuale */ }
  const ta = document.getElementById(idTextarea);
  ta.focus();
  hud.toast('Tieni premuto nel riquadro e scegli «Incolla»');
}
document.getElementById('incollaSuo').addEventListener('click', () => incollaIn('codiceSuo'));
document.getElementById('incollaStanza').addEventListener('click', () => incollaIn('codiceStanza'));

// TURN gratuito (connessione affidabile su rete mobile): credenziali incollate
// dall'utente, salvate e usate da lobby._nuovaPc via Lobby.turn
function caricaTurn() {
  try {
    const t = JSON.parse(localStorage.getItem('lantern.turn') || 'null');
    if (t && t.urls) {
      Lobby.turn = [t];
      document.getElementById('turnUrl').value = t.urls;
      document.getElementById('turnUser').value = t.username || '';
      document.getElementById('turnPass').value = t.credential || '';
    }
  } catch { /* niente TURN */ }
}
caricaTurn();
document.getElementById('turnSalva').addEventListener('click', () => {
  const urls = document.getElementById('turnUrl').value.trim();
  if (!urls) { Lobby.turn = []; localStorage.removeItem('lantern.turn'); hud.toast('TURN rimosso'); return; }
  const t = { urls, username: document.getElementById('turnUser').value.trim(), credential: document.getElementById('turnPass').value.trim() };
  Lobby.turn = [t];
  try { localStorage.setItem('lantern.turn', JSON.stringify(t)); } catch { /* pieno */ }
  hud.toast('🌐 TURN salvato: connessione più affidabile');
});
// ---- ROOM-CODE: connessione con codice stanza (niente copia/incolla) ---------
// Usa il server di segnalazione (server/signaling.mjs). L'URL lo salva l'utente.
let segnalatore = null;
const rcUrlEl = document.getElementById('rcUrl');
try { const u = localStorage.getItem('lantern.segnala'); if (u) rcUrlEl.value = u; } catch { /* ok */ }
function urlSegnala() {
  const u = (rcUrlEl.value || '').trim();
  if (!u) { hud.toast('Prima imposta il server (⚙️ apri «Server di segnalazione»)'); document.getElementById('rcServer').open = true; return null; }
  return u.replace(/^http/, 'ws'); // http→ws, https→wss
}
document.getElementById('rcUrlSalva').addEventListener('click', () => {
  const u = (rcUrlEl.value || '').trim();
  try { u ? localStorage.setItem('lantern.segnala', u) : localStorage.removeItem('lantern.segnala'); } catch { /* pieno */ }
  hud.toast(u ? '💾 Server salvato' : 'Server rimosso');
});
document.getElementById('rcCrea').addEventListener('click', async () => {
  const url = urlSegnala(); if (!url) return;
  const box = document.getElementById('rcCodice');
  box.textContent = '…';
  try {
    if (segnalatore) segnalatore.chiudi();
    segnalatore = new Segnalatore(lobby);
    segnalatore.onStato = (t) => hud.toast(t);
    segnalatore.onCode = (c) => { box.textContent = c; hud.toast('🏠 Stanza «' + c + '» — dì il codice agli amici'); };
    await segnalatore.creaStanza(url);
  } catch (e) { box.textContent = ''; hud.toast('Server non raggiungibile 😿'); console.warn(e); }
});
document.getElementById('rcEntra').addEventListener('click', async () => {
  const url = urlSegnala(); if (!url) return;
  const code = (document.getElementById('rcInput').value || '').trim().toUpperCase();
  if (code.length < 3) { hud.toast('Scrivi il codice della stanza'); return; }
  try {
    if (segnalatore) segnalatore.chiudi();
    segnalatore = new Segnalatore(lobby);
    segnalatore.onStato = (t) => hud.toast(t);
    await segnalatore.entra(url, code);
    hud.toast('🚪 Entro nella stanza «' + code + '»…');
  } catch (e) { hud.toast('Server non raggiungibile 😿'); console.warn(e); }
});

// MAI due pannelli sovrapposti: aprirne uno chiude gli altri
function chiudiPannelli(tranne = null) {
  if (tranne !== 'menu') document.getElementById('opzioni').classList.remove('aperto');
  if (tranne !== 'stanza') document.getElementById('stanza').classList.remove('aperto');
  if (tranne !== 'zaino') zaino.apri(false);
  if (tranne !== 'officina' && officina) officina.apri(false);
  if (tranne !== 'aiuto') hud.mostraAiuto(false);
}
document.getElementById('btnStanza').addEventListener('click', () => {
  const apre = !elStanza.classList.contains('aperto');
  if (apre) chiudiPannelli('stanza');
  audio.sfx(apre ? 'apri' : 'chiudi');
  elStanza.classList.toggle('aperto', apre);
});
document.getElementById('stanzaChiudi').addEventListener('click', () => { audio.sfx('chiudi'); elStanza.classList.remove('aperto'); });
for (const b of document.querySelectorAll('.stanza-indietro')) b.addEventListener('click', () => apriFaseStanza(null));

document.getElementById('stanzaCrea').addEventListener('click', async () => {
  apriFaseStanza('host');
  const ta = document.getElementById('codiceMio');
  ta.value = '… creo il codice della stanza …';
  try {
    const codice = await lobby.creaOfferta();
    ta.value = codice;
    copiaTesto(codice, document.getElementById('okMio'));
  } catch (e) { ta.value = ''; hud.toast('Errore WebRTC 😿'); console.warn(e); }
});
document.getElementById('copiaMio').addEventListener('click', () => {
  const ta = document.getElementById('codiceMio'); ta.focus(); ta.select();
  copiaTesto(ta.value, document.getElementById('okMio'));
});
document.getElementById('confermaHost').addEventListener('click', async () => {
  const r = document.getElementById('codiceSuo').value.trim();
  if (!r) { hud.toast('Incolla prima la risposta dell’amico'); return; }
  try { await lobby.completa(r); }
  catch (e) { hud.toast('Quel codice non è una risposta valida 😿'); console.warn(e); }
});

document.getElementById('stanzaEntra').addEventListener('click', () => apriFaseStanza('ospite'));
document.getElementById('generaRisposta').addEventListener('click', async () => {
  const o = document.getElementById('codiceStanza').value.trim();
  if (!o) { hud.toast('Incolla prima il codice della stanza'); return; }
  const ta = document.getElementById('codiceRisposta');
  ta.value = '… genero la risposta …';
  try {
    const risposta = await lobby.rispondi(o);
    ta.value = risposta;
    copiaTesto(risposta, document.getElementById('okRisposta'));
  } catch (e) { ta.value = ''; hud.toast('Quel codice non è una stanza valida 😿'); console.warn(e); }
});
document.getElementById('copiaRisposta').addEventListener('click', () => {
  const ta = document.getElementById('codiceRisposta'); ta.focus(); ta.select();
  copiaTesto(ta.value, document.getElementById('okRisposta'));
});

hud.onSeleziona = impostaSelezione;
hud.onModo = () => impostaModo(!costruisci);
hud.onTempo = (t) => impostaTempoGioco(t);
document.getElementById('btnPiazza').addEventListener('click', () => impostaRompi(false));
document.getElementById('btnRompi').addEventListener('click', () => impostaRompi(true));
document.getElementById('btnRuota').addEventListener('click', () => { rotSel = (rotSel + 1) % 4; aggiornaGhost(); });

// ---- zaino: assegna oggetti allo slot selezionato -----------------------------

// L'inventario vive in ui/zaino.js: qui gli si passano solo i DATI freschi e i
// callback. Nessuna logica di interfaccia in main.
zaino = new Zaino({
  voceDa,
  quanti: badge,
  // UN tocco = ce l'hai in mano. Gli slot restano un dettaglio interno: se
  // l'oggetto è già nella ruota lo si seleziona, altrimenti entra nel primo
  // posto libero (o al posto di quello che avevi in mano). L'utente non deve
  // sapere che esistono degli slot.
  onPrendi: (id) => {
    let i = hotbarIds.indexOf(id);
    if (i < 0) {
      i = hotbarIds.findIndex((x) => !x);
      if (i < 0) i = selezione;
      impostaSlot(i, id);
    }
    impostaSelezione(i);
    if (!costruisci) impostaModo(true);
    audio.sfx('raccogli');
    hud.toast(`✋ ${voceDa(id).nome}`);
    apriZaino(false);                       // preso: si torna a giocare
  },
  puoiCraftare: (r) => puoiCraftare(r, (id) => inventario.quanti(id)),
  onCraft: (ricetta) => {
    if (!crafta(ricetta, inventario)) { audio.sfx('errore'); hud.toast('Ti mancano i materiali 🤏'); return; }
    audio.sfx('crea');
    ricostruisciHotbar();
    datiZaino();
    hud.toast(`🔨 ${(voceDa(ricetta.out) || { nome: ricetta.out }).nome} ×${ricetta.n}`);
  },
});

/** Rinfresca lo zaino con lo stato attuale (posseduti, ricette, ruota). */
function datiZaino() {
  const tuttiId = [
    ...CATEGORIE_BLOCCHI.flatMap((c) => c.blocchi),
    ...Object.keys(FURNI),
    ...Object.keys(ATTREZZI),
  ];
  const posseduti = tuttiId.filter((id) => {
    const n = badge(id);
    return n === Infinity || typeof n === 'string' || n > 0;
  }).map(voceDa).filter(Boolean);
  const ricette = RICETTE.map((r) => ({
    ricetta: r, n: r.n,
    voce: voceDa(r.out) || { id: r.out, nome: r.nome },
    ingredienti: r.in.map((m) => `${m.q} ${(voceDa(m.id) || { nome: m.id }).nome}`).join(' + '),
  }));
  zaino.imposta({ posseduti, ricette, inMano: hotbarIds[selezione] || null });
}

function apriZaino(apri) {
  const mostra = apri !== false;
  if (mostra) { chiudiPannelli('zaino'); datiZaino(); }
  zaino.apri(mostra);
}
// assegna/sposta/svuota uno slot della ruota
function impostaSlot(slot, id) {
  hotbarIds[slot] = id || null;
  ricostruisciHotbar();
  segnaSalvataggio();
}
document.getElementById('btnZaino').addEventListener('click', () => { audio.sfx('apri'); apriZaino(); });
document.getElementById('btnChiudiZaino').addEventListener('click', () => { audio.sfx('chiudi'); apriZaino(false); });

// ---- salvataggio ----------------------------------------------------------------

let salvataggioSporco = false;
let ultimoSalvataggio = 0;
function segnaSalvataggio() { salvataggioSporco = true; }

// ---- eventi locali: salvataggio + debug + sim acqua + rete ---------------------

// ---- luci dei BLOCCHI (def.luce, es. Lucciola verde): una sfera fake-pointlight
// per cella, che nasce e muore col blocco — banco di prova del sistema luci
const luciBlocchi = new Map();
function gestisciLuceBlocco(e) {
  if (!e || !e.cella) return;
  const k = e.cella.join(',');
  const prec = luciBlocchi.get(k);
  if (prec) { rimuoviLuce(prec); luciBlocchi.delete(k); }
  if (e.tipo === 'metti' && e.blocco) {
    const def = defDi(e.blocco);
    if (def && def.luce) {
      luciBlocchi.set(k, creaLuce({
        pos: new THREE.Vector3(e.cella[0] + 0.5, e.cella[1] + 0.5, e.cella[2] + 0.5),
        raggio: def.luce.raggio, colore: def.luce.colore, intensita: def.luce.intensita,
        ombra: !!def.luce.ombra,
      }));
    }
  }
  // (qui si teneva il raggio della lampada PESANTE comparsa o sparita e lo si
  // dava al mesher, perché la sua mappa d'ombra andava ricotta. Il blocco però
  // cambia anche la SOLIDITÀ della cella, e di quella il mesher si accorge da
  // solo dagli eventi di world.js: era l'unica cosa che serviva davvero alle
  // ombre, ed è l'unica rimasta.)
}

// ---- blocchi che EMETTONO PARTICELLE (def.particelle) ----------------------
// Stesso schema delle luci: un registro di celle, tenuto in pari dagli eventi.
// Nel loop si emette solo dalle celle VICINE al gatto e a ritmo ridotto: un
// mondo pieno di blocchi fumanti non deve costare nulla se sono lontani.
const particelleBlocchi = new Map();          // "x,y,z" → def.particelle
// I NIDI DEI FUOCHI FATUI seguono lo STESSO schema, e stanno qui accanto
// apposta: sono la terza cosa che un blocco puo' "emettere" (luce, particelle,
// fatui) e tenerle in tre registri con tre riscansioni separate voleva dire tre
// passate su mondo.tutti(), che e' la funzione lenta (split + map + un oggetto
// nuovo per blocco). Una passata sola, due registri.
const nidiFatui = new Map();                  // "x,y,z" → def.fuochiFatui
function gestisciParticelleBlocco(e) {
  if (!e || !e.cella) return;
  const k = e.cella.join(',');
  const primaNido = nidiFatui.has(k);
  particelleBlocchi.delete(k);
  nidiFatui.delete(k);
  if (e.tipo === 'metti' && e.blocco) {
    const def = defDi(e.blocco);
    if (def && def.particelle) particelleBlocchi.set(k, def.particelle);
    if (def && def.fuochiFatui) nidiFatui.set(k, def.fuochiFatui);
  }
  if (primaNido !== nidiFatui.has(k)) fuochiFatui.imposta(nidiFatui);
}
function ricostruisciBlocchiSpeciali() {
  particelleBlocchi.clear();
  nidiFatui.clear();
  for (const b of mondo.tutti()) {
    const def = defDi(b.tipo);
    if (!def) continue;
    if (def.particelle) particelleBlocchi.set(`${b.x},${b.y},${b.z}`, def.particelle);
    if (def.fuochiFatui) nidiFatui.set(`${b.x},${b.y},${b.z}`, def.fuochiFatui);
  }
  fuochiFatui.imposta(nidiFatui);
}
let _tPart = 0;
function emettiParticelleBlocchi(dt) {
  if (!particelleBlocchi.size) return;
  _tPart -= dt;
  if (_tPart > 0) return;
  _tPart = 0.14;                                // ~7 volte al secondo, non di più
  const p = controller.pos, R2 = 26 * 26;
  for (const [k, pa] of particelleBlocchi) {
    const [x, y, z] = k.split(',').map(Number);
    const dx = x - p.x, dz = z - p.z;
    if (dx * dx + dz * dz > R2) continue;        // lontano: costa zero
    if (Math.random() > (pa.ritmo ?? 0.5)) continue;
    const a = Math.random() * Math.PI * 2, r = 0.28;
    particelle.emetti(
      x + 0.5 + Math.cos(a) * r, y + (pa.su ?? 1.0), z + 0.5 + Math.sin(a) * r,
      Math.cos(a) * 0.12, (pa.salita ?? 0.7), Math.sin(a) * 0.12,
      0.8, 0.42, 0, pa.colore || [1, 1, 0.85],
    );
  }
}

/** Riscansiona il mondo (caricamenti, generazioni, ripristini: nessun evento). */
function ricostruisciLuciBlocchi() {
  for (const l of luciBlocchi.values()) rimuoviLuce(l);
  luciBlocchi.clear();
  for (const b of mondo.tutti()) {
    const def = defDi(b.tipo);
    if (def && def.luce) {
      luciBlocchi.set(`${b.x},${b.y},${b.z}`, creaLuce({
        pos: new THREE.Vector3(b.x + 0.5, b.y + 0.5, b.z + 0.5),
        raggio: def.luce.raggio, colore: def.luce.colore, intensita: def.luce.intensita,
        ombra: !!def.luce.ombra,
      }));
    }
  }
}

function eventoLocale(e) {
  segnaSalvataggio();
  menuDebug.suEvento();
  gestisciLuceBlocco(e);
  gestisciParticelleBlocco(e);
  // (un furni piazzato o tolto poteva portarsi dietro un lampione, e il mesher
  // doveva accorgersene per ricuocerne la mappa. Un furni non è un blocco e non
  // ferma la luce, quindi adesso non ha proprio niente da dire alle ombre.)
  // suono dell'azione
  if (e.tipo === 'metti' || e.tipo === 'furniPiazza') audio.sfx('piazza');
  else if (e.tipo === 'togli' || e.tipo === 'furniRimuovi') audio.sfx('rompi');
  else if (e.tipo === 'furniStato') audio.sfx('lampione');
  if (e.cella) sim.pianificaAttorno(e.cella);
  if (lobby.connessa) lobby.invia({ t: 'evento', e });
}
mondo.onEvento = eventoLocale;
arredo.onEvento = eventoLocale;

// ---- multiplayer P2P di prova ---------------------------------------------------

// GATTI REMOTI (multi-lobby a stella): id → {gatto, pos, posa, visto, inAcqua}
// L'host relay-a le pose degli ospiti agli altri; l'id 'h' è l'host stesso.
const gattiRemoti = new Map();
const COLORI_GATTI = [[0xf5a742, 0xc07a20], [0xe36bb4, 0xb44a8e], [0x9b6bf0, 0x7648c9], [0x5bd0d0, 0x3aa8a8], [0xd6e26b, 0xb1bd44]];
let mioIdRete = null;             // assegnato dall'host nel benvenuto
function gattoRemotoDi(id) {
  let g = gattiRemoti.get(id);
  if (!g) {
    const [c1, c2] = COLORI_GATTI[(typeof id === 'number' ? id : 0) % COLORI_GATTI.length];
    g = { gatto: new Gatto(c1, c2), pos: new THREE.Vector3(), posa: null, visto: 0, inAcqua: false };
    rig.scena.add(g.gatto.gruppo);
    gattiRemoti.set(id, g);
  }
  return g;
}
function rimuoviGattoRemoto(id) {
  const g = gattiRemoti.get(id);
  if (g) { rig.scena.remove(g.gatto.gruppo); gattiRemoti.delete(id); }
}
function svuotaGattiRemoti() { for (const id of [...gattiRemoti.keys()]) rimuoviGattoRemoto(id); }

// ---- chat + membri --------------------------------------------------------------
function mioNome() { return lobby.ruolo === 'host' ? 'Host' : `Gatto ${(mioIdRete || 0) + 1}`; }
function nomeDi(id) { return id === 'h' ? 'Host' : `Gatto ${(typeof id === 'number' ? id : 0) + 1}`; }
function chatAggiungi(nome, testo, mio = false) {
  const log = document.getElementById('chatLog');
  const r = document.createElement('div');
  r.className = 'chat-riga' + (mio ? ' mia' : '');
  r.innerHTML = `<b>${nome}</b> ${testo.replace(/</g, '&lt;')}`;
  log.appendChild(r);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  if (!mio && !document.getElementById('stanza').classList.contains('aperto')) {
    hud.toast(`💬 ${nome}: ${testo.slice(0, 60)}`);
  }
}
function aggiornaMembri() {
  const box = document.getElementById('stanzaMembri');
  box.innerHTML = '';
  const voce = (nome, id = null) => {
    const r = document.createElement('div');
    r.className = 'membro';
    r.innerHTML = `<span>🐱 ${nome}</span>`;
    if (id !== null && lobby.ruolo === 'host') {
      const k = document.createElement('button');
      k.textContent = '✕';
      k.title = 'Butta fuori';
      k.addEventListener('click', () => lobby.chiudi(id));
      r.appendChild(k);
    }
    box.appendChild(r);
  };
  if (!lobby.connessa) { box.innerHTML = '<div class="stanza-hint">Da soli, per ora.</div>'; return; }
  voce(mioNome() + ' (tu)');
  if (lobby.ruolo === 'host') for (const id of lobby.membri) voce(nomeDi(id), id);
  else { voce('Host'); for (const id of gattiRemoti.keys()) if (id !== 'h') voce(nomeDi(id)); }
}
let posaTimer = 0;
let modalitaOspite = false;   // true = stai giocando NEL diorama dell'host
let officina = null;
let datiOfficina = { blocchi: [] };

/** Il TEMPO è dell'HOST: da ospite la modifica diventa una richiesta via rete
 *  (senza, il cielo dell'ospite litigava con l'orologio dell'host: flicker). */
function impostaTempoGioco(t) {
  if (lobby.connessa && lobby.ruolo === 'ospite') lobby.invia({ t: 'tempo', v: t });
  else ciclo.t = t;
}

/** Piazza il gatto su una colonna libera accanto a (px,py,pz) — l'ospite
 *  arriva DI FIANCO all'host, non in un punto a caso del mondo. */
function teletrasportaVicino(px, py, pz) {
  for (const [dx, dz] of [[1.4, 0], [0, 1.4], [-1.4, 0], [0, -1.4], [0, 0]]) {
    const x = Math.floor(px + dx), z = Math.floor(pz + dz);
    for (let y = Math.min(Math.floor(py) + 4, 60); y >= 0; y--) {
      const t = mondo.tipo(x, y, z);
      if (!t) continue;
      // serve TERRA sotto i piedi e ARIA sopra: l'acqua non è un appoggio
      // (mondo.pieno contava anche il mare: l'ospite arrivava a mollo)
      if (!defDi(t).acqua && !mondo.tipo(x, y + 1, z) && !mondo.tipo(x, y + 2, z)) {
        controller.spawn([x, y + 1, z]);
        rig.bersaglio.copy(controller.pos);
        return true;
      }
      break;
    }
  }
  return false;
}

function applicaEventoRemoto(e) {
  if (!e || !Array.isArray(e.cella) || e.cella.length !== 3 || e.cella.some((n) => !Number.isFinite(n))) return;
  const [x, y, z] = e.cella;
  if (e.tipo === 'metti' && typeof e.blocco === 'string' && defDi(e.blocco)) {
    mondo.metti(x, y, z, e.blocco, true);
  } else if (e.tipo === 'togli') {
    mondo.togli(x, y, z, true);
  } else if (e.tipo === 'furniPiazza' && FURNI[e.defId]) {
    arredo.piazza(e.defId, e.cella, e.rot || 0, true);
  } else if (e.tipo === 'furniRimuovi') {
    const ist = mondo.furniIn(x, y, z);
    if (ist) arredo.rimuovi(ist, true);
  } else if (e.tipo === 'furniStato') {
    const ist = mondo.furniIn(x, y, z);
    if (ist && ist.def.stati && Number.isInteger(e.stato)) {
      ist.manuale = true;
      arredo.setStato(ist, e.stato % ist.def.stati.length);
    }
  } else {
    return;
  }
  gestisciLuceBlocco(e);
  gestisciParticelleBlocco(e);
  sim.pianificaAttorno(e.cella);
  segnaSalvataggio();
}

function arrivoBenvenuto(m) {
  try {
    salvaSnapshot(false);                           // il TUO diorama, al sicuro
    if (m.tuoId !== undefined) mioIdRete = m.tuoId; // il tuo nome in lobby/chat
    registraDaRete(m.officina);                     // i blocchi Officina dell'host, PRIMA del mondo
    applica(m.dati, mondo, arredo, ciclo);          // il mondo dell'host (inventario resta tuo)
    mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();
    modalitaOspite = true;                          // da ospite NIENTE autosave: il mondo non è tuo
    if (!(Array.isArray(m.posa) && teletrasportaVicino(m.posa[0], m.posa[1], m.posa[2]))) respawn();
    hud.toast('🏠 Sei OSPITE nel diorama dell’amico, proprio accanto a lui — il tuo è al sicuro');
  } catch { hud.toast('Snapshot non valido 😿'); }
}

let _pezziBenv = null;
lobby.onMessaggio = (m, daId) => {
  if (m.t === 'benvenuto' && lobby.ruolo === 'ospite' && m.dati) {
    arrivoBenvenuto(m);                             // retro-compat: snapshot piccolo in un colpo
  } else if (m.t === 'benvPezzo' && lobby.ruolo === 'ospite' && typeof m.s === 'string') {
    // snapshot A PEZZI (i mondi veri superano il max-message-size SCTP)
    if (!_pezziBenv || _pezziBenv.tot !== m.tot) _pezziBenv = { tot: m.tot, parti: new Array(m.tot).fill(null) };
    if (Number.isInteger(m.i) && m.i >= 0 && m.i < m.tot) _pezziBenv.parti[m.i] = m.s;
    if (_pezziBenv.parti.every((p) => p !== null)) {
      const json = _pezziBenv.parti.join('');
      _pezziBenv = null;
      try { arrivoBenvenuto(JSON.parse(json)); }
      catch { hud.toast('Snapshot non valido 😿'); }
    }
  } else if (m.t === 'evento') {
    applicaEventoRemoto(m.e);
    if (lobby.ruolo === 'host') lobby.invia(m, daId);          // relay agli altri
  } else if (m.t === 'tempo' && lobby.ruolo === 'host' && typeof m.v === 'number') {
    ciclo.t = Math.min(1, Math.max(0, m.v));          // richiesta dell'ospite: l'orologio resta MIO
  } else if (m.t === 'chat' && typeof m.testo === 'string') {
    const nome = m.nome || nomeDi(m.id !== undefined ? m.id : daId);
    chatAggiungi(nome, m.testo.slice(0, 200));
    if (lobby.ruolo === 'host') lobby.invia({ ...m, nome }, daId);   // relay
  } else if (m.t === 'posa' && Array.isArray(m.p) && m.p.length === 3) {
    // chi è? host: il canale da cui arriva · ospite: l'id dentro al messaggio
    const id = lobby.ruolo === 'host' ? daId : (m.id !== undefined ? m.id : 'h');
    const g = gattoRemotoDi(id);
    if (!g.posa) g.pos.set(m.p[0], m.p[1], m.p[2]);
    g.posa = m;
    g.visto = performance.now();
    if (lobby.ruolo === 'host') lobby.invia({ ...m, id }, daId);     // relay agli altri
    if (lobby.ruolo === 'ospite' && id === 'h' && typeof m.tempo === 'number') ciclo.t = m.tempo;
  }
};

lobby.onStato = (s, id) => {
  const icone = { creazione: '🟡', 'in-attesa': '🟡', aperta: '🟢', chiusa: '⭘', errore: '🔴' };
  menuDebug.netStato(icone[s] || '⭘');
  const n = lobby.ruolo === 'host' ? lobby.membri.length : null;
  const pill = {
    creazione: '🟡 preparo…', 'in-attesa': '🟡 in attesa dell’amico…',
    aperta: lobby.ruolo === 'host' ? `🟢 ${n} ospite${n === 1 ? '' : 'i'} da te` : '🟢 a casa dell’amico',
    chiusa: '⭘ da soli', errore: '🔴 errore',
  };
  document.getElementById('stanzaStato').textContent = pill[s] || '🔴 da soli';
  aggiornaMembri();
  if (s === 'aperta') {
    apriFaseStanza(null);
    // chiaro CHI ospita: si gioca sempre nel diorama di chi ha creato la stanza
    if (lobby.ruolo === 'host') {
      hud.toast(`🟢 ${nomeDi(id)} sta arrivando nel TUO diorama!`);
      lobby.inviaGrandeA(id, 'benvenuto', {
        dati: serializza(mondo, arredo, ciclo),
        posa: [controller.pos.x, controller.pos.y, controller.pos.z],
        officina: datiOfficina.blocchi,      // i TUOI blocchi: l'ospite li vede
        tuoId: id,                           // così l'ospite sa chi è (nome in chat)
      });
    } else {
      document.getElementById('stanza').classList.remove('aperto');
      hud.toast('🟢 Collegato! Vai a casa dell’amico…');
    }
  }
  if (s === 'chiusa' || (lobby.ruolo === 'host' && s === 'aperta')) {
    // qualcuno se n'è andato (o è arrivato): via i gatti orfani
    if (lobby.ruolo === 'host') {
      for (const gid of [...gattiRemoti.keys()]) if (!lobby.membri.includes(gid)) rimuoviGattoRemoto(gid);
    }
  }
  if (s === 'chiusa' && !lobby.connessa) {
    svuotaGattiRemoti();
    mioIdRete = null;
    if (modalitaOspite) {
      modalitaOspite = false;
      rimuoviDaRete();                                // via i blocchi Officina dell'host
      ripristinaSnapshot();                           // torni nel TUO diorama, intatto
      hud.toast('⭘ P2P chiuso — sei tornato nel TUO diorama');
    } else {
      hud.toast('P2P chiuso');
    }
  }
};
lobby.onMembri = () => aggiornaMembri();

// chat: invio con bottone o Invio
function chatManda() {
  const input = document.getElementById('chatTesto');
  const testo = input.value.trim();
  if (!testo || !lobby.connessa) { input.value = ''; return; }
  input.value = '';
  chatAggiungi(mioNome(), testo, true);
  lobby.invia({ t: 'chat', nome: mioNome(), testo });
}
document.getElementById('chatInvia').addEventListener('click', chatManda);
document.getElementById('chatTesto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); chatManda(); }
  e.stopPropagation();          // WASD nella chat non muove il gatto
});

document.getElementById('btnEsporta').addEventListener('click', () => {
  esportaFile(serializza(mondo, arredo, ciclo, inventario, { hotbar: hotbarIds }));
  hud.toast('Diorama esportato 💾');
});
const fileImporta = document.getElementById('fileImporta');
document.getElementById('btnImporta').addEventListener('click', () => fileImporta.click());
fileImporta.addEventListener('change', async () => {
  const file = fileImporta.files[0];
  if (!file) return;
  try {
    const dati = JSON.parse(await file.text());
    applica(dati, mondo, arredo, ciclo, inventario);
    if (Array.isArray(dati.hotbar)) { hotbarIds = dati.hotbar; ricostruisciHotbar(); }
    mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();
    respawn();
    hud.toast('Diorama importato 📂');
    segnaSalvataggio();
  } catch {
    hud.toast('File non valido 😿');
  }
  fileImporta.value = '';
});
document.getElementById('btnReset').addEventListener('click', () => {
  if (!confirm('Ricominciare con una nuova isola? Il diorama attuale verrà perso (salvalo prima come partita, se vuoi tenerlo).')) return;
  cancellaLocale();
  nuovaIsola();
  mesher.ricostruisciTutto(mondo);
  ricostruisciLuciBlocchi();
  ricostruisciBlocchiSpeciali();
  hud.toast('Nuova isola 🌱');
  hud.mostraAiuto(false);
});

// ---- SLOT di salvataggio (partite nominabili) -----------------------------------
function datiAttuali(nome) {
  return { ...serializza(mondo, arredo, ciclo, inventario, { hotbar: hotbarIds }), nome };
}
function disegnaSlot() {
  const lista = document.getElementById('slotLista');
  lista.innerHTML = '';
  for (const s of elencoSlot()) {
    const el = document.createElement('div');
    el.className = 'slot-voce';
    const data = new Date(s.quando || 0);
    const quando = isNaN(data) ? '' : data.toLocaleDateString('it') + ' ' + data.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<div class="slot-info"><b></b><small>${s.blocchi || 0} blocchi · ${quando}</small></div>`;
    el.querySelector('b').textContent = s.nome || 'Partita';
    const carica = document.createElement('button');
    carica.textContent = '▶'; carica.title = 'Carica questa partita';
    carica.addEventListener('click', () => caricaPartita(s.id, s.nome));
    const sovra = document.createElement('button');
    sovra.textContent = '💾'; sovra.title = 'Sovrascrivi con lo stato attuale';
    sovra.addEventListener('click', () => {
      if (!confirm(`Sovrascrivere «${s.nome}» con il diorama attuale?`)) return;
      salvaSlot(datiAttuali(s.nome), s.nome, s.id); disegnaSlot(); hud.toast('💾 Partita aggiornata');
    });
    const rinomina = document.createElement('button');
    rinomina.textContent = '✏️'; rinomina.title = 'Rinomina';
    rinomina.addEventListener('click', () => {
      const nome = prompt('Nuovo nome della partita:', s.nome);
      if (nome && nome.trim()) { rinominaSlot(s.id, nome.trim()); disegnaSlot(); }
    });
    const elimina = document.createElement('button');
    elimina.className = 'pericolo'; elimina.textContent = '🗑'; elimina.title = 'Elimina';
    elimina.addEventListener('click', () => {
      if (!confirm(`Eliminare la partita «${s.nome}»? Non si può annullare.`)) return;
      cancellaSlot(s.id); disegnaSlot(); hud.toast('🗑 Partita eliminata');
    });
    el.append(carica, sovra, rinomina, elimina);
    lista.appendChild(el);
  }
}
function caricaPartita(id, nome) {
  if (!confirm(`Caricare «${nome}»? Il diorama attuale verrà sostituito (salvalo prima, se vuoi tenerlo).`)) return;
  const dati = caricaSlot(id);
  if (!dati) { hud.toast('Partita non trovata 😿'); return; }
  try {
    applica(dati, mondo, arredo, ciclo, inventario);
    if (Array.isArray(dati.hotbar)) { hotbarIds = dati.hotbar; ricostruisciHotbar(); }
    mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();
    respawn();
    segnaSalvataggio();
    hud.toast(`▶ «${nome}» caricata`);
    document.getElementById('opzioni').classList.remove('aperto');
  } catch { hud.toast('Partita non valida 😿'); }
}
document.getElementById('btnSalvaSlot').addEventListener('click', () => {
  const nome = prompt('Nome della partita:', 'Partita ' + (elencoSlot().length + 1));
  if (!nome || !nome.trim()) return;
  if (salvaSlot(datiAttuali(nome.trim()), nome.trim())) { disegnaSlot(); hud.toast(`💾 «${nome.trim()}» salvata`); }
  else hud.toast('Memoria piena 😿 elimina qualche partita');
});

function respawn() {
  // colonna sicura: parte dallo spawn e cerca a spirale (regge anche i mondi procedurali)
  let cella = null;
  esterno:
  for (let r = 0; r <= 26; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of new Set([-r, r])) {
        const y = mondo.appoggioInColonna(SPAWN[0] + dx, SPAWN[2] + dz, 14, 34);
        if (y !== null) { cella = [SPAWN[0] + dx, y, SPAWN[2] + dz]; break esterno; }
      }
    }
    for (let dz = -r + 1; dz <= r - 1; dz++) {
      for (const dx of new Set([-r, r])) {
        const y = mondo.appoggioInColonna(SPAWN[0] + dx, SPAWN[2] + dz, 14, 34);
        if (y !== null) { cella = [SPAWN[0] + dx, y, SPAWN[2] + dz]; break esterno; }
      }
    }
  }
  controller.spawn(cella || [SPAWN[0], 10, SPAWN[2]]);
  rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
}

// ---- azioni del menu di debug (snapshot a due livelli) -------------------------

function salvaSnapshot(conToast = true) {
  const attuale = localStorage.getItem(CHIAVE_SNAPSHOT);
  if (attuale) localStorage.setItem(CHIAVE_SNAPSHOT_PREC, attuale);
  try {
    localStorage.setItem(CHIAVE_SNAPSHOT, JSON.stringify(serializza(mondo, arredo, ciclo, inventario, { hotbar: hotbarIds })));
    if (conToast) hud.toast('📸 Snapshot salvato');
  } catch {
    hud.toast('Snapshot troppo grande 😿');
  }
}

function ripristinaSnapshot() {
  const raw = localStorage.getItem(CHIAVE_SNAPSHOT);
  if (!raw) { hud.toast('Nessuno snapshot da ripristinare'); return; }
  try {
    const dati = JSON.parse(raw);
    applica(dati, mondo, arredo, ciclo, inventario);
    if (Array.isArray(dati.hotbar)) { hotbarIds = dati.hotbar; ricostruisciHotbar(); }
  } catch {
    hud.toast('Snapshot corrotto 😿');
    return;
  }
  mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();
  respawn();
  segnaSalvataggio();
  hud.toast('↩️ Snapshot ripristinato');
}

function nuovaIsola() {
  arredo.svuota();
  generaIsola(mondo);
  for (const f of ARREDO_INIZIALE) {
    if (arredo.puoiPiazzare(f.id, f.cella, f.rot).ok) arredo.piazza(f.id, f.cella, f.rot, true);
    else console.warn('[lantern] arredo iniziale non piazzabile:', f);
  }
  arredo.aggiornaNotte(ciclo.eNotte);
  respawn();
}

function cambiaStagione(chiave) {
  // transizione SMOOTH: l'erba scivola alla nuova palette nel loop
  // (ritintaErba, niente remesh); il fogliame cambia a metà strada
  if (!avviaTransizione(chiave)) return;
  segnaSalvataggio();
  hud.toast(`${STAGIONI[chiave].emoji} Arriva ${STAGIONI[chiave].nome.toLowerCase()}…`);
}

const menuDebug = new MenuDebug({
  mondo, arredo, controller, ciclo, rig, mesher, hud, fuochiFatui,
  azioni: {
    respawn: () => { respawn(); hud.toast('🏠 A casa'); },
    stagione: (chiave) => cambiaStagione(chiave),
    snapshot: () => salvaSnapshot(),
    ripristina: () => ripristinaSnapshot(),
    salaProve: () => conCaricamento('🧪 Preparo la sala prove…', () => {
      salvaSnapshot(false);
      menuDebug.mostraZone(null);
      arredo.svuota();
      const r = generaMostra(mondo);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      ricostruisciBlocchiSpeciali();
      // spawn vuole una CELLA [x,y,z], non un Vector3 (passarne uno dava NaN)
      controller.spawn([r.spawn.x, r.spawn.y, r.spawn.z]);
      rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      segnaSalvataggio();
      hud.toast(`🧪 Sala prove: ${r.campioni} campioni in ${r.file} file — il mondo di prima è nello snapshot`, 4200);
    }),
    // Scena di collaudo: le sei zone dei fenomeni di luce/acqua, tutte a
    // distanza di camminata. Come la sala prove, salva prima uno snapshot.
    collaudo: () => conCaricamento('🔦 Preparo la scena di collaudo…', () => {
      salvaSnapshot(false);
      arredo.svuota();
      const r = generaCollaudo(mondo);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      ricostruisciBlocchiSpeciali();
      for (const c of r.acqua) sim.pianificaAttorno(c);   // sveglia la cascata
      controller.spawn(r.spawn);
      rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      segnaSalvataggio();
      // le zone diventano BOTTONI: la tabella dei teletrasporti era documentata
      // nell'intestazione di collaudo.js, restituita in r.zone… e ignorata, cioè
      // raggiungibile solo digitando controller.spawn([…]) in console
      menuDebug.mostraZone(r.zone, (piedi) => {
        controller.spawn(piedi);
        rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      });
      hud.toast(`🔦 Scena di collaudo: ${r.totale.toLocaleString('it')} blocchi in 6 zone — i bottoni delle zone sono nel menu debug`, 4200);
      return r;
    }),
    // Mondo «test delle luci»: sei zone dedicate SOLO all'illuminazione (le due
    // classi di luce, l'occlusione nei casi difficili, la mescolanza dei colori,
    // i fuochi fatui e il tetto delle 48 piastrelle). Vedi world/testLuci.js.
    testLuci: () => conCaricamento('💡 Preparo il test delle luci…', () => {
      salvaSnapshot(false);
      arredo.svuota();
      const r = generaTestLuci(mondo);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      ricostruisciBlocchiSpeciali();
      controller.spawn(r.spawn);
      rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      segnaSalvataggio();
      menuDebug.mostraZone(r.zone, (piedi) => {
        controller.spawn(piedi);
        rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      });
      // IL NUMERO DELLE PESANTI VA DETTO SUBITO — e adesso dice una cosa diversa.
      // Fino alla riscrittura questa riga avvisava che 8 lampade restavano senza
      // piastrella nell'atlante (era voluto: la zona 5 serviva a vedere il tetto
      // finire). Il tetto non c'è più: le pesanti fanno ombra TUTTE, e il numero
      // qui serve solo a dire quanto pesa la scena che si sta guardando.
      const kb = (memoriaVoxel() / 1024).toFixed(0);
      hud.toast(`💡 Test luci: ${r.totale.toLocaleString('it')} blocchi · ${r.lampade.pesanti} lampade pesanti (tutte con ombra, nessun tetto) · ${r.lampade.leggere} leggere · griglia dei muri ${kb} KB`, 7000);
      return r;
    }),
    isolaDemo: () => conCaricamento('🏝 Nuova isola…', () => {
      salvaSnapshot(false);
      menuDebug.mostraZone(null);
      nuovaIsola();
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      ricostruisciBlocchiSpeciali();
      segnaSalvataggio();
      hud.toast('🏝 Isola demo — il mondo di prima è nello snapshot');
    }),
    arcipelago: (seme, est) => conCaricamento('🌌 Genero l’arcipelago…', () => {
      salvaSnapshot(false);
      menuDebug.mostraZone(null);
      arredo.svuota();
      generaArcipelago(mondo, seme, est);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      ricostruisciBlocchiSpeciali();
      respawn();
      segnaSalvataggio();
      hud.toast(`🌌 Seme ${seme}: ${mondo.contaBlocchi} blocchi — snapshot salvato`);
    }),
    openWorld: (seme, est) => conCaricamento('⛰ Genero l’open world…', () => {
      salvaSnapshot(false);
      menuDebug.mostraZone(null);
      arredo.svuota();
      const { alberi, lampioni, fiume } = generaOpenWorld(mondo, seme, est);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      ricostruisciBlocchiSpeciali();
      for (const c of alberi) if (arredo.puoiPiazzare('albero', c, 0).ok) arredo.piazza('albero', c, 0, true);
      for (const c of lampioni) if (arredo.puoiPiazzare('lampione', c, 0).ok) arredo.piazza('lampione', c, 0, true);
      for (const c of fiume) sim.pianificaAttorno(c);   // sveglia le cascate
      arredo.aggiornaNotte(ciclo.eNotte);
      respawn();
      segnaSalvataggio();
      hud.toast(`⛰ ${mondo.contaBlocchi.toLocaleString('it')} blocchi — snapshot salvato`);
    }),
    fog: (f) => { ciclo.fattoreFog = f; hud.toast(`🌫 Fog ×${f}`); },
    tiltShift: (q) => { qManuale = true; rig.impostaTiltShift(q); hud.toast(q > 0 ? `🎞 Tilt‑shift ${q} (qualità manuale)` : 'Tilt‑shift spento'); },
    riflessi: () => {
      riflessiUtente = !riflessiUtente;
      applicaQualita();
      hud.toast(riflessiUtente ? '✨ Riflessi acqua accesi' : 'Riflessi acqua spenti');
      return riflessiUtente;
    },
    pioggia: () => {
      meteo.manuale();                  // tocchi tu: il meteo auto si fa da parte
      pioggia.imposta(!pioggia.attiva);
      hud.toast(pioggia.attiva ? '🌧 Piove sul diorama' : '☀️ Torna il sereno');
      return pioggia.attiva;
    },
    // AR con camera FINTA che inquadra il marker: se il diorama appare,
    // motore di tracking e marker compilato funzionano SU QUESTA macchina —
    // resta solo la qualità della ripresa vera (stampa, luce, angolo)
    arProva: async () => {
      if (modalitaAR.attiva) { modalitaAR.ferma(); return; }
      try {
        const risp = await fetch('./AR-Marker/marker-lanterna.png');
        const marker = await createImageBitmap(await risp.blob());
        const cv = document.createElement('canvas');
        cv.width = 1280; cv.height = 720;
        const c2 = cv.getContext('2d');
        // camera finta MANOVRABILE: destro trascina = sposta/inclina il
        // foglio, rotella = avvicina/allontana — per provare l'AR come se
        // muovessi il telefono
        let mx = 640, my = 360, mrot = 0, mlato = 520;
        const disegna = () => {
          c2.fillStyle = '#9aa0a8';
          c2.fillRect(0, 0, 1280, 720);
          c2.save();
          c2.translate(mx, my);
          c2.rotate(mrot);
          c2.drawImage(marker, -mlato / 2, -mlato / 2, mlato, mlato);
          c2.restore();
        };
        const suMuovi = (e) => {
          if (!modalitaAR.attiva || !(e.buttons & 2)) return;
          if (e.shiftKey) mrot += e.movementX * 0.004;
          else { mx += e.movementX; my += e.movementY; }
        };
        const suRotella = (e) => {
          if (!modalitaAR.attiva) return;
          mlato = Math.max(180, Math.min(700, mlato * Math.exp(-e.deltaY * 0.001)));
        };
        addEventListener('pointermove', suMuovi);
        addEventListener('wheel', suRotella, { passive: true });
        const timer = setInterval(disegna, 33);
        const stream = cv.captureStream(30);
        const gumVera = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async () => stream;
        try { await modalitaAR.avvia(controller.pos); }
        finally { navigator.mediaDevices.getUserMedia = gumVera; }
        hud.toast('🧪 Prova: tasto destro trascina il foglio (Shift = inclina), rotella = avvicina', 5200);
        const spegni = setInterval(() => {
          if (!modalitaAR.attiva) {
            clearInterval(timer); clearInterval(spegni);
            removeEventListener('pointermove', suMuovi);
            removeEventListener('wheel', suRotella);
          }
        }, 1000);
      } catch (e) { hud.toast('Prova AR fallita 😿 ' + (e.message || e)); }
    },
    infinito: () => {
      inventario.impostaInfinito(!inventario.infinito);
      hud.toast(inventario.infinito ? '∞ Risorse infinite' : '🎒 Risorse contate');
      return inventario.infinito;
    },
    netCrea: async () => {
      try {
        menuDebug.setNet('A', await lobby.creaOfferta());
        hud.toast('🎬 Offerta pronta: copiala e mandala all’amico');
      } catch (err) { hud.toast('Errore WebRTC 😿'); console.warn(err); }
    },
    netGenera: async (offerta) => {
      if (!offerta.trim()) { hud.toast('Incolla prima il codice OFFERTA'); return; }
      try {
        menuDebug.setNet('B', await lobby.rispondi(offerta));
        hud.toast('🚪 Risposta pronta: mandala all’host');
      } catch (err) { hud.toast('Codice offerta non valido 😿'); console.warn(err); }
    },
    netConferma: async (risposta) => {
      if (!risposta.trim()) { hud.toast('Incolla prima il codice RISPOSTA'); return; }
      try { await lobby.completa(risposta); }
      catch (err) { hud.toast('Codice risposta non valido 😿'); console.warn(err); }
    },
  },
});
// il pannello debug VIVE nella scheda Avanzate del menu unico (via la doppia
// finestra che confondeva): 🐞 e F3 aprono il menu già sulla scheda giusta
document.getElementById('paginaAvanzate').appendChild(menuDebug.el);
menuDebug.toggle(true);

// ---- avvio ----------------------------------------------------------------------

const elCaricamento = document.getElementById('caricamento');

// CANE DA GUARDIA DELL'AVVIO: se il gioco non parte, la lanterna resta accesa
// per sempre e non si capisce dove si sia impuntato (segnalato su Chromebook).
// Qui si tiene traccia dell'ultimo passo e, dopo un po', lo si SCRIVE a schermo.
let _passoAvvio = 'avvio';
function passoAvvio(testo) {
  _passoAvvio = testo;
  const box = elCaricamento.querySelector('div');
  if (box && box.lastChild) box.lastChild.textContent = testo;
}
const _vigile = [
  setTimeout(() => passoAvvio(`${_passoAvvio} — ci sta mettendo un po'…`), 12000),
  setTimeout(() => {
    if (elCaricamento.classList.contains('via')) return;
    passoAvvio(`Bloccato su: ${_passoAvvio}. Prova a ricaricare (Ctrl+Maiusc+R).`);
  }, 30000),
];
function fineVigile() { for (const t of _vigile) clearTimeout(t); }

async function avvia() {
  passoAvvio('Carico i modelli…');
  await caricaModelli(FURNI, (nome) => passoAvvio(`Sistemo ${nome.toLowerCase()}…`));

  // caricamento salvataggio A PROVA DI ERRORE: se il diorama salvato è corrotto
  // o incompatibile, si riparte da un'isola nuova SENZA cancellare il salvataggio
  // (resta recuperabile con 📂 Importa da un eventuale export), invece di
  // impedire l'avvio del gioco.
  // i blocchi dell'Officina PRIMA del mondo: i salvataggi possono usarli
  datiOfficina = caricaOfficina();
  officina = new Officina({
    dati: datiOfficina,
    toast: (m) => hud.toast(m),
    onCambio: (remesh = false) => {
      ricostruisciHotbar();
      svuotaGhostBlocchi();
      if (remesh) {                       // colori/luci baked: si rifà il mondo LIVE
        conCaricamento('🛠 Applico le modifiche…', () => {
          mesher.ricostruisciTutto(mondo);
          ricostruisciLuciBlocchi();
          ricostruisciBlocchiSpeciali();
        });
      }
    },
  });
  document.getElementById('btnOfficina').addEventListener('click', () => { audio.sfx('apri'); chiudiPannelli('officina'); officina.apri(); });

  const salvato = caricaLocale();
  let caricatoOk = false;
  if (salvato) {
    try {
      applica(salvato, mondo, arredo, ciclo, inventario);
      if (Array.isArray(salvato.hotbar)) hotbarIds = salvato.hotbar;
      arredo.aggiornaNotte(ciclo.eNotte);
      respawn();
      caricatoOk = true;
    } catch (e) {
      console.warn('[lantern] salvataggio non caricabile, riparto da isola nuova', e);
      try { localStorage.setItem('lantern.diorama.rotto', JSON.stringify(salvato)); } catch { /* pazienza */ }
      arredo.svuota(); mondo.svuota();
      nuovaIsola();
      setTimeout(() => hud.toast('⚠️ Salvataggio non caricato: isola nuova (il vecchio è in memoria)'), 600);
    }
  }
  if (!salvato) nuovaIsola();
  sim.bonifica();   // via l'acqua caduta nel vuoto nei vecchi salvataggi
  sincronizzaPalle();

  ricostruisciHotbar();
  impostaSelezione(0);
  impostaModo(false);
  applicaOpzioni(false);     // fog/distanza/effetti salvati dall'utente (⚙️)

  // debug in console
  window.LANTERN = { mondo, arredo, controller, ciclo, rig, gatto, nuvole, scavo, FURNI, BLOCCHI, mesher, aggiornaLuci, creaLuceLeggera, spostaLuce, rimuoviLuce, generaArcipelago, generaOpenWorld, generaCollaudo, generaTestLuci, inventario, sim, lobby, menuDebug, rompiBlocco, riflesso, pioggia, particelle, palle, sincronizzaPalle, schiumaTop, aggiornaSchiumaAcqua, meteo, modalitaAR, modalitaXR, particelleBlocchi, luciBlocchi, nidiFatui, fuochiFatui, statLuci, hud, cadenza, opzioni, uniformi: uniformiCondivise() };

  // accelerazione hardware: avvisa se il WebView disegna in SOFTWARE (fps bassi)
  if (rig.software) {
    setTimeout(() => bannerErrore('Grafica in SOFTWARE (' + rig.gpu + '): fps bassi. Attiva l’accelerazione hardware del dispositivo.'), 2500);
  }
  console.log('[lantern] GPU:', rig.gpu, rig.software ? '(SOFTWARE!)' : '(hardware ok)');

  // primo frame sincrono: la scena esiste anche se il RAF è sospeso (tab nascosta)
  ciclo.aggiorna(0);
  mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();
  gatto.aggiorna(0, controller.pos, 0, 0, true);
  nuvole.aggiorna(0);
  aggiornaLuci(controller.pos);
  rig.aggiorna();
  rig.render();

  requestAnimationFrame(loop);
  fineVigile();                                   // partito: niente più diagnosi
  setTimeout(() => elCaricamento.classList.add('via'), 250);
  // le texture dei FBX arrivano async: se il salvataggio non era in primavera,
  // il fogliame va ritinto quando le immagini sono pronte
  if (stagioneCorrente() !== 'primavera') setTimeout(() => ritingiFogliame(), 1200);
}

// ---- loop -----------------------------------------------------------------------

let prima = performance.now();
let contFrame = 0, contTempo = 0;
let acquaTimer = 0;
let _tStagione = 0;
let eraInAcqua = false;
let _tPasso = 0;
let _tPalle = 0;
let _tPartFlussi = 0, _tPartAnelli = 0;
const _ombrePg = [];
const _dimBuffer = new THREE.Vector2();

/** Spruzzo di goccioline (tuffi, secchiate): la schiuma la fa lo shader. */
function spruzzo(x, y, z, quante) {
  for (let k = 0; k < quante; k++) {
    const a = Math.random() * Math.PI * 2, vr = 0.6 + Math.random();
    particelle.emetti(x, y, z, Math.cos(a) * vr, 1.6 + Math.random() * 1.2, Math.sin(a) * vr, 0.5, 0.6, 0);
  }
}

/** La schiuma attorno agli oggetti è la SILHOUETTE della geometria che buca il
 *  pelo (schiumaTop.js): qui si tiene solo aggiornato il LAYER dedicato sugli
 *  oggetti dinamici (nuovi furni/palle) e i cerchi degli impatti di cascata. */
const _schiumaCerchi = [];
function aggiornaSchiumaAcqua() {
  arredo.radice.traverse((o) => o.layers.enable(LAYER_SCHIUMA));
  gatto.gruppo.traverse((o) => o.layers.enable(LAYER_SCHIUMA));
  for (const g of gattiRemoti.values()) g.gatto.gruppo.traverse((o) => o.layers.enable(LAYER_SCHIUMA));
  for (const p of palle.values()) p.mesh.layers.enable(LAYER_SCHIUMA);

  // UN SOLO ANELLO PER COLONNA. Il mesher segna un impatto per ogni cella che
  // ha fermato la caduta, e sopra una pozza sono sempre due (l'ultima cella che
  // cade e la sorgente che la riceve): due corone quasi concentriche si
  // fondevano in una banda spessa. Vince la più BASSA — il fondo del salto è lì.
  // Le bollicine no, quelle continuano a nascere da tutti gli impatti.
  const perColonna = new Map();
  for (const e of mesher.chunks.values()) {
    if (!e.impatti) continue;
    for (const im of e.impatti) {
      const k = im.x + ',' + im.z;
      const gia = perColonna.get(k);
      if (!gia || im.ys < gia.ys) perColonna.set(k, im);
    }
  }
  _schiumaCerchi.length = 0;
  for (const im of perColonna.values()) {
    // `ys` (dove sbatte), non `im.y` (la cima della colonna): l'anello va sul
    // pelo che riceve il colpo
    _schiumaCerchi.push({ x: im.x, y: im.ys, z: im.z, r: 0.65 + Math.min(0.55, im.h * 0.08) });
  }
  impostaSchiumaAcqua(_schiumaCerchi, rig.bersaglio);
}

/** Le palle seguono i furni Generatore: nate col furni, via col furni. */
function sincronizzaPalle() {
  const vive = new Set();
  for (const ist of arredo.istanze) {
    if (ist.defId !== 'generatore') continue;
    vive.add(ist);
    if (!palle.has(ist)) palle.set(ist, new Palla(rig.scena, ist.cella, FURNI.generatore.palla.raggioMax));
  }
  for (const [ist, p] of [...palle]) {
    if (!vive.has(ist)) { p.rimuovi(); palle.delete(ist); }
  }
}

/** Bollicine sugli impatti delle cascate (in SUPERFICIE, ∝ altezza del salto).
 *  Le correnti sono scie nello shader; niente puntini vaganti. */
function aggiornaParticellariAcqua(dt) {
  _tPartFlussi -= dt;
  if (_tPartFlussi > 0) return;
  _tPartFlussi = 0.11;
  for (const e of mesher.chunks.values()) {
    if (!e.impatti) continue;
    for (const im of e.impatti) {
      const ddx = im.x - rig.bersaglio.x, ddz = im.z - rig.bersaglio.z;
      if (ddx * ddx + ddz * ddz > 30 * 30) continue;
      const n = 1 + Math.min(3, Math.round(im.h * 0.4));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = 0.12 + Math.random() * 0.3;
        particelle.emetti(
          im.x + Math.cos(a) * r, im.y, im.z + Math.sin(a) * r,
          Math.cos(a) * (0.4 + im.h * 0.05), 0.8 + im.h * 0.12 + Math.random() * 0.5, Math.sin(a) * (0.4 + im.h * 0.05),
          0.4 + Math.min(0.4, im.h * 0.04), 0.55 + Math.min(0.7, im.h * 0.07), 0,
        );
      }
    }
  }
}
const _fuocoGatto = new THREE.Vector3();
const _seguiV = new THREE.Vector3();
const _posaRemotaV = new THREE.Vector3();

// ---- qualità adattiva: se gli fps crollano, si scala giù da soli --------------
// Livello 0 = massimo. Salendo: prima via i RIFLESSI (il costo più alto), poi
// il tilt-shift, poi la risoluzione. Su mobile si parte già senza entrambi.
const LIVELLI_Q = rig.mobile ? [
  { tilt: 0, rifl: false, scala: 1 },
  { tilt: 0, rifl: false, scala: 0.82 },
  { tilt: 0, rifl: false, scala: 0.66 },
] : [
  { tilt: 2.2, rifl: true, scala: 1 },
  { tilt: 2.2, rifl: false, scala: 1 },
  { tilt: 0, rifl: false, scala: 0.82 },
  { tilt: 0, rifl: false, scala: 0.66 },
];
let qLivello = 0;
let qManuale = false;        // qualità auto spenta: comandano le Impostazioni
let riflessiUtente = true;

// ---- Impostazioni utente (⚙️): persistenti, applicate subito -------------------
const OPZ_CHIAVE = 'lantern.opzioni.v1';
const OPZ_DEFAULT = { fog: 0.55, dist: 700, riflessi: !rig.mobile, tilt: !rig.mobile, autoQ: true, luceCotta: true, cameraFantasma: false, scala: 1, riflForza: 1, tiltQ: 2.2, meteoAuto: true, arRot: 0, arScala: 1, arEspo: 0.5, arFuoco: null, comandiTouch: rig.mobile, fpsMax: 0, vol: 0.6, muto: false, posa: 'davanti', durezza: 'normale' };
const opzioni = Object.assign({}, OPZ_DEFAULT, JSON.parse(localStorage.getItem(OPZ_CHIAVE) || '{}'));

// preset grafici: un tocco e la macchina va — comodi per testare
const PRESET_GRAFICA = {
  bassa: { scala: 0.66, riflessi: false, tilt: false, tiltQ: 0.8, riflForza: 0.6, dist: 250, fog: 0.9, autoQ: true },
  media: { scala: 0.85, riflessi: false, tilt: true, tiltQ: 1.6, riflForza: 0.8, dist: 450, fog: 0.7, autoQ: true },
  alta: { scala: 1, riflessi: true, tilt: true, tiltQ: 2.2, riflForza: 1, dist: 700, fog: 0.55, autoQ: true },
  ultra: { scala: 1, riflessi: true, tilt: true, tiltQ: 2.6, riflForza: 1.2, dist: 900, fog: 0.4, autoQ: false },
};

let _riflDim = '';
function applicaQualita() {
  const q = LIVELLI_Q[qLivello];
  rig.impostaTiltShift(qManuale ? (opzioni.tilt ? opzioni.tiltQ : 0) : Math.min(q.tilt, opzioni.tiltQ || 2.2));
  rig.setScalaRender(qManuale ? opzioni.scala : Math.min(q.scala, opzioni.scala));
  // su mobile i riflessi partono spenti (default opzioni) ma se l'utente li
  // ACCENDE valgono anche lì: niente più divieto assoluto
  riflesso.attivo = (qManuale ? true : q.rifl) && riflessiUtente;
  // ridimensionare rifà i buffer del riflesso = un frame nero: farlo SOLO se
  // le misure sono davvero cambiate, non a ogni passaggio di qui
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), pr = rig.renderer.getPixelRatio();
  const firma = `${w}x${h}@${pr.toFixed(3)}`;
  if (firma !== _riflDim) { _riflDim = firma; riflesso.dimensiona(w, h, pr); }
}

function applicaOpzioni(salva = true) {
  ciclo.fattoreFog = opzioni.fog;
  rig.camera.far = opzioni.dist;
  rig.camera.updateProjectionMatrix();
  rig.fantasma = opzioni.cameraFantasma;
  meteo.attivaAuto(opzioni.meteoAuto !== false);
  comandiTouch.mostra(!!opzioni.comandiTouch);
  document.body.classList.toggle('comandi-touch', !!opzioni.comandiTouch);  // sposta la GUI per non sovrapporsi
  audio.setVolume(opzioni.vol ?? 0.6);
  audio.muto(!!opzioni.muto);
  // bolla del bersaglio: riempita una volta sola (POSE vive più in alto, e qui
  // `opzioni` esiste di sicuro), poi tenuta in pari con la posa scelta
  if (!ruotaPosa._riempita) {
    ruotaPosa.imposta([], null, POSE.map((p) => ({
      emoji: p.icona, nome: p.nome, fn: () => { impostaPosa(p.id); audio.sfx('ui'); },
    })));
    ruotaPosa._riempita = true;
  }
  bersaglio.posa = opzioni.posa || 'davanti';
  ruotaPosa.mostraIcona(posaCorrente().icona);
  scavo.impostaDurezza(opzioni.durezza || 'normale');
  // si mostra solo quando serve: in Costruisci e coi comandi a schermo
  document.body.classList.toggle('mostra-posa', !!opzioni.comandiTouch && costruisci);
  if (!opzioni.comandiTouch) input.asseVirtuale = null;    // spegnendo: ferma il gatto
  modalitaAR.impostaAssetto(opzioni.arRot, opzioni.arScala);
  modalitaXR.impostaAssetto(opzioni.arRot, opzioni.arScala);
  impostaForzaRiflesso(opzioni.riflForza);
  // OCCLUSIONE DELLE LUCI-SFERA: lo shader la spegne all'istante (una uniform),
  // ma spento il mesher può anche smettere di calcolare la griglia — e quello
  // richiede di rifare la mesh, una volta sola, solo quando l'interruttore
  // cambia davvero.
  // LA CHIAVE SALVATA SI CHIAMA ANCORA `luceCotta`, ed è voluto: sta dentro
  // `lantern.opzioni.v1` nel localStorage di chi gioca, e rinominarla vorrebbe
  // dire riportare l'interruttore al valore di fabbrica a tutti quelli che
  // l'avevano spento. Il nome è vecchio (veniva dai due canali di luce cotti nei
  // vertici, che non esistono più), il dato no.
  const occlusioneOra = opzioni.luceCotta !== false;
  impostaOcclusione(occlusioneOra);
  if (mesher.occlusioneAttiva !== occlusioneOra) {
    mesher.occlusioneAttiva = occlusioneOra;
    mesher.ricostruisciTutto(mondo);
  }
  riflessiUtente = opzioni.riflessi;
  qManuale = !opzioni.autoQ;
  if (!qManuale) qLivello = 0;
  applicaQualita();
  aggiornaUIOpzioni();
  if (salva) { try { localStorage.setItem(OPZ_CHIAVE, JSON.stringify(opzioni)); } catch { /* pazienza */ } }
}

function aggiornaUIOpzioni() {
  document.getElementById('opzFog').value = Math.round(opzioni.fog * 100);
  document.getElementById('valFog').textContent = opzioni.fog <= 0.01 ? 'nessuna' : `×${opzioni.fog.toFixed(2)}`;
  document.getElementById('opzDist').value = opzioni.dist;
  document.getElementById('valDist').textContent = `${opzioni.dist}`;
  document.getElementById('opzScala').value = Math.round(opzioni.scala * 100);
  document.getElementById('valScala').textContent = `${Math.round(opzioni.scala * 100)}%`;
  document.getElementById('opzRiflForza').value = Math.round(opzioni.riflForza * 100);
  document.getElementById('valRifl').textContent = `×${opzioni.riflForza.toFixed(1)}`;
  document.getElementById('opzTiltQ').value = Math.round(opzioni.tiltQ * 100);
  document.getElementById('valTiltQ').textContent = opzioni.tiltQ.toFixed(1);
  document.getElementById('opzArRot').value = opzioni.arRot;
  document.getElementById('valArRot').textContent = `${opzioni.arRot}°`;
  document.getElementById('opzArScala').value = Math.round(opzioni.arScala * 100);
  document.getElementById('valArScala').textContent = `${Math.round(opzioni.arScala * 100)}%`;
  document.getElementById('opzArEspo').value = Math.round(opzioni.arEspo * 100);
  document.getElementById('valArEspo').textContent = opzioni.arEspo === 0.5 ? 'auto' : opzioni.arEspo.toFixed(2);
  document.getElementById('opzArFuoco').value = opzioni.arFuoco === null ? 50 : Math.round(opzioni.arFuoco * 100);
  document.getElementById('valArFuoco').textContent = opzioni.arFuoco === null ? 'auto (2 tocchi)' : opzioni.arFuoco.toFixed(2);
  document.getElementById('opzRiflessi').classList.toggle('attivo', opzioni.riflessi);
  document.getElementById('opzLuce').classList.toggle('attivo', opzioni.luceCotta !== false);
  document.getElementById('opzTilt').classList.toggle('attivo', opzioni.tilt);
  document.getElementById('opzPioggia').classList.toggle('attivo', pioggia.attiva);
  document.getElementById('opzAutoQ').classList.toggle('attivo', opzioni.autoQ);
  document.getElementById('opzCamera').classList.toggle('attivo', opzioni.cameraFantasma);
  document.getElementById('opzTouch').classList.toggle('attivo', !!opzioni.comandiTouch);
  document.getElementById('opzMeteo').classList.toggle('attivo', opzioni.meteoAuto !== false);
  document.getElementById('opzVol').value = Math.round((opzioni.vol ?? 0.6) * 100);
  document.getElementById('valVol').textContent = opzioni.muto ? 'muto' : `${Math.round((opzioni.vol ?? 0.6) * 100)}%`;
  document.getElementById('opzMuto').classList.toggle('attivo', !!opzioni.muto);
  for (const b of document.querySelectorAll('.opz-fps [data-fps]')) {
    b.classList.toggle('attivo', Number(b.getAttribute('data-fps')) === (opzioni.fpsMax || 0));
  }
  for (const b of document.querySelectorAll('[data-durezza]')) {
    b.classList.toggle('attivo', b.getAttribute('data-durezza') === (opzioni.durezza || 'normale'));
  }
}
document.getElementById('opzCamera').addEventListener('click', () => { opzioni.cameraFantasma = !opzioni.cameraFantasma; applicaOpzioni(); });
document.getElementById('opzTouch').addEventListener('click', () => { opzioni.comandiTouch = !opzioni.comandiTouch; applicaOpzioni(); });
document.getElementById('opzVol').addEventListener('input', (e) => { opzioni.vol = e.target.value / 100; applicaOpzioni(); });
document.getElementById('opzMuto').addEventListener('click', () => { opzioni.muto = !opzioni.muto; applicaOpzioni(); });

// ---- menu a SCHEDE + preset + reset -------------------------------------------
function apriMenu(scheda = null) {
  chiudiPannelli('menu');
  document.getElementById('opzioni').classList.add('aperto');
  if (scheda) {
    for (const b of document.querySelectorAll('.opz-scheda')) {
      b.classList.toggle('attivo', b.getAttribute('data-scheda') === scheda);
    }
    for (const p of document.querySelectorAll('.opz-pagina')) {
      p.classList.toggle('attivo', p.getAttribute('data-pagina') === scheda);
    }
    if (scheda === 'avanzate') menuDebug.toggle(true);
  }
  disegnaSlot();          // tiene aggiornata la lista delle partite salvate
}
for (const b of document.querySelectorAll('.opz-scheda')) {
  b.addEventListener('click', () => { audio.sfx('ui'); apriMenu(b.getAttribute('data-scheda')); });
}
for (const b of document.querySelectorAll('.opz-fps [data-fps]')) {
  b.addEventListener('click', () => { opzioni.fpsMax = Number(b.getAttribute('data-fps')); applicaOpzioni(); });
}
for (const b of document.querySelectorAll('[data-durezza]')) {
  b.addEventListener('click', () => {
    opzioni.durezza = b.getAttribute('data-durezza');
    applicaOpzioni();
    hud.toast(`⛏ Resistenza: ${DUREZZE[opzioni.durezza].nome}`);
  });
}
for (const [nome, valori] of Object.entries(PRESET_GRAFICA)) {
  const id = 'pre' + nome[0].toUpperCase() + nome.slice(1);
  document.getElementById(id).addEventListener('click', () => {
    Object.assign(opzioni, valori);
    qManuale = !opzioni.autoQ;
    applicaOpzioni();
    hud.toast(`🖼 Grafica «${nome}» applicata`);
  });
}
document.getElementById('opzResetTutto').addEventListener('click', () => {
  Object.assign(opzioni, OPZ_DEFAULT);
  localStorage.removeItem(OPZ_CHIAVE);
  applicaOpzioni(false);
  hud.toast('♻️ Impostazioni di fabbrica (il diorama è intatto)');
});
document.getElementById('opzArProva').addEventListener('click', () => {
  document.getElementById('opzioni').classList.remove('aperto');
  menuDebug.azioni.arProva();
});
// visore del marker AR: sempre la versione giusta, senza passarsi file
document.getElementById('opzMarker').addEventListener('click', () => document.getElementById('markerView').classList.add('aperto'));
document.getElementById('markerView').addEventListener('click', () => document.getElementById('markerView').classList.remove('aperto'));
// ---- AR sul marker: stesso gioco, visto attraverso la camera ----
modalitaAR.onStato = (t) => hud.toast(t, 3200);
// ---- AR AVANZATA (WebXR, senza marker): solo dove il dispositivo la offre ----
modalitaXR.onStato = (t, fine) => hud.toast(t, fine ? 3200 : 5200);
modalitaXR.onFine = () => {
  rig.renderer.setAnimationLoop(null);           // si torna al rAF di pagina
  document.getElementById('opzXR').classList.remove('attivo');
};
// il bottone si vede SEMPRE: se il dispositivo non ha WebXR, spiega perché
let xrSupportata = false;
ModalitaXR.disponibile().then((ok) => { xrSupportata = ok; });
modalitaXR.onAssetto = (rot, scala) => {
  opzioni.arRot = rot; opzioni.arScala = scala;
  applicaOpzioni();
};
document.getElementById('opzXR').addEventListener('click', async () => {
  const btn = document.getElementById('opzXR');
  if (modalitaXR.attiva) { modalitaXR.ferma(); return; }
  if (!xrSupportata) {
    xrSupportata = await ModalitaXR.disponibile();   // ricontrolla al volo
    if (!xrSupportata) {
      hud.toast('🪄 Qui WebXR/ARCore non c’è: sul telefono apri con Chrome (o installa "Google Play Services per AR"). Resta la modalità marker 📷', 6500);
      return;
    }
  }
  if (modalitaAR.attiva) modalitaAR.ferma();     // una modalità AR alla volta
  creature.svuota();
  fuochiFatui.svuota();   // in AR il mondo trasloca in un pivot scalato: le luci in volo vanno spente
  const ok = await modalitaXR.avvia(controller.pos);
  if (ok) rig.renderer.setAnimationLoop((t, frame) => passo(t, frame));
  btn.classList.toggle('attivo', ok);
});
document.getElementById('opzAR').addEventListener('click', async () => {
  const btn = document.getElementById('opzAR');
  if (modalitaAR.attiva) {
    modalitaAR.ferma();
    btn.classList.remove('attivo');
    return;
  }
  if (!modalitaAR.disponibile) {
    hud.toast('Qui non c’è una camera 😿 — prova dal telefono (o dall’APK)');
    return;
  }
  document.getElementById('opzioni').classList.remove('aperto');
  creature.svuota();
  fuochiFatui.svuota();   // in AR il mondo trasloca in un pivot scalato: le luci in volo vanno spente
  const ok = await conCaricamento('📷 Avvio l’AR… (camera + tracking)', () => modalitaAR.avvia(controller.pos));
  btn.classList.toggle('attivo', ok);
  if (ok && opzioni.arEspo !== 0.5) modalitaAR.regolaEsposizione(opzioni.arEspo);
});

document.getElementById('btnOpzioni').addEventListener('click', () => {
  const el = document.getElementById('opzioni');
  if (el.classList.contains('aperto')) { audio.sfx('chiudi'); el.classList.remove('aperto'); return; }
  audio.sfx('apri');
  apriMenu();                 // chiude gli altri pannelli, mai sovrapposti
  aggiornaUIOpzioni();
});
document.getElementById('opzioniChiudi').addEventListener('click', () => { audio.sfx('chiudi'); document.getElementById('opzioni').classList.remove('aperto'); });
document.getElementById('opzFog').addEventListener('input', (e) => { opzioni.fog = e.target.value / 100; applicaOpzioni(); });
document.getElementById('opzDist').addEventListener('input', (e) => { opzioni.dist = Number(e.target.value); applicaOpzioni(); });
document.getElementById('opzScala').addEventListener('input', (e) => { opzioni.scala = e.target.value / 100; applicaOpzioni(); });
document.getElementById('opzRiflForza').addEventListener('input', (e) => { opzioni.riflForza = e.target.value / 100; applicaOpzioni(); });
document.getElementById('opzTiltQ').addEventListener('input', (e) => { opzioni.tiltQ = e.target.value / 100; applicaOpzioni(); });
document.getElementById('opzArRot').addEventListener('input', (e) => { opzioni.arRot = Number(e.target.value); applicaOpzioni(); });
document.getElementById('opzArScala').addEventListener('input', (e) => { opzioni.arScala = e.target.value / 100; applicaOpzioni(); });
document.getElementById('opzArEspo').addEventListener('change', async (e) => {
  opzioni.arEspo = e.target.value / 100;
  applicaOpzioni();
  if (modalitaAR.attiva) hud.toast('💡 ' + await modalitaAR.regolaEsposizione(opzioni.arEspo));
});
document.getElementById('opzArFuoco').addEventListener('change', async (e) => {
  opzioni.arFuoco = e.target.value / 100;
  applicaOpzioni();
  if (modalitaAR.attiva) hud.toast('🔍 ' + await modalitaAR.regolaFuoco(opzioni.arFuoco));
});
document.getElementById('opzArFuoco').addEventListener('dblclick', async () => {
  opzioni.arFuoco = null;
  applicaOpzioni();
  if (modalitaAR.attiva) hud.toast('🔍 ' + await modalitaAR.regolaFuoco(null));
});
document.getElementById('opzRiflessi').addEventListener('click', () => { opzioni.riflessi = !opzioni.riflessi; applicaOpzioni(); });
document.getElementById('opzLuce').addEventListener('click', () => { opzioni.luceCotta = opzioni.luceCotta === false; applicaOpzioni(); });
document.getElementById('opzTilt').addEventListener('click', () => { opzioni.tilt = !opzioni.tilt; opzioni.autoQ = false; applicaOpzioni(); });
document.getElementById('opzAutoQ').addEventListener('click', () => { opzioni.autoQ = !opzioni.autoQ; applicaOpzioni(); });
document.getElementById('opzPioggia').addEventListener('click', () => { meteo.manuale(); pioggia.imposta(!pioggia.attiva); aggiornaUIOpzioni(); });
document.getElementById('opzMeteo').addEventListener('click', () => {
  opzioni.meteoAuto = !opzioni.meteoAuto;
  meteo.attivaAuto(opzioni.meteoAuto);
  applicaOpzioni();
});
addEventListener('resize', () => riflesso.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight), rig.renderer.getPixelRatio()));

/** Il piano d'acqua più vicino al fuoco della camera (per il riflesso). */
function pianoAcquaVicino() {
  let migliore = null, distMin = Infinity;
  for (const e of mesher.chunks.values()) {
    const g = e.acqua.geometry;
    if (!g.attributes.position || g.attributes.position.count === 0 || !g.boundingBox) continue;
    const bb = g.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const d = (cx - rig.bersaglio.x) ** 2 + (cz - rig.bersaglio.z) ** 2;
    if (d < distMin) { distMin = d; migliore = bb.max.y - 0.021; }
  }
  return migliore;
}
const _acquaNascoste = [];
let _riflAlterna = false, _riflUltimo = false;
let _schiumaDt = 0;              // tempo accumulato fra due render della schiuma
const RIFL_DIST2 = 70 * 70;
/** Cosa NON entra nel render specchiato: tutta l'acqua (feedback loop) più
 *  chunk e furni LONTANI — tra fresnel e wobble il riflesso mostra solo il
 *  vicino, inutile pagare l'intera scena una seconda volta. */
function nascostiPerRiflesso() {
  _acquaNascoste.length = 0;
  for (const [kc, e] of mesher.chunks) {
    _acquaNascoste.push(e.acqua);
    const [cx, cz] = kc.split(',').map(Number);
    const dx = cx * 16 + 8 - rig.bersaglio.x, dz = cz * 16 + 8 - rig.bersaglio.z;
    if (dx * dx + dz * dz > RIFL_DIST2) _acquaNascoste.push(e.solidi);
  }
  for (const o of arredo.radice.children) {
    const dx = o.position.x - rig.bersaglio.x, dz = o.position.z - rig.bersaglio.z;
    if (dx * dx + dz * dz > RIFL_DIST2) { _acquaNascoste.push(o); continue; }
    // gli ALONI additivi dei lampioni non vanno mai specchiati: da sotto il
    // pelo riempivano il riflesso di glow (spariva il mondo riflesso)
    o.traverse((m) => { if (m.userData.alone) _acquaNascoste.push(m); });
  }
  return _acquaNascoste;
}
// QUALITÀ ADATTIVA — con isteresi e raffreddamento.
// Prima decideva ogni mezzo secondo sull'ULTIMO campione: su una macchina che
// sta sulla soglia (28 fps → abbasso → 55 fps → rialzo → 28…) oscillava di
// continuo, e siccome ogni cambio rifà i buffer di rendering si vedevano
// FLASH NERI ininterrotti (segnalati su Chromebook). Ora:
//  · servono più campioni CONSECUTIVI d'accordo, non uno solo;
//  · dopo un cambio si aspetta, così non si rincorre da solo;
//  · risalire chiede molto più margine che scendere (asimmetria voluta:
//    meglio restare un gradino sotto che lampeggiare).
const CAMPIONI_GIU = 2;      // ~1s di fps bassi prima di alleggerire
const CAMPIONI_SU = 8;       // ~4s di fps alti prima di riprovare la qualità
const ATTESA_CAMBIO = 4000;  // ms di silenzio dopo ogni cambio
let _giu = 0, _su = 0, _ultimoCambio = 0;

function adattaQualita(fps) {
  if (qManuale) return;
  const adesso = performance.now();
  if (adesso - _ultimoCambio < ATTESA_CAMBIO) return;      // sta assestandosi

  if (fps < 28) { _giu++; _su = 0; } else if (fps >= 58) { _su++; _giu = 0; } else { _giu = 0; _su = 0; }

  if (_giu >= CAMPIONI_GIU && qLivello < LIVELLI_Q.length - 1) {
    qLivello++; _giu = _su = 0; _ultimoCambio = adesso; applicaQualita();
  } else if (_su >= CAMPIONI_SU && qLivello > 0) {
    qLivello--; _giu = _su = 0; _ultimoCambio = adesso; applicaQualita();
  }
}

// ---- (QUI C'ERA LA SONDA PER CHI NON PASSA DAL MESHER) ----------------------
// Gatto, mano, palle e mobili non hanno facce da interrogare, e quando
// l'occlusione era una maschera di bit cotta nei VERTICI leggevano l'attributo
// mancante - cioe' "luce libera" ovunque - e dietro un muro il lampione li
// illuminava ATTRAVERSO la parete. Serviva quindi sondarli a mano una volta per
// frame e riscrivergli l'attributo, con tutto il corredo di geometrie condivise
// da sganciare (fx/materials.js: scriviLuceEnte).
// Con le mappe d'ombra l'ombra si legge per FRAMMENTO in coordinate mondo: vale
// da sola per i chunk, per il gatto, per la mano, per i mobili e - novita' - per
// le creature, che dalla sonda erano escluse apposta perche' condividono le
// geometrie fra istanze. Non c'e' piu' niente da tenere in pari.

let _ultimoTick = 0;             // istante dell'ultimo tick dello schermo
const cadenza = new Cadenza(0);  // decide quali tick diventano frame (vedi cadenza.js)
function loop(adesso) {
  requestAnimationFrame(loop);
  // in XR i frame arrivano SOLO dalla sessione (setAnimationLoop): il rAF
  // di pagina si mette da parte per non fare passi doppi
  if (modalitaXR.attiva) return;
  // LIMITE FPS — la logica sta in engine/cadenza.js (con i suoi test): rAF è
  // riarmato in cima, quindi questo tick arriva a OGNI refresh dello schermo
  // anche nei frame che saltiamo, ed è la misura giusta da passargli.
  cadenza.fpsMax = opzioni.fpsMax;
  const dTick = adesso - _ultimoTick;
  _ultimoTick = adesso;
  if (!cadenza.tick(dTick)) return;
  passo(adesso, null);
}

function passo(adesso, frameXR) {
  const dt = Math.min((adesso - prima) / 1000, 0.05);
  prima = adesso;

  ciclo.aggiorna(dt);
  ciclo.zoomComp = Math.min(1, Math.max(0.3, 18 / rig.distanza));   // dezoom → nebbia più aperta
  const _terraPrima = controller.aTerra;
  const _vyPrima = controller.vel.y;
  controller.aggiorna(dt);
  audio.aggiorna(dt, ciclo.eNotte ? 1 : 0);
  emettiParticelleBlocchi(dt);
  if (!modalitaAR.attiva && !modalitaXR.attiva) {
    creature.aggiorna(dt, controller.pos, ciclo.eNotte);
    // I FUOCHI FATUI SI MUOVONO QUI, ogni frame, e non chiedono niente a
    // nessuno: sono luci LEGGERE, quindi spostarle e' scrivere tre float. Se un
    // giorno questa riga cominciasse a costare, il colpevole non e' il moto —
    // e' qualcuno che ha collegato i fatui alla griglia della luce.
    fuochiFatui.aggiorna(dt, controller.pos);
  }
  // suoni del movimento: salto (stacco), atterraggio (ricaduta), passi o bracciate
  if (_terraPrima && !controller.aTerra && controller.vel.y > 0.5) audio.sfx('salto');
  if (!_terraPrima && controller.aTerra && _vyPrima < -2.5) audio.sfx('atterra');
  const _muove = (Math.abs(controller.vel.x) + Math.abs(controller.vel.z)) > 1.2;
  if (controller.inAcqua && _muove) {
    _tPasso -= dt;
    if (_tPasso <= 0) { _tPasso = 0.5; audio.sfx('nuota'); }
  } else if (controller.aTerra && _muove) {
    _tPasso -= dt;
    if (_tPasso <= 0) { _tPasso = 0.32; audio.sfx('passo'); }
  }
  // splash entrando in acqua
  if (controller.inAcqua && !eraInAcqua) audio.sfx('splash');
  // dove GUARDA il gatto: correndo segue la corsa, da fermo resta sull'ultima
  // direzione, da seduto segue il joystick — riferimento del bersaglio
  if (controller.seduto && controller.sguardo) bersaglio.sguardoVerso(controller.sguardo.x, controller.sguardo.z);
  else bersaglio.sguardoDa(controller.vel.x, controller.vel.z);
  // col tocco l'anteprima insegue il gatto, quindi va rifatta ogni frame
  if (costruisci && opzioni.comandiTouch) aggiornaGhost();
  // in acqua niente posa "stirata da salto": il gatto galleggia
  // da seduto il gatto GUARDA dove punti il joystick/WASD (ruota sul posto)
  const _vx = controller.seduto && controller.sguardo ? controller.sguardo.x : controller.vel.x;
  const _vz = controller.seduto && controller.sguardo ? controller.sguardo.z : controller.vel.z;
  gatto.aggiorna(dt, controller.pos, _vx, _vz, controller.aTerra || controller.inAcqua);

  // ombre-cono alla Bedrock: player + gatto remoto + palle (proiettate nello shader)
  _ombrePg.length = 0;
  _ombrePg.push({ x: controller.pos.x, y: controller.pos.y + 0.06, z: controller.pos.z, r: 0.42 });
  for (const g of gattiRemoti.values()) _ombrePg.push({ x: g.pos.x, y: g.pos.y + 0.06, z: g.pos.z, r: 0.42 });
  for (const p of palle.values()) _ombrePg.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, r: 0.3 });
  impostaOmbrePg(_ombrePg);
  aggiornaTempo(adesso / 1000);          // orologio degli shader (acqua)
  impostaPioggia(pioggia.aggiorna(dt, adesso / 1000, rig.bersaglio));

  // meteo automatico (rovesci e schiarite; neve d'inverno)
  const avvisoMeteo = meteo.aggiorna(dt, stagioneCorrente() === 'inverno');
  if (avvisoMeteo) { hud.toast(avvisoMeteo); aggiornaUIOpzioni(); }

  // transizione stagionale morbida: ritinta delle cime d'erba a 10Hz
  _tStagione -= dt;
  if (_tStagione <= 0) {
    const tr = aggiornaTransizione(0.1 - _tStagione);
    _tStagione = 0.1;
    if (tr) {
      mesher.ritintaErba(tr.colorePer);
      if (tr.fine) {
        if (tr.remesh) mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();   // sabbia invernale + nidi di fuochi fatui
        svuotaGhostBlocchi();
        hud.toast(`${STAGIONI[stagioneCorrente()].emoji} ${STAGIONI[stagioneCorrente()].nome}`);
      }
    }
  }
  particelle.aggiorna(dt);
  aggiornaParticellariAcqua(dt);
  nuvole.aggiorna(dt);
  segnaPercorso.aggiorna(controller, controller.pos, dt);   // scia + meta del click-to-move
  scavo.aggiorna(adesso, mondo);

  // palle di prova dei generatori
  _tPalle -= dt;
  if (_tPalle <= 0) {
    _tPalle = 0.5;
    sincronizzaPalle();
    aggiornaSchiumaAcqua();
    // scintille delle lucciole: puntini verdi che salgono dai blocchi-luce vicini
    for (const [k, l] of luciBlocchi) {
      const dx = l.pos.x - rig.bersaglio.x, dz = l.pos.z - rig.bersaglio.z;
      if (dx * dx + dz * dz > 26 * 26) continue;
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.5;
      particelle.emetti(
        l.pos.x + Math.cos(a) * r, l.pos.y - 0.2 + Math.random() * 0.6, l.pos.z + Math.sin(a) * r,
        Math.cos(a) * 0.12, 0.25 + Math.random() * 0.3, Math.sin(a) * 0.12,
        1.6, 0.45, 1, [0.55, 1, 0.65],
      );
    }
  }
  for (const p of palle.values()) p.aggiorna(dt, mondo, controller, particelle);

  // TUFFO del gatto: goccioline (la schiuma attorno la fa lo shader dell'acqua)
  const tPiedi = mondo.tipo(Math.floor(controller.pos.x), Math.floor(controller.pos.y + 0.05), Math.floor(controller.pos.z));
  const inAcquaOra = !!(tPiedi && defDi(tPiedi).acqua);
  if (inAcquaOra && !eraInAcqua && controller.vel.y < -2) {
    const yTuffo = Math.floor(controller.pos.y + 0.05) + 0.94;
    for (let k = 0; k < 9; k++) {
      const a = Math.random() * Math.PI * 2, vr = 0.7 + Math.random();
      particelle.emetti(controller.pos.x, yTuffo, controller.pos.z, Math.cos(a) * vr, 1.8 + Math.random() * 1.2, Math.sin(a) * vr, 0.5, 0.6, 0);
    }
  }
  eraInAcqua = inAcquaOra;

  // VELO SUBACQUEO: la camera è dentro l'acqua?
  const cc = rig.camera.position;
  const tCam = mondo.tipo(Math.floor(cc.x), Math.floor(cc.y), Math.floor(cc.z));
  const sottacqua = !!(tCam && defDi(tCam).acqua);
  ciclo.sottacqua = sottacqua;
  document.getElementById('velo').style.opacity = sottacqua ? 1 : 0;

  // simulazione dell'acqua a tick
  acquaTimer += dt * 1000;
  if (acquaTimer >= ACQUA.tickMs) {
    acquaTimer = 0;
    if (sim.tick() > 0) segnaSalvataggio();
  }

  // presenza P2P: manda la mia posa, anima quella remota
  if (lobby.connessa) {
    posaTimer += dt * 1000;
    if (posaTimer >= NET.posaMs) {
      posaTimer = 0;
      const m = { t: 'posa', p: [controller.pos.x, controller.pos.y, controller.pos.z], vx: controller.vel.x, vz: controller.vel.z, aTerra: controller.aTerra, att: (VOCI[selezione] && VOCI[selezione].genere === 'attrezzo') ? VOCI[selezione].id : null, uso: _usoContatore };
      if (lobby.ruolo === 'host') { m.tempo = ciclo.t; m.id = 'h'; }
      lobby.invia(m);
    }
  }
  // TUTTI i gatti remoti (multi-lobby): anima, tuffo, pota gli stantii
  for (const [gid, g] of gattiRemoti) {
    if (!g.posa) continue;
    if (performance.now() - g.visto > 6000) { rimuoviGattoRemoto(gid); continue; }
    _posaRemotaV.set(g.posa.p[0], g.posa.p[1], g.posa.p[2]);
    g.pos.lerp(_posaRemotaV, Math.min(1, dt * 12));
    g.gatto.aggiorna(dt, g.pos, g.posa.vx || 0, g.posa.vz || 0, g.posa.aTerra !== false);
    if (!g.mano) g.mano = new ManoStrumento(g.gatto.gruppo);
    g.mano.imposta(g.posa.att || null);
    if (g.posa.uso !== undefined && g.posa.uso !== g.usoPrec) { if (g.usoPrec !== undefined) g.mano.usa(); g.usoPrec = g.posa.uso; }
    const tR = mondo.tipo(Math.floor(g.pos.x), Math.floor(g.pos.y + 0.35), Math.floor(g.pos.z));
    const dentroR = !!(tR && defDi(tR).acqua);
    if (dentroR && !g.inAcqua) {
      const yT = Math.floor(g.pos.y + 0.35) + 0.94;
      for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2, vr = 0.7 + Math.random();
        particelle.emetti(g.pos.x, yT, g.pos.z, Math.cos(a) * vr, 1.7 + Math.random(), Math.sin(a) * vr, 0.5, 0.6, 0);
      }
    }
    g.inAcqua = dentroR;
  }

  mesher.aggiorna(mondo);              // solo i chunk sporchi
  menuDebug.aggiorna(dt);
  // coi comandi touch la mira è il mirino centrale (l'anteprima segue lì)
  if (opzioni.comandiTouch) { mira.x = innerWidth / 2; mira.y = innerHeight / 2; }
  if (costruisci) aggiornaGhost();

  // COSA HA IN MANO: attrezzo, mini-blocco coi suoi colori, o mobile —
  // ma solo in Costruisci: esplorando il gatto ha le zampe libere
  mano.mostra(costruisci ? VOCI[selezione] : null);
  mano.aggiorna(dt);
  for (const g of gattiRemoti.values()) if (g.mano) g.mano.aggiorna(dt);

  aggiornaLuci(controller.pos);
  rig.segui(_seguiV.set(controller.pos.x, controller.pos.y + 1, controller.pos.z), dt);
  rig.aggiorna();
  rig.fuocoSu(_fuocoGatto.set(controller.pos.x, controller.pos.y + 0.8, controller.pos.z), dt);

  // in AR il mondo vive su un pivot scalato: i render ausiliari in spazio
  // mondo (riflesso, silhouette schiuma) si spengono, resta la schiuma di riva
  const pianoAcqua = (modalitaAR.attiva || modalitaXR.attiva) ? null : pianoAcquaVicino();

  // schiuma a silhouette: la fetta di geometria che buca il pelo. A frame
  // ALTERNI su OGNI dispositivo — su desktop girava a ogni frame ed era il 30%
  // del costo del frame (render extra su target 512²). Ora che la scia sfuma a
  // tempo e non a frame, dimezzare le chiamate non cambia quello che si vede.
  _schiumaDt += dt;
  if (pianoAcqua === null) { schiumaTop.spegni(); _schiumaDt = 0; }
  else if (_riflAlterna) { schiumaTop.aggiorna(rig.scena, rig.bersaglio, pianoAcqua, _schiumaDt); _schiumaDt = 0; }
  impostaSchiumaTop(schiumaTop.rt.texture, schiumaTop.info);

  // riflesso planare: a FRAME ALTERNI (la RT resta valida, il wobble copre il
  // mezzo frame di ritardo) e col mirror alleggerito — era un render completo
  // della scena OGNI frame, il primo sospettato dei cali muovendo la camera
  _riflAlterna = !_riflAlterna;
  if (!riflesso.attivo) {
    _riflUltimo = false;
  } else if (_riflAlterna || !_riflUltimo) {
    _riflUltimo = pianoAcqua !== null && riflesso.aggiorna(rig.scena, rig.camera, pianoAcqua, nascostiPerRiflesso());
  }
  impostaRiflesso(_riflUltimo, riflesso.rt.texture, riflesso.matriceTexture);

  if (modalitaXR.attiva) { modalitaXR.aggiorna(frameXR); modalitaXR.render(); }
  else if (modalitaAR.attiva) modalitaAR.render();
  else rig.render();

  hud.orologio(ciclo.oraTesto(), ciclo.faseEmoji(), ciclo.t);
  contFrame++; contTempo += dt;
  if (contTempo >= 0.5) {
    const fps = Math.round(contFrame / contTempo);
    hud.fps(fps);
    adattaQualita(fps);
    contFrame = 0; contTempo = 0;
  }

  // da OSPITE niente autosave: in RAM c'è il diorama dell'host, non il tuo
  if (salvataggioSporco && !modalitaOspite && adesso - ultimoSalvataggio > 3000) {
    salvaLocale(serializza(mondo, arredo, ciclo, inventario, { hotbar: hotbarIds }));
    salvataggioSporco = false;
    ultimoSalvataggio = adesso;
  }
}

addEventListener('beforeunload', () => {
  if (salvataggioSporco && !modalitaOspite) salvaLocale(serializza(mondo, arredo, ciclo, inventario, { hotbar: hotbarIds }));
});

avvia().catch((e) => {
  console.error('[lantern] avvio fallito', e);
  const box = elCaricamento.querySelector('div');
  box.lastChild.textContent = 'Qualcosa è andato storto 😿';
  const dett = document.createElement('div');
  dett.style.cssText = 'font-size:11px;opacity:.6;margin-top:8px;max-width:320px';
  dett.textContent = String(e && e.message || e).slice(0, 140);
  const btn = document.createElement('button');
  btn.textContent = '🌱 Ricomincia da capo';
  btn.style.cssText = 'margin-top:14px;padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#f2f6ff;cursor:pointer;font-size:13px';
  btn.addEventListener('click', () => {
    try {
      const rotto = localStorage.getItem('lantern.diorama.v1');
      if (rotto) localStorage.setItem('lantern.diorama.rotto', rotto);
      localStorage.removeItem('lantern.diorama.v1');
    } catch { /* pazienza */ }
    location.reload();
  });
  box.append(dett, btn);
});
