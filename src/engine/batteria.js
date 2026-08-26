// LA BATTERIA DI MISURE — il tasto «Diagnostica» del menu, per intero.
//
// ⚠ PERCHE' STA IN UN FILE SUO. Era in main.js, ed erano SETTECENTO RIGHE su
// cinquemila: un settimo della regia del gioco occupato da uno strumento che si
// usa tre volte al mese. Chi apriva main per capire come si posa un blocco si
// trovava davanti mezz'ora di benchmark, e la regola della casa («main orchestra,
// i moduli fanno») era violata dal pezzo piu' grosso del file.
//
// COSA SI VEDE ADESSO CHE PRIMA NON SI VEDEVA: l'elenco qui sotto. Stando dentro
// main, questo codice pescava a mano libera da trenta variabili globali senza che
// niente lo dicesse; adesso quelle trenta cose sono scritte una per una nel
// contratto, e chi ne aggiunge una trentunesima se ne accorge mentre lo fa.
//
// COSA NON E' CAMBIATO: il corpo delle misure, riga per riga. Questo e' un
// TRASLOCO, non una riscrittura — se i numeri cambiassero, il colpevole sarebbe
// il trasloco, e non si potrebbe piu' confrontare un referto di oggi con uno di
// luglio. La parte PURA (assemblaggio + riassunto) resta in engine/diagnostica.js.
//
// IL CONTRATTO (ctx):
//   oggetti vivi   perf, rig, ciclo, mondo, arredo, mesher, inventario, tavolozza,
//                  pioggia, erba, foglie, riflesso, opzioni, cadenza, meteo, hud,
//                  modalitaAR, modalitaXR
//   letture        versioneCodice, buildPubblicata(), qManuale(), qLivello(),
//                  riflessiUtente(), partiQualita()
//   scritture      setQManuale(v)
//   lavori altrui  controllaBuild(), ricostruisciLuci(), ricostruisciSpeciali(),
//                  applicaQualita(), sezAzzera(), sezLeggi()
//
// IL LOOP DEVE ALIMENTARLA: contaRaf() in cima a ogni giro di rAF, contaFrame(ms)
// e passoFrame(ms) a fine frame. Senza, la batteria misura zero fotogrammi e non
// se ne accorge nessuno.

import { Campioni } from './gpuTimer.js?v=mtafl3ai';
import { componiDiagnostica } from './diagnostica.js?v=mtafl3ai';
import { SCENE } from './banco.js?v=mtafl3ai';
import { serializza, applica } from '../save.js?v=mtafl3ai';
import { uniformiCondivise, impostaPioggia, impostaOcclusione, impostaParti, PARTI, statLuci, memoriaVoxel, maxOmbre, passiCielo, aggiornaLuci } from '../fx/materials.js?v=mtafl3ai';

const round2 = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null);

export function creaBatteria(ctx) {
  const { perf, rig, ciclo, mondo, arredo, mesher, inventario, tavolozza,
    pioggia, erba, foglie, riflesso, opzioni, cadenza, meteo, hud,
    modalitaAR, modalitaXR } = ctx;

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




let _diagCpu = null;       // (msCpu)=>void: raccoglitore per-frame, attivo solo in batteria
let _diagPassi = null;     // (msIntervallo)=>void: durata VERA di ogni frame
let _diagFrames = 0;       // contatore di frame VERI (rispetta la cadenza), letto a delta
let _diagInCorso = false;  // un giro alla volta
// QUANTI INVITI A DISEGNARE CI ARRIVANO. Si conta ogni giro di rAF, PRIMA della
// cadenza e prima di qualunque lavoro: è il numero di occasioni che il browser
// ci concede in un secondo. Confrontato con gli fps veri dice da che parte
// guardare, e lo dice senza disturbare la misura — è un ++ in cima al loop.
//   · inviti ≈ fps      → disegniamo tutto quello che ci danno: il tetto è
//                         FUORI (schermo, compositor, risparmio energetico)
//   · inviti ≫ fps      → gli inviti li stiamo buttando noi, perché il frame
//                         non sta dentro il tempo: il tetto è NOSTRO
// (Avevo provato la strada opposta — un loop a vuoto che non disegna — e mente:
// senza niente da comporre il browser rallenta il rAF, e su questo PC leggeva 71
// fps mentre il gioco ne faceva 144. Uno strumento che cambia quel che misura.)
let _diagRaf = 0;
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
  ctx.sezAzzera();
  const cpu = new Campioni(600);
  const passi = new Campioni(600);
  const disegno = new Campioni(600);
  _diagCpu = (ms) => cpu.push(ms);
  _diagPassi = (ms) => { if (ms > 0 && ms < 2000) passi.push(ms); };
  const raf0 = _diagRaf;
  const w = await _diagAttendi(finestra, DIAG_FRAME_MIN);
  const rafFps = w.ms > 0 ? Math.round((_diagRaf - raf0) / (w.ms / 1000)) : 0;
  _diagCpu = null;
  _diagPassi = null;
  // ---- LA MISURA SINCRONIZZATA STA IN UNA FINESTRA SUA -----------------------
  //
  // ⚠ E QUESTO E' UN ERRORE MIO DELL'ULTIMO GIRO: il gl.finish() dopo ogni
  // disegno era acceso per TUTTA la misura, quindi entrava dentro `cpuMediana` e
  // dentro la voce `disegno` di cpuSezioni. Uno strumento che serializza la
  // pipeline mentre misura la CPU non sta misurando la CPU: sta misurando anche
  // l'attesa della GPU, e nel report quei millisecondi sembravano JavaScript.
  // Adesso la sincronia vive in una finestra CORTA e separata: gli fps, la CPU e
  // le sezioni vengono dalla finestra normale, il costo del disegno da questa.
  if (!perf.disponibile) {
    rig.misuraSync = true;
    const racc = setInterval(() => { if (rig.disegnoMs > 0) disegno.push(rig.disegnoMs); }, 8);
    await _diagAttendi(260, 8);
    clearInterval(racc);
    rig.misuraSync = false;
  }
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
    // il disegno VERO del frame di gioco, con gl.finish(): c'è solo dove i timer
    // GPU mancano, ed è lì l'unico numero di cui fidarsi
    disegnoMs: disegno.n ? round2(disegno.mediana()) : null,
    disegnoP95: disegno.n ? round2(disegno.p95()) : null,
    disegnoCampioni: disegno.n,
    // DOVE VANNO I MILLISECONDI DI CPU, voce per voce (media per frame)
    cpuSezioni: ctx.sezLeggi(),
    fps: w.ms > 0 ? Math.round(w.frame / (w.ms / 1000)) : 0,
    // GLI INVITI DEL BROWSER nello stesso identico intervallo: se sono uguali
    // agli fps il tetto è fuori di noi, se sono molti di più lo stiamo mettendo
    // noi buttando i frame che non riusciamo a chiudere in tempo
    rafFps,
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
      ctx.ricostruisciLuci();
      erba.risemina();   // mondo nuovo: il campo seminato non c'entra più niente
      foglie.risemina();
      ctx.ricostruisciSpeciali();
      // condizioni: ora, pioggia, e gli anelli d'impatto messi A MANO (la sim
      // dell'acqua non li produrrebbe in una vasca ferma, e sono il caso che ha
      // smascherato il costo vero)
      ciclo.auto = false; ciclo.t = s.condizioni.ora; ciclo.aggiorna(0);
      arredo.aggiornaNotte(ciclo.eNotte);
      pioggia.imposta(s.condizioni.pioggia > 0);
      impostaPioggia(s.condizioni.pioggia || 0);
      const nImp = s.condizioni.impatti || 0;
      // array PIATTO (vedi arrV4 in materials.js): quattro float per impatto
      for (let k = 0; k < nImp && k * 4 < uni.uImpatti.value.length; k++) {
        const a = (k / Math.max(1, nImp)) * Math.PI * 2;
        const o = k * 4;
        uni.uImpatti.value[o] = Math.cos(a) * 9;
        uni.uImpatti.value[o + 1] = s.camera.bersaglio[1] + 0.44;
        uni.uImpatti.value[o + 2] = Math.sin(a) * 9;
        uni.uImpatti.value[o + 3] = 1.4 + (k % 3) * 0.5;
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
    ctx.ricostruisciLuci();
    ctx.ricostruisciSpeciali();
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
function _diagApplica({ scala, rifl, occ, parti }) {
  if (scala !== undefined) rig.setScalaRender(scala);
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
    qualitaAuto: vere ? !!vere.autoQ : !ctx.qManuale(), qLivello: ctx.qLivello(), riflessiUtente: ctx.riflessiUtente(),
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
async function esegui() {
  if (_diagInCorso) return;
  // prima di misurare: si sta eseguendo davvero l'ultima build pubblicata?
  // Se no, questa funzione non torna — la pagina si ricarica e si ricomincia.
  await ctx.controllaBuild();
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
  opzioni.autoQ = false; ctx.setQManuale(true);
  meteo.attivaAuto(false);
  const uni = uniformiCondivise();
  // leve di rendering CORRENTI, per tenerle ferme mentre se ne muove UNA alla volta
  const base = {
    scala: rig.scalaInterna,
    rifl: !!riflesso.attivo,
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
        ['preset_alta', () => { ciclo.t = snap.cicloT; ciclo.aggiorna(0); _diagApplica({ scala: 1, rifl: true, occ: true }); }, 'preset «alta»'],
        ['preset_bassa', () => { ciclo.t = snap.cicloT; ciclo.aggiorna(0); _diagApplica({ scala: 0.66, rifl: false, occ: false }); }, 'preset «bassa»'],
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
      { build: ctx.versioneCodice, buildPubblicata: ctx.buildPubblicata(),
        dispositivo, gl, impostazioni: _diagImpostazioni(snap), scena, baseline, sweep, banco, memoria, note },
      { quando: t0 },
    );
    const testo = JSON.stringify(report, null, 2);
    _diagConsegna(report.nomeFile, testo);
    prog.fatto();
    hud.toast('📊 Diagnostica pronta — file scaricato', 3200);
  } catch (e) {
    console.error('[diagnostica] errore', e);
    prog.errore(e);
  } finally {
    // RIPRISTINO: ora, tempo e lo stato di rendering derivato dalle opzioni
    // (mai toccate) via applicaQualita — nessun remesh, diorama intatto.
    _diagCpu = null;
    _diagPassi = null;
    impostaParti(ctx.partiQualita());                  // il bisturi non deve MAI restare dentro: si torna a ciò che concede la qualità
    // le impostazioni del giocatore tornano ESATTAMENTE come le aveva lasciate
    opzioni.fpsMax = snap.fpsMax; cadenza.fpsMax = snap.fpsMax;
    opzioni.autoQ = snap.autoQ; ctx.setQManuale(!snap.autoQ);
    meteo.attivaAuto(snap.meteoAuto !== false);
    ciclo.t = snap.cicloT; ciclo.auto = snap.cicloAuto; ciclo.aggiorna(0);
    ctx.applicaQualita();
    perf.imposta(snap.perfAttivo);
    if (mondo.contaBlocchi !== snap.contaBlocchi) console.warn('[diagnostica] contaBlocchi cambiato!', snap.contaBlocchi, '→', mondo.contaBlocchi);
    _diagInCorso = false;
  }
}
  return {
    esegui,
    /** dal loop, in CIMA a ogni rAF: gli inviti che il browser ci concede */
    contaRaf() { _diagRaf++; },
    /** dal loop, a fine frame VERO (rispetta la cadenza) */
    contaFrame(msCpu) { _diagFrames++; if (_diagCpu) _diagCpu(msCpu); },
    /** dal loop: l'intervallo VERO fra due frame */
    passoFrame(ms) { if (_diagPassi) _diagPassi(ms); },
    get inCorso() { return _diagInCorso; },
  };
}
