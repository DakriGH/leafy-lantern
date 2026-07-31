// Leafy‑Lantern — P0 sandbox. La regia: collega mondo, player, furni, luci e HUD.

import * as THREE from 'three';
import { PX, RAGGIO_CLICK, ACQUA, NET, SCAVO } from './config.js?v=ms91g5zy';
import { Rig } from './engine/renderer.js?v=ms91g5zy';
import { Input } from './engine/input.js?v=ms91g5zy';
import { raggioGriglia, raggioDaSchermo } from './engine/raycast.js?v=ms91g5zy';
import { Cadenza } from './engine/cadenza.js?v=ms91g5zy';
import { GpuProfiler, Campioni } from './engine/gpuTimer.js?v=ms91g5zy';
import { componiDiagnostica } from './engine/diagnostica.js?v=ms91g5zy';
import { SCENE } from './engine/banco.js?v=ms91g5zy';
import { BLOCCHI, CATEGORIE_BLOCCHI, defDi, tipoBase, livelloAcqua } from './world/blocks.js?v=ms91g5zy';
import { Mondo } from './world/world.js?v=ms91g5zy';
import { SimAcqua } from './world/acqua.js?v=ms91g5zy';
import { Lobby } from './net/lobby.js?v=ms91g5zy';
import { Segnalatore } from './net/segnalatore.js?v=ms91g5zy';
import { Bolla } from './ui/bolla.js?v=ms91g5zy';
import { Scelta } from './ui/scelta.js?v=ms91g5zy';
import { Bersaglio, POSE } from './gioco/bersaglio.js?v=ms91g5zy';
import { Zaino } from './ui/zaino.js?v=ms91g5zy';
import { Mesher, geometriaSingola } from './world/mesher.js?v=ms91g5zy';
import { generaIsola, generaArcipelago, generaOpenWorld, generaMondoGigante, SPAWN, ARREDO_INIZIALE } from './world/worldgen.js?v=ms91g5zy';
import { generaMostra } from './world/mostra.js?v=ms91g5zy';
import { generaCollaudo } from './world/collaudo.js?v=ms91g5zy';
import { generaTestLuci } from './world/testLuci.js?v=ms91g5zy';
import { generaBancoOmbre } from './world/bancoOmbre.js?v=ms91g5zy';
import { generaTestMacchine } from './world/testMacchine.js?v=ms91g5zy';
import { FuochiFatui } from './fx/fuochiFatui.js?v=ms91g5zy';
import { STAGIONI, impostaStagione, stagioneCorrente, ritingiFogliame, avviaTransizione, aggiornaTransizione } from './world/stagioni.js?v=ms91g5zy';
import { Meteo } from './fx/meteo.js?v=ms91g5zy';
import { Inventario, ATTREZZI } from './gioco/inventario.js?v=ms91g5zy';
import { Tavolozza, ZAMPA } from './gioco/tavolozza.js?v=ms91g5zy';
import { StriscaTavolozza } from './ui/tavolozza.js?v=ms91g5zy';
import { Scavo, DUREZZE } from './gioco/scavo.js?v=ms91g5zy';
import { CicloGiorno } from './fx/daynight.js?v=ms91g5zy';
import { aggiornaLuci, aggiornaTempo, impostaPioggia, impostaRiflesso, impostaOmbre, impostaForo, impostaForzaRiflesso, impostaSchiumaAcqua, impostaSchiumaTop, creaLuce, creaLuceLeggera, spostaLuce, rimuoviLuce, impostaOcclusione, uniformiCondivise, impostaLatoMassimoVoxel, memoriaVoxel, statLuci, impostaParti, PARTI, impostaMaxOmbre, maxOmbre, impostaPassiCielo, passiCielo, impostaTerminatore, ambienteAttuale, impostaVentoFurni, urtaFurni, impostaAmbiente } from './fx/materials.js?v=ms91g5zy';
import { SchiumaTop, LAYER_SCHIUMA } from './fx/schiumaTop.js?v=ms91g5zy';
import { ModalitaAR } from './ar/ar.js?v=ms91g5zy';
import { Nuvole } from './fx/nuvole.js?v=ms91g5zy';
import { SagomaVista } from './fx/sagomaVista.js?v=ms91g5zy';
import { Erba } from './fx/erba.js?v=ms91g5zy';
import { Foglie } from './fx/foglie.js?v=ms91g5zy';
import { SegnaPercorso } from './fx/percorso.js?v=ms91g5zy';
import { ComandiTouch } from './ui/comandi-touch.js?v=ms91g5zy';
import { RiflessoAcqua } from './fx/riflesso.js?v=ms91g5zy';
import { Pioggia } from './fx/pioggia.js?v=ms91g5zy';
import { Particelle } from './fx/particelle.js?v=ms91g5zy';
import { Audio } from './fx/audio.js?v=ms91g5zy';
import { Creature, registraComponentiCreature, sistemaCreature, pensaCreatura } from './gioco/creature.js?v=ms91g5zy';
import { RICETTE, puoiCraftare, crafta } from './gioco/craft.js?v=ms91g5zy';
import { registraComponentiPalle, creaEntitaPalla, distruggiPalla, calciaPalla, sistemaPalle, sistemaResaPalle } from './gioco/palla.js?v=ms91g5zy';
import { registraComponentiMacchine, GestoreMacchine, guidaMacchina, toccaMacchina, macchinaDi, haPannello } from './gioco/macchine.js?v=ms91g5zy';
import { PannelloMacchina } from './ui/pannelloMacchina.js?v=ms91g5zy';
import { Registro } from './ecs/registro.js?v=ms91g5zy';
import { Orologio, Rng } from './ecs/orologio.js?v=ms91g5zy';
import { Sistemi } from './ecs/sistemi.js?v=ms91g5zy';
import { Agenda } from './ecs/agenda.js?v=ms91g5zy';
import { Gatto } from './player/player.js?v=ms91g5zy';
import { ManoStrumento } from './player/mano.js?v=ms91g5zy';
import { dropDi } from './gioco/drop.js?v=ms91g5zy';
import { Controller } from './player/controller.js?v=ms91g5zy';
import { FURNI, centroide } from './furniture/registry.js?v=ms91g5zy';
import { caricaModelli } from './furniture/loader.js?v=ms91g5zy';
import { Arredo } from './furniture/furniture.js?v=ms91g5zy';
import { HUD } from './ui/hud.js?v=ms91g5zy';
import { MenuDebug } from './ui/debug.js?v=ms91g5zy';
import { Officina, caricaOfficina, registraDaRete, rimuoviDaRete } from './ui/officina.js?v=ms91g5zy';
import { ModalitaXR } from './ar/ar-xr.js?v=ms91g5zy';
import { serializza, applica, salvaLocale, caricaLocale, cancellaLocale, esportaFile, elencoSlot, salvaSlot, caricaSlot, rinominaSlot, cancellaSlot } from './save.js?v=ms91g5zy';

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

// ---- MISURATORE PERF (COMPITO 2): tempo GPU VERO per passata, anche in AR ----
// Timer query attorno a OGNI passata (riflesso, schiuma, render principale):
// misurano il tempo che la GPU passa dentro ciascuna, che sotto vsync la CPU non
// vede. Da SPENTO non crea nemmeno una query (guscio in engine/gpuTimer.js). Si
// accende dal menu debug (👁 Overlay → ⏱ GPU) o col tasto G: mostra fps, ms CPU e
// ms GPU totali + per passata. In AR il render passa per il contesto di MindAR:
// perf.usaContesto() lo rilega da solo. L'obiettivo: il committente lo accende,
// gioca (anche in AR), e manda uno screenshot coi numeri del SUO hardware.
const perf = new GpuProfiler(rig.renderer.getContext(), { nomi: ['principale', 'riflesso', 'schiuma'] });
let _perfAcceso = false;
let _cpuMsMedio = 0;                  // ms CPU/frame, mediati dolcemente (sempre a costo ~0)
const _perfEl = document.createElement('div');
_perfEl.id = 'perf';
_perfEl.style.cssText =
  'position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:8px;z-index:70;' +
  'padding:8px 10px;border-radius:10px;font:700 11px/1.5 ui-monospace,Menlo,Consolas,monospace;' +
  'white-space:pre;background:rgba(10,14,28,.82);color:#d8f0ff;border:1px solid rgba(120,200,255,.35);' +
  'box-shadow:0 2px 0 rgba(0,0,0,.4);pointer-events:none;display:none';
document.body.appendChild(_perfEl);

/** Accende/spegne il misuratore. `on` assente = interruttore. */
function impostaPerf(on) {
  _perfAcceso = on === undefined ? !_perfAcceso : !!on;
  perf.imposta(_perfAcceso);
  _perfEl.style.display = _perfAcceso ? 'block' : 'none';
  if (_perfAcceso && !perf.disponibile) {
    _perfEl.textContent = '⏱ GPU timer non disponibile\n(niente EXT_disjoint_timer_query_webgl2)\nfps e ms CPU restano validi';
  }
  if (typeof menuDebug !== 'undefined' && menuDebug) menuDebug.segnaPerf(_perfAcceso);
  return _perfAcceso;
}

/** Testo dell'overlay perf, ricostruito ~2 volte al secondo (fps già mediato). */
function aggiornaPerf(fps) {
  if (!_perfAcceso) return;
  const cpu = _cpuMsMedio;
  if (!perf.disponibile) {
    _perfEl.textContent =
      `${fps} fps · ${cpu.toFixed(1)} ms CPU\n⏱ GPU timer non disponibile qui`;
    return;
  }
  const s = perf.statistiche();
  const p = s.passate;
  const riga = (nome, et) => {
    const c = p[nome];
    if (!c || c.n === 0) return `  ${et.padEnd(12)}   —`;
    return `  ${et.padEnd(12)} ${c.media.toFixed(2).padStart(5)} ms  (p95 ${c.p95.toFixed(2)})`;
  };
  const dove = modalitaXR.attiva ? ' · AR avanzata' : (modalitaAR.attiva ? ' · AR marker' : '');
  _perfEl.textContent =
    `${fps} fps · ${cpu.toFixed(1)} ms CPU${dove}\n` +
    `GPU totale ${s.totaleMedia.toFixed(2)} ms  (p95 ${s.totaleP95.toFixed(2)})\n` +
    riga('principale', 'principale') + '\n' +
    riga('riflesso', 'riflesso') + '\n' +
    riga('schiuma', 'schiuma');
}

// ---- DIAGNOSTICA COMPLETA: UN tasto, pensato per MOBILE senza tastiera --------
// Il committente gioca su hardware debole (Chromebook Braswell / telefono) e in
// AR, e i cali fps lo rendono ingiocabile. Non posso misurare il SUO hardware da
// remoto: questo tasto lancia una batteria di benchmark SUL DISPOSITIVO VERO e
// gli scarica un file con TUTTO. Regole ferree:
//  · NON rigenera il mondo (il diorama da ~100k blocchi resta): misura sul mondo
//    ATTUALE toccando SOLO le leve di rendering e l'ora, e RIPRISTINA tutto.
//  · Non tocca né `opzioni` né il mesher → nessun remesh, contaBlocchi invariato.
//  · Se il timer GPU non c'è (Safari iOS), degrada a sole misure CPU/fps.
// La parte PURA (assemblaggio + riassunto) è in engine/diagnostica.js, testata.
const round2 = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null);

// QUALE CODICE HA PRODOTTO QUESTO FILE. prepara-www timbra ogni import con
// `?v=<build>` per scavalcare la cache di GitHub Pages (max-age=600), quindi il
// timbro è già scritto nell'URL di questo stesso modulo: si legge gratis.
// Serve perché è successo davvero: una diagnostica misurata su una pagina
// aperta PRIMA della pubblicazione sembrava dire che il fix non funzionava, e
// per capirlo ho dovuto dedurlo dai campi mancanti nel file. Ora c'è scritto.
const VERSIONE_CODICE = import.meta.url.split('?v=')[1] || 'sviluppo';
let _diagCpu = null;       // (msCpu)=>void: raccoglitore per-frame, attivo solo in batteria
let _diagPassi = null;     // (msIntervallo)=>void: durata VERA di ogni frame
let _diagFrames = 0;       // contatore di frame VERI (rispetta la cadenza), letto a delta
let _diagInCorso = false;  // un giro alla volta
const DIAG_FINESTRA = 1400; // ms di misura per scenario
const DIAG_SETTLE = 320;    // ms di assestamento prima di misurare (drena i timer vecchi)
// FOTOGRAMMI MINIMI per scenario: una mediana su un campione solo non è una
// mediana. Sul Chromebook (3 fps) la finestra a tempo ne raccoglieva UNO.
const DIAG_FRAME_MIN = 10;
// A COPPIE ALTERNATE: acceso/spento/acceso/spento invece di una misura sola per
// parte. Le due diagnostiche del 2026-07-26 si contraddicevano da sole (ombre
// SPENTE più lente di ombre accese, scala 0.66 a 25 fps con un picco CPU da
// 49 ms): finestre da un secondo e mezzo su un telefono che si scalda non
// distinguono differenze del 10%. Alternando, la deriva colpisce ugualmente
// entrambe le parti e il confronto DENTRO la coppia resta valido.
const DIAG_GIRI = 2;        // quante volte si alterna A/B
const DIAG_FETTA = 700;     // ms per fetta alternata
const DIAG_ASSAGGIO = 500;  // ms buttati in apertura: il primo scenario legge sempre basso

/** Aspetta `ms` di OROLOGIO (non solo rAF, che la preview congela se non è in
 *  primo piano: così non si blocca mai). Ritorna quanti frame VERI sono passati e
 *  il tempo reale trascorso, per ricavarne gli fps effettivi. */
/**
 * Aspetta `ms`, ma NON MENO DI `frameMin` FOTOGRAMMI (fino a un tetto).
 *
 * L'attesa a tempo fisso è quella che ha rovinato la misura sul Chromebook del
 * committente (Intel HD 400, diagnostica del 30 luglio): a tre fotogrammi al
 * secondo, 1400 ms di finestra hanno raccolto UN campione — e quel campione,
 * essendo il primo della batteria, si portava dentro la compilazione degli
 * shader. Quel valore gonfiato è diventato il fondo della scala, e da lì OGNI
 * altra scena risultava «più leggera del terreno asciutto»: la classifica intera
 * era il fantasma di un warm-up.
 *
 * Il tetto c'è perché su un dispositivo davvero rotto (mezzo fotogramma al
 * secondo) aspettare i dieci fotogrammi vorrebbe dire non finire mai: meglio
 * pochi campioni DICHIARATI che una diagnostica che si pianta.
 */
function _diagAttendi(ms, frameMin = 0, tetto = 3500) {
  return new Promise((ok) => {
    const f0 = _diagFrames, t0 = performance.now();
    const fine = () => ok({ frame: _diagFrames - f0, ms: performance.now() - t0 });
    const controlla = () => {
      const dt = performance.now() - t0;
      if (dt >= tetto || (dt >= ms && _diagFrames - f0 >= frameMin)) return fine();
      setTimeout(controlla, 60);
    };
    setTimeout(controlla, ms);
  });
}

/**
 * QUANTO COSTA UN DISEGNO, in millisecondi veri, SENZA passare dagli fps.
 *
 * PERCHÉ SERVE. Sul telefono del committente non ci sono le timer query, quindi
 * l'unico numero disponibile erano gli fps — che su uno schermo agganciato al
 * vsync escono a gradini (45, 30, 22,5…). Risultato: nell'ultimo giro tutte e
 * sette le scene del banco hanno misurato 36-38 fps, cioè lo strumento non
 * distingueva più niente proprio mentre gli si chiedeva di distinguere.
 *
 * Qui si disegna N volte di fila DENTRO lo stesso frame e si mette un
 * `gl.finish()` in fondo: la scheda deve aver finito davvero prima che il tempo
 * si fermi. Non è il vsync a decidere, è il lavoro. È la misura classica quando
 * i timer non ci sono, e vale per CPU e GPU insieme — che è quello che conta.
 *
 * NB misura il DISEGNO, non il frame di gioco: la logica (fisica, sim, ECS) sta
 * fuori. Per quella c'è cpuMediana.
 */
function _diagRenderMs(giri = 5, n = 6) {
  try {
    const gl = rig.renderer.getContext();
    rig.render(); gl.finish();               // scalda e sincronizza il punto di partenza
    const v = [];
    for (let g = 0; g < giri; g++) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) rig.render();
      gl.finish();
      v.push((performance.now() - t0) / n);
    }
    v.sort((a, b) => a - b);
    // SI MISURA ANCHE QUANTO BALLA, e serve più del valore. Su una GPU a TILE
    // (i Mali dei telefoni) il driver può accorpare o buttare via i disegni
    // ripetuti dentro lo stesso frame: allora questo numero non misura il nostro
    // lavoro, misura l'umore del driver. Con un solo giro non c'era modo di
    // accorgersene, e il report pubblicava lo stesso una classifica — costruita
    // sul rumore. Con lo scarto fra il giro più veloce e il più lento chi legge
    // può decidere se fidarsi.
    return { ms: round2(v[v.length >> 1]), scarto: round2(v[v.length - 1] - v[0]) };
  } catch { return null; }
}

/** Misura UNO scenario GIÀ applicato: assesta, azzera, raccoglie CPU+GPU per
 *  `finestra` ms, legge. Gli fps sono frame veri / tempo reale, e il tempo di
 *  frame MEDIANO è la cifra robusta (una singola pausa da 50 ms sposta la media
 *  e non sposta la mediana: è così che «ombre spente» risultava più lenta di
 *  «ombre accese»). */
async function _diagMisura(finestra = DIAG_FINESTRA) {
  // assestamento: i timer GPU della config PRECEDENTE si drenano (raccogli() li
  // svuota nel loop) e la CPU si stabilizza — così non sporcano questo scenario
  // l'assestamento vuole almeno DUE fotogrammi: su un dispositivo lentissimo
  // 320 ms non ne contengono nemmeno uno, e la configurazione precedente
  // finirebbe dentro la misura di questa
  await _diagAttendi(DIAG_SETTLE, 2);
  perf.azzera();
  const cpu = new Campioni(600);
  const passi = new Campioni(600);
  _diagCpu = (ms) => cpu.push(ms);
  _diagPassi = (ms) => { if (ms > 0 && ms < 2000) passi.push(ms); };
  const w = await _diagAttendi(finestra, DIAG_FRAME_MIN);
  _diagCpu = null;
  _diagPassi = null;
  await _diagAttendi(80);   // coda: i timer sono asincroni, gli ultimi arrivano ora
  const s = perf.disponibile ? perf.statistiche() : null;
  const pass = (n) => (s && s.passate[n])
    ? { media: round2(s.passate[n].media), p95: round2(s.passate[n].p95), n: s.passate[n].n }
    : { media: 0, p95: 0, n: 0 };
  const mediana = passi.n ? passi.mediana() : 0;
  const _rend = _diagRenderMs();
  return {
    renderMs: _rend ? _rend.ms : null,        // il costo di un disegno, fuori dal vsync
    renderScarto: _rend ? _rend.scarto : null, // quanto balla fra una ripetizione e l'altra
    fps: w.ms > 0 ? Math.round(w.frame / (w.ms / 1000)) : 0,
    fpsMediano: mediana > 0 ? Math.round(1000 / mediana) : 0,
    frameMs: round2(mediana), frameMsP95: round2(passi.n ? passi.p95() : 0),
    frame: w.frame,
    cpuMedia: round2(cpu.media()), cpuMediana: round2(cpu.mediana()), cpuP95: round2(cpu.p95()), cpuCampioni: cpu.n,
    gpu: {
      disponibile: !!s,
      totaleMedia: s ? round2(s.totaleMedia) : null,
      totaleP95: s ? round2(s.totaleP95) : null,
      passate: { principale: pass('principale'), riflesso: pass('riflesso'), schiuma: pass('schiuma') },
    },
  };
}

/**
 * IL BANCO STANDARD: costruisce ogni scena di engine/banco.js, la misura con le
 * impostazioni attuali, e alla fine RIMETTE IL MONDO DEL COMMITTENTE com'era.
 *
 * Perché il mondo si tocca (finora era vietato): misurare «quello che c'è
 * davanti» rende due giri inconfrontabili — a tredici minuti di distanza l'acqua
 * ha misurato 3,4 ms e 18,0 ms senza che il codice cambiasse, perché era cambiata
 * l'inquadratura. Il diorama si salva IN MEMORIA (non in localStorage: potrebbe
 * non entrarci) e si rimette nel finally, qualunque cosa succeda.
 */
async function _diagBanco(prog, passoBase, N) {
  const banco = {};
  const salvato = serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() });
  const camPrec = { b: rig.bersaglio.clone(), d: rig.distanza, p: rig.pitch, y: rig.yaw };
  const pioggiaPrec = pioggia.attiva;
  const uni = uniformiCondivise();
  try {
    for (let i = 0; i < SCENE.length; i++) {
      const s = SCENE[i];
      prog.passo(passoBase + i, N, `banco: ${s.nome}`);
      // mondo pulito, poi la scena
      mondo.chunks.clear(); mondo.contaBlocchi = 0; mondo.furni?.clear?.();
      arredo.svuota();
      s.costruisci(mondo, arredo);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
      ricostruisciBlocchiSpeciali();
      // condizioni: ora, pioggia, e gli anelli d'impatto messi A MANO (la sim
      // dell'acqua non li produrrebbe in una vasca ferma, e sono il caso che ha
      // smascherato il costo vero)
      ciclo.auto = false; ciclo.t = s.condizioni.ora; ciclo.aggiorna(0);
      arredo.aggiornaNotte(ciclo.eNotte);
      pioggia.imposta(s.condizioni.pioggia > 0);
      impostaPioggia(s.condizioni.pioggia || 0);
      const nImp = s.condizioni.impatti || 0;
      for (let k = 0; k < nImp && k < uni.uImpatti.value.length; k++) {
        const a = (k / Math.max(1, nImp)) * Math.PI * 2;
        uni.uImpatti.value[k].set(Math.cos(a) * 9, s.camera.bersaglio[1] + 0.44, Math.sin(a) * 9, 1.4 + (k % 3) * 0.5);
      }
      uni.uImpattiNum.value = nImp;
      // camera fissa: è metà del senso del banco
      rig.bersaglio.set(s.camera.bersaglio[0], s.camera.bersaglio[1], s.camera.bersaglio[2]);
      rig.distanza = s.camera.distanza; rig.pitch = s.camera.pitch; rig.yaw = s.camera.yaw;
      rig.aggiorna();
      aggiornaLuci(rig.bersaglio);
      // la scena si porta dietro i SUOI numeri (draw call, triangoli, luci
      // accese): senza, un +6 ms resta un mistero — così si sa se è per i pixel,
      // per gli oggetti o per le lampade
      banco[s.id] = { ...(await _diagMisura(DIAG_FETTA)), scena: _diagScena(), condizioni: s.condizioni, perche: s.perche };
    }
  } finally {
    uni.uImpattiNum.value = 0;
    pioggia.imposta(pioggiaPrec);
    impostaPioggia(pioggiaPrec ? 1 : 0);
    arredo.svuota();
    applica(salvato, mondo, arredo, ciclo, inventario);
    mesher.ricostruisciTutto(mondo);
    ricostruisciLuciBlocchi();
    ricostruisciBlocchiSpeciali();
    rig.bersaglio.copy(camPrec.b); rig.distanza = camPrec.d; rig.pitch = camPrec.p; rig.yaw = camPrec.y;
    rig.aggiorna();
  }
  return banco;
}

/**
 * CONFRONTO ALTERNATO: invece di misurare A e poi B una volta sola, si gira
 * A, B, A, B… in fette corte e si tiene la MEDIANA dei tempi di frame di ogni
 * parte. Se il telefono rallenta a metà (si scalda, arriva una notifica) il
 * rallentamento cade su TUTTE le parti e il confronto regge; con una misura per
 * parte, no — ed è esattamente così che nelle due diagnostiche del 2026-07-26
 * «ombre spente» risultava più lenta di «ombre accese».
 * @param voci [[nome, applica], …] — anche più di due (la scala ne ha quattro)
 */
async function _diagAlternati(voci, prog) {
  const parti = {};
  for (const [nome] of voci) parti[nome] = [];
  for (let giro = 0; giro < DIAG_GIRI; giro++) {
    for (const [nome, applica, etichetta] of voci) {
      if (prog) prog(`${etichetta || nome} — giro ${giro + 1}/${DIAG_GIRI}`);
      applica();
      parti[nome].push(await _diagMisura(DIAG_FETTA));
    }
  }
  const out = {};
  for (const [nome] of voci) {
    const lista = parti[nome];
    const ms = lista.map((m) => m.frameMs).filter((x) => x > 0).sort((a, b) => a - b);
    const mediana = ms.length ? ms[ms.length >> 1] : 0;
    out[nome] = {
      ...lista[lista.length - 1],
      frame: lista.reduce((s, m) => s + m.frame, 0),
      frameMs: round2(mediana),
      fpsMediano: mediana > 0 ? Math.round(1000 / mediana) : 0,
      fette: lista.length,
    };
  }
  return out;
}

/** Applica UNA config di rendering muovendo SOLO le leve (scala, riflesso, tilt,
 *  ombre): le stesse di applicaQualita, a mano, senza toccare `opzioni` né il
 *  mesher (niente remesh). Ogni campo assente resta com'è. */
function _diagApplica({ scala, rifl, tiltQ, occ, parti }) {
  if (scala !== undefined) rig.setScalaRender(scala);
  if (tiltQ !== undefined) rig.impostaTiltShift(tiltQ);
  if (rifl !== undefined) riflesso.attivo = !!rifl;
  if (occ !== undefined) impostaOcclusione(!!occ);
  impostaParti(parti === undefined ? PARTI.tutte : parti);   // la batteria misura sempre a shader pieno, salvo lo scenario apposta
}

// --- raccolta delle sezioni statiche (nessuna misura, nessun effetto) ---
function _diagInfoGL() {
  const gl = rig.renderer.getContext();
  const par = (p) => { try { return gl.getParameter(p); } catch { return null; } };
  let vendor = null, renderer = rig.gpu;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) { vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL); renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); }
  } catch { /* niente info driver */ }
  let est = [];
  try { est = gl.getSupportedExtensions() || []; } catch { /* pazienza */ }
  const chiave = ['EXT_disjoint_timer_query_webgl2', 'EXT_color_buffer_float', 'OES_texture_float_linear',
    'WEBGL_debug_renderer_info', 'EXT_texture_filter_anisotropic', 'KHR_parallel_shader_compile',
    'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_lose_context'];
  return {
    webgl2: (typeof WebGL2RenderingContext !== 'undefined') && (gl instanceof WebGL2RenderingContext),
    vendor, renderer, gpu: rig.gpu, software: rig.software,
    timerQuery: !!perf.disponibile || est.includes('EXT_disjoint_timer_query_webgl2'),
    maxTextureSize: par(gl.MAX_TEXTURE_SIZE),
    max3dTextureSize: par(gl.MAX_3D_TEXTURE_SIZE),
    maxTextureImageUnits: par(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxRenderbufferSize: par(gl.MAX_RENDERBUFFER_SIZE),
    maxViewportDims: (() => { try { const v = gl.getParameter(gl.MAX_VIEWPORT_DIMS); return v ? [v[0], v[1]] : null; } catch { return null; } })(),
    estensioniChiave: chiave.filter((e) => est.includes(e)),
    estensioniTotali: est.length,
  };
}

function _diagDispositivo() {
  const n = navigator;
  return {
    userAgent: n.userAgent, piattaforma: n.platform || null, lingua: n.language || null,
    schermoW: screen.width, schermoH: screen.height,
    finestraW: innerWidth, finestraH: innerHeight,
    devicePixelRatio, deviceMemory: n.deviceMemory ?? null, hardwareConcurrency: n.hardwareConcurrency ?? null,
    touch: (n.maxTouchPoints || 0) > 0,
  };
}

/**
 * ⚠ `vere` SONO LE IMPOSTAZIONI DEL GIOCATORE, e senza questo argomento il
 * report MENTIVA. La misura spegne d'ufficio limite fps, qualità automatica e
 * meteo automatico (se no si muovono sotto le mani), e questa funzione gira
 * MENTRE sono spenti: il file usciva con `autoQ: false` e `qualitaAuto: false`
 * comunque, anche per chi la qualità automatica non l'aveva mai toccata.
 * Ci sono cascato io per primo, e ho detto al committente che ce l'aveva spenta
 * quando forse era il mio strumento a scriverlo. Ora il report dice quello che
 * ha scelto LUI; in che condizioni si è misurato sta già nelle note.
 */
function _diagImpostazioni(vere) {
  const opz = JSON.parse(JSON.stringify(opzioni));
  if (vere) {
    opz.autoQ = vere.autoQ; opz.fpsMax = vere.fpsMax; opz.meteoAuto = vere.meteoAuto;
  }
  return {
    opzioni: opz,
    qualitaAuto: vere ? !!vere.autoQ : !qManuale, qLivello, riflessiUtente,
    rigMobile: rig.mobile, dprMax: rig.dprMax,
    pixelRatioRenderer: round2(rig.renderer.getPixelRatio()),
    scalaInterna: round2(rig.scalaInterna), ingrandimento: rig.nitido ? 'nitido' : 'morbido',
    maxOmbre: maxOmbre(), passiOmbraCielo: passiCielo(),
    scalaRenderUtente: opzioni.scala,
    ar: modalitaAR.attiva, xr: modalitaXR.attiva,
  };
}

function _diagScena() {
  const info = rig.renderer.info;
  const st = mesher.statistiche;
  const luci = statLuci();
  // TRIANGOLI/DRAW CALL VERI: `info.render` si azzera a ogni render() e il
  // tilt-shift fa più passate (l'ultima è UN quad a schermo intero) — leggerlo
  // fra due frame conta quel quad, non la scena. Disattivo l'auto-reset, faccio
  // un render vero e sommo, poi ripristino. È un render in più, senza effetti.
  let triangoli = info.render.triangles, drawCall = info.render.calls;
  const autoPrima = info.autoReset;
  try {
    info.autoReset = false;
    info.reset();
    rig.render();
    triangoli = info.render.triangles;
    drawCall = info.render.calls;
  } catch { /* tengo i valori grezzi */ }
  finally { info.autoReset = autoPrima; info.reset(); }
  return {
    contaBlocchi: mondo.contaBlocchi,
    chunk: mesher.chunks ? mesher.chunks.size : null,
    chunkAttivi: st.chunkAttivi,
    triangoli, drawCall,
    geometrie: info.memory.geometries, texture: info.memory.textures,
    programmiShader: info.programs ? info.programs.length : null,
    meshInScena: rig.scena.children.length,
    grigliaLuceCelle: st.occCelle, memoriaVoxelKB: round2(memoriaVoxel() / 1024),
    luci: { totali: luci.totali, attive: luci.attive, pesanti: luci.pesanti, inviate: luci.inviate, conOmbra: luci.conOmbra },
  };
}

// --- progresso a schermo (barra + percentuale), non sembra mai bloccato ---
function _diagCreaProgresso() {
  let el = document.getElementById('diag-prog');
  if (!el) {
    el = document.createElement('div');
    el.id = 'diag-prog';
    el.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(6,10,22,.72);font:600 15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;color:#eaf3ff';
    el.innerHTML = '<div style="max-width:min(92vw,420px);width:100%;padding:22px;border-radius:16px;background:rgba(14,20,38,.96);border:1px solid rgba(120,200,255,.35);box-shadow:0 10px 40px rgba(0,0,0,.5);text-align:center">'
      + '<div style="font-size:17px;margin-bottom:4px">📊 Diagnostica in corso…</div>'
      + '<div data-el="sub" style="font-size:13px;opacity:.85;min-height:2.6em;display:flex;align-items:center;justify-content:center">avvio…</div>'
      + '<div style="height:12px;border-radius:8px;background:rgba(255,255,255,.12);overflow:hidden;margin:12px 0 6px"><div data-el="bar" style="height:100%;width:0%;background:linear-gradient(90deg,#5bd1ff,#7CFFB0);transition:width .25s ease"></div></div>'
      + '<div data-el="pct" style="font-size:12px;opacity:.7">0%</div></div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  const sub = el.querySelector('[data-el="sub"]');
  const bar = el.querySelector('[data-el="bar"]');
  const pct = el.querySelector('[data-el="pct"]');
  return {
    passo(x, y, cosa) {
      const p = Math.max(0, Math.min(100, Math.round(x / y * 100)));
      sub.textContent = `Passo ${x}/${y} — ${cosa}`;
      bar.style.width = p + '%'; pct.textContent = p + '%';
    },
    fatto() {
      sub.innerHTML = '✅ Fatto, file scaricato.<br><span style="opacity:.7;font-size:12px">Se non parte, usa «Copia» nel riquadro.</span>';
      bar.style.width = '100%'; pct.textContent = '100%';
      setTimeout(() => { el.style.display = 'none'; }, 900);
    },
    errore(e) {
      sub.textContent = '😿 Errore: ' + String((e && e.message) || e).slice(0, 120);
      bar.style.background = '#ff6b6b';
      setTimeout(() => { el.style.display = 'none'; }, 4000);
    },
  };
}

// --- consegna del file: download classico + condivisione + modale con copia ---
// Non ci si fida di UN solo canale: iOS Safari spesso IGNORA l'attributo download
// e apre il JSON; il modale con textarea + «Copia» è la rete di sicurezza che
// funziona ovunque (il committente può sempre incollarmi tutto).
function _diagConsegna(nomeFile, testo) {
  let scaricato = false;
  try {
    const blob = new Blob([testo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeFile;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    scaricato = true;
  } catch (e) { console.warn('[diagnostica] download classico fallito', e); }
  _diagModale(nomeFile, testo, scaricato);
}

function _diagModale(nomeFile, testo, scaricato) {
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;background:rgba(6,10,22,.8);padding:14px;box-sizing:border-box;font:600 14px/1.5 system-ui,Segoe UI,Roboto,sans-serif;color:#eaf3ff';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:min(96vw,560px);width:100%;max-height:88vh;display:flex;flex-direction:column;padding:16px;border-radius:16px;background:rgba(14,20,38,.98);border:1px solid rgba(120,200,255,.4);box-shadow:0 10px 40px rgba(0,0,0,.55)';
  const kb = (testo.length / 1024).toFixed(1);
  const testa = document.createElement('div');
  testa.style.cssText = 'font-size:12px;opacity:.85;margin-bottom:8px';
  testa.innerHTML = (scaricato ? 'File scaricato: ' : '⚠ Il download automatico non è partito. ')
    + `<b>${nomeFile}</b> · ${kb} KB.<br>Se non lo trovi, copia tutto qui sotto e incollamelo.`;
  const titolo = document.createElement('div');
  titolo.style.cssText = 'font-size:16px;margin-bottom:6px';
  titolo.textContent = '📊 Diagnostica pronta';
  const ta = document.createElement('textarea');
  ta.readOnly = true; ta.value = testo;
  ta.style.cssText = 'flex:1;min-height:120px;width:100%;box-sizing:border-box;resize:vertical;font:500 11px/1.4 ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,.35);color:#cfe6ff;border:1px solid rgba(120,200,255,.25);border-radius:10px;padding:8px;white-space:pre;overflow:auto';
  const riga = document.createElement('div');
  riga.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';
  const mkBtn = (txt) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText = 'flex:1;min-width:120px;min-height:46px;padding:10px 14px;border-radius:12px;border:1px solid rgba(120,200,255,.4);background:rgba(90,170,255,.18);color:#eaf3ff;font:700 14px system-ui;cursor:pointer';
    return b;
  };
  const bCopia = mkBtn('📋 Copia negli appunti');
  bCopia.addEventListener('click', async () => {
    let ok = false;
    try { if (navigator.clipboard) { await navigator.clipboard.writeText(testo); ok = true; } } catch { /* fallback sotto */ }
    if (!ok) { try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch { ok = false; } }
    bCopia.textContent = ok ? '✅ Copiato!' : '⚠ Seleziona sopra e copia a mano';
  });
  riga.appendChild(bCopia);
  // condivisione del FILE (iOS/Android): il canale più affidabile se il download è ignorato
  try {
    const file = new File([testo], nomeFile, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      const bShare = mkBtn('📤 Condividi file');
      bShare.addEventListener('click', async () => { try { await navigator.share({ files: [file], title: nomeFile }); } catch { /* annullato */ } });
      riga.appendChild(bShare);
    }
  } catch { /* niente Web Share coi file qui */ }
  const bChiudi = mkBtn('✕ Chiudi');
  bChiudi.style.flex = '0 0 auto'; bChiudi.style.minWidth = '84px';
  bChiudi.addEventListener('click', () => back.remove());
  riga.appendChild(bChiudi);
  card.appendChild(titolo); card.appendChild(testa); card.appendChild(ta); card.appendChild(riga);
  back.appendChild(card); document.body.appendChild(back);
  setTimeout(() => { try { ta.focus(); ta.select(); } catch { /* pazienza */ } }, 60);
}

/**
 * LA ROUTINE: batteria di benchmark sul mondo ATTUALE, con progresso a schermo,
 * poi scarica il file. Salva lo stato prima e lo RIPRISTINA nel finally (ora,
 * tempo, e lo stato di rendering derivato dalle opzioni via applicaQualita).
 */
async function eseguiDiagnostica() {
  if (_diagInCorso) return;
  _diagInCorso = true;
  const prog = _diagCreaProgresso();
  const t0 = Date.now();
  const heapPrima = (performance.memory && performance.memory.usedJSHeapSize) || null;

  // stato da ripristinare. NON tocco opzioni/mesher, quindi contaBlocchi resta.
  const snap = { cicloT: ciclo.t, cicloAuto: ciclo.auto, perfAttivo: perf.attivo, contaBlocchi: mondo.contaBlocchi, fpsMax: opzioni.fpsMax, autoQ: opzioni.autoQ, meteoAuto: opzioni.meteoAuto };
  // LE IMPOSTAZIONI DEL GIOCATORE NON DEVONO ENTRARE NELLA MISURA. Tre di esse
  // la falsavano in silenzio, e una ha già buttato via un giro intero:
  //  · LIMITE FPS — con un tetto attivo OGNI scenario legge lo stesso numero
  //    (successo davvero: una batteria intera a 30 fps su tutte le voci);
  //  · QUALITÀ AUTOMATICA — cambierebbe scala ed effetti MENTRE si misura, cioè
  //    lo strumento si muoverebbe sotto le mani;
  //  · METEO AUTOMATICO — un rovescio che parte a metà giro sposta una scena e
  //    non l'altra.
  // Si spengono qui e si rimettono nel finally. Quello che il committente ha
  // scelto resta scritto in `impostazioni`: il report dice sia com'era, sia in
  // che condizioni è stato misurato.
  opzioni.fpsMax = 0; cadenza.fpsMax = 0;
  opzioni.autoQ = false; qManuale = true;
  meteo.attivaAuto(false);
  const uni = uniformiCondivise();
  // leve di rendering CORRENTI, per tenerle ferme mentre se ne muove UNA alla volta
  const base = {
    scala: rig.scalaInterna,
    rifl: !!riflesso.attivo,
    tiltQ: rig.tiltShift ? (opzioni.tiltQ || 2.2) : 0,
    occ: uni.uOcclusione.value > 0.5,
  };
  const note = [];
  const sweep = {};
  let banco = null;
  let baseline = null;

  try {
    perf.imposta(true);
    // in AR il render passa per il contesto di MindAR: lega lì le timer query
    try {
      const glOra = (modalitaAR.attiva && modalitaAR.mindar) ? modalitaAR.mindar.renderer.getContext() : rig.renderer.getContext();
      perf.usaContesto(glOra);
      if (perf.attivo === false && perf.disponibile) perf.imposta(true);
    } catch { /* resta col contesto di partenza */ }
    if (!perf.disponibile) note.push('gpu_timer: non disponibile (manca EXT_disjoint_timer_query_webgl2): misure solo CPU/fps.');
    ciclo.auto = false;   // congela l'ora: notte/giorno non devono derivare durante la misura

    // I confronti si fanno DENTRO un gruppo alternato; fra gruppi diversi i
    // numeri non si paragonano (il telefono cambia stato durante la batteria).
    const gruppi = [
      ['riflesso', [
        ['riflesso_on', () => _diagApplica({ ...base, rifl: true }), 'riflesso ACCESO'],
        ['riflesso_off', () => _diagApplica({ ...base, rifl: false }), 'riflesso SPENTO'],
      ]],
      ['ombre', [
        ['ombre_on', () => _diagApplica({ ...base, occ: true }), 'ombre voxel ACCESE'],
        ['ombre_off', () => _diagApplica({ ...base, occ: false }), 'ombre voxel SPENTE'],
      ]],
      ['tilt', [
        ['tilt_on', () => _diagApplica({ ...base, tiltQ: opzioni.tiltQ || 2.2 }), 'tilt-shift ACCESO'],
        ['tilt_off', () => _diagApplica({ ...base, tiltQ: 0 }), 'tilt-shift SPENTO'],
      ]],
      ['scala', [
        ['scala_1.00', () => _diagApplica({ ...base, scala: 1 }), 'scala render 1.00'],
        ['scala_0.85', () => _diagApplica({ ...base, scala: 0.85 }), 'scala render 0.85'],
        ['scala_0.66', () => _diagApplica({ ...base, scala: 0.66 }), 'scala render 0.66'],
        ['scala_0.50', () => _diagApplica({ ...base, scala: 0.5 }), 'scala render 0.50'],
      ]],
      // IL BISTURI: quanto costa OGNI TERMINE dello shader del mondo, per pixel.
      // Di giorno il pass principale costa 19,9 ms con le lampade spente: senza
      // scomporlo si finisce a riscrivere il pezzo sbagliato. `nudo` è il fondo
      // della scala — colore della palette e basta — e dice quanto del costo è
      // NOSTRO e quanto è del disegnare quei pixel, punto.
      ['shader', [
        ['shader_tutto', () => _diagApplica({ ...base, parti: PARTI.tutte }), 'shader completo'],
        ['shader_senzaNuvole', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.nuvole }), 'senza ombre delle nuvole'],
        ['shader_senzaPg', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.personaggi }), 'senza ombre dei personaggi'],
        ['shader_senzaAcqua', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.acqua }), 'acqua PIATTA'],
        ['shader_nudo', () => _diagApplica({ ...base, parti: 0 }), 'shader NUDO (solo palette)'],
      ]],
      // DENTRO l'acqua: quale pezzo del pelo costa. Serve perché l'acqua è
      // rimasta il 60% del pass anche dopo il primo giro di tagli, e senza
      // separarla si finisce a riscrivere il pezzo sbagliato (già successo).
      ['acqua', [
        ['acqua_tutta', () => _diagApplica({ ...base, parti: PARTI.tutte }), 'pelo completo'],
        ['acqua_senzaRiflesso', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.riflesso }), 'senza riflesso sul pelo'],
        ['acqua_senzaSilhouette', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.silhouette }), 'senza schiuma a silhouette'],
        ['acqua_senzaRiva', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.riva }), 'senza schiuma di riva'],
        ['acqua_senzaImpatti', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.impatti }), 'senza anelli d\'impatto'],
        ['acqua_senzaCorrenti', () => _diagApplica({ ...base, parti: PARTI.tutte & ~PARTI.correnti }), 'senza correnti e cascate'],
      ]],
      ['ora', [
        ['giorno', () => { ciclo.t = 0.5; ciclo.aggiorna(0); _diagApplica({ ...base, occ: true }); }, 'giorno pieno'],
        ['notte_ombre', () => { ciclo.t = 0.0; ciclo.aggiorna(0); _diagApplica({ ...base, occ: true }); }, 'notte con ombre'],
      ]],
      ['preset', [
        ['preset_alta', () => { ciclo.t = snap.cicloT; ciclo.aggiorna(0); _diagApplica({ scala: 1, rifl: true, tiltQ: 2.2, occ: true }); }, 'preset «alta»'],
        ['preset_bassa', () => { ciclo.t = snap.cicloT; ciclo.aggiorna(0); _diagApplica({ scala: 0.66, rifl: false, tiltQ: 0, occ: false }); }, 'preset «bassa»'],
      ]],
    ];
    const N = gruppi.length + SCENE.length + 4;   // +info +assaggio +baseline iniziale/finale +assemblaggio

    prog.passo(1, N, 'raccolgo info dispositivo/GL/scena');
    const dispositivo = _diagDispositivo();
    const gl = _diagInfoGL();
    const scena = _diagScena();
    if (modalitaAR.attiva || modalitaXR.attiva) note.push('AR/XR attiva durante la misura: riflesso e schiuma sono spenti per costruzione.');
    note.push('Riflesso, schiuma e la voce «acqua» dello shader contano SOLO se un piano d\'acqua è INQUADRATO: se leggono 0 ms, guarda l\'acqua e rifai la misura.');
    note.push('Preset misurati a livello di rendering (scala/riflesso/tilt/ombre); il diorama NON viene rifatto.');
    note.push('Ogni gruppo è misurato ALTERNANDO le sue voci: confronta solo dentro lo stesso gruppo, mai fra gruppi diversi.');
    note.push('Durante la misura limite FPS, qualità automatica e meteo automatico sono SPENTI d\'ufficio: sono impostazioni che falsano il risultato. Vengono rimessi com\'erano alla fine.');
    if (snap.fpsMax > 0) note.push(`Avevi un limite di ${snap.fpsMax} fps: l'ho tolto per questa misura, altrimenti ogni scenario avrebbe letto lo stesso numero.`);

    // ASSAGGIO BUTTATO: la primissima misura legge sempre bassa (compilazione
    // degli shader, JIT, il modale appena aperto). Prima si finiva per pubblicare
    // quel numero come «baseline» e sembrava che il gioco andasse peggio di com'è.
    prog.passo(2, N, 'scaldo il motore (misura buttata)');
    _diagApplica(base);
    await _diagMisura(DIAG_ASSAGGIO);

    prog.passo(3, N, 'baseline (impostazioni attuali)');
    _diagApplica(base);
    baseline = await _diagMisura();
    sweep.baseline = baseline;

    let i = 0;
    for (const [nome, voci] of gruppi) {
      const misure = await _diagAlternati(voci, (t) => prog.passo(4 + i, N, t));
      Object.assign(sweep, misure);
      i++;
    }

    // BASELINE DI CHIUSURA: stesse identiche impostazioni della prima. Se i due
    // numeri divergono, il telefono è cambiato durante la batteria e TUTTI i
    // confronti fra gruppi vanno buttati (quelli dentro i gruppi reggono).
    prog.passo(4 + i, N, 'baseline di chiusura (controllo deriva)');
    _diagApplica(base);
    sweep.baseline_fine = await _diagMisura();

    // IL BANCO: scene costruite qui, uguali su ogni dispositivo e ogni versione
    banco = await _diagBanco(prog, 5 + i, N);

    prog.passo(N, N, 'assemblo e scarico il file');
    const heapDopo = (performance.memory && performance.memory.usedJSHeapSize) || null;
    const memoria = {
      heapPrimaMB: heapPrima != null ? round2(heapPrima / 1048576) : null,
      heapDopoMB: heapDopo != null ? round2(heapDopo / 1048576) : null,
      cresciutaMB: (heapPrima != null && heapDopo != null) ? round2((heapDopo - heapPrima) / 1048576) : null,
      limiteMB: (performance.memory && performance.memory.jsHeapSizeLimit) ? round2(performance.memory.jsHeapSizeLimit / 1048576) : null,
      nota: performance.memory ? null : 'performance.memory non disponibile su questo browser',
    };

    const report = componiDiagnostica(
      { build: VERSIONE_CODICE, dispositivo, gl, impostazioni: _diagImpostazioni(snap), scena, baseline, sweep, banco, memoria, note },
      { quando: t0 },
    );
    const testo = JSON.stringify(report, null, 2);
    _diagConsegna(report.nomeFile, testo);
    prog.fatto();
    if (typeof hud !== 'undefined' && hud) hud.toast('📊 Diagnostica pronta — file scaricato', 3200);
  } catch (e) {
    console.error('[diagnostica] errore', e);
    prog.errore(e);
  } finally {
    // RIPRISTINO: ora, tempo e lo stato di rendering derivato dalle opzioni
    // (mai toccate) via applicaQualita — nessun remesh, diorama intatto.
    _diagCpu = null;
    _diagPassi = null;
    impostaParti(_partiQ);                  // il bisturi non deve MAI restare dentro: si torna a ciò che concede la qualità
    // le impostazioni del giocatore tornano ESATTAMENTE come le aveva lasciate
    opzioni.fpsMax = snap.fpsMax; cadenza.fpsMax = snap.fpsMax;
    opzioni.autoQ = snap.autoQ; qManuale = !snap.autoQ;
    meteo.attivaAuto(snap.meteoAuto !== false);
    ciclo.t = snap.cicloT; ciclo.auto = snap.cicloAuto; ciclo.aggiorna(0);
    if (typeof applicaQualita === 'function') applicaQualita();
    perf.imposta(snap.perfAttivo);
    if (mondo.contaBlocchi !== snap.contaBlocchi) console.warn('[diagnostica] contaBlocchi cambiato!', snap.contaBlocchi, '→', mondo.contaBlocchi);
    _diagInCorso = false;
  }
}

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
// Le PALLE non hanno più una Map dedicata in main: sono entità ECS col
// componente esclusivo 'sfera', quindi si trovano con `ecs.ognuna('sfera', …)`.
// Il loro generatore è diventato una MACCHINA (registry.js), gestita qui sotto
// dal GestoreMacchine come qualunque altro furni-con-comportamento.
const gestoreMacchine = new GestoreMacchine();

// ---- CUORE ECS + TICK FISSO (Fasi 2-3a della rifondazione) -----------------
// Una sola istanza per il gioco. Questa corsia a passo fisso possiede PALLE e
// CREATURE; tutto il resto resta sul percorso per-frame di sempre. La fisica
// avanza a scatti di 1/20s indipendenti dagli fps (orologioSim), i sistemi
// girano in ordine (sistemiSim), l'agenda scarica i "pensieri" schedulati, e la
// resa interpola (sistemiResa) con orologioSim.alpha().
const ecs = new Registro();
registraComponentiPalle(ecs);       // registra il CORE cinematico (posizione/velocita/posizionePrec/vista)
registraComponentiCreature(ecs);    // + il componente 'creatura' (riusa quel core)
registraComponentiMacchine(ecs);    // + il componente 'macchina' (furni-con-comportamento)
const orologioSim = new Orologio();          // passo 1/20 s, come i game-tick di Minecraft
const rngSim = new Rng(0x1a27ec);            // deterministico: niente Math.random nella sim
const agenda = new Agenda();                 // tick PROGRAMMATI: qui vivono i "pensieri" delle creature
// SISTEMI DI SIM (a passo fisso, ordinati). L'ordine è esplicito e stabile.
const sistemiSim = new Sistemi();
sistemiSim.aggiungiSistema('palle-fisica', sistemaPalle, 100);
sistemiSim.aggiungiSistema('creature-moto', sistemaCreature, 200);
// SERVIZI: il bundle STABILE passato a tutti i sistemi di sim (niente ctx che
// cresce con riferimenti sparsi). 'dt' è il passo fisso; 'tick'/'notte' si
// aggiornano nel loop. player/particelle si agganciano sotto (qui sono in TDZ).
// 'scena' e 'audio' servono ai def-macchina (il Generatore crea il mesh della
// palla nella scena; le macchine possono suonare). player/particelle si agganciano
// più sotto (qui sono in TDZ). Il bundle resta STABILE: cresce solo di capacità.
const servizi = { ecs, mondo, scena: rig.scena, player: null, particelle: null, audio, rng: rngSim, agenda, dt: orologioSim.passoFisso, tick: 0, notte: false };
// SISTEMI DI RESA (una volta per FRAME, interpolati). Palle e creature insieme,
// in un registro ordinato invece che a mano nel loop.
const sistemiResa = new Sistemi();
sistemiResa.aggiungiSistema('palle-resa', sistemaResaPalle, 100);
sistemiResa.aggiungiSistema('creature-resa', (ctx) => creature.resa(ctx), 200);

// la camera si ferma sui BLOCCHI (non sui furni: esili, e facevano vibrare)
rig.solido = (x, y, z) => {
  const t = mondo.tipo(x, y, z);
  return !!t && !defDi(t).acqua;
};
const nuvole = new Nuvole(rig.scena, rig.mobile ? 4 : undefined);
const segnaPercorso = new SegnaPercorso(rig.scena);
nuvole.intervalloOmbra = rig.mobile ? 0.066 : 0.033;   // maschera ombre: 15Hz su telefono
const controller = new Controller(mondo, input);
// aggancio gli ingressi della corsia ECS ora che esistono (erano in TDZ sopra):
// il gatto (spinta di contatto / fuga delle creature) e i particellari (tuffo).
servizi.player = controller;
servizi.particelle = particelle;

// ---- PANNELLO DELLE MACCHINE -----------------------------------------------
// Il cruscotto dei macchinari: riepilogo vivo + manopole costruite da
// `def.opzioni`. main NON conosce nessuna macchina né nessuna manopola — passa
// il "cruscotto" (il componente `macchina`) e il pannello si arrangia.
// Sta QUI, in alto, e non insieme agli altri pannelli: `chiudiPannelli()` lo
// nomina, e un `const` più in basso sarebbe in temporal dead zone se qualcosa
// chiudesse i pannelli durante l'avvio (è già successo con lo zaino).
const pannelloMacchina = new PannelloMacchina({
  servizi,
  // il tasto AZIONA del pannello è la stessa identica strada del tocco breve
  onAziona: (m) => {
    if (toccaMacchina(gestoreMacchine, servizi, m.istanza)) { audio.sfx('ui'); segnaSalvataggio(); }
  },
  // una manopola girata è roba da salvare come lo è un blocco posato
  onCambio: () => segnaSalvataggio(),
});
const inventario = new Inventario();
const scavo = new Scavo(rig.scena);
const sim = new SimAcqua(mondo);
const lobby = new Lobby();

const badge = (id) => {
  // la zampa non è una cosa che si possiede: sono le mani vuote, e un "0"
  // stampato sopra la farebbe sembrare finita
  if (id === ZAMPA) return '';
  if (id === 'secchio') return inventario.secchioPieno ? '💧' : '';
  return inventario.quanti(id);
};
// dichiarato QUI (non dove viene creato) perche' onCambio puo' scattare
// durante l'avvio: un const dichiarato piu' sotto sarebbe in temporal dead
// zone e persino `zaino &&` lancerebbe ReferenceError.
let zaino = null;
inventario.onCambio = () => {
  if (strisca) strisca.aggiorna();
  if (zaino && zaino.aperto) datiZaino();   // conteggi vivi anche a zaino aperto
};

// LA BOLLA: il tasto grosso sotto il pollice. Fa una cosa sola — usa quello che
// hai in mano — e tenendolo premuto la ripete. NON serve più a scegliere: la
// scelta si fa toccando la tavolozza, che ormai sta sempre a schermo.
const bolla = new Bolla({
  onUsa: () => usaStrumento(),
  // il tieni-premuto ripete solo quando si costruisce: ripetere «interagisci»
  // accenderebbe e spegnerebbe la stessa lampada cinque volte al secondo
  ripetibile: () => costruisci,
});

/**
 * Il tocco sulla bolla: fa quello che ha senso per ciò che hai in mano.
 * zampa → interagisci · blocco/mobile → piazza · attrezzo → rompe ·
 * secchio → raccoglie o versa. Niente più tasti separati.
 *
 * RENDE `false` SE NON È SUCCESSO NIENTE, e serve al tieni-premuto della bolla
 * per fermarsi da solo: fermi sul posto si posa un blocco e poi la cella è
 * occupata, quindi senza questa risposta il gioco sputerebbe «lì è già
 * occupato» a raffica. Non si controlla l'esito delle singole funzioni (sono
 * dieci strade diverse che escono a metà): si guarda se il mondo è cambiato.
 */
function usaStrumento() {
  const prima = _ultimaModifica;
  if (!costruisci) { interagisci(); return true; }
  const voce = voceInMano();
  const cella = cellaBersaglio();
  if (voce && voce.id === 'secchio') {
    // il secchio agisce sulla cella bersaglio: normale verso l'alto, come se
    // ci si versasse sopra
    usaSecchio({ cella, normale: [0, 1, 0] });
  } else {
    costruisciSuCella(cella, !voce || voce.genere === 'attrezzo');
  }
  return _ultimaModifica !== prima;
}

// Seconda bolla: DOVE costruire rispetto al gatto. Era una ruota anche questa;
// adesso è un elenchino, perché una scelta che si fa due volte in una partita
// non fa in tempo a diventare memoria muscolare — cioè l'unica cosa per cui un
// radiale varrebbe la fatica.
const scelta = new Scelta();
const btnPosa = document.getElementById('btnPosa');
btnPosa.addEventListener('click', () => {
  if (scelta.aperta) return scelta.chiudi();
  audio.sfx('apri');
  scelta.apri(btnPosa, POSE.map((p) => ({ id: p.id, emoji: p.icona, nome: p.nome })), opzioni.posa || 'davanti',
    (id) => { impostaPosa(id); audio.sfx('ui'); });
});
function impostaPosa(id) {
  opzioni.posa = id;
  bersaglio.posa = id;
  btnPosa.textContent = posaCorrente().icona;
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

// ---- LA TAVOLOZZA: cosa hai in mano ------------------------------------------
//
// Il modello sta in gioco/tavolozza.js — otto posti, la zampa come oggetto fra
// gli altri, e la promessa che niente sparisce in silenzio. Qui c'è solo il
// cablaggio, ed è volutamente sottile: le viste (la striscia in fondo, il
// catalogo dello zaino, la faccia sulla bolla) leggono lo stesso identico
// oggetto, quindi non possono raccontare storie diverse. Prima ce n'erano due
// che si contraddicevano e una terza, invisibile, che decideva davvero.

function voceDa(id) {
  // le mani libere sono una voce come le altre: da qui in giù nessuno sa che
  // «Esplora» sia una modalità, e infatti non lo è più
  if (id === ZAMPA) return { genere: 'zampa', id, nome: 'Esplora', emoji: '🐾' };
  if (BLOCCHI[id]) return { genere: 'blocco', id, nome: BLOCCHI[id].nome, cima: BLOCCHI[id].cima, lato: BLOCCHI[id].lato };
  if (FURNI[id]) return { genere: 'furni', id, nome: FURNI[id].nome, emoji: FURNI[id].icona };
  if (ATTREZZI[id]) return { genere: 'attrezzo', id, nome: ATTREZZI[id].nome, emoji: ATTREZZI[id].emoji };
  return null;
}

const tavolozza = new Tavolozza();
let strisca = null;          // creata più sotto, col resto della GUI

/** Cosa si ha DAVVERO in mano: null a mani libere. Ha preso il posto del vecchio
 *  `VOCI[selezione]`, che leggeva un array parallelo tenuto in pari a mano.
 *
 *  IL VALORE È TENUTO DA PARTE e non ricalcolato a ogni chiamata: `voceDa()`
 *  costruisce un oggetto nuovo, e questa la leggono anche il ciclo di rendering
 *  (la zampa del gatto) e quello di rete (60 volte al secondo). Ricalcolare
 *  vorrebbe dire due oggetti al frame buttati via, cioè lavoro per il
 *  raccoglitore di rifiuti proprio mentre si cerca di tenere i frame. */
let _inMano = null;
function voceInMano() { return _inMano; }
function _ricalcolaMano() {
  const id = tavolozza.inMano();
  _inMano = !id || id === ZAMPA ? null : voceDa(id);
}

function rinfrescaTavolozza() {
  bolla.mostra(voceInMano());
  if (strisca) strisca.aggiorna();
  if (zaino && zaino.aperto) datiZaino();
}

/** Tiene in pari tutto ciò che dipende da COSA hai in mano. `costruisci` non è
 *  più uno stato a sé che si può disallineare: è solo «non sei a mani libere». */
function sincronizzaMano() {
  _ricalcolaMano();
  costruisci = !tavolozza.aManiLibere();
  hud.setModo(costruisci);
  document.getElementById('barraCostruisci').classList.toggle('visibile', costruisci);
  document.body.classList.toggle('mostra-posa', !!opzioni.comandiTouch && costruisci);
  rinfrescaTavolozza();
  if (costruisci) aggiornaGhost(); else nascondiGhost();
}

tavolozza.onCambio = () => { sincronizzaMano(); segnaSalvataggio(); };

let rotSel = 0;
let costruisci = false;      // = non sei a mani libere (lo tiene vero sincronizzaMano)
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
  const voce = voceInMano();
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
  const voce = voceInMano();
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

  // palla più vicina (entro ~1.6) → calcio nella direzione gatto→palla. Ora la
  // palla è un'ENTITÀ ECS: leggo il componente posizione, il calcio scrive velocita.
  let palla = null, pallaPos = null, dPalla = 1.6 * 1.6;
  for (const e of ecs.ognuna('sfera', 'posizione')) {
    const pp = ecs.leggi(e, 'posizione');
    const d = (pp.x - px) ** 2 + (pp.z - pz) ** 2;
    if (d < dPalla && Math.abs(pp.y - py) < 1.6) { dPalla = d; palla = e; pallaPos = pp; }
  }
  // furni interagibile più vicino (entro ~2.2): macchina (onInteragisci o anche
  // solo MANOPOLE — il tasto E ci apre il pannello), lampione (stati) o sedia.
  // `haPannello` in questo elenco non è un dettaglio: senza, una macchina che ha
  // il cruscotto ma nessuna azione al tocco (Generatore, Idrovora) sarebbe
  // raggiungibile SOLO col mouse, e da telefono — dove si gioca con la bolla —
  // non ci si arrivava affatto.
  let furni = null, dFurni = 2.2 * 2.2;
  for (const ist of arredo.istanze) {
    if (!ist.def.stati && !ist.def.seduta && !ist.def.onInteragisci && !haPannello(ist.def)) continue;
    let dmin = Infinity;
    for (const [cx0, , cz0] of ist.celle) {
      const d = (cx0 + 0.5 - px) ** 2 + (cz0 + 0.5 - pz) ** 2;
      if (d < dmin) dmin = d;
    }
    if (dmin < dFurni) { dFurni = dmin; furni = ist; }
  }

  if (palla !== null && (!furni || dPalla <= dFurni)) {
    calciaPalla(ecs, palla, pallaPos.x - px, pallaPos.z - pz);
    particelle.emetti(pallaPos.x, pallaPos.y, pallaPos.z, 0, 1.4, 0, 0.4, 0.5, 0, [1, 1, 0.6]);
    audio.sfx('palla');
    hud.toast('⚽ Spinta!');
    return;
  }
  if (furni) {
    // MACCHINE: il gancio generico ha la precedenza sulle interazioni cablate.
    // Se il def gestisce il tocco (onInteragisci → true), ci fermiamo qui — ma
    // segnaliamo (le prime volte) che tenendo premuto ci sono anche le manopole.
    if (toccaMacchina(gestoreMacchine, servizi, furni)) { suggerisciPannello(furni); segnaSalvataggio(); return; }
    // nessuna azione al tocco ma delle manopole sì: il tocco APRE il pannello
    if (apriPannelloMacchina(furni)) return;
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
    // MACCHINE: gancio generico prima delle interazioni cablate (click in Esplora)
    if (toccaMacchina(gestoreMacchine, servizi, furni.istanza)) { suggerisciPannello(furni.istanza); segnaSalvataggio(); return; }
    if (apriPannelloMacchina(furni.istanza)) return;   // niente azione, ma ha manopole: apri il cruscotto
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
  const v = voceInMano();
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
  const voce = voceInMano();
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
  const inMano = voceInMano();
  if (!destro && inMano && inMano.genere === 'attrezzo' && inMano.id === 'secchio') {
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

  const voce = inMano;
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

/**
 * «DAMMI QUELLO CHE STO GUARDANDO» — il gesto migliore di Minecraft, e uno dei
 * pochi che nessuno insegna eppure tutti finiscono per usare. Guardi un muro di
 * mattoni, premi il tasto centrale, e hai i mattoni in mano: niente giro dallo
 * zaino, niente cercare fra otto posti. Costruire vuol dire soprattutto
 * continuare quello che c'è già, e questo lo rende un gesto solo.
 */
function copiaCosaGuardo(sx, sy) {
  const furni = puntaFurni(sx, sy);
  const blocco = puntaGriglia(sx, sy);
  let id = null;
  if (furni && (!blocco || furni.dist < blocco.dist)) id = furni.istanza.defId;
  else if (blocco) id = tipoBase(mondo.tipo(...blocco.cella));
  if (!id || !voceDa(id)) { hud.toast('Qui non c\'è niente da copiare 🐾'); return; }
  raccontaPresa(id, tavolozza.prendi(id));
}

input.onClick = (sx, sy, bottone) => {
  // in AR avanzata il PRIMO tocco appoggia il diorama sulla superficie puntata
  if (modalitaXR.attiva && !modalitaXR.piazzato) { modalitaXR.piazzaAlReticolo(); return; }
  if (bottone === 1) { copiaCosaGuardo(sx, sy); return; }
  if (costruisci) clickCostruisci(sx, sy, bottone === 2 || modalitaRompi);
  else if (bottone === 0) clickEsplora(sx, sy);
};
// TOCCO LUNGO = LE MANOPOLE. Vale solo in Esplora: in Costruisci il dito sta
// posando blocchi, e un pannello che spunta mentre si costruisce sarebbe un
// agguato. La regola completa (e il perché) è in ui/pannelloMacchina.js.
input.onPressione = (sx, sy) => {
  if (costruisci || modalitaXR.attiva) return;
  const furni = puntaFurni(sx, sy);
  if (!furni) return;
  if (apriPannelloMacchina(furni.istanza)) hud.toast('⚙️ Impostazioni');
};
input.onMuovi = (sx, sy) => { mira.x = sx; mira.y = sy; };

// ---- comandi touch: joystick + tasti (salta/scendi/distruggi/piazza) ----------
// Distruggi e Piazza agiscono al CENTRO dello schermo (il mirino): si orbita
// la camera per inquadrare la cella e si tocca il tasto.
// Qui resta SOLO joystick + salto: rompere/piazzare/interagire li fa la bolla
const comandiTouch = new ComandiTouch(input, {});

input.onTasto = (codice, e) => {
  if (codice === 'KeyB') impostaModo(!costruisci);
  // Maiusc+E/F = l'equivalente da tastiera del tocco lungo: le manopole della
  // macchina più vicina, senza doverla mirare col mouse.
  else if ((codice === 'KeyE' || codice === 'KeyF') && e.shiftKey) {
    const ist = macchinaVicina();
    if (!ist || !apriPannelloMacchina(ist)) hud.toast('Nessuna macchina da regolare qui intorno 🐾');
  }
  else if (codice === 'KeyE' || codice === 'KeyF') interagisci();
  else if (codice === 'KeyG') { impostaPerf(); hud.toast(_perfAcceso ? '⏱ Misuratore GPU acceso (G)' : 'Misuratore GPU spento'); }
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
  else if (/^Digit[1-8]$/.test(codice)) tavolozza.seleziona(Number(codice.slice(5)) - 1);
  if (codice === 'Space') e.preventDefault();
};

// LA ROTELLINA scorre la tavolozza, come in ogni gioco a blocchi da quindici
// anni a questa parte. È l'unico gesto che non va insegnato a nessuno.
addEventListener('wheel', (e) => {
  if (document.querySelector('.hud.aperto, #opzioni.aperto')) return;   // un pannello aperto scorre per conto suo
  if (e.deltaY === 0) return;
  tavolozza.scorri(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

/** Il tasto B e la pillola: entra o esce dalla costruzione. Adesso è solo un
 *  modo veloce di prendere in mano la zampa (o di riprendere l'ultimo attrezzo
 *  usato), perché la modalità NON è più uno stato a sé. */
let _ultimoOggetto = 1;
function impostaModo(attivo) {
  if (attivo === costruisci) return;
  if (!attivo) {
    _ultimoOggetto = tavolozza.attivo;
    tavolozza.seleziona(tavolozza.postoDi(ZAMPA));
  } else {
    // torna dove eri; se lì non c'è più niente, il primo posto con qualcosa
    let i = tavolozza.id(_ultimoOggetto) && _ultimoOggetto !== tavolozza.postoDi(ZAMPA) ? _ultimoOggetto : -1;
    if (i < 0) i = tavolozza.elenco().findIndex((id) => id && id !== ZAMPA);
    if (i < 0) { hud.toast('La tavolozza è vuota: apri lo zaino 🎒'); return; }
    tavolozza.seleziona(i);
  }
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
  if (tranne !== 'macchina' && pannelloMacchina.aperto) pannelloMacchina.chiudi();
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

hud.onModo = () => impostaModo(!costruisci);
hud.onTempo = (t) => impostaTempoGioco(t);
document.getElementById('btnPiazza').addEventListener('click', () => impostaRompi(false));
document.getElementById('btnRompi').addEventListener('click', () => impostaRompi(true));
document.getElementById('btnRuota').addEventListener('click', () => { rotSel = (rotSel + 1) % 4; aggiornaGhost(); });

// ---- le tre viste della tavolozza --------------------------------------------

/** LA FRASE CHE MANCAVA. Prendere una cosa può spostarne un'altra fuori dalla
 *  tavolozza, e prima succedeva in silenzio: la barra cambiava contenuto e non
 *  si capiva perché. Adesso lo si dice — e si dice anche che non è persa, che è
 *  il vero motivo per cui la cosa non deve preoccupare. */
function raccontaPresa(id, esito) {
  const nome = (voceDa(id) || { nome: id }).nome;
  if (esito.pieno) {
    audio.sfx('errore');
    hud.toast('Tutti gli otto posti sono fissati 📌 — liberane uno per prendere altro', 3400);
    return false;
  }
  audio.sfx('raccogli');
  if (esito.spiazzato) {
    const via = (voceDa(esito.spiazzato) || { nome: esito.spiazzato }).nome;
    hud.toast(`✋ ${nome} · ${via} è tornata nello zaino 🎒`, 3000);
  } else {
    hud.toast(`✋ ${nome}`);
  }
  if (strisca) strisca.lampeggia(esito.posto);
  return true;
}

// La striscia della barra bassa: quella che si vede giocando.
strisca = new StriscaTavolozza({
  tavolozza,
  voceDa,
  quanti: badge,
  onScegli: (i) => { if (tavolozza.id(i)) { tavolozza.seleziona(i); audio.sfx('ui'); } },
  onCambio: () => { rinfrescaTavolozza(); segnaSalvataggio(); },
  toast: (m) => hud.toast(m),
});

// L'inventario vive in ui/zaino.js: qui gli si passano solo i DATI freschi e i
// callback. Nessuna logica di interfaccia in main.
zaino = new Zaino({
  voceDa,
  quanti: badge,
  strisca: null,          // la seconda striscia nasce sotto: il suo DOM è di Zaino
  // UN TOCCO = ce l'hai in mano. Il posto lo sceglie la tavolozza da sola, e se
  // per farci stare la cosa nuova ne ha spostata un'altra lo dice a voce alta.
  onPrendi: (id) => {
    const esito = tavolozza.prendi(id);
    if (!raccontaPresa(id, esito)) return;
    apriZaino(false);                       // preso: si torna a giocare
  },
  // …oppure lo si decide: trascinare la carta in un posto preciso.
  onMetti: (posto, id) => {
    tavolozza.metti(posto, id);
    tavolozza.seleziona(posto);
    audio.sfx('ui');
    strisca.lampeggia(posto);
  },
  puoiCraftare: (r) => puoiCraftare(r, (id) => inventario.quanti(id)),
  onCraft: (ricetta) => {
    if (!crafta(ricetta, inventario)) { audio.sfx('errore'); hud.toast('Ti mancano i materiali 🤏'); return; }
    audio.sfx('crea');
    rinfrescaTavolozza();
    datiZaino();
    hud.toast(`🔨 ${(voceDa(ricetta.out) || { nome: ricetta.out }).nome} ×${ricetta.n}`);
  },
});

// LA SECONDA STRISCIA vive in fondo allo zaino: stesso modello, stessa classe,
// così i posti si sistemano dove si guarda il catalogo invece che a memoria.
// Nasce QUI e non prima perché il suo elemento lo costruisce lo Zaino: crearla
// col DOM ancora vuoto le farebbe agguantare per ripiego la striscia della
// barra bassa, cancellandola.
zaino.ctx.strisca = new StriscaTavolozza({
  el: document.getElementById('tavolozzaZaino'),
  tavolozza,
  voceDa,
  quanti: badge,
  onScegli: (i) => { if (tavolozza.id(i)) { tavolozza.seleziona(i); audio.sfx('ui'); } },
  onCambio: () => { rinfrescaTavolozza(); segnaSalvataggio(); },
  toast: (m) => hud.toast(m),
});

// LA REGOLA TOCCO-VS-PANNELLO (il perché sta in ui/pannelloMacchina.js):
//   · macchina SENZA azione al tocco → il tocco apre direttamente il pannello;
//   · macchina CON azione            → tocco breve = azione, TOCCO LUNGO = pannello.
// Qui c'è solo l'apertura; chi la chiama decide con quale gesto.
function apriPannelloMacchina(istanza) {
  if (!istanza || !haPannello(istanza.def)) return false;
  const m = macchinaDi(gestoreMacchine, servizi, istanza);
  if (!m) return false;
  chiudiPannelli('macchina');
  audio.sfx('apri');
  pannelloMacchina.apri(m);
  return true;
}

// SCOPERTA DEL TOCCO LUNGO. Un gesto che nessuno ti ha insegnato non esiste: le
// prime due volte che tocchi una macchina che ha SIA un'azione SIA delle
// manopole, il gioco lo dice. Due e non sempre — al terzo giro sarebbe rumore.
const _suggeritoLungo = new Map();
function suggerisciPannello(istanza) {
  if (!istanza || !haPannello(istanza.def)) return;
  if (typeof istanza.def.onInteragisci !== 'function') return;   // il tocco apre già il pannello
  const n = _suggeritoLungo.get(istanza.defId) || 0;
  if (n >= 2) return;
  _suggeritoLungo.set(istanza.defId, n + 1);
  hud.toast('⚙️ Tieni premuto sulla macchina per regolarla', 3200);
}

/** Il furni-macchina più vicino al gatto (stesso raggio di `interagisci`). */
function macchinaVicina() {
  let vicino = null, dmin = 2.2 * 2.2;
  for (const ist of arredo.istanze) {
    if (!haPannello(ist.def)) continue;
    for (const [cx0, , cz0] of ist.celle) {
      const d = (cx0 + 0.5 - controller.pos.x) ** 2 + (cz0 + 0.5 - controller.pos.z) ** 2;
      if (d < dmin) { dmin = d; vicino = ist; }
    }
  }
  return vicino;
}

/**
 * Il CATALOGO per lo zaino, ricavato dai dati invece che scritto a mano: le
 * categorie dei blocchi sono già in world/blocks.js, e i mobili si dividono da
 * soli in "arredo" e "macchine" a seconda che abbiano delle manopole
 * (`haPannello`). Aggiungere un macchinario nuovo lo fa comparire nella scheda
 * giusta senza toccare una riga qui — è la stessa promessa del pannello delle
 * manopole, applicata all'inventario.
 */
function datiZaino() {
  const eMacchina = (id) => haPannello(FURNI[id]);
  const voci = (ids) => ids.map(voceDa).filter(Boolean);
  const sezioni = [
    ...CATEGORIE_BLOCCHI.map((c) => ({ id: c.id, nome: c.nome, emoji: c.emoji, voci: voci(c.blocchi) })),
    { id: 'mobili', nome: 'Mobili', emoji: '🪑', voci: voci(Object.keys(FURNI).filter((id) => !eMacchina(id))) },
    { id: 'macchine', nome: 'Macchine', emoji: '⚙️', voci: voci(Object.keys(FURNI).filter(eMacchina)) },
    { id: 'attrezzi', nome: 'Attrezzi', emoji: '🧰', voci: voci(Object.keys(ATTREZZI)) },
  ].filter((s) => s.voci.length);      // una categoria vuota è solo una scheda da saltare
  const ricette = RICETTE.map((r) => ({
    ricetta: r, n: r.n,
    voce: voceDa(r.out) || { id: r.out, nome: r.nome },
    ingredienti: r.in.map((m) => `${m.q} ${(voceDa(m.id) || { nome: m.id }).nome}`).join(' + '),
  }));
  zaino.imposta({ sezioni, ricette });
}

function apriZaino(apri) {
  const mostra = apri !== false;
  if (mostra) { chiudiPannelli('zaino'); datiZaino(); }
  zaino.apri(mostra);
}
/**
 * Rilegge la tavolozza da un salvataggio. Regge DUE formati, e non per pigrizia:
 * la chiave `tavolozza` è quella nuova (otto posti, i 📌, quale hai in mano) e
 * `hotbar` è l'array di nove id che sta in tutte le partite già salvate. La
 * conversione la fa il modello (gioco/tavolozza.js, `applica`).
 *
 * TOGLIE ANCHE I FANTASMI: un blocco inventato con l'Officina e poi cancellato
 * resterebbe come un posto che punta a un id inesistente — si vedrebbe un
 * riquadro vuoto che non si può né prendere né togliere.
 */
function applicaTavolozza(dati) {
  tavolozza.applica(dati && dati.tavolozza ? dati.tavolozza : (dati && dati.hotbar));
  for (const id of tavolozza.elenco()) if (id && !voceDa(id)) tavolozza.dimentica(id);
  sincronizzaMano();
}
document.getElementById('btnZaino').addEventListener('click', () => { audio.sfx('apri'); apriZaino(); });
document.getElementById('btnChiudiZaino').addEventListener('click', () => { audio.sfx('chiudi'); apriZaino(false); });

// ---- salvataggio ----------------------------------------------------------------

let salvataggioSporco = false;
let ultimoSalvataggio = 0;
let _ultimaModifica = 0;     // quando è stata toccata l'ultima cosa da salvare
let _salvInCoda = false;     // un salvataggio è già pianificato per l'idle
function segnaSalvataggio() { salvataggioSporco = true; _ultimaModifica = performance.now(); }

/**
 * Salva DAVVERO, ma FUORI dal frame di rendering. serializza() dell'intero
 * diorama (100k blocchi → ~2MB JSON) costa ~150ms su desktop e ~600ms su
 * mobile: dentro il ciclo era un FREEZE a ogni salvataggio, ogni 3s. Qui la
 * scrittura vera va in requestIdleCallback — il browser la esegue quando ha
 * tempo libero tra un frame e l'altro, non mentre disegna il movimento. Il
 * ripiego setTimeout copre chi non ha requestIdleCallback (Safari iOS).
 */
function _salvaOra() {
  _salvInCoda = false;
  if (!salvataggioSporco || modalitaOspite) return;
  salvaLocale(serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() }));
  salvataggioSporco = false;
  ultimoSalvataggio = performance.now();
}
function pianificaSalvataggio() {
  if (_salvInCoda) return;
  _salvInCoda = true;
  if (window.requestIdleCallback) requestIdleCallback(_salvaOra, { timeout: 3000 });
  else setTimeout(_salvaOra, 0);
}

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
// LE SAGOME CHE SI VEDONO ATTRAVERSO (fx/sagomaVista.js). Quella del gatto che
// guidi nasce subito; quelle degli amici in rete nascono col loro gatto e si
// accendono solo se l'opzione «anche degli altri» è su — in una stanza affollata
// dieci sagome sovrapposte sono rumore, non aiuto.
let sagomaMia = null;

// ---- L'OCCHIO DI BUE: dove sta il gatto sullo schermo ----------------------
// Il buco lo disegna lo shader (fx/materials.js, foroOcchioDiBue), ma il CENTRO
// e la distanza li deve sapere qualcuno: proiettare un punto è aritmetica, e
// farlo una volta per frame invece che per pixel è tutta la differenza.
//
// IN PIXEL DEL BUFFER, non della finestra: gl_FragCoord vive lì, e con la scala
// di rendering dinamica (0.45–1) le due cose non coincidono affatto. Prendere
// le misure dal canvas invece che da innerWidth è il motivo per cui il cerchio
// resta centrato anche quando la qualità automatica abbassa la risoluzione.
//
// IL RAGGIO CRESCE COL VICINO: da lontano il gatto è piccolo e un cerchio largo
// sarebbe un buco nel paesaggio; addosso serve spazio per vederlo muoversi.
const _foroP = new THREE.Vector3();
const _foroDir = new THREE.Vector3();
let _foroForza = 0;

/** Quanti BLOCCHI stanno fra l'obiettivo e il gatto. Un albero non conta: la
 *  sua fronda non è un blocco, e infatti non copre — mentre un muro sì. È la
 *  differenza fra «si apre sempre» e «si apre quando serve». */
function bloccatoDavanti() {
  _foroDir.copy(rig.camera.position).sub(_foroP);
  const dist = _foroDir.length();
  if (dist < 1.5) return 0;
  _foroDir.divideScalar(dist);
  let n = 0;
  // si campiona ogni mezzo blocco, saltando le due estremità (il terreno sotto
  // i piedi del gatto e il pelo dell'obiettivo non sono ostacoli)
  for (let t = 1.0; t < dist - 0.8; t += 0.5) {
    const x = Math.floor(_foroP.x + _foroDir.x * t);
    const y = Math.floor(_foroP.y + _foroDir.y * t);
    const z = Math.floor(_foroP.z + _foroDir.z * t);
    if (mondo.solido(x, y, z)) n++;
  }
  return n;
}

// ---- L'OCCHIO DI BUE: dove sta il gatto sullo schermo ----------------------
// Il velo lo disegna lo shader (fx/materials.js, velaOcchioDiBue), ma il CENTRO,
// la distanza e soprattutto QUANTO APRIRE li decide qui: proiettare un punto e
// contare i blocchi davanti è aritmetica, e farlo una volta per frame invece
// che per pixel è tutta la differenza.
//
// IN PIXEL DEL BUFFER, non della finestra: gl_FragCoord vive lì, e con la scala
// di rendering dinamica (0.45–1) le due cose non coincidono affatto.
//
// LA FORZA SALE E SCENDE PIANO (inseguimento, non salto): con due blocchi che
// entrano ed escono dalla linea di vista camminando, un interruttore secco
// farebbe lampeggiare mezzo schermo.
function aggiornaForo(dt) {
  if (opzioni.foro === false) { _foroForza = 0; impostaForo(0, 0, 0, 1, 1, 0); return; }
  _foroP.copy(controller.pos); _foroP.y += 0.55;          // altezza del busto
  // SOGLIA: uno o due blocchi non aprono niente (è il caso di uno spigolo che
  // sfiora), da tre in su si apre tutto — «non 1-2 alberi ma se ci sono blocchi»
  const n = bloccatoDavanti();
  const voluta = n <= 1 ? 0 : Math.min(1, (n - 1) / 2);
  const k = Math.min(1, (dt || 0.016) * 8);
  _foroForza += (voluta - _foroForza) * k;
  if (_foroForza < 0.01) { _foroForza = 0; impostaForo(0, 0, 0, 1, 1, 0); return; }

  const dist = _foroP.distanceTo(rig.camera.position);
  _foroP.project(rig.camera);
  const cv = rig.renderer.domElement;
  const px = (_foroP.x * 0.5 + 0.5) * cv.width;
  const py = (_foroP.y * 0.5 + 0.5) * cv.height;          // gl_FragCoord: y in su
  const scala = cv.height / 720;                          // il raggio è tarato su 720p
  const r = (opzioni.foroRaggio ?? 110) * scala * Math.min(1.6, 14 / Math.max(4, dist));
  impostaForo(px, py, dist, r, r * 0.55, _foroForza);
}

function aggiornaSagome() {
  const on = opzioni.sagoma !== false;
  if (on && !sagomaMia) sagomaMia = new SagomaVista(rig.scena, gatto.gruppo);
  if (sagomaMia) sagomaMia.imposta(on);
  for (const g of gattiRemoti.values()) {
    if (on && opzioni.sagomaTutti && !g.sagoma) g.sagoma = new SagomaVista(rig.scena, g.gatto.gruppo, 0xffd9a0);
    if (g.sagoma) g.sagoma.imposta(on && opzioni.sagomaTutti);
  }
}

// L'ERBA nel vento: un solo oggetto, l'animazione tutta nel vertex shader.
const erba = new Erba(rig.scena);
// LE FOGLIE: mucchi tondi sparsi sul prato, e si spazzano via camminandoci
// dentro. Stessa architettura dell'erba (istanze + semina a chunk), ma la
// distribuzione è a mucchi e il calpestio LEVA le foglie invece di piegarle.
const foglie = new Foglie(rig.scena);
let _cellaFoglie = 0;   // ultima cella calpestata: si controlla solo quando cambia

/**
 * IL MUCCHIO CHE SI SPAZZA. Si guarda SOLO quando il giocatore cambia cella —
 * a sessanta fotogrammi al secondo la stessa cella tornerebbe sessanta volte, e
 * il mucchio esploderebbe sessanta volte di fila. Le foglie che partono sono
 * particelle vere, del colore di QUEL mucchio: quelle che restano a terra le
 * toglie foglie.calpesta(), e non ricrescono dietro le spalle.
 */
/**
 * SCUOTI L'ALBERO SE CI SBATTI DENTRO. Si guarda solo quando il giocatore cambia
 * cella — come per le foglie — e solo le otto celle attorno: un albero occupa la
 * sua colonna, quindi passarci accanto vuol dire avere la sua cella a un passo.
 * Una botta alla volta basta: contro un albero per volta ci si sbatte.
 */
// I dischi delle nuvole, riusati ogni frame: senza, sono dieci oggetti nuovi al
// fotogramma buttati al garbage collector — cioè uno scatto ogni tanto.
const _dischiNuvole = [];
const _lampoCol = new THREE.Color();
let _tSchizzo = 0;

/**
 * GLI SCHIZZI A TERRA. La pioggia cadeva e non toccava niente: nessun segno di
 * dove arrivava. Qui, qualche volta al secondo, si sceglie un punto a caso
 * attorno al giocatore, si controlla che ci sia una NUVOLA SOPRA (se no lì non
 * piove) e si cerca il terreno; sul terreno parte uno spruzzo cortissimo.
 *
 * Perché a campione e non una goccia per volta: le gocce vivono nel vertex
 * shader e la CPU non sa dove sono nessuna di loro — inseguirle vorrebbe dire
 * simularle. Un campione ogni tanto costa una lettura del mondo e dà la stessa
 * informazione all'occhio, che è «sta piovendo LÌ».
 */
function schizziPioggia(dt, forza) {
  if (forza <= 0.02 || pioggia.materiale.uniforms.uNeve.value > 0.5) return;
  _tSchizzo -= dt;
  if (_tSchizzo > 0) return;
  _tSchizzo = 0.05;
  const quanti = 1 + Math.floor(meteo.forza * 3);
  for (let i = 0; i < quanti; i++) {
    const a = Math.random() * 6.283, r = 2 + Math.random() * 12;
    const x = controller.pos.x + Math.cos(a) * r, z = controller.pos.z + Math.sin(a) * r;
    // c'è una nuvola sopra questo punto?
    let sotto = false;
    for (const d of _dischiNuvole) {
      if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r) { sotto = true; break; }
    }
    if (!sotto) continue;
    const cx = Math.floor(x), cz = Math.floor(z);
    let y = null;
    for (let dy = 3; dy >= -6; dy--) {
      const t = mondo.tipo(cx, Math.floor(controller.pos.y) + dy, cz);
      if (t && !defDi(t).acqua) { y = Math.floor(controller.pos.y) + dy + 1; break; }
    }
    if (y === null) continue;
    // spruzzo BASSO e corto: una goccia che rimbalza, non una fontana
    for (let k = 0; k < 2; k++) {
      const b = Math.random() * 6.283, vr = 0.35 + Math.random() * 0.5;
      particelle.emetti(x, y + 0.04, z, Math.cos(b) * vr, 0.7 + Math.random() * 0.5,
        Math.sin(b) * vr, 0.28, 0.28, 0, [0.78, 0.87, 1.0]);
    }
  }
}

function urtaVegetazione(cx, cz) {
  const y = Math.floor(controller.pos.y + 0.1);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        const ist = mondo.furniIn(cx + dx, y + dy, cz + dz);
        if (!ist || !ist.def || !ist.def.vento) continue;
        urtaFurni(controller.pos.x, controller.pos.z, 2.2);
        return;
      }
    }
  }
}

function calpestaFoglie() {
  if (!controller.aTerra) return;
  const cx = Math.floor(controller.pos.x), cz = Math.floor(controller.pos.z);
  const k = (cx + 2048) * 4096 + (cz + 2048);
  if (k === _cellaFoglie) return;
  _cellaFoglie = k;
  // l'urto agli alberi vale ANCHE con le foglie spente: sono due cose diverse
  // che condividono soltanto il momento in cui conviene guardare (cambio cella)
  urtaVegetazione(cx, cz);
  if (!foglie.attiva) return;
  const b = foglie.calpesta(cx, cz);
  if (!b) return;
  const y = controller.pos.y + 0.12;
  // QUELLE CHE VOLANO VIA SONO FOGLIE, non pallini del colore giusto: stessa
  // sagoma allungata di quelle a terra, e svolazzano invece di cadere come
  // sassi (fx/particelle.js, aForma). Vivono piu' a lungo proprio perche' il
  // bello e' guardarle scendere.
  // LA MISURA VIENE DAL MUCCHIO. Erano «minuscole rispetto alle foglie», ed era
  // vero: la scala era una costante scelta a occhio mentre le foglie a terra
  // hanno un lato loro. Un punto di lato L unità di mondo, a distanza d, occupa
  // circa L·751/d pixel; gl_PointSize vale scala·130/d. Da qui scala ≈ L·5.8, e
  // un filo in più perché la sagoma della foglia non riempie tutto il quadrato.
  const scala = Math.max(0.5, (b.lato || 0.22) * 6.2);
  const quante = Math.min(6, b.quante);
  for (let i = 0; i < quante; i++) {
    const a = Math.random() * 6.283, vr = 0.55 + Math.random() * 0.9;
    particelle.emetti(cx + 0.5 + (Math.random() - 0.5) * 0.8, y + 0.05,
      cz + 0.5 + (Math.random() - 0.5) * 0.8,
      Math.cos(a) * vr, 1.1 + Math.random() * 0.7, Math.sin(a) * vr,
      2.0, scala, 0, b.colore, 0.05 + Math.random() * 0.95);
  }
}

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
    if (opzioni.sagoma !== false && opzioni.sagomaTutti) {
      g.sagoma = new SagomaVista(rig.scena, g.gatto.gruppo, 0xffd9a0);
      g.sagoma.imposta(true);
    }
  }
  return g;
}
function rimuoviGattoRemoto(id) {
  const g = gattiRemoti.get(id);
  if (g) {
    rig.scena.remove(g.gatto.gruppo);
    if (g.sagoma) g.sagoma.smonta(rig.scena);
    gattiRemoti.delete(id);
  }
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
  esportaFile(serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() }));
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
    applicaTavolozza(dati);
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
  return { ...serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() }), nome };
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
    applicaTavolozza(dati);
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
    localStorage.setItem(CHIAVE_SNAPSHOT, JSON.stringify(serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() })));
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
    applicaTavolozza(dati);
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
    perf: (on) => impostaPerf(on),
    diagnostica: () => eseguiDiagnostica(),
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
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
    // BANCO OMBRE E LUCI: le sagome contro il sole, le terrazze, gli ingombri e
    // la MATRICE delle sorgenti (raggio × intensità × colore × ombra), che è la
    // carta dei campioni da guardare prima di scrivere un numero nell'Officina.
    // Arreda: i mobili glieli piazza qui chi chiama, il generatore non conosce
    // l'arredo e non deve conoscerlo.
    // MONDO GIGANTE: il banco di CARICO — montagne alte, mezzo milione di
    // blocchi, dimensionato per stare appena sotto il paracadute della griglia
    // luce, così le prestazioni si misurano CON le ombre accese.
    mondoGigante: () => conCaricamento('⛰ Genero il mondo gigante…', () => {
      salvaSnapshot(false);
      arredo.svuota();
      const r = generaMondoGigante(mondo, (Math.random() * 1e4) | 0);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
      ricostruisciBlocchiSpeciali();
      for (const [x, y, z] of r.alberi) arredo.piazza('albero', [x, y, z], 0, true);
      for (const [x, y, z] of r.lampioni) arredo.piazza('lampione', [x, y, z], 0, true);
      const y0 = mondo.appoggioInColonna(0, 0, 40, 40) ?? 8;
      controller.spawn([0, y0 + 1, 0]);
      rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      segnaSalvataggio();
      const st = mesher.statistiche || {};
      hud.toast('⛰ Mondo gigante: montagne fino a quota ~35, ombre accese — è il banco delle prestazioni (G per i numeri)', 6000);
      return r;
    }),
    bancoOmbre: () => conCaricamento('🌗 Preparo il banco delle ombre…', () => {
      salvaSnapshot(false);
      arredo.svuota();
      const r = generaBancoOmbre(mondo);
      for (const f of r.furni) arredo.piazza(f.id, f.cella, f.rot, true);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
      ricostruisciBlocchiSpeciali();
      controller.spawn(r.spawn);
      rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      segnaSalvataggio();
      menuDebug.mostraZone(r.zone, (piedi) => {
        controller.spawn(piedi);
        rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      });
      hud.toast(`🌗 Banco ombre: ${r.furni.length} mobili e ${r.sorgenti.length} sorgenti di prova`
        + ' — le sagome si guardano di giorno, la matrice di notte (tasto T per l\'ora)', 7000);
      return r;
    }),
    // Mondo «test dei macchinari»: TUTTE le macchine già montate, ognuna col
    // contorno che le serve per lavorare (acqua per la pompa, spiazzo per la
    // palla, catena allineata). Unico mondo di prova che arreda: `arredo` va
    // passato a `genera`, e non si svuota prima — se lo svuota lui.
    testMacchine: () => conCaricamento('⚙️ Preparo il banco dei macchinari…', () => {
      salvaSnapshot(false);
      const r = generaTestMacchine(mondo, arredo);
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
      ricostruisciBlocchiSpeciali();
      for (const c of r.acqua) sim.pianificaAttorno(c);   // assesta il pelo della pozza
      // il reconcile SUBITO: senza, le macchine appena posate restano furni muti
      // fino al prossimo giro del loop e la scena sembra morta per un istante.
      gestoreMacchine.sincronizza(ecs, servizi, arredo.istanze);
      controller.spawn(r.spawn);
      rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      segnaSalvataggio();
      menuDebug.mostraZone(r.zone, (piedi) => {
        controller.spawn(piedi);
        rig.bersaglio.copy(controller.pos).add(new THREE.Vector3(0, 1, 0));
      });
      hud.toast(`⚙️ Banco dei macchinari: ${r.macchine.length} macchine montate · tocca per usarle, TIENI PREMUTO per le manopole`, 7000);
      return r;
    }),
    isolaDemo: () => conCaricamento('🏝 Nuova isola…', () => {
      salvaSnapshot(false);
      menuDebug.mostraZone(null);
      nuovaIsola();
      mesher.ricostruisciTutto(mondo);
      ricostruisciLuciBlocchi();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
      rinfrescaTavolozza();
      svuotaGhostBlocchi();
      if (remesh) {                       // colori/luci baked: si rifà il mondo LIVE
        conCaricamento('🛠 Applico le modifiche…', () => {
          mesher.ricostruisciTutto(mondo);
          ricostruisciLuciBlocchi();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
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
      applicaTavolozza(salvato);
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
  gestoreMacchine.sincronizza(ecs, servizi, arredo.istanze);   // macchine dai furni (ex sincronizzaPalle)

  sincronizzaMano();
  applicaOpzioni(false);     // fog/distanza/effetti salvati dall'utente (⚙️)

  // debug in console
  window.LANTERN = { mondo, arredo, controller, ciclo, rig, gatto, nuvole, scavo, FURNI, BLOCCHI, mesher, aggiornaLuci, creaLuceLeggera, spostaLuce, rimuoviLuce, generaArcipelago, generaOpenWorld, generaCollaudo, generaTestLuci, generaTestMacchine, inventario, tavolozza, strisca, zaino, bolla, scelta, sim, lobby, menuDebug, rompiBlocco, riflesso, pioggia, particelle, gestoreMacchine, guidaMacchina, toccaMacchina, macchinaDi, pannelloMacchina, apriPannelloMacchina, ecs, orologioSim, passo, sistemiSim, sistemiResa, rngSim, servizi, agenda, creature, sistemaCreature, pensaCreatura, calciaPalla, sistemaPalle, sistemaResaPalle, creaEntitaPalla, distruggiPalla, schiumaTop, aggiornaSchiumaAcqua, meteo, modalitaAR, modalitaXR, particelleBlocchi, luciBlocchi, nidiFatui, fuochiFatui, statLuci, hud, cadenza, opzioni, uniformi: uniformiCondivise(), perf, impostaPerf, diagnostica: eseguiDiagnostica };

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

// ---- LE SAGOME DEI MOBILI CHE PROIETTANO AL SOLE ---------------------------
// Ogni mobile porta un pugno di scatole (furniture.js) e lo shader le prova una
// per una: è così che l'ombra di un albero ha la forma dell'albero invece del
// passo della griglia. Il budget però è finito, quindi si mandano le PIÙ VICINE
// a quello che stai guardando — è una scala di dettaglio, e come tutte le scale
// di dettaglio deve essere STABILE: si rifà la scelta solo quando il bersaglio
// si è spostato davvero o quando i mobili cambiano, se no la lista si rimescola
// a ogni frame e le ombre in fondo sfarfallano.
const SCATOLE_BUDGET = 32;
// L'AREA DELLE OMBRE È LARGA IL DOPPIO DI PRIMA, ed è la diagnosi dell'utente:
// «le ombre vengono caricate ma l'area è troppo piccola». A 34 blocchi le
// sagome entravano nel budget praticamente addosso al gatto, e camminando le si
// vedeva comparire. Il costo non è la distanza ma il BUDGET (quante scatole
// finiscono nello shader), quindi allargare il raggio si paga solo con la
// scelta — che è un ordinamento ogni due blocchi di cammino, non per frame.
const SCATOLE_PORTATA = 70;
const SCATOLE_DETTAGLIO = 20;      // entro questa distanza, la sagoma per intero
// La fascia in cui i due livelli di dettaglio si scambiano il posto. Larga:
// il passaggio deve durare parecchi passi, se no si vede lo stesso.
const SCATOLE_LOD_BANDA = 9;
// LA FASCIA IN CUI L'OMBRA NASCE. Chi sta oltre `portata` non proietta; chi sta
// negli ultimi metri prima del confine proietta a forza ridotta, così l'ombra
// SI FA invece di apparire. È la stessa idea della nebbia: un confine netto si
// vede sempre, uno sfumato non lo nota nessuno.
const SCATOLE_SFUMA = 18;
const _scatole = [];        // l'uscita, riusata: nessuna allocazione per frame
const _scelte = [];         // la SCELTA (stabile): sagoma copiata + chi la porta
let _scatoleX = 1e9, _scatoleZ = 1e9, _scatoleN = -1;
const _scatoleVicine = [];
// budget effettivo: lo abbassa la qualità automatica sui dispositivi in affanno
let _scatoleBudget = SCATOLE_BUDGET;
function impostaBudgetScatole(n) {
  if (n === _scatoleBudget) return;
  _scatoleBudget = Math.max(0, n | 0);
  _scatoleN = -1;                     // il taglio è cambiato: la scelta va rifatta
}

/**
 * SCEGLIERE È UNA COSA, DOSARE UN'ALTRA, e averle tenute insieme è ciò che
 * faceva «andare a scatti» le ombre.
 *
 * La SCELTA (quali sagome entrano nel budget, in che ordine) è un giro su tutti
 * i mobili più un ordinamento: si può fare ogni due blocchi di cammino, e anzi
 * DEVE essere stabile, se no la lista si rimescola e le ombre in fondo
 * sfarfallano.
 *
 * Il PESO (quanto scurisce ognuna) è invece una rampa continua sulla distanza, e
 * campionarla ogni mezzo blocco vuol dire mostrarla a gradini da mezzo blocco:
 * l'ombra non sfumava, faceva un salto di tono a ogni passo del gatto. Con
 * l'ombra debole non si notava; adesso che l'ombra si vede, si vedono anche i
 * gradini. Ora il peso si rifà a OGNI FOTOGRAMMA — sono trentadue moltiplicazioni
 * su una lista già pronta, cioè niente — e la scelta resta ferma.
 */
function scatoleVicine() {
  const b = rig.bersaglio;
  const n = arredo.versione;
  if (n === _scatoleN && Math.abs(b.x - _scatoleX) + Math.abs(b.z - _scatoleZ) < 2) {
    return _dosaScatole(b);
  }
  _scatoleX = b.x; _scatoleZ = b.z; _scatoleN = n;
  _scatoleVicine.length = 0;
  for (const ist of arredo.istanze) {
    if (!ist.scatoleOmbra || !ist.scatoleOmbra.length) continue;
    const cx = ist.cella[0] + 0.5, cz = ist.cella[2] + 0.5;
    const dx = cx - b.x, dz = cz - b.z;
    const d2 = dx * dx + dz * dz;
    // il margine è la soglia di ricalcolo: chi è appena fuori portata adesso
    // può entrarci camminando prima che la scelta si rifaccia
    if (d2 > (SCATOLE_PORTATA + 2) * (SCATOLE_PORTATA + 2)) continue;
    // DUE LIVELLI DI DETTAGLIO: da vicino la sagoma intera (la chioma che si
    // stringe, il palo sottile), da lontano corpo e chioma. Un albero in fondo
    // occupa dieci pixel: pagargli cinque scatole vorrebbe dire toglierle a uno
    // che si vede. Nella fascia di mezzo ci sono ENTRAMBI, uno che sale e
    // l'altro che scende: la sagoma si trasforma invece di scattare. Quanto sale
    // e quanto scende lo decide `_dosaScatole`, fotogramma per fotogramma.
    _scatoleVicine.push({ d2, cx, cz, det: true, s: ist.scatoleOmbra });
    if (ist.scatolaOmbra && ist.scatolaOmbra.length) {
      // mezzo blocco più «lontano» nell'ordinamento: a parità di distanza la
      // sagoma di dettaglio ha la precedenza sul budget
      _scatoleVicine.push({ d2: d2 + 0.5, cx, cz, det: false, s: ist.scatolaOmbra });
    }
  }
  _scatoleVicine.sort((p, q) => p.d2 - q.d2);
  // LE SCATOLE SI COPIANO UNA VOLTA SOLA, qui, e poi si riusano: `_dosaScatole`
  // gira a ogni fotogramma e non deve allocare niente, se no il costo di questa
  // morbidezza me lo ritrovo come singhiozzo del garbage collector.
  // SI COPIA IL DOPPIO DEL BUDGET, e non è spreco: nella fascia di staffetta ogni
  // mobile compare due volte (sagoma intera e sagoma grossa) ma una delle due ha
  // sempre peso quasi zero. Se la scelta si fermasse al budget, quelle copie
  // spente si mangerebbero i posti e le ombre vere finirebbero fuori. Il tetto
  // vero è sulle ombre ACCESE, e lo mette `_dosaScatole`.
  _scelte.length = 0;
  const tetto = _scatoleBudget * 2;
  for (const v of _scatoleVicine) {
    for (const s of v.s) {
      if (_scelte.length >= tetto) break;
      _scelte.push({
        cx: v.cx, cz: v.cz, det: v.det,
        box: { x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, z0: s.z0, z1: s.z1,
               s0: s.s0, s1: s.s1, d0: s.d0, d1: s.d1, peso: 1 },
      });
    }
    if (_scelte.length >= tetto) break;
  }
  return _dosaScatole(b);
}

/** Il PESO di ogni sagoma scelta, ricalcolato per questo fotogramma. */
function _dosaScatole(b) {
  _scatole.length = 0;
  // L'ALTRA METÀ DEL POPPING: il budget tagliava di netto. Riempite le trentadue
  // scatole, la trentatreesima non esisteva — e camminando basta che un oggetto
  // VICINO entri in lista perché uno lontano venga espulso di colpo, con la sua
  // ombra che sparisce in un fotogramma. Ora le ultime scatole del budget
  // entrano già in dissolvenza: quella che sta per essere espulsa è quasi
  // invisibile, quindi espellerla non si vede.
  const sfumaDa = Math.floor(_scatoleBudget * 0.7);
  for (let i = 0; i < _scelte.length; i++) {
    if (_scatole.length >= _scatoleBudget) break;
    const v = _scelte[i];
    const dx = v.cx - b.x, dz = v.cz - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    // pieno fin quasi al confine, poi giù a zero nella fascia
    let p = Math.min(1, (SCATOLE_PORTATA - d) / SCATOLE_SFUMA);
    if (p <= 0.01) continue;
    // la staffetta fra i due livelli di dettaglio
    const t = Math.max(0, Math.min(1,
      (SCATOLE_DETTAGLIO + SCATOLE_LOD_BANDA - d) / SCATOLE_LOD_BANDA));
    p *= v.det ? t : 1 - t;
    if (p <= 0.01) continue;
    // il rango si conta sulle ombre ACCESE, non sulle scelte: le copie spente
    // della staffetta non devono far sbiadire chi viene dopo
    const rango = _scatole.length;
    if (rango >= sfumaDa) p *= 1 - (rango - sfumaDa) / Math.max(1, _scatoleBudget - sfumaDa);
    if (p <= 0.01) continue;
    // il peso viaggia con la scatola: `impostaOmbre` lo mette in uDinMez.w
    v.box.peso = p;
    _scatole.push(v.box);
  }
  return _scatole;
}

const _ctxResa = { ecs, alpha: 0, dtFrame: 0, notte: false };   // ctx della resa (palle+creature), riusato ogni frame
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
  for (const e of ecs.ognuna('sfera', 'vista')) ecs.leggi(e, 'vista').mesh.layers.enable(LAYER_SCHIUMA);

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

// NB: il vecchio `sincronizzaPalle()` (che special-casava il Generatore e la Map
// `palle`) è SPARITO da qui: la sua logica ora vive nel def del generatore
// (registry.js → aggiorna/rimuovi) e il reconcile generico è
// `gestoreMacchine.sincronizza(...)`, chiamato dove prima stava sincronizzaPalle.

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
// Scala della qualità AUTOMATICA. `ombre` = ombre voxel DDA delle luci pesanti:
// il marching (fino a PASSI_MAX letture di texture 3D per pixel dentro una pozza
// di lampada) e' l'aggiunta per-pixel piu' costosa del gioco, e prima girava a
// costo pieno a OGNI livello — ecco perche' su macchine deboli i frame calavano
// anche con la qualita' gia' abbassata. Al PRIMO scalino cadono INSIEME le due
// cose piu' care: il riflesso (secondo render della scena) e le ombre voxel.
// Spente, le luci-sfera restano identiche, solo senza occlusione dei muri.
// Ogni scalino porta anche la DISTANZA DI DISEGNO (`dist`), e non è un dettaglio:
// su un mondo aperto la nebbia nascondeva i chunk lontani ma la GPU li disegnava
// lo stesso, pagando draw call e riempimento per pixel che poi la nebbia
// copriva. Prima la distanza la toccavano solo i preset a mano — la scala
// automatica no, quindi un telefono in affanno restava col far plane a 700 e
// continuava a fondere sui chunk in fondo. Adesso avvicinando l'orizzonte
// scendono INSIEME i pixel (scala) e la geometria (dist): sono le due leve che
// contano su un chip fill-starved, e la nebbia era già lì a coprire il taglio.
const LIVELLI_Q = rig.mobile ? [
  // su mobile le ombre voxel sono SEMPRE off (misurato: ~30% di fps su Mali-G68).
  // Chi le vuole le accende a mano dalle Impostazioni; la scala auto non le
  // riaccende mai da sola. Gli ultimi due scalini sono NUOVI: il vecchio
  // pavimento (0.66 di scala, ~1MP su questi schermi) restava troppo pesante per
  // le GPU più deboli, che così stavano incollate sotto i 30fps senza via
  // d'uscita. Ora la scala arriva a 0.45 e l'orizzonte a 220: brutto, ma
  // GIOCABILE, ed è la condizione per cui l'AR su fascia bassa è pensabile.
  // `schiuma` = la passata a silhouette attorno agli oggetti in acqua. Misurata
  // sul Chromebook: 4,7 ms di GPU, cioè quanto il riflesso e il 17% del frame,
  // per un anello di spuma. Resta accesa finché la macchina regge; sotto no. La
  // schiuma di RIVA non è questa: quella sta nello shader dell'acqua e non si
  // spegne mai.
  // `acquaRicca` = i pezzi CARI del pelo (ondeggio del riflesso e silhouette
  // della schiuma). Misurato sul Chromebook: il pelo dell'acqua è 14,3 ms dei 24
  // del pass principale, cioè il 60% — più di riflesso e schiuma come passate
  // messe insieme. Toglierne i dettagli costa molto meno, all'occhio, che
  // rendere tutto sfocato abbassando la risoluzione: per questo si spegne PRIMA.
  // `maxOmbre` = quante luci possono PROIETTARE nello stesso frame. Misurato col
  // banco: una luce con ombra costa ~0,73 ms, e crescono in fila indiana. Le
  // vicine tengono l'ombra, le lontane restano accese e basta.
  // `sole` = celle di cammino per l'ombra del cielo (cel shading). È la prima
  // cosa che si spegne scendendo: è bella ma è un lusso, e a 0 non costa NIENTE
  // (lo shader esce alla prima riga).
  { tilt: 0, rifl: false, ombre: false, schiuma: true, acquaRicca: true, maxOmbre: 6, sole: 10, scatole: 20, scala: 1, dist: 700 },
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 4, sole: 6, scatole: 12, scala: 0.9, dist: 500 },
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 3, sole: 0, scatole: 6, scala: 0.82, dist: 500 },
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 2, sole: 0, scatole: 0, scala: 0.66, dist: 360 },
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 1, sole: 0, scatole: 0, scala: 0.55, dist: 280 },
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 0, sole: 0, scatole: 0, scala: 0.45, dist: 220 },
] : [
  // `dinamiche` sta SOLO qui, in cima: le ombre dei corpi in movimento si provano
  // scatola per scatola a ogni frammento, ed è il termine più caro di tutti.
  // `sole` è la PORTATA dell'ombra del cielo in blocchi, e 13 è il tetto vero
  // (SOLE_RAGGIO_MAX in fx/materials.js): oltre, il cammino finisce i passi
  // prima della distanza e l'orlo dell'ombra torna a denti di sega.
  { tilt: 2.2, rifl: true, ombre: true, schiuma: true, acquaRicca: true, maxOmbre: 8, sole: 13, scatole: 32, dinamiche: true, scala: 1, dist: 900, erba: 1.3, erbaR: 6 },
  { tilt: 2.2, rifl: false, ombre: false, schiuma: true, acquaRicca: true, maxOmbre: 6, sole: 12, scatole: 24, scala: 1, dist: 700, erba: 1, erbaR: 5 },
  // ⚠ IL TILT-SHIFT NON SI SPEGNE PIU' QUI, e lo dicono le misure del
  // committente: sul suo Chromebook, in DUE giri diversi e con la voce misurata
  // alternata, spento costa il 6% di GPU IN PIU' (28,95 ms contro 27,26; e prima
  // 80,0 contro 74,1). Qualunque sia il motivo — il composer c'e' comunque
  // appena la scala scende sotto 1 — spegnerlo non risparmia niente e toglie
  // meta' dell'aspetto del diorama. Restava in scala per un'ipotesi mia mai
  // verificata: «e' un post-process, quindi costa». Non su quel chip.
  { tilt: 1.8, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 4, sole: 8, scatole: 14, scala: 1, dist: 500, erba: 0.6, erbaR: 3 },
  { tilt: 1.6, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 2, sole: 6, scatole: 8, scala: 0.82, dist: 500 },
  { tilt: 1.4, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 1, sole: 0, scatole: 4, scala: 0.66, dist: 360 },
  // ⚠ GLI ULTIMI DUE SCALINI SONO NUOVI, e li ha chiesti una misura precisa: sul
  // Chromebook del committente (Intel HD 400) il pass principale costa 69,8 ms a
  // scala 1 e 24,1 ms a scala 0,50 — cioè la RISOLUZIONE è la leva, e la scala
  // automatica si fermava a 0,66 (36,7 ms, ancora ~20 fps). Il fondo scala di
  // «desktop» era tarato su un portatile lento, non su un chip integrato del
  // 2015: per quello serve arrivare dove arriva la scala mobile. Brutto, ma
  // giocabile — e sopra c'è tutta la scala per chi non ne ha bisogno.
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 0, sole: 0, scatole: 0, scala: 0.55, dist: 300 },
  { tilt: 0, rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 0, sole: 0, scatole: 0, scala: 0.45, dist: 240 },
];
let qLivello = 0;
let qManuale = false;        // qualità auto spenta: comandano le Impostazioni
let riflessiUtente = true;
let _schiumaQ = true;        // la passata schiuma se la può permettere questo livello?
let _dinamicheOn = false;    // ombre dinamiche concesse (utente E livello)
let _partiQ = 127;           // termini dello shader concessi dal livello di qualità

// ---- Impostazioni utente (⚙️): persistenti, applicate subito -------------------
const OPZ_CHIAVE = 'lantern.opzioni.v1';
// luceCotta (ombre voxel) OFF di default su MOBILE, come già riflessi e tilt.
// Misurato sul dispositivo del committente (Mali-G68): le ombre sono il singolo
// costo per-pixel più alto e su questi chip fill-starved fanno cadere gli fps
// del ~30%. Restano un opt-in per chi vuole e può permettersele; su desktop
// restano accese. Chi ha un salvataggio vecchio con le ombre on: glielo dico,
// oppure «Ripristina» le riporta al default giusto per il suo dispositivo.
const OPZ_DEFAULT = { fog: 0.55, dist: 700, riflessi: !rig.mobile, tilt: !rig.mobile, autoQ: true, luceCotta: !rig.mobile, cameraFantasma: false, erba: true, foro: true, foroRaggio: 110, sagoma: false, sagomaTutti: false, scala: 1, riflForza: 1, tiltQ: 2.2, meteoAuto: true, arRot: 0, arScala: 1, arEspo: 0.5, arFuoco: null, comandiTouch: rig.mobile, fpsMax: 0, vol: 0.6, muto: false, posa: 'davanti', durezza: 'normale', nitido: true, ombraSole: !rig.mobile, solePassi: 12, soleTerm: true, soleForza: 1, ombreDin: false };
const opzioni = Object.assign({}, OPZ_DEFAULT, JSON.parse(localStorage.getItem(OPZ_CHIAVE) || '{}'));

// preset grafici: un tocco e la macchina va — comodi per testare
// `luceCotta` = ombre voxel delle luci pesanti (nome storico della chiave
// salvata, vedi applicaOpzioni). "bassa" le spegne SUBITO come fa col riflesso,
// invece di aspettare che la qualità auto scenda: una macchina che tiene 30fps
// con cali non scende mai sotto la soglia e resterebbe col marching acceso.
const PRESET_GRAFICA = {
  bassa: { scala: 0.66, riflessi: false, luceCotta: false, tilt: false, tiltQ: 0.8, riflForza: 0.6, dist: 250, fog: 0.9, autoQ: true },
  media: { scala: 0.85, riflessi: false, luceCotta: true, tilt: true, tiltQ: 1.6, riflForza: 0.8, dist: 450, fog: 0.7, autoQ: true },
  alta: { scala: 1, riflessi: true, luceCotta: true, tilt: true, tiltQ: 2.2, riflForza: 1, dist: 700, fog: 0.55, autoQ: true },
  ultra: { scala: 1, riflessi: true, luceCotta: true, tilt: true, tiltQ: 2.6, riflForza: 1.2, dist: 900, fog: 0.4, autoQ: false },
};

let _riflDim = '';
function applicaQualita() {
  const q = LIVELLI_Q[qLivello];
  rig.impostaTiltShift(qManuale ? (opzioni.tilt ? opzioni.tiltQ : 0) : Math.min(q.tilt, opzioni.tiltQ || 2.2));
  rig.setScalaRender(qManuale ? opzioni.scala : Math.min(q.scala, opzioni.scala));
  // l'orizzonte segue la qualità: quando è auto NON supera mai quello del livello,
  // così un telefono in affanno smette di disegnare i chunk che la nebbia già copre
  const far = qManuale ? opzioni.dist : Math.min(q.dist, opzioni.dist);
  if (rig.camera.far !== far) { rig.camera.far = far; rig.camera.updateProjectionMatrix(); }
  // su mobile i riflessi partono spenti (default opzioni) ma se l'utente li
  // ACCENDE valgono anche lì: niente più divieto assoluto
  riflesso.attivo = (qManuale ? true : q.rifl) && riflessiUtente;
  _schiumaQ = qManuale ? true : q.schiuma !== false;
  // i termini cari del pelo seguono la scala di qualità: è lo STESSO
  // interruttore che usa il bisturi della diagnostica, quindi zero macchinari in
  // più — e la diagnostica, finito il giro, torna qui invece che a "tutto".
  impostaMaxOmbre(qManuale ? 8 : (q.maxOmbre ?? 6));
  // l'ombra del cielo la vuole l'utente E se la deve poter permettere il livello
  const soleOn = opzioni.ombraSole !== false;
  impostaPassiCielo(!soleOn ? 0 : (qManuale ? (opzioni.solePassi ?? 12) : (q.sole ?? 0)));
  // il terminatore è dentro la stessa opzione madre: da solo non ha senso
  impostaTerminatore(soleOn && opzioni.soleTerm !== false);
  // OMBRE DINAMICHE: le chiede l'utente E il livello deve poterle reggere. È il
  // termine più caro dell'ombra del cielo (una scatola alla volta, per
  // frammento), quindi vive solo in cima alla scala.
  _dinamicheOn = soleOn && !!opzioni.ombreDin && (qManuale || q.dinamiche === true);
  // QUANTE SAGOME DI MOBILI PROIETTANO. È il termine che cresce con il numero di
  // oggetti in scena e che il resto della scala non tocca: ogni sagoma è un
  // pezzo di lavoro PER FRAMMENTO, e su una GPU integrata trentadue sagome sono
  // trentadue confronti su ogni pixel di mondo. La scala automatica finora
  // abbassava i pixel ma non questo — un bosco fitto restava caro anche a metà
  // risoluzione. Con zero le ombre dei mobili spariscono e resta quella del
  // terreno, che costa una lettura di heightmap.
  impostaBudgetScatole(qManuale ? SCATOLE_BUDGET : (q.scatole ?? SCATOLE_BUDGET));
  ciclo.forzaOmbra = Math.max(0, Math.min(1.5, opzioni.soleForza ?? 1));
  // L'ERBA SEGUE LA QUALITÀ: diradare i fili è meglio che spegnerli tutti — un
  // prato con la metà dei fili è ancora un prato, un prato spento è una moquette.
  erba.densita = qManuale ? 1 : (q.erba ?? 1);
  erba.raggioChunk = qManuale ? 5 : (q.erbaR ?? 5);
  erba.risemina();
  // le foglie seguono la stessa manopola: sono meno dell'erba, quindi il raggio
  // resta più corto anche al massimo — un mucchio si guarda da vicino
  foglie.densita = qManuale ? 1 : (q.erba ?? 1);
  foglie.raggioChunk = Math.min(4, qManuale ? 4 : (q.erbaR ?? 4));
  foglie.risemina();
  _partiQ = (qManuale || q.acquaRicca !== false)
    ? PARTI.tutte
    : (PARTI.tutte & ~PARTI.riflesso & ~PARTI.silhouette);
  impostaParti(_partiQ);
  // OMBRE VOXEL: l'uniform effettiva è "le vuole l'utente" E "il livello di
  // qualità se le può permettere". Qui si tocca SOLO l'interruttore dello shader
  // (uOcclusione): la texture 3D dei muri la gestisce l'interruttore utente in
  // applicaOpzioni, così una scalata automatica non fa ricostruire la mesh.
  // PROFILO AR "MINIMO": in AR marker il marching d'ombra resta SEMPRE spento —
  // è l'aggiunta per-pixel più cara e il telefono paga già camera + tracking.
  // La guardia sta QUI (e non solo all'avvio dell'AR) perché adattaQualita e
  // applicaOpzioni possono richiamare applicaQualita mentre l'AR è accesa e la
  // riaccenderebbero. Riflesso, schiuma e tilt-shift sono invece GIÀ spenti in AR
  // per costruzione (render via MindAR, pianoAcqua = null).
  impostaOcclusione((qManuale ? true : q.ombre) && opzioni.luceCotta !== false && !modalitaAR.attiva);
  // ridimensionare rifà i buffer del riflesso = un frame nero: farlo SOLO se
  // le misure sono davvero cambiate, non a ogni passaggio di qui
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), pr = rig.renderer.getPixelRatio();
  const firma = `${w}x${h}@${pr.toFixed(3)}`;
  if (firma !== _riflDim) { _riflDim = firma; riflesso.dimensiona(w, h, pr); }
}

function applicaOpzioni(salva = true) {
  rig.nitido = opzioni.nitido !== false;   // come si ingrandisce il bersaglio interno
  ciclo.fattoreFog = opzioni.fog;
  rig.camera.far = opzioni.dist;
  rig.camera.updateProjectionMatrix();
  rig.fantasma = opzioni.cameraFantasma;
  // LA SAGOMA E LA CAMERA SONO LA STESSA DECISIONE, presa da due parti: se il
  // gatto si vede attraverso gli ostacoli, la camera non ha piu' motivo di
  // rientrare — ed e' proprio il rientro che dava fastidio. Accendendo la
  // sagoma la camera smette di essere spinta dai muri; la si puo' comunque
  // rimettere a mano spegnendo la sagoma.
  // OCCHIO DI BUE E SAGOMA fanno lo stesso mestiere in due modi opposti: l'uno
  // buca quello che copre, l'altra disegna il gatto sopra. Tutt'e due tolgono
  // il motivo per cui la camera rientrava davanti agli ostacoli — ed era il
  // rientro a dare fastidio.
  if (opzioni.foro || opzioni.sagoma) rig.fantasma = true;
  erba.imposta(opzioni.erba !== false);
  foglie.imposta(opzioni.erba !== false);
  aggiornaSagome();
  meteo.attivaAuto(opzioni.meteoAuto !== false);
  comandiTouch.mostra(!!opzioni.comandiTouch);
  document.body.classList.toggle('comandi-touch', !!opzioni.comandiTouch);  // sposta la GUI per non sovrapporsi
  // il numero del tasto sui posti serve solo a chi una tastiera ce l'ha
  // i comandi a schermo accesi vogliono dire «sto giocando col dito» a
  // prescindere da cosa dice il browser (che in anteprima mente, e sugli ibridi
  // dice entrambe le cose)
  const conTastiera = matchMedia('(pointer: fine)').matches && !opzioni.comandiTouch;
  strisca.mostraNumeri(conTastiera);
  zaino.conTastiera = conTastiera;
  audio.setVolume(opzioni.vol ?? 0.6);
  audio.muto(!!opzioni.muto);
  bersaglio.posa = opzioni.posa || 'davanti';
  btnPosa.textContent = posaCorrente().icona;
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
  // interruttore UTENTE delle ombre: decide se tenere in piedi la texture 3D dei
  // muri (e quindi se ricostruire la mesh al cambio). L'uniform dello shader la
  // imposta poi applicaQualita, combinando questo volere col livello di qualità.
  const occlusioneOra = opzioni.luceCotta !== false;
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
  document.getElementById('opzNitido').classList.toggle('attivo', opzioni.nitido !== false);
  document.getElementById('opzSole').classList.toggle('attivo', opzioni.ombraSole !== false);
  document.getElementById('opzTerm').classList.toggle('attivo', opzioni.soleTerm !== false);
  document.getElementById('opzDin').classList.toggle('attivo', !!opzioni.ombreDin);
  document.getElementById('opzCamera').classList.toggle('attivo', opzioni.cameraFantasma);
  document.getElementById('opzErba').classList.toggle('attivo', opzioni.erba !== false);
  document.getElementById('opzForo').classList.toggle('attivo', opzioni.foro !== false);
  document.getElementById('opzSagoma').classList.toggle('attivo', opzioni.sagoma !== false);
  document.getElementById('opzSagomaTutti').classList.toggle('attivo', !!opzioni.sagomaTutti);
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
document.getElementById('opzErba').addEventListener('click', () => { opzioni.erba = opzioni.erba === false; applicaOpzioni(); });
document.getElementById('opzForo').addEventListener('click', () => { opzioni.foro = opzioni.foro === false; applicaOpzioni(); });
document.getElementById('opzSagoma').addEventListener('click', () => { opzioni.sagoma = opzioni.sagoma === false; applicaOpzioni(); });
document.getElementById('opzSagomaTutti').addEventListener('click', () => { opzioni.sagomaTutti = !opzioni.sagomaTutti; applicaOpzioni(); });
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
// il tasto Diagnostica DUPLICATO nella scheda Grafica (vedi index.html): stessa
// azione del gemello in Avanzate, così chi ha cali di fps lo trova subito
document.getElementById('opzDiagnostica')?.addEventListener('click', () => eseguiDiagnostica());
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
// PROFILO AR "MINIMO" (COMPITO 3): all'accensione/spegnimento dell'AR rifà la
// qualità — applicaQualita, con la guardia !modalitaAR.attiva, spegne il marching
// d'ombra in AR e lo riaccende all'uscita. In più abbassa la scala di render del
// renderer di MindAR: in AR il telefono paga già la texture video della camera e
// il tracking MindAR, quindi ogni pixel in meno conta doppio. Il tracking NON si
// tocca. Riflesso, schiuma e tilt-shift sono già spenti in AR per costruzione.
modalitaAR.onCambio = (attivo) => {
  applicaQualita();
  if (attivo && modalitaAR.mindar) {
    modalitaAR.mindar.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, rig.mobile ? 1 : 1.5));
  }
};
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
  creature.svuota(ecs);
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
  creature.svuota(ecs);
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
document.getElementById('opzNitido').addEventListener('click', () => { opzioni.nitido = opzioni.nitido === false; applicaOpzioni(); });
document.getElementById('opzSole').addEventListener('click', () => { opzioni.ombraSole = opzioni.ombraSole === false; applicaOpzioni(); });
document.getElementById('opzTerm').addEventListener('click', () => { opzioni.soleTerm = opzioni.soleTerm === false; applicaOpzioni(); });
// le ombre dinamiche pretendono la qualità in cima: accenderle con la qualità
// auto attiva vorrebbe dire vederle sparire al primo calo, che si legge come un
// bug. Quindi accenderle passa in manuale, esattamente come fa il tilt-shift.
document.getElementById('opzDin').addEventListener('click', () => { opzioni.ombreDin = !opzioni.ombreDin; if (opzioni.ombreDin) opzioni.autoQ = false; applicaOpzioni(); });
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
  const _cpuInizio = performance.now();   // ms CPU del lavoro di questo frame (overlay perf)
  const _passoMs = adesso - prima;        // intervallo VERO fra due frame (per la diagnostica)
  const dt = Math.min(_passoMs / 1000, 0.05);
  prima = adesso;
  if (_diagPassi) _diagPassi(_passoMs);

  ciclo.aggiorna(dt);
  ciclo.zoomComp = Math.min(1, Math.max(0.3, 18 / rig.distanza));   // dezoom → nebbia più aperta
  const _terraPrima = controller.aTerra;
  const _vyPrima = controller.vel.y;
  controller.aggiorna(dt);
  audio.aggiorna(dt, ciclo.eNotte ? 1 : 0);
  emettiParticelleBlocchi(dt);
  if (!modalitaAR.attiva && !modalitaXR.attiva) {
    // POOL delle creature (spawn/despawn per distanza): crea/distrugge ENTITÀ ECS
    // attorno al gatto. Il MOTO e il PENSIERO girano nella corsia a passo fisso.
    creature.sincronizza(ecs, servizi, controller.pos);
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
  // le sagome copiano la posa DOPO l'animazione: prima sarebbero indietro di un
  // frame, e su un gatto che salta un frame si vede
  if (sagomaMia) sagomaMia.aggiorna();
  if (opzioni.sagomaTutti) for (const g of gattiRemoti.values()) if (g.sagoma) g.sagoma.aggiorna();
  aggiornaForo(dt);
  erba.aggiorna(dt, mondo, controller.pos, ambienteAttuale(), rig.camera.position);
  foglie.aggiorna(dt, mondo, controller.pos, ambienteAttuale());
  calpestaFoglie();
  mesher.aggiornaMaterialeMondo();   // opaco quando il buco è chiuso: early-z

  // I CORPI CHE FANNO OMBRA: player + gatti in rete + palle. `y` è la BASE e `h`
  // l'altezza — servono alle ombre DINAMICHE, che proiettano la scatola vera
  // lungo il raggio del sole; ai coni alla Bedrock basta il raggio.
  // Le SAGOME DEI MOBILI viaggiano nella stessa lista (vedi scatoleVicine).
  _ombrePg.length = 0;
  _ombrePg.push({ x: controller.pos.x, y: controller.pos.y + 0.06, z: controller.pos.z, r: 0.42, h: 0.95 });
  for (const g of gattiRemoti.values()) _ombrePg.push({ x: g.pos.x, y: g.pos.y + 0.06, z: g.pos.z, r: 0.42, h: 0.95 });
  // la palla: `y` resta il centro (è l'ancora del cono, non toccarla) e `y0` dice
  // dove comincia la scatola — il cono e la scatola non misurano la stessa cosa
  for (const e of ecs.ognuna('sfera', 'vista')) { const v = ecs.leggi(e, 'vista'), s = ecs.leggi(e, 'sfera'); _ombrePg.push({ x: v.mesh.position.x, y: v.mesh.position.y, z: v.mesh.position.z, r: s.raggio, y0: v.mesh.position.y - s.raggio, h: s.raggio * 2 }); }
  impostaOmbre(scatoleVicine(), _ombrePg, _dinamicheOn);
  aggiornaTempo(adesso / 1000);          // orologio degli shader (acqua)
  // LE NUVOLE DECIDONO DOVE PIOVE: si passano i loro dischi alla pioggia prima
  // di aggiornarla, se no il rovescio insegue di un fotogramma la nuvola che lo
  // fa — e a camera ferma quel ritardo si vede come uno scivolamento.
  pioggia.impostaNuvole(nuvole.dischi(_dischiNuvole), 1.8 + 2.6 * meteo.forza);
  // la distanza della camera allarga il campo di pioggia: a sessanta blocchi si
  // guarda un panorama, e la pioggia deve esserci su tutto il panorama
  const _fPioggia = pioggia.aggiorna(dt, adesso / 1000, rig.bersaglio,
    rig.camera.position.distanceTo(rig.bersaglio));
  impostaPioggia(_fPioggia);
  schizziPioggia(dt, _fPioggia);

  // meteo automatico (rovesci e schiarite; neve d'inverno)
  const avvisoMeteo = meteo.aggiorna(dt, stagioneCorrente() === 'inverno');
  // LE RAFFICHE SEGUONO IL TEMPO CHE FA: col rovescio il prato si piega davvero,
  // ed è la richiesta («voglio proprio vedere le raffiche quando c'è il meteo»).
  // IL VENTO SEGUE L'INTENSITÀ, non un interruttore: con la pioggerella il prato
  // ondeggia appena, con la tempesta si piega. Prima era 0 o 1 e tutti i tipi di
  // brutto tempo davano lo stesso vento.
  erba.forzaMeteo = pioggia.attiva ? Math.max(0.35, meteo.forza) : 0;
  // IL LAMPO schiarisce TUTTA la scena per un istante, e passa dall'ambiente —
  // cioè dallo stesso colore che tinge ogni cosa unlit. Toccare una luce a parte
  // illuminerebbe solo quello che quella luce raggiunge, e un fulmine che
  // illumina metà mondo non e' un fulmine.
  if (meteo.lampo > 0) {
    const l = meteo.lampo * meteo.lampo;   // sale in un frame, scende in fretta
    _lampoCol.copy(ambienteAttuale()).addScalar(l * 0.9);
    impostaAmbiente(_lampoCol);
  }
  // GLI ALBERI SEGUONO LO STESSO VENTO DELL'ERBA — se il prato si piega e le
  // chiome stanno ferme, la raffica non esiste: si vede un prato animato dentro
  // un bosco di plastica. La direzione è la stessa uniform (uVento dell'erba),
  // l'ampiezza è più piccola perché un albero è più rigido di un filo d'erba.
  {
    // 0.90/1.00 e non 0.55/0.75: misurato sul modello vero, con quei fattori e
    // il tempo calmo la chioma si spostava di 0,046 blocchi, cioè un pixel — un
    // bosco di plastica accanto a un prato che ondeggia. Un albero è più rigido
    // di un filo d'erba ma è anche molto più alto, e l'altezza la conta già la
    // legge quadratica dentro GLSL_VENTO: qui non serviva scontarla due volte.
    const v = erba.materiale.uniforms.uVento.value;
    impostaVentoFurni(v.x, v.y, v.z * 0.90, v.w * 1.00);
  }
  // le foglie NON seguono il meteo: vedi il perche in fx/foglie.js
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

  // MACCHINE dei furni (ex "palle dei generatori"): reconcile periodico che crea
  // le entità-macchina per i furni-con-comportamento appena posati e distrugge le
  // orfane. Generico: vale per il generatore-palla come per lo scintillatore-demo.
  _tPalle -= dt;
  if (_tPalle <= 0) {
    _tPalle = 0.5;
    gestoreMacchine.sincronizza(ecs, servizi, arredo.istanze);
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
  // CORSIA A PASSO FISSO (ECS) — possiede PALLE, CREATURE e MACCHINE. La fisica
  // avanza a tick di 1/20s: l'orologio ACCUMULA il dt reale e consuma solo interi
  // passi, così la traiettoria è identica a 25 come a 60 fps. Il resto di passo()
  // gira per-frame come sempre. Ordine dentro il tick: prima l'AGENDA scarica le
  // voci scadute — i "pensieri" delle creature E i risvegli delle macchine, che
  // condividono l'agenda e si distinguono dal componente — POI i sistemi muovono.
  servizi.notte = ciclo.eNotte;
  orologioSim.passi(dt, (tick) => {
    servizi.tick = tick;
    agenda.scarica(tick, (cosa) => {
      if (ecs.ha(cosa, 'macchina')) guidaMacchina(cosa, servizi);
      else pensaCreatura(cosa, servizi);
    });
    sistemiSim.esegui(servizi);
  });
  // resa INTERPOLATA: sposta i mesh fra posizionePrec e posizione con alpha (la
  // frazione di tick non ancora consumata), disaccoppiando la fluidità dagli Hz.
  _ctxResa.alpha = orologioSim.alpha();
  _ctxResa.dtFrame = dt;
  _ctxResa.notte = ciclo.eNotte;
  sistemiResa.esegui(_ctxResa);

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
      const m = { t: 'posa', p: [controller.pos.x, controller.pos.y, controller.pos.z], vx: controller.vel.x, vz: controller.vel.z, aTerra: controller.aTerra, att: (_inMano && _inMano.genere === 'attrezzo') ? _inMano.id : null, uso: _usoContatore };
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
  mano.mostra(voceInMano());
  mano.aggiorna(dt);
  for (const g of gattiRemoti.values()) if (g.mano) g.mano.aggiorna(dt);

  aggiornaLuci(controller.pos);
  rig.segui(_seguiV.set(controller.pos.x, controller.pos.y + 1, controller.pos.z), dt);
  rig.aggiorna();
  rig.fuocoSu(_fuocoGatto.set(controller.pos.x, controller.pos.y + 0.8, controller.pos.z), dt);

  // in AR il mondo vive su un pivot scalato: i render ausiliari in spazio
  // mondo (riflesso, silhouette schiuma) si spengono, resta la schiuma di riva
  const pianoAcqua = (modalitaAR.attiva || modalitaXR.attiva) ? null : pianoAcquaVicino();

  // MISURATORE PERF: prima di misurare, lega il contesto GPU corrente. In AR
  // marker il render passa per il renderer di MindAR, che è un ALTRO contesto GL:
  // usaContesto() se ne accorge e ri-alloca le query di là. Solo da acceso.
  if (_perfAcceso) {
    const glOra = (modalitaAR.attiva && modalitaAR.mindar) ? modalitaAR.mindar.renderer.getContext() : rig.renderer.getContext();
    perf.usaContesto(glOra);
  }

  // schiuma a silhouette: la fetta di geometria che buca il pelo. A frame
  // ALTERNI su OGNI dispositivo — su desktop girava a ogni frame ed era il 30%
  // del costo del frame (render extra su target 512²). Ora che la scia sfuma a
  // tempo e non a frame, dimezzare le chiamate non cambia quello che si vede.
  // SFALSATE, NON INSIEME. Schiuma e riflesso giravano tutt'e due sulla stessa
  // metà dei frame: sul Chromebook sono 4,7 + 4,2 ms di GPU che cadono nello
  // STESSO frame, e infatti i tempi erano a due velocità (mediana 16,7 ms, 5%
  // peggiore sopra 66, 34 fps veri contro i 60 che sembravano). Stesso lavoro
  // totale, metà del picco: la schiuma sui frame pari, il riflesso sui dispari.
  _riflAlterna = !_riflAlterna;

  _schiumaDt += dt;
  if (pianoAcqua === null || !_schiumaQ) { schiumaTop.spegni(); _schiumaDt = 0; }
  else if (_riflAlterna) { perf.regione('schiuma', () => schiumaTop.aggiorna(rig.scena, rig.bersaglio, pianoAcqua, _schiumaDt)); _schiumaDt = 0; }
  impostaSchiumaTop(schiumaTop.rt.texture, schiumaTop.info);

  // riflesso planare: a FRAME ALTERNI (la RT resta valida, il wobble copre il
  // mezzo frame di ritardo) e col mirror alleggerito — era un render completo
  // della scena OGNI frame, il primo sospettato dei cali muovendo la camera
  if (!riflesso.attivo) {
    _riflUltimo = false;
  } else if (!_riflAlterna || !_riflUltimo) {
    _riflUltimo = pianoAcqua !== null && perf.regione('riflesso', () => riflesso.aggiorna(rig.scena, rig.camera, pianoAcqua, nascostiPerRiflesso()));
  }
  impostaRiflesso(_riflUltimo, riflesso.rt.texture, riflesso.matriceTexture);

  // render principale (composer col tilt-shift, o render diretto): la passata
  // più cara, avvolta in un query dedicato. In AR/XR è quella del rispettivo
  // renderer — il contesto è già stato legato sopra.
  if (modalitaXR.attiva) { modalitaXR.aggiorna(frameXR); perf.regione('principale', () => modalitaXR.render()); }
  else if (modalitaAR.attiva) perf.regione('principale', () => modalitaAR.render());
  else perf.regione('principale', () => rig.render());
  perf.raccogli();   // i timer sono asincroni: raccoglie i risultati pronti (di qualche frame fa)

  hud.orologio(ciclo.oraTesto(), ciclo.faseEmoji(), ciclo.t);
  contFrame++; contTempo += dt;
  if (contTempo >= 0.5) {
    const fps = Math.round(contFrame / contTempo);
    hud.fps(fps);
    adattaQualita(fps);
    aggiornaPerf(fps);         // overlay perf (~2 Hz): fps, ms CPU, ms GPU per passata
    contFrame = 0; contTempo = 0;
  }

  // ms CPU del frame, mediati dolcemente: costa un performance.now() anche da
  // overlay spento, trascurabile, e così il numero è già pronto quando si accende
  const _cpuMs = performance.now() - _cpuInizio;
  _cpuMsMedio += (_cpuMs - _cpuMsMedio) * 0.1;
  // gancio della DIAGNOSTICA: un contatore di frame VERI (rispetta la cadenza) e
  // un raccoglitore di ms CPU per-frame, attivi solo mentre la batteria gira.
  _diagFrames++;
  if (_diagCpu) _diagCpu(_cpuMs);

  // AUTOSALVATAGGIO deboundato e FUORI dal frame (vedi pianificaSalvataggio).
  // Da OSPITE niente autosave: in RAM c'è il diorama dell'host, non il tuo.
  // Aspetta che le modifiche si ASSESTINO (2s dall'ultima) così costruire di
  // fila non fa partire un salvataggio a ogni blocco; ma se si continua a
  // modificare senza pause, un tetto a 15s garantisce che nulla vada perso.
  if (salvataggioSporco && !modalitaOspite && !_salvInCoda
      && (adesso - _ultimaModifica > 2000 || adesso - ultimoSalvataggio > 15000)) {
    pianificaSalvataggio();
  }
}

addEventListener('beforeunload', () => {
  if (salvataggioSporco && !modalitaOspite) salvaLocale(serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() }));
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
