// PARTE PURA della diagnostica completa: prende le misure GREZZE già raccolte
// dal dispositivo (info GL, impostazioni, scena, baseline, sweep a feature,
// memoria) e le compone in UN oggetto pronto da scaricare, con in testa un
// RIASSUNTO leggibile — le 2-4 righe di diagnosi ovvia.
//
// PERCHÉ È SEPARATA. Il committente gioca su hardware debole e i cali fps lo
// rendono ingiocabile; non posso misurarlo da remoto, quindi il file di
// diagnostica È il modo di sapere. La raccolta vera tocca WebGL/DOM/rAF e vive
// in main.js; QUI c'è solo l'assemblaggio e il calcolo del riassunto, che è
// aritmetica pura — così si prova per intero in Node (test/diagnostica.test.mjs)
// senza un contesto grafico.

import { riassuntoBanco } from './banco.js?v=ms9b0zbn';

// 2 = c'è il banco standard: le scene se le costruisce la diagnostica, quindi i
// numeri sono confrontabili fra dispositivi e fra versioni (prima no).
export const VERSIONE_DIAGNOSTICA = 2;

/** Nome file col timbro dell'ora LOCALE: lantern-diagnostica-AAAAMMGG-hhmm.json.
 *  Accetta un Date o un numero di ms (Date.now()); il default è "adesso". */
export function nomeFileDiagnostica(quando = Date.now()) {
  const d = quando instanceof Date ? quando : new Date(quando);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `lantern-diagnostica-${stamp}.json`;
}

// --- letture difensive di una "misura" ---------------------------------------
// Una misura è { fps, cpuMediana, cpuP95, cpuMedia, gpu: { disponibile,
// totaleMedia, totaleP95, passate: { principale, riflesso, schiuma } } }.
// Ogni scenario dello sweep può mancare (misura saltata, o GPU senza timer):
// il riassunto non deve MAI lanciare, solo omettere la riga che non può dire.

// fps MEDIANO se c'è: una singola pausa da 50 ms sposta la media e non sposta la
// mediana, e sono proprio quelle pause che facevano leggere «ombre spente» come
// più lenta di «ombre accese». I file vecchi hanno solo `fps`: si ricade lì.
function fpsDi(m) {
  if (m && typeof m.fpsMediano === 'number' && isFinite(m.fpsMediano) && m.fpsMediano > 0) return m.fpsMediano;
  return m && typeof m.fps === 'number' && isFinite(m.fps) ? m.fps : null;
}

function gpuDisponibile(m) { return !!(m && m.gpu && m.gpu.disponibile); }

function gpuTotale(m) { return gpuDisponibile(m) && typeof m.gpu.totaleMedia === 'number' ? m.gpu.totaleMedia : null; }

function gpuPassata(m, nome) {
  if (!gpuDisponibile(m) || !m.gpu.passate) return null;
  const c = m.gpu.passate[nome];
  return c && typeof c.media === 'number' && c.n > 0 ? c.media : null;
}

const arr = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x * 10) / 10 : null);

/**
 * Le 2-4 righe di diagnosi ovvia, in cima al file: quello che si capisce a colpo
 * d'occhio senza leggere i numeri. Difensiva: emette una riga solo se ha i dati
 * per dirla, così su un dispositivo senza timer GPU (o con qualche scenario
 * saltato) resta comunque sensata.
 */
export function riassuntoDiagnostica(dati) {
  const righe = [];
  const gl = (dati && dati.gl) || {};
  const sw = (dati && dati.sweep) || {};
  const base = (dati && dati.baseline) || sw.baseline || null;

  // 1) chi sta disegnando, e se è la GPU vera o software (il sospetto numero uno)
  const gpuTxt = gl.renderer || gl.gpu || 'sconosciuta';
  const soft = gl.software === true ? 'SÌ ⚠ (niente accelerazione hardware!)' : (gl.software === false ? 'no' : '?');
  const timer = gl.timerQuery === true ? 'sì' : (gl.timerQuery === false ? 'no' : '?');
  righe.push(`GPU: ${gpuTxt} — software: ${soft} · WebGL2: ${gl.webgl2 ? 'sì' : 'no'} · timer GPU: ${timer}`);

  // QUALE build ha misurato: senza, una pagina rimasta aperta da prima della
  // pubblicazione fa sembrare che una correzione non funzioni
  if (dati && dati.build) {
    righe.push(dati.build === 'sviluppo'
      ? 'Build: in sviluppo (server locale, nessun timbro).'
      : `Build: ${dati.build} — se non è l'ultima pubblicata, RICARICA la pagina e rifai la misura.`);
  }

  // 1b) IL LIMITE FPS FALSA TUTTO, e va detto SUBITO. Con un tetto attivo ogni
  //     scenario legge lo stesso numero — è successo: una batteria intera con
  //     `fpsMax: 30` ha misurato 30 fps su TUTTE le voci, banco compreso, e non
  //     valeva niente.
  const fpsMax = dati && dati.impostazioni && dati.impostazioni.opzioni && dati.impostazioni.opzioni.fpsMax;
  if (fpsMax > 0) {
    righe.push(`⚠ LIMITE FPS ATTIVO (${fpsMax}): con un tetto ai fotogrammi ogni scenario legge lo stesso numero e la misura non vale. Toglilo (Grafica → Limite FPS → nessuno) e rifai il giro.`);
  }

  // 2) baseline: dove siamo adesso. IN TESTA VA LA MEDIA, non la mediana — è
  // quella che si sente giocando. Sul Chromebook la mediana diceva 60 fps mentre
  // i frame veri erano 34 al secondo: metà a 16,7 ms e metà sopra i 60, e il
  // riassunto raccontava una cosa che l'utente non stava vedendo.
  if (base && (base.fps != null || fpsDi(base) !== null)) {
    const medi = typeof base.fps === 'number' && base.fps > 0 ? base.fps : fpsDi(base);
    const mediana = fpsDi(base);
    const g = gpuTotale(base);
    const dueNumeri = mediana != null && medi != null && Math.abs(mediana - medi) > Math.max(3, medi * 0.1);
    righe.push(`Alle impostazioni attuali: ${arr(medi)} fps${dueNumeri ? ` (mediana ${arr(mediana)})` : ''}`
      + `${base.cpuMediana != null ? ` · ${arr(base.cpuMediana)} ms CPU` : ''}${g != null ? ` · ${arr(g)} ms GPU` : ''}.`);
  }

  // 2a) FRAME IRREGOLARI. Un gioco che alterna 16 e 66 ms si sente peggio di uno
  // fermo a 35 fps costanti, e nessuna media lo dice. Il p95 contro la mediana
  // lo dice: se il quinto percentile peggiore è il doppio della mediana, i frame
  // sono a due velocità (di solito perché due passate pesanti cadono nello
  // stesso frame invece di alternarsi).
  if (base && base.frameMs > 0 && base.frameMsP95 >= base.frameMs * 2) {
    righe.push(`⚠ Frame IRREGOLARI: metà dei frame in ${arr(base.frameMs)} ms, ma il 5% peggiore sopra ${arr(base.frameMsP95)} ms — a schermo si vede come scatto, non come lentezza.`);
  }

  // 2b) DERIVA: la stessa identica configurazione misurata in apertura e in
  // chiusura. Se i due numeri non coincidono il dispositivo è cambiato durante
  // la batteria (si scalda, entra in risparmio energetico) e i confronti FRA
  // gruppi diversi non valgono più: va detto in testa, non lasciato dedurre.
  // SI GUARDANO I ms GPU SE CI SONO, non gli fps: su uno schermo agganciato al
  // vsync gli fps saltano a gradini (30 → 60) e gridavano «deriva +100%» mentre
  // la GPU faceva 31,5 e 31,1 ms, cioè non era cambiato niente.
  const fine = sw.baseline_fine;
  if (base && fine) {
    const gA = gpuTotale(base), gB = gpuTotale(fine);
    const usaGpu = gA != null && gB != null && gA > 0;
    const a = usaGpu ? gA : fpsDi(base);
    const b = usaGpu ? gB : fpsDi(fine);
    if (a != null && b != null && a > 0) {
      // in ms un aumento è un PEGGIORAMENTO: il segno si gira per leggerlo sempre
      // come «il dispositivo è andato meglio o peggio»
      const delta = Math.round((usaGpu ? (a - b) / a : (b - a) / a) * 100);
      const unita = usaGpu ? 'ms GPU' : 'fps';
      if (Math.abs(delta) >= 12) {
        righe.push(`⚠ Deriva ${delta > 0 ? '+' : ''}${delta}%: la stessa configurazione dava ${arr(a)} ${unita} all'inizio e ${arr(b)} alla fine — il dispositivo è cambiato durante la misura. Fidati SOLO dei confronti dentro lo stesso gruppo.`);
      } else {
        righe.push(`Deriva ${delta > 0 ? '+' : ''}${delta}% (su ${unita}): il dispositivo è rimasto stabile per tutta la misura.`);
      }
    }
  }

  // 3) la scala di rendering: la leva fill-rate più importante su macchine deboli
  const alto = sw['scala_1.00'] || sw['scala_1.0'] || base;
  const basso = sw['scala_0.50'] || sw['scala_0.66'] || sw['scala_0.85'];
  const bassoNome = sw['scala_0.50'] ? '0.50' : (sw['scala_0.66'] ? '0.66' : '0.85');
  if (alto && basso && fpsDi(alto) !== null && fpsDi(basso) !== null && alto !== basso) {
    const guad = fpsDi(alto) > 0 ? Math.round((fpsDi(basso) - fpsDi(alto)) / fpsDi(alto) * 100) : null;
    righe.push(`Scala render: a ${bassoNome} gli fps vanno da ${arr(fpsDi(alto))} a ${arr(fpsDi(basso))}${guad != null ? ` (${guad >= 0 ? '+' : ''}${guad}%)` : ''}.`);
  }

  // 4) quanto costa il riflesso: GPU se c'è, altrimenti la differenza di fps
  const rOn = sw.riflesso_on, rOff = sw.riflesso_off;
  const rPass = gpuPassata(rOn, 'riflesso');
  if (rPass != null && rPass > 0) {
    righe.push(`Il riflesso dell'acqua costa ~${arr(rPass)} ms GPU per esecuzione.`);
  } else if (rOn && rOff && fpsDi(rOn) !== null && fpsDi(rOff) !== null) {
    righe.push(`Riflesso: ${arr(fpsDi(rOn))} fps acceso contro ${arr(fpsDi(rOff))} spento.`);
  }

  // 5) il caso peggiore del committente: notte + ombre voxel (lampade + marching)
  const notte = sw.notte_ombre, giorno = sw.giorno;
  if (notte && giorno && fpsDi(notte) !== null && fpsDi(giorno) !== null) {
    righe.push(`Caso peggiore (notte con ombre): ${arr(fpsDi(notte))} fps, contro ${arr(fpsDi(giorno))} di giorno.`);
  }

  // 6) il tilt-shift: sul telefono del committente è la voce singola più cara
  const tOn = sw.tilt_on, tOff = sw.tilt_off;
  if (tOn && tOff && fpsDi(tOn) !== null && fpsDi(tOff) !== null && fpsDi(tOn) > 0) {
    const guad = Math.round((fpsDi(tOff) - fpsDi(tOn)) / fpsDi(tOn) * 100);
    righe.push(`Tilt-shift: ${arr(fpsDi(tOn))} fps acceso contro ${arr(fpsDi(tOff))} spento (${guad >= 0 ? '+' : ''}${guad}% a spegnerlo).`);
  }

  // 7) LA SCOMPOSIZIONE DEL COSTO PER PIXEL — la riga che decide dove si lavora.
  //    `nudo` è il mondo disegnato col solo colore della palette: quello che
  //    resta lì sotto non è ottimizzabile riscrivendo la lanterna, è il prezzo di
  //    riempire quei pixel. La differenza fra `tutto` e `nudo` è invece nostra, e
  //    i due termini in mezzo dicono di chi è.
  const sTutto = sw.shader_tutto, sNudo = sw.shader_nudo;
  const gT = gpuPassata(sTutto, 'principale'), gN = gpuPassata(sNudo, 'principale');
  if (gT != null && gN != null && gT > 0) {
    const nostro = gT - gN;
    const quota = Math.round(nostro / gT * 100);
    righe.push(`Costo per pixel: shader completo ${arr(gT)} ms · NUDO ${arr(gN)} ms ⇒ la lanterna pesa ${arr(nostro)} ms (${quota}% del pass principale), il resto è il prezzo di riempire i pixel.`);
    const voci = [
      ['acqua (tutto il pelo)', gpuPassata(sw.shader_senzaAcqua, 'principale')],
      ['ombre nuvole', gpuPassata(sw.shader_senzaNuvole, 'principale')],
      ['ombre personaggi', gpuPassata(sw.shader_senzaPg, 'principale')],
    ].filter(([, v]) => v != null).map(([n, v]) => `${n} ${arr(gT - v)} ms`);
    if (voci.length) righe.push(`Dentro il pass: ${voci.join(' · ')}.`);
  }

  // 7b) e DENTRO l'acqua, quale pezzo: è il gruppo che dice dove mettere le mani
  const aT = gpuPassata(sw.acqua_tutta, 'principale');
  if (aT != null && aT > 0) {
    const pezzi = [
      ['riflesso', gpuPassata(sw.acqua_senzaRiflesso, 'principale')],
      ['schiuma a silhouette', gpuPassata(sw.acqua_senzaSilhouette, 'principale')],
      ['schiuma di riva', gpuPassata(sw.acqua_senzaRiva, 'principale')],
      ['anelli d\'impatto', gpuPassata(sw.acqua_senzaImpatti, 'principale')],
      ['correnti e cascate', gpuPassata(sw.acqua_senzaCorrenti, 'principale')],
    ].filter(([, v]) => v != null)
      .map(([n, v]) => ({ n, ms: aT - v }))
      .sort((a, b) => b.ms - a.ms)
      .map((p) => `${p.n} ${arr(p.ms)} ms`);
    if (pezzi.length) righe.push(`Dentro l'acqua (dal più caro): ${pezzi.join(' · ')}.`);
  } else if (sTutto && sNudo && fpsDi(sTutto) !== null && fpsDi(sNudo) !== null) {
    righe.push(`Costo per pixel: ${arr(fpsDi(sTutto))} fps con lo shader completo contro ${arr(fpsDi(sNudo))} col mondo NUDO.`);
  }

  // 8) IL BANCO STANDARD, in fondo: è la parte confrontabile fra dispositivi,
  //    fra versioni e fra giorni diversi, perché le scene le costruisce il gioco
  //    invece di misurare quello che capita davanti alla camera.
  righe.push(...riassuntoBanco(dati && dati.banco));

  return righe;
}

/**
 * Compone il report COMPLETO da scaricare. Riceve le sezioni già raccolte dal
 * dispositivo (parte impura, in main.js) e ci mette in testa versione, timbro
 * temporale, nome file e riassunto. Non misura e non tocca nulla: pura.
 *
 * @param grezzi { dispositivo, gl, impostazioni, scena, baseline, sweep, memoria, note }
 * @param opts   { versione, quando }  quando = ms/Date del momento di generazione
 */
export function componiDiagnostica(grezzi = {}, opts = {}) {
  const versione = opts.versione != null ? opts.versione : VERSIONE_DIAGNOSTICA;
  const quando = opts.quando != null ? opts.quando : Date.now();
  const generato = (quando instanceof Date ? quando : new Date(quando)).toISOString();

  const dati = {
    build: grezzi.build || null,
    banco: grezzi.banco || null,
    dispositivo: grezzi.dispositivo || null,
    gl: grezzi.gl || null,
    impostazioni: grezzi.impostazioni || null,
    scena: grezzi.scena || null,
    baseline: grezzi.baseline || null,
    sweep: grezzi.sweep || null,
    memoria: grezzi.memoria || null,
    note: grezzi.note || null,
  };
  const riassunto = riassuntoDiagnostica(dati);

  // il riassunto va IN TESTA: è la prima cosa che serve leggendo il file
  return {
    versione,
    generato,
    nomeFile: nomeFileDiagnostica(quando),
    riassunto,
    ...dati,
  };
}
