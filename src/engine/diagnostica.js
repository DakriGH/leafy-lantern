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

export const VERSIONE_DIAGNOSTICA = 1;

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

  // 2) baseline: dove siamo adesso
  if (base && fpsDi(base) !== null) {
    const g = gpuTotale(base);
    righe.push(`Alle impostazioni attuali: ${arr(fpsDi(base))} fps${base.frameMs != null ? ` (${arr(base.frameMs)} ms a frame)` : ''}${base.cpuMediana != null ? ` · ${arr(base.cpuMediana)} ms CPU (mediana)` : ''}${g != null ? ` · ${arr(g)} ms GPU` : ''}.`);
  }

  // 2b) DERIVA: la stessa identica configurazione misurata in apertura e in
  // chiusura. Se i due numeri non coincidono il dispositivo è cambiato durante
  // la batteria (si scalda, entra in risparmio energetico) e i confronti FRA
  // gruppi diversi non valgono più: va detto in testa, non lasciato dedurre.
  const fine = sw.baseline_fine;
  if (base && fine && fpsDi(base) !== null && fpsDi(fine) !== null && fpsDi(base) > 0) {
    const delta = Math.round((fpsDi(fine) - fpsDi(base)) / fpsDi(base) * 100);
    if (Math.abs(delta) >= 12) {
      righe.push(`⚠ Deriva ${delta > 0 ? '+' : ''}${delta}%: la stessa configurazione dava ${arr(fpsDi(base))} fps all'inizio e ${arr(fpsDi(fine))} alla fine — il dispositivo è cambiato durante la misura. Fidati SOLO dei confronti dentro lo stesso gruppo.`);
    } else {
      righe.push(`Deriva ${delta > 0 ? '+' : ''}${delta}%: il dispositivo è rimasto stabile per tutta la misura.`);
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

  // 7) il pre-passaggio di profondità: vale la pena solo dove lo shader per
  //    pixel è il collo. Se c'è il timer GPU si guarda il pass principale, che
  //    è la cosa che il pre-passaggio può ridurre; altrimenti gli fps.
  const pOn = sw.prepass_on, pOff = sw.prepass_off;
  if (pOn && pOff) {
    const gOn = gpuPassata(pOn, 'principale'), gOff = gpuPassata(pOff, 'principale');
    if (gOn != null && gOff != null && gOff > 0) {
      const taglio = Math.round((gOff - gOn) / gOff * 100);
      righe.push(`Pre-passaggio di profondità: il pass principale passa da ${arr(gOff)} a ${arr(gOn)} ms GPU (${taglio >= 0 ? '−' : '+'}${Math.abs(taglio)}%).`);
    } else if (fpsDi(pOn) !== null && fpsDi(pOff) !== null) {
      righe.push(`Pre-passaggio di profondità: ${arr(fpsDi(pOn))} fps con, ${arr(fpsDi(pOff))} senza.`);
    }
  }

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
