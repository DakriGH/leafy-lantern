// Leafy‑Lantern — P0 sandbox. La regia: collega mondo, player, furni, luci e HUD.

import * as THREE from 'three';
import { PX, RAGGIO_CLICK, ACQUA, NET, SCAVO, ANALITICA_URL, CHIAVE_SALVATAGGIO } from './config.js?v=mtafl3ai';
import { Rig } from './engine/renderer.js?v=mtafl3ai';
import { Input } from './engine/input.js?v=mtafl3ai';
import { raggioGriglia, raggioDaSchermo } from './engine/raycast.js?v=mtafl3ai';
import { Cadenza } from './engine/cadenza.js?v=mtafl3ai';
import { GpuProfiler } from './engine/gpuTimer.js?v=mtafl3ai';
import { creaBatteria } from './engine/batteria.js?v=mtafl3ai';
import { BLOCCHI, CATEGORIE_BLOCCHI, defDi, tipoBase, livelloAcqua } from './world/blocks.js?v=mtafl3ai';
import { Mondo } from './world/world.js?v=mtafl3ai';
import { SimAcqua } from './world/acqua.js?v=mtafl3ai';
import { Lobby } from './net/lobby.js?v=mtafl3ai';
import { Segnalatore } from './net/segnalatore.js?v=mtafl3ai';
import { avviaAnalitica, urlPannello } from './net/analitica.js?v=mtafl3ai';
import { puo as ruoloPuo, DESCRIZIONE as RUOLO_DESCR, RUOLI } from './net/permessi.js?v=mtafl3ai';
import { leggiProfilo, salvaProfilo, COLORI as COLORI_PROFILO } from './net/profilo.js?v=mtafl3ai';
import { PannelloInsieme } from './ui/multiplayer.js?v=mtafl3ai';
import { Targhetta } from './ui/targhetta.js?v=mtafl3ai';
import { Bolla } from './ui/bolla.js?v=mtafl3ai';
import { Scelta } from './ui/scelta.js?v=mtafl3ai';
import { Bersaglio, POSE } from './gioco/bersaglio.js?v=mtafl3ai';
import { Zaino } from './ui/zaino.js?v=mtafl3ai';
import { Mesher, geometriaSingola } from './world/mesher.js?v=mtafl3ai';
import { generaIsola, generaArcipelago, generaOpenWorld, generaMondoGigante, SPAWN, ARREDO_INIZIALE } from './world/worldgen.js?v=mtafl3ai';
import { generaMostra } from './world/mostra.js?v=mtafl3ai';
import { generaCollaudo } from './world/collaudo.js?v=mtafl3ai';
import { generaTestLuci } from './world/testLuci.js?v=mtafl3ai';
import { generaBancoOmbre } from './world/bancoOmbre.js?v=mtafl3ai';
import { generaTestMacchine } from './world/testMacchine.js?v=mtafl3ai';
import { FuochiFatui } from './fx/fuochiFatui.js?v=mtafl3ai';
import { STAGIONI, impostaStagione, stagioneCorrente, ritingiFogliame, avviaTransizione, aggiornaTransizione } from './world/stagioni.js?v=mtafl3ai';
import { Meteo } from './fx/meteo.js?v=mtafl3ai';
import { Inventario, ATTREZZI } from './gioco/inventario.js?v=mtafl3ai';
import { Tavolozza, ZAMPA } from './gioco/tavolozza.js?v=mtafl3ai';
import { StriscaTavolozza } from './ui/tavolozza.js?v=mtafl3ai';
import { Scavo, DUREZZE } from './gioco/scavo.js?v=mtafl3ai';
import { CicloGiorno } from './fx/daynight.js?v=mtafl3ai';
import { aggiornaLuci, aggiornaTempo, impostaPioggia, impostaRiflesso, impostaOmbre, impostaForo, impostaForzaRiflesso, impostaSchiumaAcqua, impostaSchiumaTop, creaLuce, creaLuceLeggera, spostaLuce, rimuoviLuce, impostaOcclusione, uniformiCondivise, impostaLatoMassimoVoxel, memoriaVoxel, statLuci, impostaParti, PARTI, impostaMaxOmbre, maxOmbre, impostaPassiCielo, passiCielo, impostaTerminatore, impostaProfiloShader, ambienteAttuale, impostaVentoFurni, urtaFurni, impostaAmbiente, filtroCieloLineare, cieloSorgente, impostaCampoSole } from './fx/materials.js?v=mtafl3ai';
import { CampoSole } from './fx/campoSole.js?v=mtafl3ai';
import { SchiumaTop, LAYER_SCHIUMA } from './fx/schiumaTop.js?v=mtafl3ai';
import { ModalitaAR } from './ar/ar.js?v=mtafl3ai';
import { Nuvole } from './fx/nuvole.js?v=mtafl3ai';
import { SagomaVista } from './fx/sagomaVista.js?v=mtafl3ai';
import { Erba } from './fx/erba.js?v=mtafl3ai';
import { Foglie } from './fx/foglie.js?v=mtafl3ai';
import { SegnaPercorso } from './fx/percorso.js?v=mtafl3ai';
import { ComandiTouch } from './ui/comandi-touch.js?v=mtafl3ai';
import { RiflessoAcqua } from './fx/riflesso.js?v=mtafl3ai';
import { Pioggia } from './fx/pioggia.js?v=mtafl3ai';
import { Particelle } from './fx/particelle.js?v=mtafl3ai';
import { Audio } from './fx/audio.js?v=mtafl3ai';
import { Creature, registraComponentiCreature, sistemaCreature, pensaCreatura } from './gioco/creature.js?v=mtafl3ai';
import { RICETTE, puoiCraftare, crafta } from './gioco/craft.js?v=mtafl3ai';
import { registraComponentiPalle, creaEntitaPalla, distruggiPalla, calciaPalla, sistemaPalle, sistemaResaPalle } from './gioco/palla.js?v=mtafl3ai';
import { registraComponentiMacchine, GestoreMacchine, guidaMacchina, toccaMacchina, macchinaDi, haPannello, impostaConfig } from './gioco/macchine.js?v=mtafl3ai';
import { PannelloMacchina } from './ui/pannelloMacchina.js?v=mtafl3ai';
import { Registro } from './ecs/registro.js?v=mtafl3ai';
import { Orologio, Rng } from './ecs/orologio.js?v=mtafl3ai';
import { Sistemi } from './ecs/sistemi.js?v=mtafl3ai';
import { Agenda } from './ecs/agenda.js?v=mtafl3ai';
import { Gatto } from './player/player.js?v=mtafl3ai';
import { ManoStrumento } from './player/mano.js?v=mtafl3ai';
import { dropDi } from './gioco/drop.js?v=mtafl3ai';
import { Controller } from './player/controller.js?v=mtafl3ai';
import { FURNI, centroide } from './furniture/registry.js?v=mtafl3ai';
import { caricaModelli } from './furniture/loader.js?v=mtafl3ai';
import { Arredo } from './furniture/furniture.js?v=mtafl3ai';
import { HUD } from './ui/hud.js?v=mtafl3ai';
import { MenuDebug } from './ui/debug.js?v=mtafl3ai';
import { Officina, caricaOfficina, registraDaRete, rimuoviDaRete } from './ui/officina.js?v=mtafl3ai';
import { ModalitaXR } from './ar/ar-xr.js?v=mtafl3ai';
import { serializza, applica, salvaLocale, caricaLocale, cancellaLocale, esportaFile, elencoSlot, salvaSlot, caricaSlot, rinominaSlot, cancellaSlot } from './save.js?v=mtafl3ai';

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
// ⚠ IL DIORAMA MESSO DA PARTE PER LA VISITA NON E' LO SNAPSHOT DELL'UTENTE.
// Andare a casa di un amico metteva il proprio mondo nello stesso cassetto dove
// l'utente tiene lo snapshot che si e' salvato a mano — quello con cui torna
// indietro dopo aver rigenerato l'isola. Due visite e quello snapshot non c'era
// piu': la prima lo spingeva nel «precedente», la seconda lo buttava via. Roba
// perduta in silenzio, che e' il modo peggiore di perderla.
//
// E sta in sessionStorage, non in localStorage, perche' e' roba di QUESTA
// scheda: chi apre due schede per provare il multiplayer con se stesso — cioe'
// chiunque provi il multiplayer da solo — aveva le due partite che si
// scrivevano addosso a vicenda, e tornando a casa si ritrovava il mondo
// dell'altro. Un salvataggio condiviso fra schede va bene per IL mondo; per il
// «dove stavo prima di uscire» no.
const CHIAVE_VISITA = 'lantern.visita.v1';

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

// ---- LA DIAGNOSTICA SE N'È ANDATA IN UN FILE SUO ---------------------------
//
// Qui c'erano settecento righe di batteria di misure — un settimo di main — per
// uno strumento che si usa tre volte al mese. Adesso stanno in
// engine/batteria.js, e quello che era pescare a mano libera da trenta variabili
// di questo file è diventato un contratto scritto (vedi l'intestazione là).
// Qui restano le due cose che servono ANCHE al gioco, non solo alle misure.

// QUALE CODICE STA GIRANDO. prepara-www timbra ogni import con `?v=<build>` per
// scavalcare la cache di GitHub Pages (max-age=600), quindi il timbro è già
// scritto nell'URL di questo stesso modulo: si legge gratis. Serve alla
// diagnostica, ma anche alla RETE — la stanza porta con sé su che versione gira.
const VERSIONE_CODICE = import.meta.url.split('?v=')[1] || 'sviluppo';

// ---- LA BUILD VECCHIA: il problema che ha bruciato due giri di misure --------
//
// GitHub Pages serve index.html con `Cache-Control: max-age=600`. Dieci minuti
// in cui il browser NON ricarica la pagina, quindi il telefono continuava a
// eseguire la build di prima — e la diagnostica misurava un codice che non era
// quello appena pubblicato. Due file di fila persi così, e il committente non
// aveva modo di accorgersene: nel report c'era scritto solo «se non è l'ultima
// pubblicata, RICARICA», senza che nessuno sapesse quale fosse l'ultima.
//
// Adesso lo sa il gioco: chiede al server la pagina SENZA cache, legge il `?v=`
// e lo confronta con quello che sta eseguendo. Se non coincidono ricarica UNA
// volta sola (il sigillo in sessionStorage impedisce il giro infinito quando si
// gioca offline o dietro un proxy che non aggiorna).
let _buildPubblicata = null;      // quella sul server, quando si riesce a saperlo
async function _controllaBuild() {
  if (VERSIONE_CODICE === 'sviluppo') return;   // dev server: non c'è niente da confrontare
  try {
    const risp = await fetch('./index.html?cb=' + Date.now(), { cache: 'no-store' });
    if (!risp.ok) return;
    const m = (await risp.text()).match(/main\.js\?v=([a-z0-9]+)/i);
    if (!m) return;
    _buildPubblicata = m[1];
    if (_buildPubblicata === VERSIONE_CODICE) return;
    if (sessionStorage.getItem('lantern.ricarica') === _buildPubblicata) {
      // già provato e siamo ancora indietro: non insistere, dillo e basta
      hud.toast('⚠ Stai giocando una versione vecchia: chiudi e riapri la pagina', 6000);
      return;
    }
    sessionStorage.setItem('lantern.ricarica', _buildPubblicata);
    location.reload();
  } catch { /* offline: si gioca quello che c'è */ }
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
  if (opzioni.comandiTouch) {
    const v = voceInMano();
    const rompe = modalitaRompi || !v || v.genere === 'attrezzo';
    const tipo = rompe ? 'togli' : (v.genere === 'blocco' ? 'metti' : 'furniPiazza');
    if (!possoQui(tipo)) { nascondiGhost(); return; }
    ghostSuBersaglio();
    return;
  }
  if (modalitaRompi) { nascondiGhost(); return; }
  const voce = voceInMano();
  if (!voce || voce.genere === 'attrezzo') { nascondiGhost(); return; }
  const colpo = puntaGriglia(mira.x, mira.y);
  if (!colpo) { nascondiGhost(); return; }

  // l'anteprima TACE: se non puoi, semplicemente non compare (vedi possoQui)
  if (!possoQui(voce.genere === 'blocco' ? 'metti' : 'furniPiazza')) { nascondiGhost(); return; }
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
      // accendere una lampada è un evento di rete come mettere un blocco: se
      // l'host lo rifiuta e qui è già stato applicato, i due mondi divergono
      if (!possoLocalmente('furniStato')) return;
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
      if (!possoLocalmente('furniStato')) return;      // stessa ragione di interagisci()
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

/**
 * POSSO FARLO, QUI, ADESSO?
 *
 * ⚠ ERA IL BUCO PIU' BRUTTO DI TUTTO IL MULTIPLAYER, e non si vedeva perche' non
 * dava errore: dava DUE MONDI. Un visitatore piazzava un blocco, il blocco
 * compariva a casa sua, il messaggio partiva, l'host lo rifiutava perche' un
 * visitatore non costruisce — e nessuno diceva niente a nessuno. Da quel momento
 * il mondo dell'ospite e quello dell'host erano diversi: blocchi che esistono
 * per uno solo, muri che si attraversano perche' li' dentro non c'e' niente, e
 * ogni azione successiva che allarga la crepa.
 *
 * Il ruolo lo sapeva gia': `mioRuolo` arriva dal server appena si entra. Solo
 * che non lo leggeva NESSUNO — stava li' scritto e basta. Adesso si legge prima
 * di toccare il mondo, e chi non puo' se lo sente dire subito, con la ragione.
 *
 * A casa propria non chiede permesso a nessuno: il freno vale solo quando si e'
 * ospiti. E resta un freno di CORTESIA — quello vero, che conta, e' sull'host
 * (vedi il filtro in `lobby.onMessaggio`), perche' questo qui lo si scavalca
 * dalla console del browser in dieci secondi.
 */
function possoQui(tipo) {
  if (!lobby.connessa || lobby.ruolo !== 'ospite') return true;
  return ruoloPuo(mioRuolo, { tipo });
}

/**
 * Come `possoQui`, ma LO DICE. Si chiama solo da un GESTO dell'utente.
 *
 * ⚠ NON METTERLA NEL LOOP. È già successo: la stessa domanda stava dentro
 * `aggiornaGhost`, che gira a ogni frame — un ospite senza permessi si prendeva
 * sessanta avvisi e sessanta suoni d'errore al secondo, cioè il gioco
 * inutilizzabile invece del divieto. Dove serve solo SAPERE (l'anteprima, un
 * pulsante da spegnere) si usa `possoQui`, che tace.
 */
function possoLocalmente(tipo) {
  if (possoQui(tipo)) return true;
  const d = RUOLO_DESCR[mioRuolo];
  hud.toast(d ? `${d.icona} Sei ${d.titolo}: ${d.dice}` : 'Non puoi farlo in questa stanza');
  try { audio.sfx('errore'); } catch { /* senza audio pazienza */ }
  return false;
}

function usaSecchio(colpo) {
  if (!colpo) return;
  if (!possoLocalmente('metti')) return;
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
  if (!possoLocalmente('togli')) return;
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
      if (!possoLocalmente('furniRimuovi')) return;
      arredo.rimuovi(ist); inventario.aggiungi(ist.defId);
      audio.sfx('raccogli'); segnaSalvataggio(); return;
    }
    if (!mondo.tipo(x, y, z)) { hud.toast('Qui non c’è niente da rompere'); audio.sfx('errore'); return; }
    rompiBlocco([x, y, z]);
    return;
  }
  const voce = voceInMano();
  if (!voce || voce.genere === 'attrezzo') { hud.toast('Scegli un blocco dalla bolla 🫧'); return; }
  if (!possoLocalmente(voce.genere === 'blocco' ? 'metti' : 'furniPiazza')) return;
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
      if (!possoLocalmente('furniRimuovi')) return;
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

// ---- IL COLLEGAMENTO FRA GIOCATORI: UNA STRADA SOLA --------------------------
//
// ⚠ QUI DENTRO VIVEVANO DUE MULTIPLAYER, e la parte peggiore è che uno dei due
// era MORTO da mesi senza che si vedesse. C'era il pannello vecchio «Gioca
// insieme» (#stanza in index.html) con dentro TRE modi di collegarsi — il codice
// stanza, i codici WebRTC da copiare e incollare a mano, e le credenziali TURN —
// più una sua chat e una sua lista di membri. Poi è arrivato il pannello nuovo
// (ui/multiplayer.js, il tasto 🌐), e il vecchio non è stato tolto: è stato solo
// smesso di aprire. Da lì in poi il gioco continuava a tenerlo in vita per
// niente — scriveva lo stato della stanza in un'etichetta che nessuno vedeva,
// ridisegnava a ogni cambiamento una lista di membri invisibile, teneva
// agganciati una dozzina di pulsanti irraggiungibili — e chi leggeva il codice
// trovava due impianti che facevano la stessa cosa in due modi diversi, senza
// niente che dicesse quale dei due fosse quello vero.
//
// Adesso ne resta uno. I codici manuali sono spariti col pannello: il server di
// segnalazione fa lo stesso lavoro senza far copiare niente a nessuno.
//
// IL TURN, invece, NON è sparito: le credenziali già salvate continuano a
// valere e il server ne consegna di usa-e-getta a chi entra in una stanza
// (chiediTurnAlServer). Quello che è sparito è il modulo per incollarle a mano,
// che era l'unico pezzo di gergo rimasto in un gioco per bambini.
function caricaTurn() {
  try {
    const t = JSON.parse(localStorage.getItem('lantern.turn') || 'null');
    if (t && t.urls) Lobby.turn = [t];
  } catch { /* niente TURN */ }
}
caricaTurn();

// ---- E IL TURN LO CHIEDE AL NOSTRO SERVER -----------------------------------
//
// Il campo qui sopra resta per chi ha un TURN suo, ma nessuno deve piu' incollare
// credenziali a mano: il server (server/signaling.mjs, rotta /turn) tiene la
// chiave nelle sue variabili d'ambiente e rende credenziali USA E GETTA. Se
// stessero nel gioco sarebbero leggibili da chiunque apra la pagina, e sarebbe
// la banda del committente spesa da estranei.
//
// ⚠ NON BLOCCA NIENTE: si chiede all'avvio e si scrive in Lobby.turn quando
// arriva. Se il server non risponde restano gli STUN, che bastano in tutti i
// casi in cui la strada diretta esiste — cioe' la maggior parte delle reti di
// casa. Le credenziali incollate a mano, se ci sono, hanno la precedenza.
// ---- IL CONTACHILOMETRI DELLA BANDA ----------------------------------------
//
// Il server non vede passare la partita, quindi non può sapere quanto costa. Chi
// lo sa è il browser: ogni tanto legge le statistiche di WebRTC e riferisce la
// DIFFERENZA dall'ultima volta — non il totale, se no ogni referto conterebbe
// daccapo tutto quello di prima. Si manda solo quando c'è qualcosa da dire.
const _consumoVisto = new Map();     // idCanale → byte già riferiti
let _consumoTimer = null;

async function riferisciConsumo() {
  if (!segnalatore || !segnalatore.ws || segnalatore.ws.readyState !== 1) return;
  let stats; try { stats = await lobby.statistiche(); } catch { return; }
  for (const s of stats) {
    const tot = (s.su || 0) + (s.giu || 0);
    const prima = _consumoVisto.get(s.id);
    const delta = prima === undefined ? tot : tot - prima;
    _consumoVisto.set(s.id, tot);
    if (delta <= 0) continue;
    try {
      segnalatore.ws.send(JSON.stringify({ t: 'consumo', relay: s.relay, byte: delta, nuova: prima === undefined }));
    } catch { /* segnalazione caduta: pazienza, e' solo un contatore */ }
  }
}

function avviaContachilometri() {
  if (_consumoTimer) return;
  // ogni venti secondi: il server ne accetta uno ogni quindici, e un contatore
  // che si fa rifiutare a meta' e' un contatore sbagliato
  _consumoTimer = setInterval(riferisciConsumo, 20000);
}
function fermaContachilometri() {
  if (_consumoTimer) { clearInterval(_consumoTimer); _consumoTimer = null; }
  _consumoVisto.clear();
}

async function chiediTurnAlServer(biglietto) {
  if (!ANALITICA_URL || !biglietto) return;
  try {
    const r = await fetch(ANALITICA_URL.replace(/\/+$/, '') + '/turn?b=' + encodeURIComponent(biglietto));
    if (!r.ok) return;
    const j = await r.json();
    if (!j || !Array.isArray(j.iceServers)) return;
    // solo le voci TURN: gli STUN il gioco ce li ha gia' suoi
    const soloTurn = j.iceServers.filter((v) => {
      const u = Array.isArray(v.urls) ? v.urls.join(' ') : String(v.urls || '');
      return /^turns?:/.test(u.trim());
    });
    if (soloTurn.length) { Lobby.turn = soloTurn; console.info('[lantern] TURN pronto:', j.da); }
    else console.info('[lantern] nessun TURN:', j.da);
  } catch { /* server spento: si resta con gli STUN */ }
}
// ⚠ NON SI CHIEDE PIÙ ALL'AVVIO. Il TURN costa banda a chi lo paga, quindi il
// server lo concede solo a chi ha un BIGLIETTO — e il biglietto lo rilascia
// entrando in una stanza. Chi gioca da solo non ne ha bisogno e non lo chiede:
// una richiesta in meno per ogni partita, e la quota resta per chi serve.

// ---- DOVE STA IL TRAMITE ----------------------------------------------------
//
// ⚠ L'INDIRIZZO NON SI CHIEDE A NESSUNO: è LO STESSO SERVER delle presenze.
// `signaling.mjs` nasce per il codice-stanza — le analitiche gliele abbiamo
// aggiunte sopra — quindi appena ANALITICA_URL è configurato il gioco sa già
// dove sta il tramite. Chi durante le prove vuole puntare a un server diverso
// scrive UNA volta `localStorage['lantern.segnala']` e quello vince su tutto.
//
// Prima l'indirizzo si leggeva da un campo di testo che stava nel pannello
// vecchio: cioè da un campo che nessuno poteva più vedere né riempire. Leggerlo
// dal DOM voleva dire leggere sempre la stringa vuota e non accorgersene mai.
let segnalatore = null;
function urlSegnala() {
  let scelto = '';
  try { scelto = (localStorage.getItem('lantern.segnala') || '').trim(); } catch { /* ok */ }
  const u = scelto || ANALITICA_URL;
  if (!u) { hud.toast('Nessun server di segnalazione configurato 😿'); return null; }
  return u.replace(/^http/, 'ws'); // http→ws, https→wss
}
// ⚠ QUI STAVANO DUE GEMELLI POVERI di `_apriStanzaDaPannello` e
// `_entraDaPannello`: gli stessi due gesti, ma agganciati ai pulsanti del
// pannello vecchio e con META' dei collegamenti. Aprivano la stanza leggendo
// nome, password e «bussare» da campi che nel frattempo erano stati cancellati
// dalla pagina — quindi: stanza sempre senza nome, sempre senza password,
// sempre a porte aperte — e sovrascrivevano `segnalatore` senza agganciargli ne'
// lo sgombero, ne' la caduta, ne' le bussate. Erano irraggiungibili, ma bastava
// un giorno di distrazione per riportarli in vita e passare una settimana a
// chiedersi perche' la password della stanza non venisse mai chiesta.

// ---- IL PONTE FRA IL PANNELLO «INSIEME» E LA RETE ---------------------------
//
// Il pannello non conosce main e non conosce la lobby: chiede e riferisce. Il
// motivo non e' eleganza, e' che quel modulo mostra testo scritto da altre
// persone, e tenerlo ignorante di tutto il resto vuol dire che l'unica cosa che
// puo' fare con quel testo e' mostrarlo.
// ⚠ DUE MONDI, DUE CHIAVI, E VANNO CUCITE. Il server di segnalazione conosce gli
// ospiti col SUO identificativo (`gid`, tipo «a1b2c3.4»); la lobby P2P li conosce
// col numero del canale (1, 2, 3…). Sono due cose diverse e non c'e' modo di
// dedurre l'una dall'altra: nascono in due posti che non si parlano.
// Finche' non erano cucite, `ruoliOspiti` veniva SCRITTA col gid (quando ammetti)
// e LETTA col numero di canale (quando arriva un evento) — quindi il filtro dei
// permessi non trovava mai niente e ripiegava su «spettatore». Falliva dalla
// parte sicura, per fortuna, ma un ospite promosso a costruttore non poteva
// costruire e nessuno capiva perche'.
// Il cucito e' possibile perche' l'host serve un ospite alla volta (vedi
// Segnalatore._servi): il prossimo canale che si apre e' del prossimo ammesso.
const _chiDentro = new Map();      // idCanale → { nome, colore } di chi e' in stanza
const _inArrivo = [];              // { gid, chi, ruolo } ammessi, in attesa del canale
const _bussanti = new Map();       // gid → { nome, colore } di chi ha bussato e aspetta
const _gidDelCanale = new Map();   // idCanale → gid del segnalatore (per parlargli dopo)
// 🛡 CHI STA GUARDANDO SENZA FARSI VEDERE. Un moderatore entrato in incognito
// e' collegato come tutti — riceve il mondo, le pose, la chat — ma da questa
// parte non esiste: niente gatto, niente targhetta, niente riga nella lista,
// niente conteggio, niente annuncio. E le sue pose vengono buttate PRIMA del
// rimbalzo agli altri, se no comparirebbe nel diorama di chiunque altro.
const _spie = new Set();           // idCanale dei moderatori invisibili
let _codiceStanza = null;

function _apriStanzaDaPannello(opz) {
  const url = urlSegnala(); if (!url) return;
  (async () => {
    try {
      if (segnalatore) segnalatore.chiudi();
      segnalatore = new Segnalatore(lobby);
      _agganciaSegnalatore();
      await segnalatore.creaStanza(url, { ...opz, build: VERSIONE_CODICE, max: 8 });
    } catch (e) { hud.toast('Server non raggiungibile 😿'); console.warn(e); }
  })();
}

let _sonoSpia = false;   // sto guardando una stanza da moderatore, in incognito

// ⚠ «STANZA INESISTENTE» PUO' ESSERE UNA BUGIA, e per mesi e' stata la ragione
// per cui il multiplayer sembrava rotto a caso. Il server non e' un processo
// solo: ne girano diverse copie, e ognuna conosce le stanze aperte SU DI SE'.
// Se l'host e' capitato sulla copia A e tu apri il collegamento sulla copia B,
// la B ti risponde in buona fede che quella stanza non esiste — mentre l'amico
// e' li' che aspetta guardando lo stesso codice.
//
// La soluzione giusta e' che le copie si parlino, e il server ci prova; ma
// quando quel tubo non c'e' (dipende dalla piattaforma) l'unica cosa che si puo'
// fare dal gioco e' RIPROVARE con un collegamento nuovo, che viene smistato di
// nuovo e ha buone probabilita' di finire su un'altra copia. Con tre copie
// bastano tre tentativi; qui se ne fanno sei, e si dice all'utente che si sta
// insistendo invece di lasciarlo davanti a un errore secco.
// ⚠ SI BUSSA A UNA PORTA ALLA VOLTA, e qui c'e' stato un errore vero da cui vale
// la pena imparare. Per fare presto si aprivano TRE collegamenti insieme, con
// l'idea che tre copie diverse rispondessero e vincesse la piu' veloce. Ma
// «cercare» e «bussare» sul filo sono lo STESSO messaggio: se le copie si
// parlano — e adesso si parlano — tutte e tre trovano la stanza e tutte e tre
// entrano. Da fuori si vedeva cosi': lo stesso amico suonava il campanello tre
// volte, l'host apriva tre volte, mandava il mondo intero tre volte, e due dei
// tre collegamenti non rispondevano mai piu' perche' nel frattempo il gioco li
// aveva chiusi — inchiodando la coda di chi ospita per tutti gli altri.
//
// Un tentativo per volta, ma SVELTI: il server risponde «non ce l'ho» in poco
// piu' di un secondo (ATTESA_MS in signaling.mjs), quindi quattro tentativi
// stanno in cinque secondi scarsi, e ogni tentativo e' un collegamento nuovo che
// viene smistato di nuovo — cioe' un'altra copia. Nel frattempo si dice
// all'utente che si sta insistendo, invece di lasciarlo davanti a un errore secco.
const TENTATIVI_ENTRATA = 4;

function _entraDaPannello(code, pw, spia) {
  const url = urlSegnala(); if (!url) return;
  _codiceCercato = String(code || '').toUpperCase();
  _tentativoEntrata = 0;
  _pwCercata = pw || '';
  _spiaCercata = spia || '';
  _sonoSpia = !!spia;
  hud.toast(spia ? '🛡 Entro a guardare «' + _codiceCercato + '» senza farmi vedere'
    : '🚪 Cerco la stanza «' + _codiceCercato + '»…');
  _bussaAllaPorta(url);
}

let _codiceCercato = null, _tentativoEntrata = 0, _pwCercata = '', _spiaCercata = '';
let _segInProva = null;     // il tentativo in volo, da chiudere se si rinuncia

/** Chiude il tentativo in corso, se ce n'è uno. Anche `azzeraRete` passa di qui. */
function _chiudiTentativo() {
  if (_segInProva) { try { _segInProva.chiudi(); } catch { /* ok */ } _segInProva = null; }
}

function _bussaAllaPorta(url) {
  _tentativoEntrata++;
  if (_tentativoEntrata > 1) {
    insieme.attesa(`Cerco la stanza «${_codiceCercato}»… (tentativo ${_tentativoEntrata} di ${TENTATIVI_ENTRATA})`);
  }
  const me = leggiProfilo();
  const cercato = _codiceCercato;
  const seg = new Segnalatore(lobby);
  _segInProva = seg;

  // ha trovato la porta: da qui in poi è LUI il segnalatore buono
  seg.onTrovata = () => {
    if (_codiceCercato !== cercato) return;   // nel frattempo si è rinunciato
    _codiceCercato = null;
    _segInProva = null;
    seg.onTrovata = null;
    _agganciaSegnalatore(seg);
  };

  // «non ce l'ho» può voler dire «non ce l'ho IO»: si riprova altrove
  const riprova = () => {
    if (_codiceCercato !== cercato) return;   // già risolto o annullato
    _chiudiTentativo();
    if (_tentativoEntrata < TENTATIVI_ENTRATA) { setTimeout(() => _bussaAllaPorta(url), 250); return; }
    _codiceCercato = null;
    insieme.respinto('inesistente', { msg: `Non trovo la stanza «${cercato}». Controlla il codice: se l’amico ce l’ha aperta, falla richiudere e riaprire.` });
  };

  seg.onRespinto = (codice, dati) => {
    if (_codiceCercato !== cercato) return;   // ha già vinto: questo è rumore
    if (codice === 'inesistente' || /inesistente/i.test((dati && dati.msg) || '')) { riprova(); return; }
    // password sbagliata, stanza piena, versione diversa: rifiuto VERO, si smette
    _codiceCercato = null;
    _chiudiTentativo();
    insieme.respinto(codice, dati);
  };

  seg.entra(url, cercato, {
    nome: me.nome, colore: me.colore, build: VERSIONE_CODICE,
    pw: _pwCercata, spia: _spiaCercata,
  }).catch(() => {
    if (_codiceCercato !== cercato) return;
    _codiceCercato = null;
    _chiudiTentativo();
    insieme.respinto('', { msg: `Non riesco a raggiungere il server per entrare in «${cercato}».` });
  });
}

/** Tutti i richiami del segnalatore in un posto solo: si creano piu' volte. */
function _agganciaSegnalatore(seg = segnalatore) {
  segnalatore = seg;
  segnalatore.onStato = (t) => hud.toast(t);
  segnalatore.onBiglietto = (b) => chiediTurnAlServer(b);
  segnalatore.onCode = (c) => {
    _codiceStanza = c;
    hud.toast('🏠 Stanza «' + c + '» — di\u2019 il codice agli amici');
    insieme.aggiorna();
  };
  segnalatore.onRuolo = (r) => {
    clearTimeout(_attesaBussata); _attesaBussata = null;   // ti hanno aperto
    mioRuolo = r;
    const dd = RUOLO_DESCR[r];
    insieme.avviso(dd ? `Sei dentro come ${dd.icona} ${dd.titolo} — ${dd.dice}` : 'Sei dentro.', 'si');
    const d = RUOLO_DESCR[r];
    if (d) hud.toast(`${d.icona} Sei ${d.titolo} — ${d.dice}`);
    insieme.aggiorna();
  };
  segnalatore.onAttesa = (msg) => {
    insieme.attesa(msg);
    clearTimeout(_attesaBussata);
    _attesaBussata = setTimeout(() => {
      if (lobby.connessa) return;                        // nel frattempo e' entrato
      azzeraRete('Nessuno ha risposto alla porta. Riprova quando c’è qualcuno.', 'no');
    }, ATTESA_BUSSATA_MS);
  };
  segnalatore.onSgombero = (motivo) => azzeraRete(motivo, 'no');
  segnalatore.onCaduta = () => {
    // il P2P gia' avviato regge da solo; quello che muore e' la porta d'ingresso
    if (!_codiceStanza && !lobby.connessa) return;      // niente da salvare
    if (lobby.connessa) {
      _codiceStanza = null;                              // nessuno puo' piu' entrare
      insieme.avviso('Il collegamento col server è caduto: chi c’è resta, ma non può entrare più nessuno. Chiudi e riapri la stanza per farla tornare visibile.', 'no');
      insieme.aggiorna();
    } else {
      azzeraRete('Il server non risponde più: la stanza è chiusa.', 'no');
    }
  };
  segnalatore.onRespinto = (codice, dati) => insieme.respinto(codice, dati);
  segnalatore.onIngresso = (gid, chi, spia) => {
    // entra senza bussare: o la stanza e' aperta a tutti, o e' un moderatore.
    // Se l'host l'ha appena ammesso a mano e' gia' in coda: non si raddoppia.
    if (_inArrivo.some((a) => a.gid === gid)) return;
    _inArrivo.push({ gid, chi, ruolo: spia ? 'spettatore' : 'visitatore', spia: !!spia });
  };
  segnalatore.onBussata = (gid, chi) => {
    _bussanti.set(gid, chi);
    const g = gattiRemoti.get(gid);
    if (g && g.targhetta) g.targhetta.imposta(chi.nome, chi.colore);
    insieme.bussano(gid, chi);
    hud.toast(`🚪 ${chi.nome || 'Qualcuno'} sta bussando`);
  };
}

/**
 * TORNA A ZERO. Qualunque cosa sia successa.
 *
 * ⚠ IL GUAIO NON E' CADERE, E' RESTARE PER TERRA. Se l'altro chiude il portatile,
 * se salta la rete, se il browser uccide la scheda per fare spazio — succede, e
 * va bene. Quello che non va bene e' quello che restava dopo: un codice-stanza
 * che non apre piu' niente, un pannello che dice «in attesa» di qualcuno che non
 * arrivera' mai, mezzo stato di rete appeso a una connessione morta. Da li' non
 * si usciva se non ricaricando la pagina, e ricaricare vuol dire perdere il
 * diorama di chi stava ospitando.
 *
 * Quindi: UNA funzione, che rimette tutto come prima di aprire il menu, e che si
 * puo' chiamare da qualunque disastro senza chiedersi da dove si viene.
 */
function azzeraRete(motivo, tipo) {
  try { lobby.chiudi(); } catch { /* gia' giu' */ }
  if (segnalatore) { try { segnalatore.chiudi(); } catch { /* idem */ } }
  fermaContachilometri();
  _codiceStanza = null;
  _sonoSpia = false;
  mioRuolo = 'completo';
  _codiceCercato = null;
  _chiudiTentativo();
  _chiDentro.clear(); ruoliOspiti.clear(); _gidDelCanale.clear(); _bussanti.clear();
  _inArrivo.length = 0; _spie.clear();
  clearTimeout(_attesaBussata); _attesaBussata = null;
  if (typeof insieme !== 'undefined') {
    insieme.avviso(motivo || '', tipo || '');
    insieme.aggiorna();
  }
  if (motivo) hud.toast('⭘ ' + motivo);
}

// se si bussa e non risponde nessuno, non si resta li' a fissare il pannello
let _attesaBussata = null;
const ATTESA_BUSSATA_MS = 45000;

const insieme = new PannelloInsieme({
  get urlServer() { return ANALITICA_URL; },
  get versione() { return VERSIONE_CODICE; },
  apri: (opz) => _apriStanzaDaPannello(opz),
  entra: (code, pw, spia) => _entraDaPannello(code, pw, spia),
  chiudi: () => azzeraRete('', ''),
  // ⚠ «SONO L'HOST» LO DICE IL CODICE, NON LA LOBBY. `lobby.ruolo` diventa
  // 'host' solo quando qualcuno si COLLEGA davvero: fra l'apertura della stanza
  // e il primo ospite resta null, e in quella finestra — che e' proprio quella in
  // cui devi leggere il codice per dirlo agli amici — il codice non compariva.
  // Era il difetto per cui «non riuscivo a entrare nelle stanze»: la stanza
  // c'era, il codice pure, ma a schermo non lo vedeva nessuno.
  stato: () => ({
    dentro: !!lobby.connessa || !!_codiceStanza,
    ruolo: lobby.ruolo || (_codiceStanza ? 'host' : null),
    codice: _codiceStanza,
    // ⚠ IL TESTO SE LO FA DA SE'. Prima lo leggeva dal vecchio pannello nascosto,
    // che e' un modo elegante per farsi trovare disallineati: quel nodo lo scrive
    // `lobby.onStato`, che parla di CANALI, mentre qui interessa la stanza — e
    // una stanza aperta senza nessuno dentro non e' «da soli», e' «in attesa».
    testo: (() => {
      if (!_codiceStanza && !lobby.connessa) return 'da soli';
      const n = lobby.membri.filter((x) => !_spie.has(x)).length;
      if (_codiceStanza) return n ? `${n} ospit${n === 1 ? 'e' : 'i'} da te` : 'stanza aperta, in attesa';
      return 'a casa di qualcun altro';
    })(),
  }),
  membri: () => ((lobby.ruolo === 'host' || _codiceStanza) ? lobby.membri : []).filter((gid) => !_spie.has(gid)).map((gid) => ({
    gid,
    nome: (_chiDentro.get(gid) || {}).nome || ('ospite ' + gid),
    colore: (_chiDentro.get(gid) || {}).colore,
    ruolo: ruoliOspiti.get(gid) || 'visitatore',
  })),
  ammetti: (gid, ruolo) => {
    // si mette in CODA: il ruolo verra' scritto sulla chiave giusta appena il
    // canale P2P di questo ospite si apre (vedi lobby.onStato)
    _inArrivo.push({ gid, chi: _bussanti.get(gid) || {}, ruolo });
    _bussanti.delete(gid);
    if (segnalatore && segnalatore.ws) segnalatore.ws.send(JSON.stringify({ t: 'ammetti', gid, ruolo }));
    insieme.aggiorna();
  },
  rifiuta: (gid) => {
    _bussanti.delete(gid);
    if (segnalatore && segnalatore.ws) segnalatore.ws.send(JSON.stringify({ t: 'rifiuta', gid }));
  },
  cambiaRuolo: (idCanale, ruolo) => {
    const gid = idCanale;
    // ⚠ SI SCRIVE PRIMA QUI, e poi lo si dice all'ospite: la mappa dell'host e'
    // quella che decide davvero cosa passa. Se l'avviso si perdesse per strada,
    // il permesso sarebbe comunque gia' cambiato dove conta.
    ruoliOspiti.set(idCanale, ruolo);
    // ⚠ la mappa dell'host e' quella che DECIDE: si scrive prima li'. L'avviso
    // all'ospite serve solo a fargli vedere l'etichetta giusta, e se si
    // perdesse per strada il permesso sarebbe comunque gia' cambiato dove conta.
    const seg = _gidDelCanale.get(idCanale);
    if (seg && segnalatore && segnalatore.ws) segnalatore.ws.send(JSON.stringify({ t: 'ruolo', gid: seg, ruolo }));
    insieme.aggiorna();
  },
  // ⚠ «FUORI» DEVE BUTTARE FUORI. Qui c'era `lobby.chiudiCanale(...)`, che non
  // esiste: il ternario lo scopriva a tempo di esecuzione e sceglieva `null`,
  // cioè NIENTE. Il risultato era il peggiore possibile — l'ospite restava
  // collegato ma spariva dalle mappe dell'host, quindi il suo ruolo tornava
  // «ignoto» = spettatore: chi ospita credeva di averlo cacciato, l'altro si
  // ritrovava a non poter più fare niente senza che nessuno gli dicesse perché.
  // Il canale P2P è diretto: chiuderlo È la cacciata.
  esci: (gid) => {
    lobby.chiudi(gid);
    ruoliOspiti.delete(gid); _chiDentro.delete(gid); _gidDelCanale.delete(gid); _spie.delete(gid);
    insieme.aggiorna();
  },
  mandaChat: (testo) => {
    const me = leggiProfilo();
    insieme.chatArrivata(me.nome, testo, true);
    lobby.invia({ t: 'chat', testo, nome: me.nome });
  },
  profiloCambiato: () => insieme.aggiorna(),
});

document.getElementById('btnInsieme').addEventListener('click', () => {
  const apri = !insieme.aperto;
  chiudiPannelli(apri ? 'insieme' : null);
  insieme.apri(apri);
});

// MAI due pannelli sovrapposti: aprirne uno chiude gli altri
function chiudiPannelli(tranne = null) {
  if (tranne !== 'insieme' && typeof insieme !== 'undefined') insieme.apri(false);
  if (tranne !== 'menu') document.getElementById('opzioni').classList.remove('aperto');
  // il vecchio pannello non si apre piu': resta solo come intelaiatura muta
  if (tranne !== 'zaino' && zaino) zaino.apri(false);   // può nascere dopo: vedi `let zaino = null`
  if (tranne !== 'officina' && officina) officina.apri(false);
  if (tranne !== 'aiuto') hud.mostraAiuto(false);
  if (tranne !== 'macchina' && pannelloMacchina.aperto) pannelloMacchina.chiudi();
}
// (QUI STAVANO I DODICI PULSANTI DEL PANNELLO VECCHIO: crea/entra con i codici
// WebRTC da copiare e incollare a mano, i due «Copia», i due «Incolla», il
// «Collega!», gli «indietro» e la X di chiusura. Il pannello non si apre da
// mesi — lo dice il commento di chiudiPannelli — quindi erano dodici ascoltatori
// appesi a bottoni che nessuno poteva premere, piu' le funzioni che servivano
// solo a loro: apriFaseStanza, copiaTesto, incollaIn. Il collegamento a mano non
// serve piu' a niente: il server di segnalazione fa lo stesso lavoro senza far
// copiare niente a nessuno, e se un giorno il server non ci fosse la strada
// giusta sarebbe rifarlo dentro il pannello nuovo, non resuscitare questo.)

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
  // le DECORAZIONI hanno una scheda loro: un ciuffo d'erba fra le panchine e i
  // lampioni non lo trova nessuno, ed era metà del «troppe cose confusionarie»
  const eDecoro = (id) => !!FURNI[id].decoro;
  const voci = (ids) => ids.map(voceDa).filter(Boolean);
  const sezioni = [
    ...CATEGORIE_BLOCCHI.map((c) => ({ id: c.id, nome: c.nome, emoji: c.emoji, voci: voci(c.blocchi) })),
    { id: 'natura', nome: 'Natura', emoji: '🌿', voci: voci(Object.keys(FURNI).filter(eDecoro)) },
    { id: 'mobili', nome: 'Mobili', emoji: '🪑', voci: voci(Object.keys(FURNI).filter((id) => !eMacchina(id) && !eDecoro(id))) },
    { id: 'macchine', nome: 'Macchine', emoji: '⚙️', voci: voci(Object.keys(FURNI).filter((id) => eMacchina(id) && !eDecoro(id))) },
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
// se la memoria è piena lo si dice UNA volta: un avviso ogni tre secondi
// coprirebbe lo schermo proprio mentre si cerca di mettere in salvo il lavoro
let _memoriaPienaDetta = false;

function _salvaOra() {
  _salvInCoda = false;
  if (!salvataggioSporco || modalitaOspite) return;
  const ok = salvaLocale(serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() }));
  if (!ok) {
    // ⚠ IL DIORAMA È ANCORA TUTTO QUI, in memoria: quello che manca è il posto
    // dove metterlo. Se lo si dice adesso, si fa in tempo a esportarlo su file o
    // a cancellare una partita vecchia; se non lo si dice, si scopre alla
    // prossima apertura che l'ultima ora non c'è mai stata.
    ultimoSalvataggio = performance.now();     // non si riprova a raffica
    if (_memoriaPienaDetta) return;
    _memoriaPienaDetta = true;
    bannerErrore('MEMORIA PIENA: il diorama non si sta più salvando. Esportalo su file (⚙️ → Diorama → 📤 Esporta) o elimina una partita salvata.');
    hud.toast('💾 Memoria piena: il diorama NON si salva più — esportalo su file', 6000);
    return;
  }
  _memoriaPienaDetta = false;
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
  // ⚠ SOLO GLI EVENTI DEI BLOCCHI. Qui sotto si CANCELLA la luce registrata su
  // quella cella prima di ricrearla, e la cancellazione non guardava il tipo di
  // evento: un evento che parla di un MOBILE (cambio stato, manopola girata)
  // spegneva la lucciola che stava nella stessa cella, per sempre e in silenzio.
  if (e.tipo !== 'metti' && e.tipo !== 'togli') return;
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
  if (e.tipo !== 'metti' && e.tipo !== 'togli') return;   // stessa ragione di gestisciLuceBlocco
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
  // ogni volta che il mondo si rifà da capo (isola nuova, diorama caricato,
  // snapshot ripristinato) i furni arrivano tutti insieme senza passare dagli
  // eventi: i segnaposto delle decorazioni vanno riletti a mano
  if (typeof ricostruisciDecori === 'function') ricostruisciDecori();
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

// I TRE SEGNAPOSTO e a quale sistema appartengono. Il furni non disegna niente:
// registra la cella e a metterci la roba è il sistema instanziato, lo stesso che
// semina i mucchi naturali. Così un ciuffo messo a mano e uno nato da solo sono
// letteralmente lo stesso codice — non «due cose che si somigliano».
const DECORO_FX = {
  ciuffo: { posa: (c) => erba.posa(c[0], c[1], c[2]), togli: (c) => erba.togliPosa(c[0], c[2]) },
  foglieSecche: { posa: (c) => foglie.posa(c[0], c[1], c[2], 0), togli: (c) => foglie.togliPosa(c[0], c[2]) },
  petali: { posa: (c) => foglie.posa(c[0], c[1], c[2], 1), togli: (c) => foglie.togliPosa(c[0], c[2]) },
};

/** Rilegge dal mondo TUTTI i segnaposto piazzati: al caricamento di un diorama
 *  i furni arrivano tutti insieme e non passano dagli eventi. */
let _decoriPronti = false;      // erba e foglie esistono? (vedi la TDZ qui sotto)
function ricostruisciDecori() {
  // ⚠ IL CONTROLLO NON E' DIFENSIVISMO: `ricostruisciBlocchiSpeciali` gira anche
  // durante l'avvio, PRIMA che `const erba` sia stato valutato, e toccare un
  // const nella sua zona morta lancia — non torna undefined, lancia. Un flag
  // esplicito e' l'unico modo di dirlo senza un try/catch che nasconderebbe gli
  // errori veri.
  if (!_decoriPronti) return;
  erba._posati.clear(); foglie._posate.clear();
  for (const ist of arredo.istanze) {
    const fx = DECORO_FX[ist.def.id];
    if (fx) fx.posa(ist.cella);
  }
}

function eventoLocale(e) {
  segnaSalvataggio();
  if (e.tipo === 'furniPiazza' && DECORO_FX[e.defId]) DECORO_FX[e.defId].posa(e.cella);
  else if (e.tipo === 'furniRimuovi' && e.cella) {
    // non si sa QUALE furni era: si toglie da tutti e due, chi non ce l'ha esce
    erba.togliPosa(e.cella[0], e.cella[2]);
    foglie.togliPosa(e.cella[0], e.cella[2]);
  }
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

// ---- LE MANOPOLE DEI MACCHINARI ENTRANO NEL GIRO DEGLI EVENTI ---------------
//
// ⚠ ERANO L'UNICA MODIFICA AL MONDO CHE NON PASSAVA DA `mondo.onEvento`, e si
// vedeva: due giocatori nella stessa stanza guardavano lo stesso Scintillatore
// andare a due ritmi diversi, il Campanello acceso per uno e spento per l'altro.
// Peggio del disaccordo era il finale: la config si SALVA col furni, quindi
// quando l'host salvava vinceva la sua versione e le regolazioni dell'ospite
// sparivano — senza che nessuno avesse fatto niente di sbagliato.
//
// Adesso una manopola girata è un evento come un blocco posato: stessa strada,
// stesso salvataggio, stesso filtro dei permessi sull'host.
let _daRete = false;      // stiamo APPLICANDO un evento altrui: non si rimanda indietro

servizi.consentiConfig = () => _daRete || possoLocalmente('macchinaConfig');
servizi.onConfigCambiata = (m, chiave, valore) => {
  if (_daRete) { segnaSalvataggio(); return; }        // arrivata da fuori: già in giro
  eventoLocale({ tipo: 'macchinaConfig', cella: m.cella, chiave, valore });
};

// all'avvio: se il server ha una build più nuova, si ricarica subito (una volta)
_controllaBuild();

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
_decoriPronti = true;           // da qui in poi i segnaposto si possono rileggere
ricostruisciDecori();           // il diorama caricato all'avvio ne ha gia'
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

// ---- I RUOLI DEGLI OSPITI ---------------------------------------------------
// L'host tiene qui che permessi ha dato a ognuno; l'ospite tiene il PROPRIO in
// `mioRuolo`. Sono due cose diverse apposta: l'ospite puo mentire a se stesso
// quanto vuole, tanto a decidere e' la mappa dell'host.
const ruoliOspiti = new Map();     // idCanale -> 'spettatore' | 'visitatore' | ...

// ⚠ QUANTO PUO' PARLARE UN OSPITE. Senza un tetto, chiunque sia in stanza puo'
// mandare eventi e chat a raffica: l'host li applica tutti, ricalcola la luce e
// il mesher per ognuno, e il gioco di CHI OSPITA si inchioda. Non serve un
// attaccante — basta un bug in una versione modificata. Il tetto e' generoso per
// il gioco vero (venti azioni al secondo sono piu' di quante ne faccia un umano)
// e stretto per una raffica automatica.
const AZIONI_AL_SEC = 20, CHAT_AL_SEC = 3;
const _quota = new Map();          // idCanale -> { azioni, chat, finestra }
function quotaOk(id, tipo) {
  const ora = performance.now();
  let q = _quota.get(id);
  if (!q || ora - q.finestra > 1000) { q = { azioni: 0, chat: 0, finestra: ora }; _quota.set(id, q); }
  if (tipo === 'chat') return ++q.chat <= CHAT_AL_SEC;
  return ++q.azioni <= AZIONI_AL_SEC;
}
let mioRuolo = 'completo';         // il mio, quando sono ospite a casa d'altri
let _risincronizzando = false;     // una richiesta di rimessa in pari alla volta
const gattiRemoti = new Map();
const COLORI_GATTI = [[0xf5a742, 0xc07a20], [0xe36bb4, 0xb44a8e], [0x9b6bf0, 0x7648c9], [0x5bd0d0, 0x3aa8a8], [0xd6e26b, 0xb1bd44]];
let mioIdRete = null;             // assegnato dall'host nel benvenuto
function gattoRemotoDi(id) {
  let g = gattiRemoti.get(id);
  if (!g) {
    const [c1, c2] = COLORI_GATTI[(typeof id === 'number' ? id : 0) % COLORI_GATTI.length];
    g = { gatto: new Gatto(c1, c2), pos: new THREE.Vector3(), posa: null, visto: 0, inAcqua: false };
    rig.scena.add(g.gatto.gruppo);
    // il nome sopra la testa: se non lo conosco ancora resta vuoto e comparira'
    // appena arriva (bussata o benvenuto), senza dover ricreare niente
    g.targhetta = new Targhetta(g.gatto.gruppo);
    const chi = _chiDentro.get(id);
    if (chi) g.targhetta.imposta(chi.nome, chi.colore);
    gattiRemoti.set(id, g);
    if (opzioni.sagoma !== false && opzioni.sagomaTutti) {
      g.sagoma = new SagomaVista(rig.scena, g.gatto.gruppo, 0xffd9a0);
      g.sagoma.imposta(true);
    }
  }
  return g;
}
function rimuoviGattoRemoto(id) {
  const _g = gattiRemoti.get(id);
  if (_g && _g.targhetta) _g.targhetta.via();
  const g = gattiRemoti.get(id);
  if (g) {
    rig.scena.remove(g.gatto.gruppo);
    if (g.sagoma) g.sagoma.smonta(rig.scena);
    gattiRemoti.delete(id);
  }
}
function svuotaGattiRemoti() { for (const id of [...gattiRemoti.keys()]) rimuoviGattoRemoto(id); }

// ---- CHI C'E' IN STANZA, E COSA SI DICONO -----------------------------------
//
// ⚠ QUI STAVANO UNA CHAT E UN ELENCO MEMBRI DI TROPPO. Ne esistevano due copie:
// queste, che scrivevano dentro il pannello vecchio (#chatLog, #stanzaMembri),
// e quelle di ui/multiplayer.js, che sono le uniche che si vedono. Ogni
// messaggio veniva scritto due volte e ogni cambio di stanza ridisegnava una
// lista che nessuno poteva guardare — lavoro sprecato, ma soprattutto due
// verita' possibili sulla stessa cosa, che e' il modo piu' sicuro per finire a
// leggere quella sbagliata.
//
// Della vecchia chat resta UNA cosa, ed era l'unica che valeva: l'avviso a
// schermo quando arriva un messaggio col pannello CHIUSO. Senza, chi non tiene
// il pannello aperto non sa che gli hanno scritto.
function nomeDi(id) { return id === 'h' ? 'Host' : `Gatto ${(typeof id === 'number' ? id : 0) + 1}`; }

/** Il messaggio va nel pannello; se il pannello e' chiuso, lo si dice comunque. */
function chatArrivata(nome, testo) {
  insieme.chatArrivata(nome, testo);
  if (!insieme.aperto) hud.toast(`💬 ${nome}: ${testo.slice(0, 60)}`);
}
let posaTimer = 0;
let _ultimaPosa = null;        // l'ultima posa DAVVERO spedita (vedi il blocco presenza)
let _ultimoInvioPosa = 0;
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
  } else if (e.tipo === 'macchinaConfig') {
    // UNA MANOPOLA GIRATA DALL'ALTRA PARTE. Il valore NON si crede sulla parola:
    // passa da `impostaConfig`, che è lo stesso guardiano dei valori locali —
    // chiave inesistente, tipo sbagliato, numero fuori scala, tutto viene
    // rimesso in riga o buttato. Dalla rete arriva un'intenzione, non un dato.
    const ist = mondo.furniIn(x, y, z);
    const m = ist && macchinaDi(gestoreMacchine, servizi, ist);
    if (m && typeof e.chiave === 'string') {
      _daRete = true;                       // niente eco: non lo si rimanda al mittente
      try { impostaConfig(servizi, m, e.chiave, e.valore); }
      finally { _daRete = false; }
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
    // ⚠ SOLO LA PRIMA VOLTA, e non è una micro-ottimizzazione: è il tuo mondo.
    // Questo benvenuto arriva anche a metà visita — ogni volta che si chiede una
    // rimessa in pari (`rivogliotutto`), che succede a ogni permesso negato. La
    // seconda volta in RAM non c'è più il TUO diorama, c'è quello dell'host:
    // rimetterlo da parte voleva dire SOVRASCRIVERE la copia del tuo con una
    // copia del suo, e al ritorno a casa ti ritrovavi in casa d'altri senza aver
    // fatto niente di strano. Se la visita è già cominciata, la copia buona è
    // già nel cassetto e non si tocca.
    if (!modalitaOspite) salvaPerVisita();          // il TUO diorama, al sicuro e a parte
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
    // ⚠ `m.tot` VIENE DALLA RETE, e finiva dritto in `new Array(m.tot)`: un
    // messaggio con tot = un miliardo faceva allocare un array da un miliardo di
    // caselle nel browser di chi riceve. Non serve nemmeno malizia — basta un
    // messaggio corrotto. Un mondo grande sta in poche centinaia di pezzi:
    // oltre mille non e' uno snapshot, e si butta.
    if (!Number.isInteger(m.tot) || m.tot < 1 || m.tot > 1000) return;
    if (!_pezziBenv || _pezziBenv.tot !== m.tot) _pezziBenv = { tot: m.tot, parti: new Array(m.tot).fill(null) };
    if (Number.isInteger(m.i) && m.i >= 0 && m.i < m.tot) _pezziBenv.parti[m.i] = m.s;
    if (_pezziBenv.parti.every((p) => p !== null)) {
      const json = _pezziBenv.parti.join('');
      _pezziBenv = null;
      try { arrivoBenvenuto(JSON.parse(json)); }
      catch { hud.toast('Snapshot non valido 😿'); }
    }
  } else if (m.t === 'evento') {
    // ⚠ QUI SI APPLICANO I PERMESSI, e qui soltanto. Nascondere i pulsanti a chi
    // non puo usarli e' garbo, non sicurezza: chiunque apra la console del
    // browser manda questo messaggio a mano. L'host e' l'autorita' — se l'evento
    // non e' permesso al ruolo di chi l'ha spedito, non si applica E non si
    // rimbalza agli altri, altrimenti il rifiuto varrebbe solo per il diorama
    // dell'host e non per quello che vedono gli altri ospiti.
    if (lobby.ruolo === 'host') {
      if (!quotaOk(daId, 'evento')) return;                // raffica: si lascia cadere
      const suo = ruoliOspiti.get(daId) || 'spettatore';   // ignoto = il minimo
      if (!ruoloPuo(suo, m.e)) {
        lobby.inviaA(daId, { t: 'negato', motivo: suo });
        return;
      }
    }
    applicaEventoRemoto(m.e);
    if (lobby.ruolo === 'host') lobby.invia(m, daId);          // relay agli altri
  } else if (m.t === 'negato') {
    // l'host ha rifiutato qualcosa: si dice PERCHE', se no sembra un bug del gioco
    const d = RUOLO_DESCR[m.motivo];
    hud.toast(d ? `${d.icona} Sei ${d.titolo}: ${d.dice}` : 'Non hai il permesso per farlo');
    // ⚠ E SI RIMETTE A POSTO IL MONDO. Col freno locale un rifiuto non dovrebbe
    // arrivare quasi mai — ma «quasi mai» capita: se il ruolo cambia mentre il
    // messaggio e' per strada, l'azione e' gia' applicata qui e non la'. Da quel
    // momento i due mondi sono diversi, e nessuno dei due sa di esserlo. Chiedere
    // di nuovo tutto e' sproporzionato? No: costa un secondo e succede una volta.
    if (lobby.ruolo === 'ospite' && !_risincronizzando) {
      _risincronizzando = true;
      hud.toast('↻ rimetto in pari il diorama…');
      lobby.invia({ t: 'rivogliotutto' });
      setTimeout(() => { _risincronizzando = false; }, 5000);
    }
  } else if (m.t === 'rivogliotutto' && lobby.ruolo === 'host') {
    // un ospite si e' accorto di essere fuori sincrono: gli si rimanda tutto
    if (!quotaOk(daId, 'evento')) return;
    lobby.inviaGrandeA(daId, 'benvenuto', {
      dati: serializza(mondo, arredo, ciclo),
      posa: [controller.pos.x, controller.pos.y, controller.pos.z],
      officina: datiOfficina.blocchi,
      tuoId: daId,
    });
  } else if (m.t === 'tempo' && lobby.ruolo === 'host' && typeof m.v === 'number') {
    ciclo.t = Math.min(1, Math.max(0, m.v));          // richiesta dell'ospite: l'orologio resta MIO
  } else if (m.t === 'chat' && typeof m.testo === 'string') {
    if (lobby.ruolo === 'host' && !quotaOk(daId, 'chat')) return;   // niente spam
    const nome = m.nome || nomeDi(m.id !== undefined ? m.id : daId);
    chatArrivata(nome, m.testo.slice(0, 200));
    if (lobby.ruolo === 'host') lobby.invia({ ...m, nome }, daId);   // relay
  } else if (m.t === 'posa' && Array.isArray(m.p) && m.p.length === 3) {
    // chi è? host: il canale da cui arriva · ospite: l'id dentro al messaggio
    const id = lobby.ruolo === 'host' ? daId : (m.id !== undefined ? m.id : 'h');
    if (lobby.ruolo === 'host' && _spie.has(id)) return;   // il moderatore non ha corpo
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

  // ⚠ PRIMA SI CAPISCE CHI E' ARRIVATO, POI SI SCRIVE A SCHERMO. L'ordine non e'
  // pignoleria: qui sotto si conta la gente in stanza, e se la cucitura delle
  // chiavi avvenisse dopo, il primo conteggio comprenderebbe anche il moderatore
  // in incognito — «1 ospite da te» con la lista dei membri vuota. Un numero che
  // sale senza che entri nessuno e' esattamente il modo in cui ci si accorge di
  // essere osservati.
  if (s === 'aperta' && lobby.ruolo === 'host') {
    // il canale appena aperto e' del primo ammesso in coda, perche' l'host ne
    // serve uno alla volta (vedi Segnalatore._servi)
    const arrivo = _inArrivo.shift();
    if (arrivo) {
      ruoliOspiti.set(id, arrivo.ruolo);          // ORA la chiave e' quella giusta
      _gidDelCanale.set(id, arrivo.gid);
      if (arrivo.spia) {
        _spie.add(id);                            // c'e', ma da qui non si vede
      } else {
        _chiDentro.set(id, arrivo.chi);
        const g = gattiRemoti.get(id);
        if (g && g.targhetta) g.targhetta.imposta(arrivo.chi.nome, arrivo.chi.colore);
      }
    }
  }
  // ⚠ CHI MOSTRA LO STATO VA SVEGLIATO DA CHI LO SA. Lo stato di una stanza
  // cambia per conto suo — quando qualcuno arriva o se ne va — quindi il
  // pannello non puo' indovinarlo: senza questa riga la lista dei membri restava
  // com'era al momento in cui l'avevi aperta, e diceva «da soli» con un ospite
  // dentro. (Qui accanto si scriveva anche l'etichetta del pannello vecchio e si
  // ridisegnava la sua lista: due schermi da tenere in pari, uno dei quali
  // invisibile.)
  if (typeof insieme !== 'undefined') insieme.aggiorna();
  if (s === 'aperta') {
    avviaContachilometri();
    // chiaro CHI ospita: si gioca sempre nel diorama di chi ha creato la stanza
    if (lobby.ruolo === 'host') {
      if (!_spie.has(id)) hud.toast(`🟢 ${nomeDi(id)} sta arrivando nel TUO diorama!`);
      lobby.inviaGrandeA(id, 'benvenuto', {
        dati: serializza(mondo, arredo, ciclo),
        posa: [controller.pos.x, controller.pos.y, controller.pos.z],
        officina: datiOfficina.blocchi,      // i TUOI blocchi: l'ospite li vede
        tuoId: id,                           // così l'ospite sa chi è (nome in chat)
      });
    } else {
      hud.toast('🟢 Collegato! Vai a casa dell’amico…');
    }
  }
  if (s === 'chiusa' || (lobby.ruolo === 'host' && s === 'aperta')) {
    // qualcuno se n'è andato (o è arrivato): via i gatti orfani
    if (lobby.ruolo === 'host') {
      for (const gid of [...gattiRemoti.keys()]) if (!lobby.membri.includes(gid)) rimuoviGattoRemoto(gid);
      // ⚠ E VIA ANCHE QUELLO CHE NON SI VEDE. Di un ospite andato via restavano
      // il ruolo, il nome e la corrispondenza col segnalatore: roba piccola, ma
      // questa stanza deve reggere una serata intera con gente che entra ed esce,
      // e quattro mappe che crescono e non calano mai sono una perdita lenta.
      for (const gid of [...ruoliOspiti.keys()]) {
        if (lobby.membri.includes(gid)) continue;
        ruoliOspiti.delete(gid); _chiDentro.delete(gid); _gidDelCanale.delete(gid); _spie.delete(gid);
      }
    }
  }
  if (s === 'chiusa' && !lobby.connessa) {
    fermaContachilometri();
    svuotaGattiRemoti();
    mioIdRete = null;
    if (modalitaOspite) {
      modalitaOspite = false;
      rimuoviDaRete();                                // via i blocchi Officina dell'host
      tornaDallaVisita();                             // torni nel TUO diorama, intatto
      hud.toast('⭘ P2P chiuso — sei tornato nel TUO diorama');
    } else {
      hud.toast('P2P chiuso');
    }
  }
};
// la lista dei membri la disegna il pannello nuovo, che la chiede a `membri()`
lobby.onMembri = () => { if (typeof insieme !== 'undefined') insieme.aggiorna(); };

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

/** Il MIO diorama, messo da parte per il tempo di una visita. */
function salvaPerVisita() {
  try {
    sessionStorage.setItem(CHIAVE_VISITA, JSON.stringify(
      serializza(mondo, arredo, ciclo, inventario, { tavolozza: tavolozza.serializza() })));
    return true;
  } catch {
    // se non ci sta, meglio saperlo ADESSO che al ritorno
    hud.toast('Non riesco a mettere da parte il tuo diorama 😿');
    return false;
  }
}

/** E rieccolo, appena finita la visita. */
function tornaDallaVisita() {
  const raw = sessionStorage.getItem(CHIAVE_VISITA);
  if (!raw) { ripristinaSnapshot(); return; }      // ripiego: meglio di niente
  try {
    applica(JSON.parse(raw), mondo, arredo, ciclo, inventario);
    applicaTavolozza(JSON.parse(raw));
  } catch { hud.toast('Il tuo diorama non si rilegge 😿'); return; }
  sessionStorage.removeItem(CHIAVE_VISITA);
  mesher.ricostruisciTutto(mondo);
  ricostruisciLuciBlocchi();
  ricostruisciBlocchiSpeciali();
  respawn();
  segnaSalvataggio();
}

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
    diagnostica: () => batteria.esegui(),
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
    // ⚠ UNA VERITÀ SOLA. Questo interruttore scriveva `inventario.infinito` per
    // conto suo, quindi poteva contraddire la modalità scelta nel menu: risorse
    // infinite con la durezza «Normale», o Creativa coi mattoni che finiscono.
    // Due posti che decidono la stessa cosa fanno sempre così. Adesso muove la
    // MODALITÀ, che è l'unica autorità, e l'altra metà la segue da sé.
    infinito: () => {
      opzioni.durezza = inventario.infinito ? 'normale' : 'creativa';
      applicaOpzioni();
      hud.toast(inventario.infinito ? '✨ Creativa: risorse infinite, blocchi a un tocco' : '⛏ Normale: risorse contate');
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

  // ---- IL SIGILLO DELL'AVVIO: contro i salvataggi che INCHIODANO -------------
  //
  // ⚠ IL PARACADUTE CHE C'ERA COPRIVA SOLO GLI AVVII CHE *LANCIANO*. Un
  // salvataggio corrotto dà un'eccezione → catch → isola nuova, e va bene. Ma
  // un salvataggio PATOLOGICO può anche non lanciare niente: macina — è
  // successo davvero, un mondo salvato a metà di una rigenerazione ha tenuto
  // l'avvio inchiodato per MINUTI, e siccome il blocco è sincrono nemmeno il
  // cane da guardia coi suoi setTimeout riesce a dirlo a schermo. Per chi
  // gioca è la morte del salvataggio: OGNI apertura si congela, per sempre,
  // senza un messaggio.
  //
  // Il sigillo: si scrive un contatore PRIMA di toccare il salvataggio e lo si
  // toglie ad avvio finito. Se all'apertura il contatore dice che DUE avvii di
  // fila non sono mai arrivati in fondo, il salvataggio va da parte (in
  // «lantern.diorama.rotto», recuperabile) e si riparte da un'isola nuova.
  // DUE e non uno: chi chiude la scheda durante un caricamento lento ma sano
  // non deve perdere niente — un incidente singolo non prova nulla, due di
  // fila sì.
  const SIGILLO = 'lantern.avvioInCorso';
  let _avviiRotti = 0;
  try { _avviiRotti = Number(localStorage.getItem(SIGILLO) || 0); } catch { /* ok */ }
  // ⚠ IL CATCH QUI SOTTO NON È «pazienza»: LOGGA. La prima versione inghiottiva
  // tutto, e ci è cascato dentro un ReferenceError (CHIAVE_SALVATAGGIO non era
  // importata): il paracadute sembrava scritto e non si apriva MAI — cioè lo
  // stesso identico difetto, «l'errore mangiato in silenzio», che questo
  // paracadute esiste per curare. Il try serve per il solo caso legittimo
  // (localStorage che rifiuta in navigazione privata), non per nascondere i miei.
  let _salvataggioAccantonato = false;
  if (_avviiRotti >= 2) {
    try {
      const raw = localStorage.getItem(CHIAVE_SALVATAGGIO);
      if (raw) {
        localStorage.setItem('lantern.diorama.rotto', raw);
        localStorage.removeItem(CHIAVE_SALVATAGGIO);
        _salvataggioAccantonato = true;
      }
    } catch (e) { console.error('[lantern] sigillo d’avvio: accantonamento fallito', e); }
  }
  try { localStorage.setItem(SIGILLO, String(_avviiRotti + 1)); } catch { /* ok */ }

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
  window.LANTERN = { mondo, arredo, controller, ciclo, rig, gatto, nuvole, scavo, FURNI, BLOCCHI, mesher, aggiornaLuci, campoSole, erba, foglie, segnaPercorso, creaLuceLeggera, spostaLuce, rimuoviLuce, generaArcipelago, generaOpenWorld, generaCollaudo, generaTestLuci, generaTestMacchine, inventario, tavolozza, strisca, zaino, bolla, scelta, sim, lobby, menuDebug, rompiBlocco, riflesso, pioggia, particelle, gestoreMacchine, guidaMacchina, toccaMacchina, macchinaDi, pannelloMacchina, apriPannelloMacchina, ecs, orologioSim, passo, sistemiSim, sistemiResa, rngSim, servizi, agenda, creature, sistemaCreature, pensaCreatura, calciaPalla, sistemaPalle, sistemaResaPalle, creaEntitaPalla, distruggiPalla, schiumaTop, aggiornaSchiumaAcqua, meteo, modalitaAR, modalitaXR, particelleBlocchi, luciBlocchi, nidiFatui, fuochiFatui, statLuci, hud, cadenza, opzioni, uniformi: uniformiCondivise(), perf, impostaPerf, diagnostica: () => batteria.esegui() };

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
  crono('luci', () => aggiornaLuci(controller.pos));
  rig.aggiorna();
  rig.render();

  requestAnimationFrame(loop);
  fineVigile();                                   // partito: niente più diagnosi
  try { localStorage.removeItem(SIGILLO); } catch { /* ok */ }   // avvio finito: sigillo via
  if (_salvataggioAccantonato) {
    setTimeout(() => hud.toast('⚠️ Due avvii di fila si erano bloccati: il vecchio diorama è stato messo da parte e sei su un’isola nuova', 7000), 800);
  }
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
// ---- LE SAGOME DEI MOBILI VANNO AL CAMPO DEL SOLE ---------------------------
//
// ⚠ QUI VIVEVANO DUECENTOTRENTA RIGHE DI MACCHINARIO — budget dei trentadue,
// portata, isteresi del taglio, staffetta fra due livelli di dettaglio, pesi di
// dissolvenza contro il pop-in, e il famoso oscillatore del taglio che faceva
// sfarfallare tutte le ombre insieme. Ognuna di quelle righe curava un sintomo
// della stessa malattia: le scatole si pagavano PER PIXEL, quindi potevano
// essere solo poche, quindi bisognava scegliere, dosare, sfumare la scelta.
//
// Il campo del sole (fx/campoSole.js) elimina la malattia: le scatole si
// stampano UNA volta nel campo, tutte, e lo shader legge un texel. Niente
// budget, niente pop-in, niente pesi. La lista si rifa' solo quando l'arredo
// cambia davvero (versione), e la tiene d'occhio il campo con la sua chiave.
//
// Resta un elenchino ANALITICO: le OTTO scatole piu' vicine per la vegetazione,
// che si scurisce per VERTICE (GLSL_SCATOLE_VERTICE) e il campo non lo legge.
const _scatoleCampo = [];          // TUTTE le sagome, per il campo del sole
let _scatoleCampoVer = -1;         // versione d'arredo con cui e' stata costruita
function scatoleCampo() {
  if (arredo.versione === _scatoleCampoVer) return _scatoleCampo;
  _scatoleCampoVer = arredo.versione;
  _scatoleCampo.length = 0;
  for (const ist of arredo.istanze) {
    if (!ist.scatoleOmbra) continue;
    for (const s of ist.scatoleOmbra) _scatoleCampo.push(s);
  }
  return _scatoleCampo;
}

// le otto piu' vicine al punto guardato, per l'erba e le foglie; si rifanno a
// mezzo blocco di cammino o quando l'arredo cambia — un giro e un sort su
// qualche decina di mobili, un paio di volte al secondo
const _scatoleVertice = [];
const _viciniOrdinati = [];
let _svX = 1e9, _svZ = 1e9, _svVer = -1;
function scatoleVertice() {
  const b = rig.bersaglio;
  if (arredo.versione === _svVer && Math.abs(b.x - _svX) + Math.abs(b.z - _svZ) < 0.5) return _scatoleVertice;
  _svX = b.x; _svZ = b.z; _svVer = arredo.versione;
  _viciniOrdinati.length = 0;
  for (const ist of arredo.istanze) {
    if (!ist.scatoleOmbra || !ist.scatoleOmbra.length) continue;
    const dx = ist.cella[0] + 0.5 - b.x, dz = ist.cella[2] + 0.5 - b.z;
    _viciniOrdinati.push({ d2: dx * dx + dz * dz, s: ist.scatoleOmbra });
  }
  _viciniOrdinati.sort((p, q) => p.d2 - q.d2);
  _scatoleVertice.length = 0;
  for (const v of _viciniOrdinati) {
    for (const s of v.s) {
      // l'ombra di contatto e' una gonnellina da quattordici centimetri: per
      // i fili d'erba non dice niente, e il posto in otto e' prezioso
      if (s.contatto) continue;
      _scatoleVertice.push(s);
      if (_scatoleVertice.length >= 8) return _scatoleVertice;
    }
  }
  return _scatoleVertice;
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
  // ⚠ LA SCHIUMA DI UN GATTO CHE NON È IN ACQUA NON HA SENSO, e si vedeva: «stando
  // a bordo riva la schiuma c'è anche se il player non è in acqua». La schiuma è
  // la SILHOUETTE dall'alto di quel che buca il pelo, quindi finché il gatto sta
  // nel layer la sua sagoma disegna un anello anche da asciutto, un metro più in
  // là. Ora entra nel layer solo se i piedi sono sotto il pelo (con un dito di
  // margine, se no sul bordo l'anello lampeggia a ogni passo).
  const _pelo = pianoAcquaVicino();
  const _inAcqua = (g) => _pelo !== null && g.gruppo.position.y <= _pelo + 0.10;
  gatto.gruppo.traverse((o) => { if (_inAcqua(gatto)) o.layers.enable(LAYER_SCHIUMA); else o.layers.disable(LAYER_SCHIUMA); });
  for (const g of gattiRemoti.values()) {
    const dentro = _inAcqua(g.gatto);
    g.gatto.gruppo.traverse((o) => { if (dentro) o.layers.enable(LAYER_SCHIUMA); else o.layers.disable(LAYER_SCHIUMA); });
  }
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
  // `sole` = l'ombra del cielo (cel shading), 0 = spenta. ⚠ COL CAMPO DEL SOLE
  // NON È PIÙ UN LUSSO: costa una lettura di texture per pixel — meno delle
  // ombre delle nuvole, che qui sono sempre state accese — più un ricalcolo
  // CPU di qualche ms ogni due secondi (a fette da 3 ms, fattore 1 su mobile).
  // Resta accesa fino al terzultimo gradino; gli ultimi due sono la corsia di
  // emergenza dei chip che non reggono nemmeno i pixel, e lì si spegne TUTTO.
  { rifl: false, ombre: false, schiuma: true, acquaRicca: true, maxOmbre: 6, sole: 10, scala: 1, dist: 700 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 4, sole: 6, scala: 0.9, dist: 500 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 3, sole: 6, scala: 0.82, dist: 500 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 2, sole: 6, scala: 0.66, dist: 360 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 1, sole: 0, scala: 0.55, dist: 280 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 0, sole: 0, scala: 0.45, dist: 220 },
] : [
  // `sole` = l'ombra del cielo: 0 = spenta, qualunque altro numero = accesa.
  // (Era una portata in blocchi ai tempi del cammino per-pixel; il campo del
  // sole non ha passi da contare e le ombre lunghe arrivano fin dove devono.)
  { rifl: true, ombre: true, schiuma: true, acquaRicca: true, maxOmbre: 8, sole: 13, scala: 1, dist: 900, erba: 1.3, erbaR: 6 },
  { rifl: false, ombre: false, schiuma: true, acquaRicca: true, maxOmbre: 6, sole: 12, scala: 1, dist: 700, erba: 1, erbaR: 5 },
  // ⚠ IL TILT-SHIFT NON SI SPEGNE PIU' QUI, e lo dicono le misure del
  // committente: sul suo Chromebook, in DUE giri diversi e con la voce misurata
  // alternata, spento costa il 6% di GPU IN PIU' (28,95 ms contro 27,26; e prima
  // 80,0 contro 74,1). Qualunque sia il motivo — il composer c'e' comunque
  // appena la scala scende sotto 1 — spegnerlo non risparmia niente e toglie
  // meta' dell'aspetto del diorama. Restava in scala per un'ipotesi mia mai
  // verificata: «e' un post-process, quindi costa». Non su quel chip.
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 4, sole: 8, scala: 1, dist: 500, erba: 0.6, erbaR: 3 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 2, sole: 6, scala: 0.82, dist: 500 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 1, sole: 0, scala: 0.66, dist: 360 },
  // ⚠ GLI ULTIMI DUE SCALINI SONO NUOVI, e li ha chiesti una misura precisa: sul
  // Chromebook del committente (Intel HD 400) il pass principale costa 69,8 ms a
  // scala 1 e 24,1 ms a scala 0,50 — cioè la RISOLUZIONE è la leva, e la scala
  // automatica si fermava a 0,66 (36,7 ms, ancora ~20 fps). Il fondo scala di
  // «desktop» era tarato su un portatile lento, non su un chip integrato del
  // 2015: per quello serve arrivare dove arriva la scala mobile. Brutto, ma
  // giocabile — e sopra c'è tutta la scala per chi non ne ha bisogno.
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 0, sole: 0, scala: 0.55, dist: 300 },
  { rifl: false, ombre: false, schiuma: false, acquaRicca: false, maxOmbre: 0, sole: 0, scala: 0.45, dist: 240 },
];
let qLivello = 0;
let qManuale = false;        // qualità auto spenta: comandano le Impostazioni
let riflessiUtente = true;
let _schiumaQ = true;        // la passata schiuma se la può permettere questo livello?
let _partiQ = 127;           // termini dello shader concessi dal livello di qualità

// ---- Impostazioni utente (⚙️): persistenti, applicate subito -------------------
const OPZ_CHIAVE = 'lantern.opzioni.v1';
// luceCotta (ombre voxel delle LAMPADE) resta OFF di default su MOBILE: il DDA
// nella texture 3D è ancora un costo per-pixel vero (misurato: ~30% di fps sui
// Mali fill-starved). Restano un opt-in.
// ⚠ L'OMBRA DEL SOLE INVECE SI ACCENDE ANCHE SU MOBILE, ed è il dividendo del
// campo del sole: quello che prima costava un cammino di tredici letture più
// le scatole per OGNI pixel adesso costa UNA lettura di texture — meno delle
// ombre delle nuvole, che su telefono sono sempre state accese. Il cel shading
// che il committente chiede («ombre e luci in cel shading») finalmente esiste
// anche dove si gioca davvero. Se una diagnostica dal dispositivo dicesse il
// contrario, la leva è questa: ombraSole nel default e `sole` nella scala.
const OPZ_DEFAULT = { fog: 0.55, dist: 700, riflessi: !rig.mobile, autoQ: true, luceCotta: !rig.mobile, cameraFantasma: false, erba: true, foro: true, foroRaggio: 110, sagoma: false, sagomaTutti: false, scala: 1, riflForza: 1, meteoAuto: true, arRot: 0, arScala: 1, arEspo: 0.5, arFuoco: null, comandiTouch: rig.mobile, fpsMax: 0, vol: 0.6, muto: false, posa: 'davanti', durezza: 'normale', nitido: true, ombraSole: true, solePassi: 12, soleTerm: true, soleForza: 1, ombreDin: false };
const opzioni = Object.assign({}, OPZ_DEFAULT, JSON.parse(localStorage.getItem(OPZ_CHIAVE) || '{}'));

// preset grafici: un tocco e la macchina va — comodi per testare
// `luceCotta` = ombre voxel delle luci pesanti (nome storico della chiave
// salvata, vedi applicaOpzioni). "bassa" le spegne SUBITO come fa col riflesso,
// invece di aspettare che la qualità auto scenda: una macchina che tiene 30fps
// con cali non scende mai sotto la soglia e resterebbe col marching acceso.
//
// ⚠ IL PROFILO ADESSO SCRIVE TUTTE LE VOCI DELLA PAGINA, e prima no: toccava
// sette chiavi su tredici e lasciava dov'erano ombra del sole, chiaroscuro,
// ombre dinamiche, portata dell'ombra, forza e pixel nitidi. Il committente
// l'ha detto così: «i profili grafici non toccano alcune cose». È il difetto
// peggiore che possa avere un preset — scegli «Bassa» perché va a scatti, e la
// voce che costa di più resta accesa: il preset sembra non funzionare.
//
// Regola, da qui in avanti: se una manopola sta nella pagina Grafica, allora
// ogni profilo deve dire quanto vale. Aggiungerne una senza metterla qui è un
// bug, non un'omissione.
const PRESET_GRAFICA = {
  bassa: {
    scala: 0.66, riflessi: false, luceCotta: false, riflForza: 0.6, dist: 250, fog: 0.9,
    nitido: true, ombraSole: false, solePassi: 0, soleTerm: false, soleForza: 1, ombreDin: false,
    erba: true, autoQ: true,
  },
  media: {
    scala: 0.85, riflessi: false, luceCotta: true, riflForza: 0.8, dist: 450, fog: 0.7,
    nitido: true, ombraSole: true, solePassi: 8, soleTerm: true, soleForza: 1, ombreDin: false,
    erba: true, autoQ: true,
  },
  alta: {
    scala: 1, riflessi: true, luceCotta: true, riflForza: 1, dist: 700, fog: 0.55,
    nitido: true, ombraSole: true, solePassi: 12, soleTerm: true, soleForza: 1, ombreDin: false,
    erba: true, autoQ: true,
  },
  ultra: {
    scala: 1, riflessi: true, luceCotta: true, riflForza: 1.2, dist: 900, fog: 0.4,
    nitido: true, ombraSole: true, solePassi: 13, soleTerm: true, soleForza: 1, ombreDin: true,
    erba: true, autoQ: false,
  },
};

let _riflDim = '';
function applicaQualita() {
  const q = LIVELLI_Q[qLivello];
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
  // (QUI SI DOSAVANO «ombre dinamiche» e budget delle sagome: due manopole del
  // costo per-pixel delle scatole, che il campo del sole ha azzerato. Le sagome
  // dei mobili adesso costano UNA lettura di texture qualunque sia il loro
  // numero — un bosco fitto e una panchina sola pesano uguale — quindi la scala
  // di qualità non ha più niente da dosare qui.)
  ciclo.forzaOmbra = Math.max(0, Math.min(1.5, opzioni.soleForza ?? 1));
  // ⚠ E QUI SI DECIDE COSA VIENE COMPILATO, non solo cosa viene eseguito.
  // Spegnere l'ombra del sole o le lampade con un `if` non le spegne davvero su
  // GPU mobile: i registri restano riservati per il caso peggiore e lo shader
  // resta lento anche quando non fa niente. Con il profilo, a qualità bassa lo
  // shader del mondo è un ALTRO shader — più piccolo. Vedi impostaProfiloShader.
  // Le LAMPADE restano sempre (senza, la notte è nera). Quello che si compila
  // via è il loro CAMMINO D'OMBRA nella griglia dei voxel: è il termine più
  // caro del fragment, e la scala di qualità lo spegne già — solo che a
  // spegnerlo con un `if` non si guadagnava niente.
  impostaProfiloShader({
    sole: soleOn && passiCielo() > 0,
    ombreLuci: (qManuale ? true : LIVELLI_Q[qLivello].ombre) && opzioni.luceCotta !== false,
    // i pezzi cari del pelo dell'acqua: sui gradini bassi il fragment non li
    // CONTIENE proprio (uParti qui sotto resta come bisturi sul profilo pieno)
    acquaRicca: qManuale || q.acquaRicca !== false,
  });
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
  // ---- LA CREATIVA È UNA MODALITÀ, non una manopola dello scavo --------------
  //
  // ⚠ ERANO DUE METÀ CHE NON SI PARLAVANO, ed è il difetto che il committente ha
  // descritto con «la creativa è rotta: non ti fa piazzare gli item finiti».
  // Aveva ragione, e la ragione è peggiore di un baco: la creativa NON ESISTEVA.
  // C'era «✨ Creativa» fra le durezze — che spegneva solo la salute dei blocchi,
  // cioè li rompeva in un colpo — e c'erano le risorse infinite, un interruttore
  // sepolto nel menu debug che nessun giocatore trova. Chi sceglieva Creativa
  // otteneva metà creativa: rompi tutto ma finisci i mattoni, cioè il peggio di
  // tutt'e due i mondi.
  //
  // Adesso è UNA scelta sola. Creativa = non si conta niente e si rompe subito;
  // Normale/Dura = si conta, come è sempre stato. E siccome la scelta vive in
  // `opzioni`, sopravvive alla ricarica come tutto il resto.
  const creativa = (opzioni.durezza || 'normale') === 'creativa';
  scavo.impostaDurezza(opzioni.durezza || 'normale');
  if (inventario.infinito !== creativa) {
    inventario.impostaInfinito(creativa);
    rinfrescaTavolozza();          // i contatori diventano ∞ (o tornano numeri)
    if (zaino && zaino.aperto) datiZaino();
  }
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
  document.getElementById('opzPioggia').classList.toggle('attivo', pioggia.attiva);
  document.getElementById('opzAutoQ').classList.toggle('attivo', opzioni.autoQ);
  document.getElementById('opzNitido').classList.toggle('attivo', opzioni.nitido !== false);
  document.getElementById('opzSole').classList.toggle('attivo', opzioni.ombraSole !== false);
  document.getElementById('opzTerm').classList.toggle('attivo', opzioni.soleTerm !== false);
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
    hud.toast(opzioni.durezza === 'creativa'
      ? '✨ Creativa: materiali infiniti, blocchi a un tocco'
      : `${DUREZZE[opzioni.durezza].nome}: i materiali si contano`);
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
document.getElementById('opzDiagnostica')?.addEventListener('click', () => batteria.esegui());
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
document.getElementById('opzAutoQ').addEventListener('click', () => { opzioni.autoQ = !opzioni.autoQ; applicaOpzioni(); });
document.getElementById('opzNitido').addEventListener('click', () => { opzioni.nitido = opzioni.nitido === false; applicaOpzioni(); });
document.getElementById('opzSole').addEventListener('click', () => { opzioni.ombraSole = opzioni.ombraSole === false; applicaOpzioni(); });
document.getElementById('opzTerm').addEventListener('click', () => { opzioni.soleTerm = opzioni.soleTerm === false; applicaOpzioni(); });
// le ombre dinamiche pretendono la qualità in cima: accenderle con la qualità
// auto attiva vorrebbe dire vederle sparire al primo calo, che si legge come un
// bug. Quindi accenderle passa in manuale, esattamente come fa il tilt-shift.
document.getElementById('opzPioggia').addEventListener('click', () => { meteo.manuale(); pioggia.imposta(!pioggia.attiva); aggiornaUIOpzioni(); });
document.getElementById('opzMeteo').addEventListener('click', () => {
  opzioni.meteoAuto = !opzioni.meteoAuto;
  meteo.attivaAuto(opzioni.meteoAuto);
  applicaOpzioni();
});
// LA HEIGHTMAP DELLE OMBRE SI PUÒ FILTRARE? Solo se la scheda sa filtrare le
// texture float: senza OES_texture_float_linear il risultato è indefinito (nero,
// di solito), quindi lì si resta a Nearest e le ombre tornano a gradini — meglio
// dei denti di sega che di un mondo nero. La domanda si fa QUI e non dentro il
// renderer perché renderer.js non deve dipendere dai materiali (la suite lo
// carica da sola, senza DOM).
filtroCieloLineare(!!rig.renderer.extensions.get('OES_texture_float_linear'));

// ---- IL CAMPO DEL SOLE ------------------------------------------------------
// L'ombra del cielo, precalcolata per colonna (fx/campoSole.js): lo shader ne fa
// UNA lettura al posto del cammino di tredici più le scatole dei mobili. Su
// mobile la grana resta a un texel per blocco (metà memoria, metà spazzata);
// su desktop mezza cella, che tiene fine il bordo degli ottagoni delle chiome.
// Stessa politica di filtro della heightmap: bilineare solo se la scheda sa
// filtrare le texture float.
const campoSole = new CampoSole(256, -128, rig.mobile ? 1 : 2);
impostaCampoSole(campoSole.texture);
campoSole.filtroLineare(!!rig.renderer.extensions.get('OES_texture_float_linear'));

// La presenza verso il nostro server (spenta finché config.ANALITICA_URL è vuoto)
globalThis.VERSIONE_CODICE = VERSIONE_CODICE;
let _fpsUltimi = 0;
avviaAnalitica(() => _fpsUltimi);

// ---- LO SCHERMO NON SI SPEGNE MENTRE SI GIOCA -------------------------------
//
// Richiesta del committente per poter provare il gioco dal telefono senza che il
// display si spenga ogni mezzo minuto. È la Screen Wake Lock API: si chiede al
// sistema di tenere acceso lo schermo finché la pagina è VISIBILE, e il sistema
// la revoca da solo appena si cambia scheda o si blocca il telefono — quindi non
// c'è modo che resti appesa e svuoti la batteria a gioco chiuso.
//
// SI RICHIEDE ANCHE AL RIENTRO, e non è un dettaglio: una revoca automatica non
// si annulla da sola, quindi senza il gancio su `visibilitychange` basterebbe
// guardare una notifica per perdere il blocco per il resto della sessione.
// Dove l'API non c'è (Safari vecchi, desktop datati) non succede niente: è un
// `if`, non una dipendenza.
let _schermoSveglio = null;
async function tieniSchermoAcceso() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    _schermoSveglio = await navigator.wakeLock.request('screen');
    _schermoSveglio.addEventListener('release', () => { _schermoSveglio = null; });
  } catch { _schermoSveglio = null; }   // batteria scarica o permesso negato: pazienza
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !_schermoSveglio) tieniSchermoAcceso();
});
tieniSchermoAcceso();

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
// ---- OGNI QUANTI FRAME SI RIFA' IL RIFLESSO --------------------------------
// Misurato sul telefono del committente (Mali-G68, confronto ALTERNATO dentro
// lo stesso gruppo, quindi affidabile anche senza timer GPU): riflesso acceso
// 30 fps mediani contro 45 spento — un gradino intero di vsync. Non sono i
// pixel (la RT sta a 0.35², cioe' un ottavo): e' la PASSATA in piu', che su una
// scheda a tile vuol dire un altro giro di tile-buffer da riempire e svuotare.
// Quindi la leva non e' rimpicciolirla, e' rifarla piu' di rado — la texture
// resta valida e l'acqua ondeggia comunque, quindi il ritardo non si vede.
const RIFL_OGNI = 3;          // un aggiornamento ogni tre frame (era due)
let _riflGiro = 0, _riflUltimo = false;
let _riflAlterna = false;
let _schiumaDt = 0;              // tempo accumulato fra due render della schiuma
const RIFL_DIST2 = 70 * 70;
/** Cosa NON entra nel render specchiato: tutta l'acqua (feedback loop) più
 *  chunk e furni LONTANI — tra fresnel e wobble il riflesso mostra solo il
 *  vicino, inutile pagare l'intera scena una seconda volta. */
function nascostiPerRiflesso() {
  _acquaNascoste.length = 0;
  // ⚠ NON TOGLIERE LA VEGETAZIONE DAL RIFLESSO. L'ho provato per risparmiare i
  // vertici del prato (misurati −14.8% sulla passata) e il committente l'ha
  // visto subito: «il riflesso è rotto, ogni tanto riflette cose strane». Aveva
  // ragione e il mio ragionamento era sbagliato — avevo detto «una lamella nel
  // bersaglio del mirror sta sotto il pixel», ma questo vale per l'erba LONTANA:
  // la riva davanti alla camera si specchia grande, e lì il prato mancante si
  // legge come una sponda pelata che nel mondo vero è erbosa. Un riflesso che non
  // corrisponde al mondo è un difetto, non un'ottimizzazione.
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
// ---- DOVE FINISCONO I MILLISECONDI DI CPU -----------------------------------
//
// Con la misura sincronizzata del disegno (2-4 ms sul telefono del committente)
// si e' finalmente saputo che il collo NON e' la GPU: e' il JavaScript, otto o
// dodici millisecondi per fotogramma su un mondo di 649 blocchi. Sapere «e' la
// CPU» pero' non basta a sistemarla: serve sapere QUALE pezzo. Questo cronometro
// spezza il frame in voci e le pubblica nel report — costa un performance.now()
// per voce e solo mentre la batteria di misure gira, zero il resto del tempo.
const _sez = new Map();
const _round2 = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null);
function crono(nome, fn) {
  if (!batteria.inCorso) return fn();
  const t = performance.now();
  const v = fn();
  _sez.set(nome, (_sez.get(nome) || 0) + (performance.now() - t));
  return v;
}
let _sezFrame = 0;
function _sezLeggi() {
  const out = {};
  if (_sezFrame > 0) for (const [k, v] of _sez) out[k] = _round2(v / _sezFrame);
  return out;
}
function _sezAzzera() { _sez.clear(); _sezFrame = 0; }

// ---- LA BATTERIA DI MISURE, e tutto ciò di cui ha bisogno --------------------
//
// Nasce QUI, in fondo, e non dov'è usata: pesca da mezzo main (cadenza, la scala
// di qualità, l'erba, il meteo…) e quelle cose esistono solo da questa riga in
// giù. Il contratto sta scritto in engine/batteria.js — ed è il guadagno vero
// del trasloco: prima queste trenta dipendenze c'erano lo stesso, solo che non
// le vedeva nessuno.
const batteria = creaBatteria({
  perf, rig, ciclo, mondo, arredo, mesher, inventario, tavolozza,
  pioggia, erba, foglie, riflesso, opzioni, cadenza, meteo, hud,
  modalitaAR, modalitaXR,
  versioneCodice: VERSIONE_CODICE,
  buildPubblicata: () => _buildPubblicata,
  qManuale: () => qManuale,
  setQManuale: (v) => { qManuale = v; },
  qLivello: () => qLivello,
  riflessiUtente: () => riflessiUtente,
  partiQualita: () => _partiQ,
  controllaBuild: () => _controllaBuild(),
  ricostruisciLuci: () => ricostruisciLuciBlocchi(),
  ricostruisciSpeciali: () => ricostruisciBlocchiSpeciali(),
  applicaQualita: () => applicaQualita(),
  sezAzzera: () => _sezAzzera(),
  sezLeggi: () => _sezLeggi(),
});

function loop(adesso) {
  requestAnimationFrame(loop);
  batteria.contaRaf();               // gli inviti del browser, contati prima di tutto
  if (batteria.inCorso) _sezFrame++;
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
  batteria.passoFrame(_passoMs);

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
  crono('erba', () => erba.aggiorna(dt, mondo, controller.pos, ambienteAttuale(), rig.camera.position));
  crono('foglie', () => foglie.aggiorna(dt, mondo, controller.pos, ambienteAttuale()));
  calpestaFoglie();
  mesher.aggiornaMaterialeMondo();   // opaco quando il buco è chiuso: early-z

  // I CORPI CHE FANNO OMBRA: player + gatti in rete + palle, coi coni sotto i
  // piedi (uPg). I MOBILI non passano più di qui: le loro sagome stanno nel
  // CAMPO DEL SOLE, e qui sotto lo si tiene solo sveglio — che quasi sempre
  // vuol dire un confronto di stringhe e basta.
  _ombrePg.length = 0;
  _ombrePg.push({ x: controller.pos.x, y: controller.pos.y + 0.06, z: controller.pos.z, r: 0.42, h: 0.95 });
  for (const g of gattiRemoti.values()) _ombrePg.push({ x: g.pos.x, y: g.pos.y + 0.06, z: g.pos.z, r: 0.42, h: 0.95 });
  for (const e of ecs.ognuna('sfera', 'vista')) { const v = ecs.leggi(e, 'vista'), s = ecs.leggi(e, 'sfera'); _ombrePg.push({ x: v.mesh.position.x, y: v.mesh.position.y, z: v.mesh.position.z, r: s.raggio, y0: v.mesh.position.y - s.raggio, h: s.raggio * 2 }); }
  impostaOmbre(scatoleVertice(), _ombrePg);
  campoSole.aggiorna({
    ...cieloSorgente(),
    dir: uniformiCondivise().uSoleDir.value,
    scatole: scatoleCampo(),
    versioneScatole: arredo.versione,
    attivo: passiCielo() > 0,
  });
  aggiornaTempo(adesso / 1000);          // orologio degli shader (acqua)
  // LE NUVOLE DECIDONO DOVE PIOVE: si passano i loro dischi alla pioggia prima
  // di aggiornarla, se no il rovescio insegue di un fotogramma la nuvola che lo
  // fa — e a camera ferma quel ritardo si vede come uno scivolamento.
  pioggia.impostaNuvole(nuvole.dischi(_dischiNuvole), 1.8 + 2.6 * meteo.forza);
  // la distanza della camera allarga il campo di pioggia: a sessanta blocchi si
  // guarda un panorama, e la pioggia deve esserci su tutto il panorama
  // `pixelPerBlocco` = quanti blocchi copre UN pixel a distanza 1 dalla camera:
  // serve alla pioggia per non disegnare gocce più sottili di un pixel (che il
  // rasterizzatore cancellerebbe) senza per questo ingrassarle.
  const _fPioggia = pioggia.aggiorna(dt, adesso / 1000, rig.bersaglio,
    rig.camera.position.distanceTo(rig.bersaglio),
    2 * Math.tan(rig.camera.fov * Math.PI / 360) / Math.max(1, rig.renderer.domElement.height));
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
  crono('particelle', () => { particelle.aggiorna(dt); aggiornaParticellariAcqua(dt); });
  crono('nuvole', () => nuvole.aggiorna(dt));
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
  crono('sim', () => orologioSim.passi(dt, (tick) => {
    servizi.tick = tick;
    agenda.scarica(tick, (cosa) => {
      if (ecs.ha(cosa, 'macchina')) guidaMacchina(cosa, servizi);
      else pensaCreatura(cosa, servizi);
    });
    sistemiSim.esegui(servizi);
  }));
  // resa INTERPOLATA: sposta i mesh fra posizionePrec e posizione con alpha (la
  // frazione di tick non ancora consumata), disaccoppiando la fluidità dagli Hz.
  _ctxResa.alpha = orologioSim.alpha();
  _ctxResa.dtFrame = dt;
  _ctxResa.notte = ciclo.eNotte;
  crono('resa', () => sistemiResa.esegui(_ctxResa));

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

  // ---- PRESENZA P2P: SI PARLA SOLO QUANDO C'È DA DIRE QUALCOSA --------------
  //
  // ⚠ PRIMA SI MANDAVA LA POSA DIECI VOLTE AL SECONDO SEMPRE, anche a gatto
  // fermo. Il committente ha descritto lo scenario vero di questo gioco: «i
  // player potrebbero stare ore afk, a pescare o fermi con la scheda aperta».
  // Dieci pacchetti al secondo per ore sono decine di migliaia di messaggi per
  // dire «sono ancora qui, nello stesso identico posto» — e se la connessione
  // passa dal TURN quella è banda che si paga davvero, a consumo, per niente.
  //
  // Ora vale la regola dei protocolli di rete seri: si trasmette il CAMBIAMENTO.
  // Se la posa è identica alla precedente (entro mezzo centimetro, che a schermo
  // è meno di un pixel) non parte niente, e resta un battito ogni due secondi
  // perché l'altro capo sa distinguere «fermo» da «sparito» — il potatore dei
  // gatti stantii scatta a sei secondi.
  // A gatto fermo si passa da 600 messaggi al minuto a 30: il 95% in meno.
  if (lobby.connessa) {
    posaTimer += dt * 1000;
    if (posaTimer >= NET.posaMs) {
      posaTimer = 0;
      const att = (_inMano && _inMano.genere === 'attrezzo') ? _inMano.id : null;
      const fermo = Math.abs(controller.vel.x) < 0.02 && Math.abs(controller.vel.z) < 0.02;
      const mosso = !_ultimaPosa
        || Math.abs(controller.pos.x - _ultimaPosa.x) > 0.005
        || Math.abs(controller.pos.y - _ultimaPosa.y) > 0.005
        || Math.abs(controller.pos.z - _ultimaPosa.z) > 0.005
        || _ultimaPosa.fermo !== fermo || _ultimaPosa.att !== att
        || _ultimaPosa.uso !== _usoContatore || _ultimaPosa.aTerra !== controller.aTerra;
      const battito = performance.now() - _ultimoInvioPosa > 2000;
      if (mosso || battito) {
        _ultimaPosa = { x: controller.pos.x, y: controller.pos.y, z: controller.pos.z,
          fermo, att, uso: _usoContatore, aTerra: controller.aTerra };
        _ultimoInvioPosa = performance.now();
        const m = { t: 'posa', p: [controller.pos.x, controller.pos.y, controller.pos.z], vx: controller.vel.x, vz: controller.vel.z, aTerra: controller.aTerra, att, uso: _usoContatore };
        if (lobby.ruolo === 'host') { m.tempo = ciclo.t; m.id = 'h'; }
        if (!_sonoSpia) lobby.invia(m);   // in incognito non si manda dove si sta

      }
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

  crono('mesher', () => mesher.aggiorna(mondo, rig.bersaglio));   // i chunk sporchi, i vicini prima
  menuDebug.aggiorna(dt);
  // coi comandi touch la mira è il mirino centrale (l'anteprima segue lì)
  if (opzioni.comandiTouch) { mira.x = innerWidth / 2; mira.y = innerHeight / 2; }
  // ⚠ COL TOCCO L'ANTEPRIMA È GIÀ STATA RIFATTA in cima al frame (segue il gatto):
  // rifarla qui voleva dire due volte per frame — due `puoiPiazzare`, due giri
  // sulle celle del mobile, due scritture di materiale — per disegnare lo stesso
  // identico ghost. Col mouse invece l'unica chiamata è questa.
  if (costruisci && !opzioni.comandiTouch) aggiornaGhost();

  // COSA HA IN MANO: attrezzo, mini-blocco coi suoi colori, o mobile —
  // ma solo in Costruisci: esplorando il gatto ha le zampe libere
  mano.mostra(voceInMano());
  mano.aggiorna(dt);
  for (const g of gattiRemoti.values()) if (g.mano) g.mano.aggiorna(dt);

  aggiornaLuci(controller.pos);
  rig.segui(_seguiV.set(controller.pos.x, controller.pos.y + 1, controller.pos.z), dt);
  rig.aggiorna();

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
  _riflGiro = (_riflGiro + 1) % RIFL_OGNI;

  _schiumaDt += dt;
  if (pianoAcqua === null || !_schiumaQ) { schiumaTop.spegni(); _schiumaDt = 0; }
  else if (_riflAlterna) { perf.regione('schiuma', () => schiumaTop.aggiorna(rig.scena, rig.bersaglio, pianoAcqua, _schiumaDt)); _schiumaDt = 0; }
  impostaSchiumaTop(schiumaTop.rt.texture, schiumaTop.info);

  // riflesso planare: a FRAME ALTERNI (la RT resta valida, il wobble copre il
  // mezzo frame di ritardo) e col mirror alleggerito — era un render completo
  // della scena OGNI frame, il primo sospettato dei cali muovendo la camera
  if (!riflesso.attivo) {
    _riflUltimo = false;
  } else if (_riflGiro === 0 || !_riflUltimo) {
    _riflUltimo = pianoAcqua !== null && crono('riflesso', () => perf.regione('riflesso', () => riflesso.aggiorna(rig.scena, rig.camera, pianoAcqua, nascostiPerRiflesso())));
  }
  impostaRiflesso(_riflUltimo, riflesso.rt.texture, riflesso.matriceTexture);

  // render principale (composer col tilt-shift, o render diretto): la passata
  // più cara, avvolta in un query dedicato. In AR/XR è quella del rispettivo
  // renderer — il contesto è già stato legato sopra.
  if (modalitaXR.attiva) { modalitaXR.aggiorna(frameXR); perf.regione('principale', () => modalitaXR.render()); }
  else if (modalitaAR.attiva) perf.regione('principale', () => modalitaAR.render());
  else crono('disegno', () => perf.regione('principale', () => rig.render()));
  perf.raccogli();   // i timer sono asincroni: raccoglie i risultati pronti (di qualche frame fa)

  hud.orologio(ciclo.oraTesto(), ciclo.faseEmoji(), ciclo.t);
  contFrame++; contTempo += dt;
  if (contTempo >= 0.5) {
    const fps = Math.round(contFrame / contTempo);
    hud.fps(fps);
    _fpsUltimi = fps;          // per il ping di presenza, che gira fuori dal frame
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
  batteria.contaFrame(_cpuMs);

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
